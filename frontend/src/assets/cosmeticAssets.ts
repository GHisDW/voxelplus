import { MINECRAFT_ITEMS } from './items';

export interface CosmeticDef {
  id: string;
  name: string;
  type: 'item' | 'frame' | 'effect' | 'badge';
  textureUrl: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  description: string;
  effectClass?: string;
  isEffect?: boolean;
  unlockedByDefault?: boolean;
}

// Map item IDs to their texture dataUrls from MINECRAFT_ITEMS
function getTexture(itemId: string): string {
  const item = MINECRAFT_ITEMS.find((i) => i.id === itemId || i.id === `minecraft:${itemId}`);
  return item?.dataUrl || '';
}

export const COSMETIC_ITEMS: CosmeticDef[] = [
  {
    id: 'dirt_block',
    name: 'Grass Block',
    type: 'item',
    textureUrl: getTexture('grass_block'),
    rarity: 'common',
    description: 'The foundation of every world you create.',
    unlockedByDefault: true
  },
  {
    id: 'crafting_table',
    name: 'Crafting Table',
    type: 'item',
    textureUrl: getTexture('crafting_table'),
    rarity: 'common',
    description: '3x3 grid of infinite possibilities.',
    unlockedByDefault: false
  },
  {
    id: 'diamond',
    name: 'Pure Diamond',
    type: 'item',
    textureUrl: getTexture('diamond'),
    rarity: 'rare',
    description: 'Rare gemstone excavated from deep underground caverns.',
    unlockedByDefault: false
  },
  {
    id: 'golden_apple',
    name: 'Golden Apple',
    type: 'item',
    textureUrl: getTexture('golden_apple'),
    rarity: 'rare',
    description: 'Infused with regeneration and vitality enchantments.',
    unlockedByDefault: false
  },
  {
    id: 'totem_of_undying',
    name: 'Totem of Undying',
    type: 'item',
    textureUrl: getTexture('totem_of_undying'),
    rarity: 'epic',
    description: 'Bestows second life and cheat-death warding.',
    unlockedByDefault: false
  },
  {
    id: 'netherite_ingot',
    name: 'Netherite Ingot',
    type: 'item',
    textureUrl: getTexture('netherite_ingot'),
    rarity: 'epic',
    description: 'Forged from ancient Nether debris, indestructible in lava.',
    unlockedByDefault: false
  },
  {
    id: 'elytra',
    name: 'Elytra Wings',
    type: 'item',
    textureUrl: getTexture('elytra'),
    rarity: 'legendary',
    description: 'Aerodynamic wings discovered within mysterious End Ships.',
    unlockedByDefault: false
  },
  {
    id: 'enchantment_glint',
    name: 'Enchantment Glint',
    type: 'effect',
    isEffect: true,
    textureUrl: getTexture('enchanted_book'),
    rarity: 'legendary',
    description: 'Classic shimmering purple Minecraft enchantment glint sweep across your avatar.',
    effectClass: 'effect-enchantment-glint',
    unlockedByDefault: false
  },
  {
    id: 'golden_radiance',
    name: 'Golden Radiance',
    type: 'effect',
    isEffect: true,
    textureUrl: getTexture('beacon'),
    rarity: 'epic',
    description: 'Blazing golden aura of sunlight sweeping your player profile.',
    effectClass: 'effect-golden-radiance',
    unlockedByDefault: false
  },
  {
    id: 'prismatic_shimmer',
    name: 'Prismatic Shimmer',
    type: 'effect',
    isEffect: true,
    textureUrl: getTexture('heart_of_the_sea'),
    rarity: 'legendary',
    description: 'Mesmerizing holographic rainbow sheen sweeping across your avatar.',
    effectClass: 'effect-prismatic-shimmer',
    unlockedByDefault: false
  }
];

export function getCosmeticDef(id: string | null | undefined): CosmeticDef | undefined {
  if (!id) return undefined;
  return COSMETIC_ITEMS.find((c) => c.id === id);
}

export function getCosmeticEffectClass(cosmeticId: string | null | undefined): string {
  const def = getCosmeticDef(cosmeticId);
  return def?.effectClass || '';
}

// Local storage helper for unlocked cosmetics (persisted per user)
const UNLOCKED_STORAGE_KEY = 'voxelplus_unlocked_cosmetics';

export function getUnlockedCosmetics(userId: string): string[] {
  try {
    const raw = localStorage.getItem(`${UNLOCKED_STORAGE_KEY}_${userId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return ['dirt_block']; // Default free starter
}

export function unlockCosmeticForUser(userId: string, cosmeticId: string): void {
  try {
    const unlocked = getUnlockedCosmetics(userId);
    if (!unlocked.includes(cosmeticId)) {
      unlocked.push(cosmeticId);
      localStorage.setItem(`${UNLOCKED_STORAGE_KEY}_${userId}`, JSON.stringify(unlocked));
    }
  } catch {}
}
