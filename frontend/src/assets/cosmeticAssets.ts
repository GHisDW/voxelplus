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
}

// Map item IDs to their texture dataUrls from MINECRAFT_ITEMS
function getTexture(itemId: string): string {
  const item = MINECRAFT_ITEMS.find((i) => i.id === itemId || i.id === `minecraft:${itemId}`);
  return item?.dataUrl || '';
}

/**
 * Visual definitions keyed by the CANONICAL server catalog ids
 * (voxel_cosmetics.id). These are display assets only — ownership lives
 * exclusively in the cloud (voxel_user_cosmetics); nothing here unlocks,
 * grants, or persists cosmetics.
 */
export const COSMETIC_ITEMS: CosmeticDef[] = [
  { id: 'cosmetic_dirt_block', name: 'Grass Block', type: 'item', textureUrl: getTexture('grass_block'), rarity: 'common', description: 'The foundation of every world you create.' },
  { id: 'cosmetic_grass_block', name: 'Grass Block', type: 'item', textureUrl: getTexture('grass_block'), rarity: 'common', description: 'The surface of the world.' },
  { id: 'cosmetic_crafting_table', name: 'Crafting Table', type: 'item', textureUrl: getTexture('crafting_table'), rarity: 'common', description: '3x3 grid of infinite possibilities.' },
  { id: 'cosmetic_compass', name: 'Compass', type: 'item', textureUrl: getTexture('compass'), rarity: 'rare', description: 'Points toward adventure.' },
  { id: 'cosmetic_chest', name: 'Chest', type: 'item', textureUrl: getTexture('chest'), rarity: 'rare', description: 'A collector\'s pride.' },
  { id: 'cosmetic_diamond', name: 'Diamond', type: 'item', textureUrl: getTexture('diamond'), rarity: 'epic', description: 'The rarest of treasures.' },
  { id: 'cosmetic_netherite', name: 'Netherite Ingot', type: 'item', textureUrl: getTexture('netherite_ingot'), rarity: 'epic', description: 'Forged in the Nether.' },
  { id: 'cosmetic_emerald', name: 'Emerald', type: 'item', textureUrl: getTexture('emerald'), rarity: 'rare', description: 'A merchant\'s currency.' },
  { id: 'cosmetic_nether_star', name: 'Nether Star', type: 'item', textureUrl: getTexture('nether_star'), rarity: 'legendary', description: 'The rarest cosmetic.' },
  { id: 'cosmetic_ender_dragon_egg', name: 'Dragon Egg', type: 'item', textureUrl: getTexture('dragon_egg'), rarity: 'legendary', description: 'The ultimate trophy.' },
  { id: 'cosmetic_beacon', name: 'Beacon', type: 'item', textureUrl: getTexture('beacon'), rarity: 'legendary', description: 'A beacon of light.' },
  { id: 'cosmetic_totem', name: 'Totem of Undying', type: 'item', textureUrl: getTexture('totem_of_undying'), rarity: 'epic', description: 'Cheating death.' },
  { id: 'cosmetic_book', name: 'Enchanted Book', type: 'badge', textureUrl: getTexture('enchanted_book'), rarity: 'common', description: 'Knowledge is power.' },
  { id: 'cosmetic_sword', name: 'Diamond Sword', type: 'badge', textureUrl: getTexture('diamond_sword'), rarity: 'rare', description: 'Ready for battle.' },
  { id: 'cosmetic_elytra_x', name: 'Elytra', type: 'item', textureUrl: getTexture('elytra'), rarity: 'legendary', description: 'Wings of the End.' },
  {
    id: 'effect_enchanted_glint', name: 'Enchanted Glint', type: 'effect', isEffect: true,
    textureUrl: getTexture('enchanted_book'), rarity: 'rare',
    description: 'Classic shimmering purple Minecraft enchantment glint sweep across your avatar.',
    effectClass: 'effect-enchantment-glint'
  },
  {
    id: 'effect_golden_radiance', name: 'Golden Radiance', type: 'effect', isEffect: true,
    textureUrl: getTexture('beacon'), rarity: 'epic',
    description: 'Blazing golden aura of sunlight sweeping your player profile.',
    effectClass: 'effect-golden-radiance'
  },
  {
    id: 'effect_prismatic_shimmer', name: 'Prismatic Shimmer', type: 'effect', isEffect: true,
    textureUrl: getTexture('heart_of_the_sea'), rarity: 'legendary',
    description: 'Mesmerizing holographic rainbow sheen sweeping across your avatar.',
    effectClass: 'effect-prismatic-shimmer'
  },
  {
    id: 'effect_smoldering_ember', name: 'Smoldering Ember', type: 'effect', isEffect: true,
    textureUrl: getTexture('blaze_powder'), rarity: 'epic',
    description: 'Nether-hot embers trail behind you.',
    effectClass: 'effect-smoldering-ember'
  },
  {
    id: 'effect_frost_aura', name: 'Frost Aura', type: 'effect', isEffect: true,
    textureUrl: getTexture('snowball'), rarity: 'rare',
    description: 'Cold as powdered snow.',
    effectClass: 'effect-frost-aura'
  }
];

export function getCosmeticDef(id: string | null | undefined): CosmeticDef | undefined {
  if (!id) return undefined;
  return COSMETIC_ITEMS.find((c) => c.id === id);
}

/**
 * Closed-set effect renderer mapping: a cosmetic id maps to one of a fixed
 * set of CSS classes — never arbitrary server-supplied CSS/JS.
 */
export function getCosmeticEffectClass(cosmeticId: string | null | undefined): string {
  const def = getCosmeticDef(cosmeticId);
  return def?.effectClass || '';
}
