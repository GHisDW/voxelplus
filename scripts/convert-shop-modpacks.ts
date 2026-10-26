/**
 * Convert modpacks for the VPack shop
 */

import fs from 'node:fs';
import path from 'node:path';
import { VPackConverter } from '../electron/backend/vpack/vpackConverter';

const MODPACKS_DIR = path.join(process.cwd(), '.test-modpacks');
const SHOP_OUTPUT_DIR = path.join(process.cwd(), 'vpacks');

const SHOP_PACKS = [
  {
    input: 'Fresh-Smooth-26.3.mrpack',
    output: 'Fresh-Smooth-26.3.vpack',
    name: 'Fresh & Smooth 26.3',
    description: 'Optimization modpack for Minecraft 26.3. Reduces lag and improves FPS with carefully tuned performance mods.',
    price: 250,
    author: 'Modrinth Community'
  },
  {
    input: 'Cobblemon-Fabric-1.3.2.mrpack',
    output: 'Cobblemon-1.3.2.vpack',
    name: 'Cobblemon Official Modpack',
    description: 'Official Cobblemon modpack for Fabric. Includes all necessary mods for a complete Pokémon experience in Minecraft.',
    price: 350,
    author: 'Cobblemon Team'
  },
  {
    input: 'Fabulously-Optimized-v15.mrpack',
    output: 'Fabulously-Optimized-v15.vpack',
    name: 'Fabulously Optimimized v15',
    description: 'Ultimate optimization modpack. Combines the best performance mods for maximum FPS and smooth gameplay.',
    price: 300,
    author: 'Modrinth Community'
  }
];

async function convertShopPacks() {
  console.log('=== Converting Modpacks for VPack Shop ===\n');

  if (!fs.existsSync(SHOP_OUTPUT_DIR)) {
    fs.mkdirSync(SHOP_OUTPUT_DIR, { recursive: true });
  }

  for (const pack of SHOP_PACKS) {
    console.log(`Converting: ${pack.name}`);
    console.log(`  Input: ${pack.input}`);
    console.log(`  Output: ${pack.output}`);
    console.log(`  Price: ${pack.price} VPcoins`);

    const inputPath = path.join(MODPACKS_DIR, pack.input);
    const outputPath = path.join(SHOP_OUTPUT_DIR, pack.output);

    if (!fs.existsSync(inputPath)) {
      console.log(`  ✗ Input file not found\n`);
      continue;
    }

    try {
      const result = await VPackConverter.convertMrpackToVPack(inputPath, outputPath);

      if (result.success) {
        console.log(`  ✓ Converted successfully`);
        console.log(`    Physical files: ${result.physicalFilesCount}`);
        console.log(`    Remote references: ${result.remoteFilesCount}`);
        console.log(`    Unresolved: ${result.unresolvedCount}`);

        // Update manifest with shop metadata
        if (result.manifest) {
          result.manifest.description = pack.description;
          result.manifest.author = pack.author;
          result.manifest.price = pack.price;
          result.manifest.shareSource = 'shop';

          // Re-write the VPack with updated manifest
          const AdmZip = await import('adm-zip');
          const zip = new AdmZip.default(outputPath);
          zip.addFile('manifest.json', Buffer.from(JSON.stringify(result.manifest, null, 2), 'utf-8'));
          zip.writeZip(outputPath);

          console.log(`  ✓ Updated shop metadata`);
        }
      } else {
        console.log(`  ✗ Conversion failed: ${result.error}`);
      }
    } catch (error: any) {
      console.log(`  ✗ Error: ${error.message}`);
    }

    console.log('');
  }

  console.log('=== Conversion Complete ===');
  console.log(`VPacks saved to: ${SHOP_OUTPUT_DIR}`);
}

convertShopPacks().catch(console.error);
