/**
 * Default Cards — Built-in Voxel⁺ Cards shipped with the application.
 *
 * This file contains the complete definition of all cards that ship with Voxel⁺.
 * To add, edit, or remove a built-in card, modify this file.
 *
 * Important lifecycle rules:
 * - Cards with stable IDs should keep their IDs across updates
 * - Built-in cards have source: 'builtin'
 * - If a card is removed from this file, existing installations become "retired"
 * - Retired cards remain installed but cannot be reinstalled
 * - Card version (cardVersion) is separate from Minecraft/loader versions
 */

import { VoxelCard } from '../../types';

/**
 * Returns the complete list of built-in Voxel⁺ cards.
 * These are the official cards shipped with the application.
 */
export function getDefaultCards(): VoxelCard[] {
  return [
    {
      schemaVersion: 1,
      id: 'voxelplus-performance-263',
      name: 'Voxel⁺ Performance',
      description:
        'A curated selection of performance mods optimized for Minecraft development environments. Includes Sodium and Lithium for maximum FPS and reduced lag.',
      tagline: 'Max FPS for Minecraft dev',
      artwork: null,
      cardVersion: '1.0.0',
      minecraftVersion: '26.3',
      loaderType: 'fabric',
      loaderVersion: '0.19.5',
      source: 'builtin',
      mods: [
        {
          provider: 'modrinth',
          projectId: 'AANobbMI',
          projectName: 'Sodium',
          versionId: 'v4PSXean',
          versionName: 'Sodium 0.9.3-alpha.1 for Fabric 26.3',
          downloadUrl: 'https://cdn.modrinth.com/data/AANobbMI/versions/v4PSXean/sodium-fabric-0.9.3-alpha.1%2Bmc26.3.jar',
          filename: 'sodium-fabric-0.9.3-alpha.1+mc26.3.jar',
          iconUrl: 'https://cdn.modrinth.com/data/AANobbMI/icon.png',
          contentType: 'mod',
        },
        {
          provider: 'modrinth',
          projectId: 'gvQqBUqZ',
          projectName: 'Lithium',
          versionId: 'xS0Q8LSi',
          versionName: 'Lithium 0.26.2 for Fabric',
          downloadUrl: 'https://cdn.modrinth.com/data/gvQqBUqZ/versions/xS0Q8LSi/lithium-fabric-0.26.2%2Bmc26.3.jar',
          filename: 'lithium-fabric-0.26.2+mc26.3.jar',
          iconUrl: 'https://cdn.modrinth.com/data/gvQqBUqZ/icon.png',
          contentType: 'mod',
        },
      ],
      tags: ['performance', 'fps', 'fabric'],
      author: 'Voxel⁺ Team',
      publishedAt: '2026-10-01T00:00:00.000Z',
      signature: null,
    },
  ];
}

/**
 * Helper to get a specific default card by ID.
 */
export function getDefaultCard(cardId: string): VoxelCard | null {
  return getDefaultCards().find(c => c.id === cardId) ?? null;
}

/**
 * Returns the set of all built-in card IDs.
 * Used to determine if a card is "built-in" vs user-created.
 */
export function getBuiltInCardIds(): Set<string> {
  return new Set(getDefaultCards().map(c => c.id));
}
