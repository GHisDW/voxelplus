import test from 'node:test';
import assert from 'node:assert/strict';
import { SkinValidator } from '../electron/backend/skins/skinValidator';
import { VPackManager } from '../electron/backend/packs/vpackManager';
import { PackInstaller } from '../electron/backend/packs/packInstaller';
import { CardStore } from '../electron/backend/cards/cardStore';
import { VoxelCard, MyPack } from '../electron/types';

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
    // missing name, minecraftVersion, loaderType, etc.
  };

  const validation = VPackManager.validateManifest(invalidManifest);
  assert.equal(validation.isValid, false);
  assert.match(validation.error || '', /Missing or invalid/);
});

test('VPackManager - manifest validation passes for valid manifest', () => {
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
        downloadUrl: 'https://cdn.modrinth.com/example.jar',
        filename: 'sodium.jar',
        contentType: 'mod'
      }
    ],
    resourcePacks: [],
    shaderPacks: []
  };

  const validation = VPackManager.validateManifest(validManifest);
  assert.equal(validation.isValid, true);
});

test('CardStore - built-in card retrieval and user card provenance', () => {
  const cards = CardStore.listCards();
  assert.ok(cards.length > 0);

  const builtIn = cards.find(c => c.id === 'voxelplus-performance-263');
  assert.ok(builtIn);
  assert.equal(builtIn.source, 'builtin');

  const isBuiltIn = CardStore.isBuiltInCard('voxelplus-performance-263');
  assert.equal(isBuiltIn, true);

  const isUserCardBuiltIn = CardStore.isBuiltInCard('custom-user-card-id');
  assert.equal(isUserCardBuiltIn, false);
});
