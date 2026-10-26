/**
 * Update comprehensive test to use real mods from the Cobblemon instance
 */

import fs from 'node:fs';
import path from 'node:path';

const COBBLEMON_INSTANCE_PATH = path.join('C:', 'Users', 'Mokshad', 'AppData', 'Roaming', 'VoxelPlus', 'instances', 'Test-Cobblemon-Import');
const TEST_MODS_DIR = path.join(process.cwd(), '.test-mods-real');

async function copyRealMods() {
  console.log('Copying real mods from Cobblemon instance...');

  if (!fs.existsSync(COBBLEMON_INSTANCE_PATH)) {
    console.error('Cobblemon instance not found');
    process.exit(1);
  }

  if (!fs.existsSync(TEST_MODS_DIR)) {
    fs.mkdirSync(TEST_MODS_DIR, { recursive: true });
  }

  const sourceModsDir = path.join(COBBLEMON_INSTANCE_PATH, 'mods');
  const modFiles = fs.readdirSync(sourceModsDir).filter(f => f.endsWith('.jar'));

  // Copy 5 random mods for testing
  const modsToCopy = modFiles.slice(0, 5);

  for (const modFile of modsToCopy) {
    const sourcePath = path.join(sourceModsDir, modFile);
    const destPath = path.join(TEST_MODS_DIR, modFile);

    fs.copyFileSync(sourcePath, destPath);
    console.log(`  Copied: ${modFile}`);
  }

  console.log(`\nCopied ${modsToCopy.length} real mods to: ${TEST_MODS_DIR}`);
  console.log('\nYou can now update the comprehensive test to use these mods instead of dummy content.');
  console.log('Update the COMPATIBLE_MODS object in tests/comprehensive-instance.test.ts to reference these files.');
}

async function main() {
  await copyRealMods();
}

main().catch(console.error);
