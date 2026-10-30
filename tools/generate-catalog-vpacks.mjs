import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

const root = path.resolve(import.meta.dirname, '..');
const researchDir = path.join(root, 'work', 'research');
const outputDir = path.join(root, 'vpacks');

const catalog = [
  {
    slug: 'cobblemon-official-1.8.4',
    sourceFile: 'Cobblemon-Official-1.8.4.vpack',
    packId: 'voxelplus-cobblemon-official',
    name: 'Cobblemon Official Modpack 1.8.4',
    description: 'This modpack is copied from the official Cobblemon modpack. Features a complete Pokémon experience in Minecraft with Fabric loader. Includes all necessary mods, configs, and resources for the full Cobblemon gameplay.',
    author: 'Cobblemon Team (Original) + Voxel+ (Converted)',
    item: 'minecraft:ender_pearl',
    artwork: 'preset:ocean_depths',
    price: 400
  },
  {
    slug: 'zombie-invade-100-days-2.3',
    sourceFile: 'Zombie-Invade-100-Days-2.3.vpack',
    packId: 'voxelplus-zombie-invade',
    name: 'Zombie Invade 100 Days 2.3',
    description: 'This modpack is copied from the Zombie Invade 100 Days modpack. A challenging survival experience with zombie-themed gameplay, custom structures, and immersive mechanics. Converted for Voxel+ launcher.',
    author: 'Original Creator + Voxel+ (Converted)',
    item: 'minecraft:rotten_flesh',
    artwork: 'preset:nether_wastes',
    price: 300
  },
  {
    slug: 'fabulously-optimized-voxelplus',
    sourceFile: 'fabulously-optimized.mrpack',
    packId: 'voxelplus-fabulously-optimized',
    name: 'Fabulously Optimized · Voxel+ Edition',
    description: 'A Voxel+ Fabric performance instance based on Fabulously Optimized, with its verified 26.3 client mods and defaults.',
    author: 'Voxel+ + Fabulously Optimized',
    item: 'minecraft:golden_apple',
    artwork: 'preset:mountain_vista',
    sourceProjectId: '1KVo5zza',
    sourceVersionId: 'D35n5vLL',
    sourceUrl: 'https://cdn.modrinth.com/data/1KVo5zza/versions/D35n5vLL/Fabulously.Optimized-v15.0.0-beta.1.mrpack',
    price: 300
  },
  {
    slug: 'actions-and-fresh',
    sourceFile: 'fresh-smooth.mrpack',
    packId: 'voxelplus-actions-and-fresh',
    name: 'Actions & Fresh',
    description: 'A Voxel+ Fabric visual instance based on Fresh & Smooth, with animated entities, action-focused visuals, resource packs, and shader support.',
    author: 'Voxel+ + Fresh & Smooth',
    item: 'minecraft:nether_star',
    artwork: 'preset:cherry_grove',
    sourceProjectId: 'ICQPO4fX',
    sourceVersionId: 'WkwdmoDl',
    sourceUrl: 'https://cdn.modrinth.com/data/ICQPO4fX/versions/WkwdmoDl/Fresh%20%26%20Smooth%2026.3%20%28initial%20release%29%202.9.7.mrpack',
    price: 450
  },
  {
    slug: 'fabricate-create',
    sourceFile: 'fabricate.mrpack',
    packId: 'voxelplus-fabricate-create',
    name: 'Fabricate: Create Engineering',
    description: 'A Voxel+ Fabric engineering instance based on Fabricate, with Create, performance mods, configs, and client presentation.',
    author: 'Voxel+ + Fabricate',
    item: 'minecraft:copper_ingot',
    artwork: 'preset:sunset_plains',
    sourceProjectId: '9RQ9AyJY',
    sourceVersionId: 'sUv2uZiC',
    sourceUrl: 'https://cdn.modrinth.com/data/9RQ9AyJY/versions/sUv2uZiC/pack.mrpack',
    price: 500
  }
];

function contentType(filePath) {
  if (filePath.startsWith('mods/')) return 'mod';
  if (filePath.startsWith('resourcepacks/')) return 'resourcepack';
  if (filePath.startsWith('shaderpacks/')) return 'shaderpack';
  if (filePath.startsWith('config/')) return 'config';
  return 'other';
}

fs.mkdirSync(outputDir, { recursive: true });
for (const file of fs.readdirSync(outputDir)) {
  if (file.endsWith('.vpack')) fs.rmSync(path.join(outputDir, file), { force: true });
}

