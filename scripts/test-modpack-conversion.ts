/**
 * Test converting a real Modrinth modpack to VPack format
 */

import fs from 'node:fs';
import path from 'node:path';
import { VPackConverter } from '../electron/backend/vpack/vpackConverter';
import { VPackManager } from '../electron/backend/vpack/vpackManager';
import { InstanceManager } from '../electron/backend/instances/instanceManager';
import { ConfigStore } from '../electron/backend/storage/configStore';

const MODPACK_PATH = path.join(process.cwd(), '.test-modpacks', 'Cobblemon-Fabric-1.3.2.mrpack');
const OUTPUT_DIR = path.join(process.cwd(), '.test-conversion');

async function setupEnvironment() {
  console.log('Setting up test environment...');
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

async function testModrinthToVPack() {
  console.log('\n=== Test 1: Convert Modrinth .mrpack to VPack ===');
  console.log(`Input: ${MODPACK_PATH}`);

  try {
    const outputPath = path.join(OUTPUT_DIR, 'Cobblemon-Fabric-1.3.2.vpack');

    const result = await VPackConverter.convertMrpackToVPack(MODPACK_PATH, outputPath);

    console.log('Conversion result:', result);

    if (result.success) {
      console.log(`✓ Converted successfully to: ${outputPath}`);
      console.log(`Physical files: ${result.physicalFilesCount}`);
      console.log(`Remote references: ${result.remoteFilesCount}`);
      console.log(`Unresolved: ${result.unresolvedCount}`);

      return outputPath;
    } else {
      console.log(`✗ Conversion failed: ${result.error}`);
      return null;
    }
  } catch (error: any) {
    console.error(`✗ Error during conversion: ${error.message}`);
    return null;
  }
}

async function testVPackValidation(vpackPath: string) {
  console.log('\n=== Test 2: Validate generated VPack ===');
  console.log(`VPack: ${vpackPath}`);

  try {
    const validation = VPackManager.validateVPack(vpackPath);

    console.log('Validation result:', {
      valid: validation.valid,
      manifest: validation.manifest ? 'Found' : 'Not found',
      errors: validation.errors,
      warnings: validation.warnings
    });

    if (validation.valid && validation.manifest) {
      console.log(`✓ VPack is valid`);
      console.log(`Name: ${validation.manifest.name}`);
      console.log(`Minecraft: ${validation.manifest.minecraft?.version}`);
      console.log(`Loader: ${validation.manifest.loader?.type} ${validation.manifest.loader?.version}`);
      console.log(`Content entries: ${validation.manifest.content?.length || 0}`);
      return true;
    } else {
      console.log(`✗ VPack validation failed`);
      validation.errors.forEach(e => console.log(`  - ${e}`));
      return false;
    }
  } catch (error: any) {
    console.error(`✗ Error during validation: ${error.message}`);
    return false;
  }
}

async function testVPackImport(vpackPath: string) {
  console.log('\n=== Test 3: Import VPack as instance ===');
  console.log(`VPack: ${vpackPath}`);

  try {
    const imported = await InstanceManager.importInstance(vpackPath, 'Test-Cobblemon-Import');

    if (imported) {
      console.log(`✓ Imported successfully`);
      console.log(`Instance ID: ${imported.id}`);
      console.log(`Instance name: ${imported.name}`);
      console.log(`Instance path: ${imported.instancePath}`);
      console.log(`Minecraft: ${imported.minecraft.version}`);
      console.log(`Loader: ${imported.loader.type} ${imported.loader.version}`);

      // Check if files exist
      if (imported.instancePath) {
        const gradlewBat = path.join(imported.instancePath, 'gradlew.bat');
        const buildGradle = path.join(imported.instancePath, 'build.gradle');
        const modsDir = path.join(imported.instancePath, 'mods');

        console.log('\nChecking instance structure:');
        console.log(`  gradlew.bat exists: ${fs.existsSync(gradlewBat)}`);
        console.log(`  build.gradle exists: ${fs.existsSync(buildGradle)}`);
        console.log(`  mods/ exists: ${fs.existsSync(modsDir)}`);

        if (fs.existsSync(modsDir)) {
          const modFiles = fs.readdirSync(modsDir);
          console.log(`  Mods in directory: ${modFiles.length}`);
          modFiles.slice(0, 5).forEach(m => console.log(`    - ${m}`));
        }

        // Ask if user wants to keep the instance
        console.log('\n⚠️  Instance created at:', imported.instancePath);
        console.log('You can test launching it from the UI or delete it manually.');

        return true;
      }
    } else {
      console.log(`✗ Import failed`);
      return false;
    }
  } catch (error: any) {
    console.error(`✗ Error during import: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

async function main() {
  console.log('=== Modpack Conversion Test ===\n');

  await setupEnvironment();

  // Check if modpack exists
  if (!fs.existsSync(MODPACK_PATH)) {
    console.error(`Modpack not found: ${MODPACK_PATH}`);
    console.log('Run download-modpack.ts first');
    process.exit(1);
  }

  // Test 1: Convert to VPack
  const vpackPath = await testModrinthToVPack();
  if (!vpackPath) {
    console.log('\nStopping due to conversion failure');
    process.exit(1);
  }

  // Test 2: Validate VPack
  const isValid = await testVPackValidation(vpackPath);
  if (!isValid) {
    console.log('\nStopping due to validation failure');
    process.exit(1);
  }

  // Test 3: Import VPack
  await testVPackImport(vpackPath);

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
