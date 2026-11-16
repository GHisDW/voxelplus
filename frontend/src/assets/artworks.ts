import { MINECRAFT_ITEMS } from './items';

export interface ArtworkPreset {
  id: string;
  name: string;
  gradient: string;
  accentColor: string;
  theme: string;
  textureUri: string;
}

// Generate Minecraft-authentic block & item composition artworks
// using official bundled textures from MINECRAFT_ITEMS
function createMinecraftCompositeUri(
  centerItemId: string,
  flankingItemIds: string[],
  bgHex: string,
  accentHex: string
): string {
  const centerItem = MINECRAFT_ITEMS.find(i => i.id === centerItemId) || MINECRAFT_ITEMS[0];
  const flank1 = MINECRAFT_ITEMS.find(i => i.id === flankingItemIds[0]) || MINECRAFT_ITEMS[1];
  const flank2 = MINECRAFT_ITEMS.find(i => i.id === flankingItemIds[1]) || MINECRAFT_ITEMS[2];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgHex}" />
        <stop offset="100%" stop-color="#0a0d14" />
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${accentHex}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${accentHex}" stop-opacity="0"/>
      </radialGradient>
      <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect width="100%" height="100%" fill="url(#grid)"/>
    <circle cx="160" cy="90" r="70" fill="url(#glow)"/>

    <!-- Authentic Minecraft items collage -->
    <g transform="translate(60, 66) scale(2.5)" opacity="0.5">
      <image href="${flank1.dataUrl}" width="16" height="16" style="image-rendering: pixelated;"/>
    </g>
    <g transform="translate(220, 66) scale(2.5)" opacity="0.5">
      <image href="${flank2.dataUrl}" width="16" height="16" style="image-rendering: pixelated;"/>
    </g>
    <g transform="translate(136, 58) scale(4)">
      <image href="${centerItem.dataUrl}" width="16" height="16" style="image-rendering: pixelated;"/>
    </g>
  </svg>`.replace(/\s+/g, ' ');

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const ARTWORK_PRESETS: ArtworkPreset[] = [
  {
    id: 'preset:grass_block',
    name: 'Overworld Wilderness',
    gradient: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #052e16 100%)',
    accentColor: '#22c55e',
    theme: 'green',
    textureUri: createMinecraftCompositeUri('minecraft:grass_block', ['minecraft:diamond_pickaxe', 'minecraft:crafting_table'], '#14532d', '#22c55e')
  },
  {
    id: 'preset:nether_star',
    name: 'Nether Wastes & Fortress',
    gradient: 'linear-gradient(135deg, #7f1d1d 0%, #450a0a 50%, #1e0505 100%)',
    accentColor: '#ef4444',
    theme: 'red',
    textureUri: createMinecraftCompositeUri('minecraft:nether_star', ['minecraft:blaze_rod', 'minecraft:netherite_sword'], '#7f1d1d', '#ef4444')
  },
  {
    id: 'preset:the_end',
    name: 'The End Dimension',
    gradient: 'linear-gradient(135deg, #581c87 0%, #3b0764 50%, #17042a 100%)',
    accentColor: '#c084fc',
    theme: 'purple',
    textureUri: createMinecraftCompositeUri('minecraft:elytra', ['minecraft:ender_pearl', 'minecraft:end_crystal'], '#581c87', '#c084fc')
  },
  {
    id: 'preset:diamond_gear',
    name: 'Deepslate Expedition',
    gradient: 'linear-gradient(135deg, #0e7490 0%, #155e75 50%, #082f49 100%)',
    accentColor: '#38bdf8',
    theme: 'blue',
    textureUri: createMinecraftCompositeUri('minecraft:diamond', ['minecraft:diamond_sword', 'minecraft:enchanted_book'], '#0e7490', '#38bdf8')
  },
  {
    id: 'preset:ancient_city',
    name: 'Deep Dark & Ancient Relics',
    gradient: 'linear-gradient(135deg, #042f2e 0%, #115e59 50%, #021a1a 100%)',
    accentColor: '#2dd4bf',
    theme: 'teal',
    textureUri: createMinecraftCompositeUri('minecraft:totem_of_undying', ['minecraft:heart_of_the_sea', 'minecraft:amethyst_shard'], '#042f2e', '#2dd4bf')
  },
  {
    id: 'preset:redstone_lab',
    name: 'Redstone Engineering',
    gradient: 'linear-gradient(135deg, #831843 0%, #500724 50%, #1f020d 100%)',
    accentColor: '#fb7185',
    theme: 'red',
    textureUri: createMinecraftCompositeUri('minecraft:redstone', ['minecraft:command_block', 'minecraft:tnt'], '#831843', '#fb7185')
  }
];

// Artwork cache to avoid repeatedly resolving or processing identical artworks
const artworkCache = new Map<string, string>();

/**
 * Validates custom artwork string (must be valid safe data URI, local path, or preset ID)
 */
export function validateArtworkFormat(artwork: string | null | undefined): boolean {
  if (!artwork) return true;
  if (artwork.startsWith('preset:')) return true;
  if (artwork.startsWith('data:image/')) {
    // Check max safe size (e.g. 5MB)
    return artwork.length <= 5 * 1024 * 1024 * 1.37;
  }
  // Local filesystem path or file:// URL
  if (artwork.startsWith('file://') || /^[a-zA-Z0-9_\-./\\]+\.(png|jpg|jpeg|webp)$/i.test(artwork)) {
    return true;
  }
  return false;
}

export function getArtworkStyle(artwork: string | null | undefined): string {
  const key = artwork || 'default';
  if (artworkCache.has(key)) {
    return artworkCache.get(key)!;
  }

  let result: string;
  if (!artwork || !validateArtworkFormat(artwork)) {
    const fallback = ARTWORK_PRESETS[0];
    result = `url("${fallback.textureUri}") center/cover no-repeat, ${fallback.gradient}`;
  } else if (artwork.startsWith('preset:')) {
    const found = ARTWORK_PRESETS.find(p => p.id === artwork) || ARTWORK_PRESETS[0];
    result = `url("${found.textureUri}") center/cover no-repeat, ${found.gradient}`;
  } else {
    // User custom uploaded data URL / safe cached URI
    const safeUrl = artwork.replace(/"/g, '%22');
    result = `url("${safeUrl}") center/cover no-repeat, ${ARTWORK_PRESETS[0].gradient}`;
  }

  artworkCache.set(key, result);
  return result;
}

export function getArtworkBackground(artwork: string | null | undefined): { backgroundImage: string; accentColor: string } {
  const found = ARTWORK_PRESETS.find(p => p.id === artwork) || ARTWORK_PRESETS[0];
  return {
    backgroundImage: getArtworkStyle(artwork),
    accentColor: found.accentColor
  };
}
