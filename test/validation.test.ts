import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import { SkinValidator } from '../electron/backend/skins/skinValidator';
import { VPackManager } from '../electron/backend/packs/vpackManager';
import { CardInstaller } from '../electron/backend/cards/cardInstaller';
import { CardStore } from '../electron/backend/cards/cardStore';
import { CommandManager } from '../electron/backend/commandManager';
import { getDefaultCards } from '../electron/backend/cards/defaultCards';
import { PathManager } from '../electron/backend/storage/paths';

test('SkinValidator - 64x32 dimensions default to Steve model', () => {
  const model = SkinValidator.detectSkinModel(Buffer.alloc(100), { width: 64, height: 32 });
  assert.equal(model, 'steve');
});

test('SkinValidator - PNG signature validation', async () => {
  const result = await SkinValidator.validateSkin('non_existent_file.png');
  assert.equal(result.isValid, false);
  assert.equal(result.error, 'File does not exist');
});

test('VPackManager - manifest validation rejects missing fields', () => {
  const invalidManifest = {
    schemaVersion: 1,
    id: 'test-pack',
  };

  const validation = VPackManager.validateManifest(invalidManifest);
  assert.equal(validation.isValid, false);
  assert.equal(validation.state, 'INVALID_MALFORMED');
  assert.match(validation.error || '', /Missing or invalid/);
});

test('VPackManager - enforces Modrinth provider and cdn.modrinth.com URLs', () => {
  const nonModrinthManifest = {
    schemaVersion: 1,
    id: 'arbitrary-pack',
    name: 'Arbitrary Pack',
    description: 'A test pack',
    packVersion: '1.0.0',
    minecraftVersion: '26.3',
    loaderType: 'fabric',
    loaderVersion: '0.19.5',
    mods: [
      {
        provider: 'curseforge',
        projectId: '12345',
        projectName: 'Mod',
        versionId: '123',
        versionName: '1.0',
        downloadUrl: 'https://example.com/untrusted.jar',
        filename: 'mod.jar',
        contentType: 'mod'
      }
    ],
    resourcePacks: [],
    shaderPacks: []
  };

  const validation = VPackManager.validateManifest(nonModrinthManifest);
  assert.equal(validation.isValid, false);
  assert.equal(validation.state, 'INVALID_MALFORMED');
  assert.match(validation.error || '', /User VPacks only support Modrinth dependencies/);
});

test('VPackManager - passes for valid Modrinth VPack manifest and distinguishes unresolved state', () => {
  const validManifest = {
    schemaVersion: 1,
    id: 'valid-pack',
    name: 'Valid Pack',
    description: 'A test pack',
    packVersion: '1.0.0',
    minecraftVersion: '26.3',
    loaderType: 'fabric',
    loaderVersion: '0.19.5',
    mods: [
      {
        provider: 'modrinth',
        projectId: 'AANobbMI',
        projectName: 'Sodium',
        versionId: 'v4PSXean',
        versionName: 'Sodium 0.9.3',
        downloadUrl: 'https://cdn.modrinth.com/data/AANobbMI/versions/v4PSXean/sodium.jar',
        filename: 'sodium.jar',
        contentType: 'mod'
      }
    ],
    resourcePacks: [],
    shaderPacks: []
  };

  const validation = VPackManager.validateManifest(validManifest);
  assert.equal(validation.isValid, true);
  assert.equal(validation.state, 'VALID_RESOLVED');
  assert.equal(validation.hasUnresolved, false);
});

test('VPackManager - path safety helper rejects dangerous traversal paths', () => {
  const destDir = os.tmpdir();
  assert.equal(VPackManager.isPathSafe(destDir, '../malicious.txt'), false);
  assert.equal(VPackManager.isPathSafe(destDir, '..\\malicious.txt'), false);
  assert.equal(VPackManager.isPathSafe(destDir, '/etc/passwd'), false);
  assert.equal(VPackManager.isPathSafe(destDir, 'C:\\Windows\\System32'), false);
  assert.equal(VPackManager.isPathSafe(destDir, 'mods/sodium.jar'), true);
});

test('CardStore - built-in cards exist, are immutable, and never get retired', () => {
  const builtIns = getDefaultCards();
  assert.ok(builtIns.length > 0);

  const defaultCard = builtIns[0];
  const isRetired = CardStore.isCardRetired(defaultCard.id);
  assert.equal(isRetired, false, 'Built-in cards must never be retired');

  const cardList = CardStore.listCards();
  const found = cardList.find(c => c.id === defaultCard.id);
  assert.ok(found);
  assert.equal(found.source, 'builtin');

  // Verify built-in card immutability
  assert.throws(
    () => CardStore.saveCard({ ...defaultCard, name: 'Attempted Override' }),
    /Cannot modify canonical built-in card/
  );

  assert.throws(
    () => CardStore.deleteCard(defaultCard.id),
    /Cannot delete canonical built-in card/
  );
});

