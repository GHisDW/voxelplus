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
    input: 'Cobblemon Official Modpack [Fabric] 1.8.4.mrpack',
    output: 'Cobblemon-Official-1.8.4.vpack',
    name: 'Cobblemon Official Modpack 1.8.4',
    description: 'This modpack is copied from the official Cobblemon modpack. Features a complete Pokémon experience in Minecraft with Fabric loader. Includes all necessary mods, configs, and resources for the full Cobblemon gameplay.',
    price: 400,
    author: 'Cobblemon Team (Original) + Voxel+ (Converted)'
  },
  {
    input: 'Zombie Invade 100 Days 2.3.mrpack',
    output: 'Zombie-Invade-100-Days-2.3.vpack',
    name: 'Zombie Invade 100 Days 2.3',
    description: 'This modpack is copied from the Zombie Invade 100 Days modpack. A challenging survival experience with zombie-themed gameplay, custom structures, and immersive mechanics. Converted for Voxel+ launcher.',
    price: 300,
    author: 'Original Creator + Voxel+ (Converted)'
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

          // Create voxel-instance.json metadata
          const metadata = {
            schemaVersion: 1,
            id: result.manifest.packId,
            name: pack.name,
            description: pack.description,
            minecraft: result.manifest.minecraft,
            loader: result.manifest.loader,
            runtime: { java: 'auto', memoryMb: 4096 },
            appearance: { artwork: result.manifest.artwork, item: result.manifest.item },
            isFavorite: false,
            createdAt: new Date().toISOString(),
            lastPlayedAt: null,
            status: 'READY',
            shareSource: 'shop',
            isVPack: true
          };

          // Re-write the VPack with updated manifest and metadata
          const AdmZip = await import('adm-zip');
          const zip = new AdmZip.default(outputPath);
          zip.addFile('manifest.json', Buffer.from(JSON.stringify(result.manifest, null, 2), 'utf-8'));
          zip.addFile('voxel-instance.json', Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8'));
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
