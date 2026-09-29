/**
 * Default Cards — Built-in Voxel⁺ Cards shipped with the application.
 *
 * This file contains the complete definition of all cards that ship with Voxel⁺.
 * To add, edit, or remove a built-in card, modify this file.
 *
 * Important lifecycle rules:
 * - Cards with stable IDs should keep their IDs across updates
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
        'A curated selection of performance mods optimized for Minecraft development environments. Includes Sodium, Lithium, and Starlight for maximum FPS and reduced lag.',
      tagline: 'Max FPS for Minecraft dev',
      artwork: null,
      cardVersion: '1.0.0',
      minecraftVersion: '26.3',
      loaderType: 'fabric',
      loaderVersion: '0.16.0',
      mods: [
        {
          provider: 'modrinth',
          projectId: 'AANobbMI',
          projectName: 'Sodium',
          versionId: 'PLACEHOLDER',
          versionName: 'mc26-compatible',
          downloadUrl: '',
          filename: 'sodium-placeholder.jar',
          iconUrl: 'https://cdn.modrinth.com/data/AANobbMI/icon.png',
          contentType: 'mod',
        },
        {
          provider: 'modrinth',
          projectId: 'gvQqBUqZ',
          projectName: 'Lithium',
          versionId: 'PLACEHOLDER',
          versionName: 'mc26-compatible',
          downloadUrl: '',
          filename: 'lithium-placeholder.jar',
          iconUrl: 'https://cdn.modrinth.com/data/gvQqBUqZ/icon.png',
          contentType: 'mod',
        },
      ],
      tags: ['performance', 'fps', 'fabric'],
      author: 'Voxel⁺ Team',
      publishedAt: new Date().toISOString(),
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