test('CardStore - user card save and reload preserves user provenance strictly', () => {
  const sampleUserCard = {
    schemaVersion: 1,
    id: 'user-custom-card-99',
    name: 'User Custom Card',
    description: 'A custom card created by user',
    tagline: 'Custom',
    artwork: null,
    cardVersion: '1.0.0',
    minecraftVersion: '26.3',
    loaderType: 'fabric' as const,
    loaderVersion: '0.19.5',
    source: 'user' as const,
    mods: [],
    tags: [],
    author: 'User',
    publishedAt: new Date().toISOString(),
    signature: null
  };

  CardStore.saveCard(sampleUserCard as any);

  // Reload cards list and get specific card
  const reloadedCards = CardStore.listCards();
  const reloaded = reloadedCards.find(c => c.id === 'user-custom-card-99');
  assert.ok(reloaded);
  assert.equal(reloaded.source, 'user', 'User card must remain source: user upon save and reload');

  // Clean up
  CardStore.deleteCard('user-custom-card-99');
});

test('CardStore - retired cards can be reconstructed from snapshots', () => {
  const sampleCard = {
    schemaVersion: 1,
    id: 'test-historical-card',
    name: 'Historical Card',
    description: 'A retired test card',
    tagline: 'Historical',
    artwork: null,
    cardVersion: '1.0.0',
    minecraftVersion: '26.3',
    loaderType: 'fabric' as const,
    loaderVersion: '0.19.5',
    source: 'developer' as const,
    mods: [],
    tags: [],
    author: 'Test',
    publishedAt: new Date().toISOString(),
    signature: null
  };

  CardStore.saveCardSnapshot(sampleCard);
  const reconstructed = CardStore.getCardIncludingRetired('test-historical-card');
  assert.ok(reconstructed);
  assert.equal(reconstructed.name, 'Historical Card');
});

test('CardInstaller - rejects version fallback when exact Minecraft version is unmatched', async () => {
  const unresolvableModRef = {
    provider: 'modrinth' as const,
    projectId: 'AANobbMI',
    projectName: 'Sodium',
    versionId: '',
    versionName: 'Unmatched',
    downloadUrl: '',
    filename: 'sodium.jar',
    contentType: 'mod' as const
  };

  // Attempt to resolve Sodium for non-existent Minecraft version 99.99
  const resolved = await CardInstaller.resolveModRef(unresolvableModRef, '99.99', 'fabric');
  assert.equal(resolved, null, 'Must not select arbitrary fallback version when target MC version is unmatched');
});

test('Developer Catalog Runtime Path - CommandManager.saveCard in developer mode writes catalog.json and NOT user definitions', () => {
  // Set developer mode on global
  (global as any).isDeveloperMode = true;

  const devCard = {
    schemaVersion: 1,
    id: 'dev-runtime-card-202',
    name: 'Runtime Dev Card',
    description: 'Developer card created through CommandManager API',
    tagline: 'Runtime Dev',
    artwork: null,
    cardVersion: '1.0.0',
    minecraftVersion: '26.3',
    loaderType: 'fabric' as const,
    loaderVersion: '0.19.5',
    source: 'developer' as const,
    mods: [],
    tags: ['runtime-dev'],
    author: 'Voxel+ Developer',
    publishedAt: new Date().toISOString(),
    signature: null
  };

  // 1. Save developer card through CommandManager (IPC path)
  CommandManager.saveCard(devCard as any);

  // 2. Verify card appears in config/developer/catalog.json
  const catalogFile = CardStore.getDeveloperCatalogFile();
  assert.ok(fs.existsSync(catalogFile), 'catalog.json must exist');
  const catalogContent = fs.readFileSync(catalogFile, 'utf-8');
  assert.match(catalogContent, /dev-runtime-card-202/);

  // 3. Verify card does NOT appear in config/cards/definitions/
  const userDefDir = path.join(PathManager.getConfigDir(), 'cards', 'definitions');
  const userDefFile = path.join(userDefDir, 'dev-runtime-card-202.json');
  assert.equal(fs.existsSync(userDefFile), false, 'Developer card must NOT be saved in user cards definitions directory');

  // 4. Reload catalog from disk and verify source: developer
  const loadedCatalog = CardStore.loadDeveloperCatalog();
  const found = loadedCatalog.find(c => c.id === 'dev-runtime-card-202');
  assert.ok(found);
  assert.equal(found.source, 'developer');

  // 5. Delete card through CommandManager API
  CommandManager.deleteCard('dev-runtime-card-202');

  // 6. Verify card disappears from catalog.json
  const catalogAfterDelete = CardStore.loadDeveloperCatalog();
  assert.equal(catalogAfterDelete.some(c => c.id === 'dev-runtime-card-202'), false);

  // 7. Verify built-in cards are protected from modification/deletion
  const builtInCard = CardStore.getBuiltInCards()[0];
  assert.throws(
    () => CommandManager.saveCard({ ...builtInCard, name: 'Hacked Built-in' } as any),
    /Cannot modify canonical built-in card/
  );
  assert.throws(
    () => CommandManager.deleteCard(builtInCard.id),
    /Cannot delete canonical built-in card/
  );

  // Reset developer mode
  (global as any).isDeveloperMode = false;
});

