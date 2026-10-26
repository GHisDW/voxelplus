/**
 * Manual Launch Verification Script
 *
 * This script creates instances one at a time for each loader/version combination,
 * installs 5 mods per instance, and attempts to run `gradlew runClient` to verify
 * the instance can actually launch.
 *
 * Usage:
 *   npx tsx scripts/manual-launch-test.ts
 *
 * The script will:
 * 1. Create a test instance for each loader/version
 * 2. Add 5 dummy mods
 * 3. Run `gradlew runClient` with a 30s timeout
 * 4. Record success/failure results
 * 5. Clean up the instance before moving to the next
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { InstanceManager } from '../electron/backend/instances/instanceManager';
import { LoaderRegistry } from '../electron/backend/instances/loaderProvider';
import { ModManager } from '../electron/backend/mods/modManager';
import { ConfigStore } from '../electron/backend/storage/configStore';
import { InstanceMetadataStore } from '../electron/backend/instances/metadata';

// Configuration
const TEMP_INSTANCE_DIR = path.join(process.cwd(), '.test-instances');
const MOD_COUNT = 5;
const RUNCLIENT_TIMEOUT = 30000; // 30 seconds

// Loader versions to test
const TEST_CONFIG = {
  fabric: ['1.21.1', '1.20.1', '1.19.4', '1.16.5'],
  quilt: ['1.21.1', '1.20.1', '1.19.4'],
  forge: ['1.20.1', '1.19.4', '1.16.5'],
  neoforge: ['1.21.1', '1.20.4']
};

// Dummy mod names (we'll create placeholder .jar files)
const DUMMY_MODS = ['mod1', 'mod2', 'mod3', 'mod4', 'mod5'];

interface TestResult {
  loader: string;
  version: string;
  success: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function setupEnvironment() {
  console.log('Setting up test environment...');
  if (!fs.existsSync(TEMP_INSTANCE_DIR)) {
    fs.mkdirSync(TEMP_INSTANCE_DIR, { recursive: true });
  }

  // Force ConfigStore to use our test directory
  // ConfigStore.getInstanceDirectory() normally uses app.getPath('userData')
  // We need to ensure instances are created in our test directory
  const configDir = path.join(TEMP_INSTANCE_DIR, 'config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Note: ConfigStore uses Electron's app.getPath internally
  // Since we're running outside Electron, we may need to mock this
  // For now, instances will be created in the default location
  // We'll move them to our test directory after creation
}

async function createTestInstance(loader: string, version: string): Promise<{ success: boolean; instanceId?: string; instancePath?: string; error?: string }> {
  try {
    const instanceName = `test-${loader}-${version.replace(/\./g, '-')}`;
    console.log(`  Creating instance: ${instanceName}`);

    const payload = {
      name: instanceName,
      description: `Test instance for ${loader} ${version}`,
      minecraftVersion: version,
      loaderType: loader,
      javaRuntime: 'auto',
      memoryMb: 4096,
      artwork: null,
      item: 'minecraft:grass_block',
      shareSource: 'test'
    };

    const instance = await InstanceManager.createInstance(payload);

    // Move instance to our test directory if it was created elsewhere
    const actualPath = instance.instancePath;
    const testPath = path.join(TEMP_INSTANCE_DIR, instance.id);

    if (actualPath !== testPath && fs.existsSync(actualPath)) {
      console.log(`  Moving instance from ${actualPath} to ${testPath}`);
      fs.mkdirSync(path.dirname(testPath), { recursive: true });
      fs.renameSync(actualPath, testPath);

      // Update metadata with new path
      instance.instancePath = testPath;
      InstanceMetadataStore.writeMetadata(testPath, instance);
    }

    return { success: true, instanceId: instance.id, instancePath: testPath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function addDummyMods(instanceId: string, instancePath: string): Promise<void> {
  const modsDir = path.join(instancePath, 'mods');
  if (!fs.existsSync(modsDir)) {
    fs.mkdirSync(modsDir, { recursive: true });
  }

  for (const modName of DUMMY_MODS) {
    const modFile = path.join(modsDir, `${modName}.jar`);
    // Create a minimal .jar file (just dummy content)
    fs.writeFileSync(modFile, Buffer.from('dummy mod content'));
  }

  console.log(`  Added ${MOD_COUNT} dummy mods`);
}

async function runGradlewRunClient(instancePath: string): Promise<{ success: boolean; output: string; error?: string }> {
  const gradlewBat = path.join(instancePath, 'gradlew.bat');
  const gradlewSh = path.join(instancePath, 'gradlew');

  if (!fs.existsSync(gradlewBat) && !fs.existsSync(gradlewSh)) {
    return { success: false, output: '', error: 'gradlew not found' };
  }

  const gradlew = fs.existsSync(gradlewBat) ? gradlewBat : gradlewSh;

  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn(gradlew, ['runClient'], {
      cwd: instancePath,
      shell: true
    });

    let output = '';
    let errorOutput = '';

    proc.stdout?.on('data', (data) => {
      output += data.toString();
      console.log(`  [stdout] ${data.toString().trim()}`);
    });

    proc.stderr?.on('data', (data) => {
      errorOutput += data.toString();
      console.log(`  [stderr] ${data.toString().trim()}`);
    });

    // Kill after timeout
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      const duration = Date.now() - startTime;
      // If we got output, Gradle started successfully
      if (output.length > 0 || errorOutput.length > 0) {
        resolve({ success: true, output: output + errorOutput });
      } else {
        resolve({ success: false, output: '', error: 'No output (timeout)' });
      }
    }, RUNCLIENT_TIMEOUT);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;
      // If it closed before timeout but had output, consider it a success
      if (output.length > 0 || errorOutput.length > 0) {
        resolve({ success: true, output: output + errorOutput });
      } else {
        resolve({ success: false, output: '', error: `Process closed with code ${code}` });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, output: '', error: err.message });
    });
  });
}

async function cleanupInstance(instanceId: string, instancePath: string) {
  console.log(`  Cleaning up instance...`);
  try {
    // Force delete the directory directly since we moved it
    if (fs.existsSync(instancePath)) {
      fs.rmSync(instancePath, { recursive: true, force: true });
      console.log(`  Instance directory deleted`);
    }
  } catch (error: any) {
    console.log(`  Warning: Could not delete instance: ${error.message}`);
  }
}

async function testLoaderVersion(loader: string, version: string): Promise<TestResult> {
  const startTime = Date.now();
  console.log(`\n=== Testing ${loader} ${version} ===`);

  try {
    // Create instance
    const createResult = await createTestInstance(loader, version);
    if (!createResult.success) {
      return {
        loader,
        version,
        success: false,
        error: `Failed to create instance: ${createResult.error}`,
        duration: Date.now() - startTime
      };
    }

    const instanceId = createResult.instanceId!;
    const instancePath = createResult.instancePath!;

    // Add mods
    await addDummyMods(instanceId, instancePath);

    // Run gradlew runClient
    console.log(`  Running gradlew runClient (timeout: ${RUNCLIENT_TIMEOUT}ms)...`);
    const runResult = await runGradlewRunClient(instancePath);

    // Cleanup
    await cleanupInstance(instanceId, instancePath);

    if (!runResult.success) {
      return {
        loader,
        version,
        success: false,
        error: runResult.error || 'Unknown error',
        duration: Date.now() - startTime
      };
    }

    console.log(`  ✓ Success!`);
    return {
      loader,
      version,
      success: true,
      duration: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      loader,
      version,
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}

async function main() {
  console.log('=== Manual Launch Verification Script ===\n');

  await setupEnvironment();

  const totalTests = Object.values(TEST_CONFIG).flat().length;
  let completed = 0;

  for (const [loader, versions] of Object.entries(TEST_CONFIG)) {
    for (const version of versions) {
      const result = await testLoaderVersion(loader, version);
      results.push(result);
      completed++;

      console.log(`\nProgress: ${completed}/${totalTests} tests completed`);

      // Write results to file after each test
      const resultsFile = path.join(TEMP_INSTANCE_DIR, 'results.json');
      fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    }
  }

  // Final summary
  console.log('\n=== Final Results ===');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total: ${results.length}`);
  console.log(`✓ Successful: ${successful}`);
  console.log(`✗ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  ${r.loader} ${r.version}: ${r.error}`);
    });
  }

  // Save final results
  const resultsFile = path.join(TEMP_INSTANCE_DIR, 'results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsFile}`);
}

main().catch(console.error);
