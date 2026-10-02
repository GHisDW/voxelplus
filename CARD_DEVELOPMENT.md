# Voxel⁺ Card Development Guide

This guide explains how to add, edit, or remove built-in Voxel⁺ cards that ship with the application.

## Overview

Built-in cards are the official Voxel⁺ cards that users can install from the Shop. They are defined in a centralized configuration file for easy maintenance.

## Card Definition Location

All built-in cards are defined in:
```
electron/backend/cards/defaultCards.ts
```

This file is the canonical single source of truth for all built-in cards shipped with Voxel⁺. The application never fabricates fallback cards if `defaultCards.ts` cannot be loaded.

## Developer Mode IPC Authorization

Developer operations (saving, deleting, or retiring cards) are protected by backend IPC authorization guards in `electron/main.ts`. Attempting to invoke developer card commands without developer mode active (`!app.isPackaged || process.env.NODE_ENV === 'development'`) throws a structured `DEVELOPER_MODE_REQUIRED` error.

## Card Structure

Each card follows the `VoxelCard` interface from `electron/types.ts`:

```typescript
{
  schemaVersion: 1,                          // Schema version for migration support
  id: 'example-card',                        // Stable, immutable ID (never change this)
  name: 'Example Card',                      // Display name (can be changed)
  description: 'A detailed description...', // Card description
  tagline: 'Short tagline',                 // Short tagline shown on card tiles
  artwork: null,                             // Artwork URL or data URI (optional)
  cardVersion: '1.0.0',                      // Card version (separate from MC/mod versions)
  minecraftVersion: '26.3',                 // Target Minecraft version
  loaderType: 'fabric',                     // Loader type: 'fabric' | 'forge' | 'neoforge' | 'quilt'
  loaderVersion: '0.16.0',                  // Exact loader version
  mods: [...],                              // Array of mod references
  tags: ['performance', 'fps'],            // Tags for filtering
  author: 'Voxel⁺ Team',                    // Card author/publisher
  publishedAt: '2024-01-01T00:00:00.000Z', // ISO date of this card version
  signature: null                            // Reserved for future signing (null for now)
}
```

## Stable IDs

**CRITICAL**: Every card must have a stable, immutable `id` field. This ID should:

- Never change between card versions
- Never be reused for different cards
- Survive card renames
- Be lowercase, use hyphens for spaces
- Be unique across all cards

Example good IDs:
- `voxelplus-performance-263`
- `survival-plus-fabric`
- `redstone-automation`

Example bad IDs:
- `Performance Pack` (spaces, may change)
- `card-12345` (generic, unclear)
- `my-card-v2` (version in ID, breaks versioning)

## Card Versioning

Cards have their own version system (`cardVersion`) that is completely separate from:
- Minecraft version
- Loader version  
- Individual mod versions

When you update a card:
1. Keep the same `id`
2. Increment `cardVersion` (e.g., `1.0.0` → `1.1.0`)
3. Update other fields as needed (name, description, mods, etc.)

This allows Voxel⁺ to track card updates independently of the actual content versions.

## Mod References

Each mod in the `mods` array is a `CardModRef` that explicitly identifies a specific file from a content provider:

```typescript
{
  provider: 'modrinth',                    // 'modrinth' or 'curseforge'
  projectId: 'AANobbMI',                   // Provider-specific project ID
  projectName: 'Sodium',                   // Display name
  versionId: 'PLACEHOLDER',                // Provider-specific version ID
  versionName: 'mc26-compatible',          // Display version name
  downloadUrl: '',                          // Direct download URL for the exact file
  filename: 'sodium-placeholder.jar',     // Filename to use on disk
  iconUrl: 'https://cdn.modrinth.com/...', // Icon URL for display
  contentType: 'mod',                      // 'mod' | 'resourcepack' | 'shader'
  unresolved: false                         // True if provider identity couldn't be resolved
}
```

## Content Providers

Currently supported providers:
- `modrinth` - Fully functional
- `curseforge` - Infrastructure ready, requires API key