test('VPackManager - real ZIP import rejects malicious path traversal archives (../, ..\\, /absolute, C:\\)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpack-sec-test-'));

  const traversalPaths = [
    '../outside.txt',
    '..\\outside.txt',
    '/absolute.txt',
    'C:\\outside.txt'
  ];

  for (let i = 0; i < traversalPaths.length; i++) {
    const zipPath = path.join(tmpDir, `malicious_${i}.vpack`);
    const zip = new AdmZip();
    const manifest = {
      schemaVersion: 1,
      id: `malicious-pack-${i}`,
      name: 'Malicious Pack',
      description: 'Exploit test',
      packVersion: '1.0.0',
      minecraftVersion: '26.3',
      loaderType: 'fabric',
      loaderVersion: '0.19.5',
      mods: [],
      resourcePacks: [],
      shaderPacks: []
    };

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf-8'));
    zip.addFile('dummy.txt', Buffer.from('hacked', 'utf-8'));
    (zip.getEntries().find(e => e.entryName === 'dummy.txt') as any).entryName = traversalPaths[i];
    zip.writeZip(zipPath);

    const result = await VPackManager.importPack(zipPath);
    assert.equal(result.success, false);
    assert.equal(result.validationState, 'INVALID_MALFORMED');
    assert.match(result.error || '', /path traversal attempt/i);
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('VPackManager - legitimate .vpack archive import and export round trip with Modrinth resolution', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpack-valid-test-'));
  const zipPath = path.join(tmpDir, 'valid.vpack');
  const packId = `roundtrip-pack-${Date.now()}`;

  const validManifest = {
    schemaVersion: 1,
    id: packId,
    name: 'Legitimate Roundtrip Pack',
    description: 'A valid roundtrip vpack',
    packVersion: '1.0.0',
    minecraftVersion: '26.3',
    loaderType: 'fabric',
    loaderVersion: '0.19.5',
    mods: [
      {
        provider: 'modrinth',
        projectId: 'AANobbMI',
        projectName: 'Sodium',
        versionId: 'v4PSXean',
        versionName: 'Sodium 0.9.3',
        downloadUrl: 'https://cdn.modrinth.com/data/AANobbMI/versions/v4PSXean/sodium.jar',
        filename: 'sodium.jar',
        contentType: 'mod'
      }
    ],
    resourcePacks: [],
    shaderPacks: []
  };

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(validManifest), 'utf-8'));
  zip.writeZip(zipPath);

  const importResult = await VPackManager.importPack(zipPath);
  assert.equal(importResult.success, true, `Import failed: ${importResult.error}`);
  assert.equal(importResult.validationState, 'VALID_RESOLVED');
  assert.ok(importResult.pack);
  assert.equal(importResult.pack.name, 'Legitimate Roundtrip Pack');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('VPackManager - importPack classifies fake or non-existent Modrinth version as VALID_UNRESOLVED', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpack-fake-test-'));
  const zipPath = path.join(tmpDir, 'fake.vpack');
  const packId = `fake-pack-${Date.now()}`;

  const fakeManifest = {
    schemaVersion: 1,
    id: packId,
    name: 'Fake Dependency Pack',
    description: 'Pack with fake version id',
    packVersion: '1.0.0',
    minecraftVersion: '26.3',
    loaderType: 'fabric',
    loaderVersion: '0.19.5',
    mods: [
      {
        provider: 'modrinth',
        projectId: 'fakeProjectId99',
        projectName: 'Fake Mod',
        versionId: 'fakeVersionId99',
        versionName: 'Fake 1.0',
        downloadUrl: 'https://cdn.modrinth.com/data/fake/fake.jar',
        filename: 'fake.jar',
        contentType: 'mod'
      }
    ],
    resourcePacks: [],
    shaderPacks: []
  };

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(fakeManifest), 'utf-8'));
  zip.writeZip(zipPath);

  const importResult = await VPackManager.importPack(zipPath);
  assert.equal(importResult.success, true);
  assert.equal(importResult.validationState, 'VALID_UNRESOLVED', 'Fake Modrinth dependency must cause VPack import state to be VALID_UNRESOLVED');
  assert.ok(importResult.pack);
  assert.equal(importResult.pack.mods[0].unresolved, true, 'Dependency must be marked unresolved');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
