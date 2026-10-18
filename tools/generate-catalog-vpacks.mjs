import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

const root = path.resolve(import.meta.dirname, '..');
const researchDir = path.join(root, 'work', 'research');
const outputDir = path.join(root, 'vpacks');

const catalog = [
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
    slug: 'create-industrial-horizons',
    sourceFile: 'industrial-horizons.mrpack',
    packId: 'voxelplus-create-industrial-horizons',
    name: 'Create: Industrial Horizons',
    description: 'A Voxel+ Fabric engineering instance based on Create: Industrial Horizons, including its Create ecosystem, datapacks, configs, and client presentation.',
    author: 'Voxel+ + Create: Industrial Horizons',
    item: 'minecraft:copper_ingot',
    artwork: 'preset:sunset_plains',
    sourceProjectId: 'ZKwcjthq',
    sourceVersionId: 'uOvCHfRw',
    sourceUrl: 'https://cdn.modrinth.com/data/ZKwcjthq/versions/uOvCHfRw/Industrial%20Horizons%202.1.mrpack',
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
    runtime: { java: 'auto', memoryMb: item.slug === 'create-industrial-horizons' ? 6144 : 4096 },
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
  archive.writeZip(path.join(outputDir, `${item.slug}.vpack`));
  console.log(`${item.name}: ${content.length} entries -> ${item.slug}.vpack`);
}