for (const item of catalog) {
  const outputPath = path.join(outputDir, `${item.slug}.vpack`);

  // Check if source is already a vpack (converted locally)
  if (item.sourceFile.endsWith('.vpack')) {
    const localVpackPath = path.join(researchDir, item.sourceFile);
    if (fs.existsSync(localVpackPath)) {
      // Copy and update existing vpack
      const sourceZip = new AdmZip(localVpackPath);
      let manifest;
      try {
        manifest = JSON.parse(sourceZip.readAsText('manifest.json'));
      } catch (e) {
        console.error(`Failed to parse manifest from ${localVpackPath}:`, e);
        continue;
      }

      // Update metadata
      manifest.description = item.description;
      manifest.author = item.author;
      manifest.artwork = item.artwork;
      manifest.item = item.item;
      manifest.price = item.price;
      manifest.shareSource = 'voxelplus-catalog';

      // Update instance metadata
      let metadata;
      try {
        metadata = JSON.parse(sourceZip.readAsText('voxel-instance.json'));
      } catch (e) {
        console.error(`Failed to parse voxel-instance.json from ${localVpackPath}:`, e);
        continue;
      }
      metadata.description = item.description;
      metadata.appearance.artwork = item.artwork;
      metadata.appearance.item = item.item;
      metadata.shareSource = 'voxelplus-catalog';

      sourceZip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
      sourceZip.addFile('voxel-instance.json', Buffer.from(JSON.stringify(metadata, null, 2)));
      sourceZip.writeZip(outputPath);
      console.log(`${item.name}: updated from existing vpack -> ${item.slug}.vpack`);
      continue;
    }
  }

  // Original logic for mrpack conversion
  const localSourcePath = path.join(researchDir, item.sourceFile);
  const source = fs.existsSync(localSourcePath)
    ? new AdmZip(localSourcePath)
    : new AdmZip(Buffer.from(await (await fetch(item.sourceUrl)).arrayBuffer()));
  const index = JSON.parse(source.readAsText('modrinth.index.json'));
  const content = index.files.map(file => ({
    relativePath: file.path.replace(/\\/g, '/'),
    type: contentType(file.path),
    sizeBytes: file.fileSize,
    sha1: file.hashes?.sha1,
    downloadUrl: file.downloads?.[0]
  }));

  const archive = new AdmZip();
  for (const entry of source.getEntries()) {
    if (entry.isDirectory || !entry.entryName.startsWith('overrides/')) continue;
    const target = entry.entryName.slice('overrides/'.length);
    if (!target) continue;
    archive.addFile(target, entry.getData());
    content.push({
      relativePath: target,
      type: contentType(target),
      sizeBytes: entry.header.size
    });
  }

  const manifest = {
    formatId: 'voxelplus-vpack',
    formatVersion: 1,
    packId: item.packId,
    name: item.name,
    description: item.description,
    author: item.author,
    packVersion: index.versionId,
    minecraft: { version: index.dependencies.minecraft },
    loader: { type: 'fabric', version: index.dependencies['fabric-loader'] },
    content,
    artwork: item.artwork,
    item: item.item,
    shareSource: 'voxelplus-catalog',
    price: item.price,
    createdAt: new Date().toISOString(),
    generatorVersion: '3.0.0',
    source: {
      platform: 'modrinth',
      projectId: item.sourceProjectId,
      versionId: item.sourceVersionId,
      url: item.sourceUrl
    }
  };

  const metadata = {
    schemaVersion: 1,
    id: item.packId,
    name: item.name,
    description: item.description,
    minecraft: { version: index.dependencies.minecraft },
    loader: { type: 'fabric', version: index.dependencies['fabric-loader'] },
    runtime: { java: 'auto', memoryMb: item.slug === 'fabricate-create' ? 6144 : 4096 },
    appearance: { artwork: item.artwork, item: item.item },
    isFavorite: false,
    createdAt: new Date().toISOString(),
    lastPlayedAt: null,
    status: 'READY',
    shareSource: 'voxelplus-catalog',
    isVPack: true
  };

  archive.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
  archive.addFile('voxel-instance.json', Buffer.from(JSON.stringify(metadata, null, 2)));
  archive.writeZip(outputPath);
  console.log(`${item.name}: ${content.length} entries -> ${item.slug}.vpack`);
}
