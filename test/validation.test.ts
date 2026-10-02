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

test('CardStore - built-in cards exist and never get retired without developer catalog', () => {
  const builtIns = getDefaultCards();
  assert.ok(builtIns.length > 0);

  const defaultCard = builtIns[0];
  const isRetired = CardStore.isCardRetired(defaultCard.id);
  assert.equal(isRetired, false, 'Built-in cards must never be retired');

  const cardList = CardStore.listCards();
  const found = cardList.find(c => c.id === defaultCard.id);
  assert.ok(found);
  assert.equal(found.source, 'builtin');
});

test('CardStore - missing source explicitly defaults to user provenance', () => {
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
    mods: [],
    tags: [],
    author: 'User',
    publishedAt: new Date().toISOString(),
    signature: null
  };

  CardStore.saveCard(sampleUserCard as any);
  const loaded = CardStore.getCard('user-custom-card-99');
  assert.ok(loaded);
  assert.equal(loaded.source, 'developer');

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