Mod references should clearly identify their provider. This enables future CurseForge integration without breaking existing cards.

## Adding a New Card

1. Open `electron/backend/cards/defaultCards.ts`
2. Add a new card object to the array returned by `getDefaultCards()`
3. Choose a stable, unique `id`
4. Set `cardVersion: '1.0.0'`
5. Fill in all required fields
6. Add mod references with valid provider data
7. Test locally by running Voxel⁺

Example:

```typescript
{
  schemaVersion: 1,
  id: 'my-new-card',
  name: 'My New Card',
  description: 'A new card for testing...',
  tagline: 'Test Card',
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
  ],
  tags: ['test'],
  author: 'Voxel⁺ Team',
  publishedAt: new Date().toISOString(),
  signature: null,
}
```

## Editing an Existing Card

1. Find the card in `electron/backend/cards/defaultCards.ts`
2. **Keep the same `id`** (never change this)
3. Increment `cardVersion` if you're making substantive changes
4. Update other fields as needed
5. Test locally

## Removing a Card

When you remove a card from `defaultCards.ts`:

1. Delete the card object from the array
2. Users who already installed the card will NOT lose their instance
3. The card becomes "retired" - it shows as unavailable in the Shop
4. Users can still access their existing instance
5. The card cannot be reinstalled through the Shop

This protects user data and prevents silent data loss.

## Card Retirement System

The retirement system works automatically:

- When Voxel⁺ starts, it checks which cards are in the built-in set
- Cards that were previously built-in but are no longer in the set become "retired"
- Retired cards:
  - Show a "Retired" badge in the Shop
  - Cannot be reinstalled
  - Keep existing instances intact
  - Display a helpful message explaining the situation

## Minecraft Version Support

When adding Minecraft version support:

1. Check if the card's actual content is compatible with the new version
2. If compatible, add the version to `minecraftVersion`
3. If not compatible, do NOT claim compatibility
4. For ranges, consider creating separate cards for different MC versions

Currently, Voxel⁺ supports Minecraft 26.3 as an official release version.

## Testing a Card Locally

1. Add or edit the card in `defaultCards.ts`
2. Build and run Voxel⁺
3. Navigate to the Shop page
4. Find your card in the list
5. Click to view details
6. Click "Install Card"
7. Verify the instance is created correctly
8. Check that mods are downloaded and installed
9. Launch the instance to verify it works

## Troubleshooting

**Card not showing in Shop:**
- Check that the card is in the `getDefaultCards()` array
- Verify the `id` is unique
- Check for syntax errors in the JSON

**Installation fails:**
- Verify all mod references have valid `downloadUrl` fields
- Check that the provider and project IDs are correct
- Look at console errors for specific failure reasons

**Mods don't download:**
- Ensure `downloadUrl` is a valid, accessible URL
- Check that the file size is reasonable
- Verify the mod is actually compatible with the specified MC version and loader

**Card shows as retired:**
- Check if the card ID exists in `defaultCards.ts`
- If you want the card available, ensure it's in the built-in set
- If you intentionally removed it, this is expected behavior

## Best Practices

1. **Use stable IDs**: Choose IDs that will never need to change
2. **Version properly**: Increment `cardVersion` when making changes
3. **Test thoroughly**: Always test cards before shipping
4. **Be specific**: Use exact version IDs, not just "latest"
5. **Document changes**: Keep track of what changed between card versions
6. **Protect user data**: Never change a card's ID or delete user instances
7. **Provider-agnostic**: Design cards to work with multiple providers

## Future Enhancements

Planned improvements to the card system:

- **Automatic version resolution**: Automatically find the best mod versions for a given MC version
- **Dependency handling**: Automatically include mod dependencies
- **Validation tools**: CLI tools to validate card definitions
- **Migration support**: Automatic migration when card schema changes
- **Signed cards**: Cryptographic signatures for official cards

## Questions?

If you have questions about card development, please refer to the main Voxel⁺ documentation or open an issue on GitHub.
