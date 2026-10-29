import { CosmeticDefinition, CosmeticEffect } from '../../types';

export const COSMETIC_EFFECTS: CosmeticEffect[] = [
  { id: 'fx-sparkle', name: 'Nether Stardust Sparkle', family: 'glitter', cssClass: 'fx-sparkle' },
  { id: 'fx-rainbow', name: 'Prismatic Beacon Aura', family: 'rainbow', cssClass: 'fx-rainbow' },
  { id: 'fx-shine', name: 'Diamond Hyper Luster', family: 'shine', cssClass: 'fx-shine' },
  { id: 'fx-enchant', name: 'Arcane Enchantment Glint', family: 'enchantment', cssClass: 'fx-enchant' },
  { id: 'fx-fire', name: 'Blaze Fire Trail', family: 'fire', cssClass: 'fx-fire' },
  { id: 'fx-ice', name: 'Frost Crystal Aura', family: 'ice', cssClass: 'fx-ice' },
  { id: 'fx-poison', name: 'Witch Poison Cloud', family: 'poison', cssClass: 'fx-poison' },
  { id: 'fx-ender', name: 'Enderman Teleport Dust', family: 'ender', cssClass: 'fx-ender' },
  { id: 'fx-golden', name: 'Golden Apple Radiance', family: 'golden', cssClass: 'fx-golden' },
  { id: 'fx-redstone', name: 'Redstone Pulse Energy', family: 'redstone', cssClass: 'fx-redstone' },
  { id: 'fx-nether', name: 'Nether Portal Swirl', family: 'nether', cssClass: 'fx-nether' },
  { id: 'fx-wither', name: 'Wither Skull Decay', family: 'wither', cssClass: 'fx-wither' }
];

export const COSMETIC_CATALOGUE: CosmeticDefinition[] = [
  // Gems & Minerals
  {
    id: 'cosmetic-gem-emerald',
    name: 'Villager Emerald',
    description: 'The iconic brilliant green gem traded across Minecraft villages.',
    rarity: 'common',
    category: 'gem',
    artworkPath: 'minecraft:emerald',
    unlockCondition: null,
    price: 0,
    supportedEffectIds: ['fx-sparkle', 'fx-shine'],
    available: true
  },
  {
    id: 'cosmetic-gem-diamond',
    name: 'Flawless Diamond',
    description: 'Mined deep beneath Y=0, shimmering with pure subterranean brilliance.',
    rarity: 'epic',
    category: 'gem',
    artworkPath: 'minecraft:diamond',
    unlockCondition: null,
    price: 350,
    supportedEffectIds: ['fx-sparkle', 'fx-rainbow', 'fx-shine', 'fx-ice'],
    available: true
  },
  {
    id: 'cosmetic-gem-amethyst',
    name: 'Geode Amethyst Shard',
    description: 'A vibrant purple crystalline shard harvested inside an underground geode.',
    rarity: 'rare',
    category: 'gem',
    artworkPath: 'minecraft:amethyst_shard',
    unlockCondition: null,
    price: 250,
    supportedEffectIds: ['fx-sparkle', 'fx-enchant', 'fx-ender'],
    available: true
  },
  {
    id: 'cosmetic-gem-netherite',
    name: 'Netherite Ingot',
    description: 'Forged from ancient debris and gold in the depths of the Nether.',
    rarity: 'legendary',
    category: 'gem',
    artworkPath: 'minecraft:netherite_ingot',
    unlockCondition: null,
    price: 850,
    supportedEffectIds: ['fx-enchant', 'fx-shine', 'fx-fire', 'fx-nether'],
    available: true
  },
  {
    id: 'cosmetic-gem-gold',
    name: 'Gilded Gold Ingot',
    description: 'Refined piglin currency gleaming with warmth.',
    rarity: 'uncommon',
    category: 'gem',
    artworkPath: 'minecraft:gold_ingot',
    unlockCondition: null,
    price: 150,
    supportedEffectIds: ['fx-shine'],
    available: true
  },
  {
    id: 'cosmetic-gem-redstone',
    name: 'Pulsing Redstone Dust',
    description: 'Crackles with electrical redstone potential and machinery power.',
    rarity: 'common',
    category: 'gem',
    artworkPath: 'minecraft:redstone',
    unlockCondition: null,
    price: 100,
    supportedEffectIds: ['fx-sparkle'],
    available: true
  },
  {
    id: 'cosmetic-gem-copper',
    name: 'Oxidized Copper Ingot',
    description: 'A versatile orange metal that conducts lightning and crafts golems.',
    rarity: 'common',
    category: 'gem',
    artworkPath: 'minecraft:copper_ingot',
    unlockCondition: null,
    price: 75,
    supportedEffectIds: ['fx-sparkle'],
    available: true
  },
  {
    id: 'cosmetic-gem-iron',
    name: 'Pure Iron Ingot',
    description: 'Heavy metallurgical standard used in armor, rails, and golems.',
    rarity: 'common',
    category: 'gem',
    artworkPath: 'minecraft:iron_ingot',
    unlockCondition: null,
    price: 100,
    supportedEffectIds: ['fx-shine'],
    available: true
  },
  {
    id: 'cosmetic-gem-prismarine',
    name: 'Prismarine Shard',
    description: 'Recovered from ocean monuments guarded by Elder Guardians.',
    rarity: 'uncommon',
    category: 'gem',
    artworkPath: 'minecraft:prismarine_crystals',
    unlockCondition: null,
    price: 180,
    supportedEffectIds: ['fx-sparkle', 'fx-rainbow'],
    available: true
  },
  {
    id: 'cosmetic-gem-glowstone',
    name: 'Glowstone Dust',
    description: 'Harvested from stalactites in the Nether ceiling.',
    rarity: 'uncommon',
    category: 'gem',
    artworkPath: 'minecraft:glowstone_dust',
    unlockCondition: null,
    price: 140,
    supportedEffectIds: ['fx-sparkle', 'fx-shine'],
    available: true
  },

  // Tools & Weapons
  {
    id: 'cosmetic-tool-iron-pickaxe',
    name: 'Iron Pickaxe',
    description: 'Reliable iron pick for cleaving through deepslate and ores.',
    rarity: 'common',
    category: 'mining',
    artworkPath: 'minecraft:iron_pickaxe',
    unlockCondition: null,
    price: 120,
    supportedEffectIds: ['fx-shine'],
    available: true
  },
  {
    id: 'cosmetic-tool-golden-pickaxe',
    name: 'Golden Efficiency Pickaxe',
    description: 'Mines at blisteringly fast speed with delicate golden durability.',
    rarity: 'uncommon',
    category: 'mining',
    artworkPath: 'minecraft:golden_pickaxe',
    unlockCondition: null,
    price: 220,
    supportedEffectIds: ['fx-shine'],
    available: true
  },
  {
    id: 'cosmetic-tool-diamond-pickaxe',
    name: 'Diamond Fortune Pickaxe',
    description: 'The quintessential tool of every true Minecraft caver and architect.',
    rarity: 'rare',
    category: 'mining',
    artworkPath: 'minecraft:diamond_pickaxe',
    unlockCondition: null,
    price: 320,
    supportedEffectIds: ['fx-shine', 'fx-enchant'],
    available: true
  },
  {
    id: 'cosmetic-tool-netherite-pickaxe',
    name: 'Netherite Pickaxe',
    description: 'Indestructible tool reforged with netherite smithing templates.',
    rarity: 'epic',
    category: 'mining',
    artworkPath: 'minecraft:netherite_pickaxe',
    unlockCondition: null,
    price: 650,
    supportedEffectIds: ['fx-enchant', 'fx-shine'],
    available: true
  },
  {
    id: 'cosmetic-tool-diamond-sword',
    name: 'Diamond Sharpness Sword',
    description: 'A razor-sharp blade ready to vanquish any hostile mob.',
    rarity: 'rare',
    category: 'mining',
    artworkPath: 'minecraft:diamond_sword',
    unlockCondition: null,
    price: 350,
    supportedEffectIds: ['fx-shine', 'fx-enchant'],
    available: true
  },
  {
    id: 'cosmetic-tool-netherite-sword',
    name: 'Netherite Blade',
    description: 'Fire-resistant black alloy blade capable of searing through armor.',
    rarity: 'epic',
    category: 'mining',
    artworkPath: 'minecraft:netherite_sword',
    unlockCondition: null,
    price: 750,
    supportedEffectIds: ['fx-enchant', 'fx-rainbow', 'fx-fire', 'fx-nether'],
    available: true
  },
  {
    id: 'cosmetic-tool-trident',
    name: 'Oceanic Trident',
    description: 'Hurled with Channeling or Riptide across storm-swept seas.',
    rarity: 'epic',
    category: 'mining',
    artworkPath: 'minecraft:trident',
    unlockCondition: null,
    price: 650,
    supportedEffectIds: ['fx-rainbow', 'fx-sparkle'],
    available: true
  },
  {
    id: 'cosmetic-tool-bow',
    name: 'Infinity Power Bow',
    description: 'Launches volleys of arrows across vast multiplayer battlefields.',
    rarity: 'uncommon',
    category: 'mining',
    artworkPath: 'minecraft:bow',
    unlockCondition: null,
    price: 200,
    supportedEffectIds: ['fx-shine'],
    available: true
  },
  {
    id: 'cosmetic-tool-crossbow',
    name: 'Quick Charge Crossbow',
    description: 'Snaps shut with devastating pierces and firework ammo.',
    rarity: 'rare',
    category: 'mining',
    artworkPath: 'minecraft:crossbow',
    unlockCondition: null,
    price: 280,
    supportedEffectIds: ['fx-sparkle', 'fx-shine'],
    available: true
  },
  {
    id: 'cosmetic-tool-spyglass',
    name: 'Amethyst Spyglass',
    description: 'Focuses vision on distant pillager outposts and mansions.',
    rarity: 'uncommon',
    category: 'mining',
    artworkPath: 'minecraft:spyglass',
    unlockCondition: null,
    price: 160,
    supportedEffectIds: ['fx-sparkle'],
    available: true
  },

  // Relics & Rare Artifacts
  {
    id: 'cosmetic-relic-totem',
    name: 'Totem of Undying',
    description: 'Clutched in your off-hand to cheat death and grant regeneration.',
    rarity: 'epic',
    category: 'relic',
    artworkPath: 'minecraft:totem_of_undying',
    unlockCondition: null,
    price: 550,
    supportedEffectIds: ['fx-sparkle', 'fx-rainbow'],
    available: true
  },
  {
    id: 'cosmetic-relic-nether-star',
    name: 'Nether Star',
    description: 'Claimed by defeating the Wither; power source of majestic beacons.',
    rarity: 'legendary',
    category: 'relic',
    artworkPath: 'minecraft:nether_star',
    unlockCondition: null,
    price: 1200,
    supportedEffectIds: ['fx-sparkle', 'fx-rainbow', 'fx-shine', 'fx-enchant', 'fx-wither', 'fx-golden'],
    available: true
  },
  {
    id: 'cosmetic-relic-beacon',
    name: 'Sky Beacon',
    description: 'Channels high-frequency energy pyramids into the clouds.',
    rarity: 'epic',
    category: 'relic',
    artworkPath: 'minecraft:beacon',
    unlockCondition: null,
    price: 800,
    supportedEffectIds: ['fx-rainbow', 'fx-shine'],
    available: true
  },
  {
    id: 'cosmetic-relic-elytra',
    name: 'End City Elytra',
    description: 'Woven wings recovered from flying End Ships that grant flight.',
    rarity: 'legendary',
    category: 'relic',
    artworkPath: 'minecraft:elytra',
    unlockCondition: null,
    price: 1500,
    supportedEffectIds: ['fx-sparkle', 'fx-rainbow', 'fx-shine', 'fx-enchant', 'fx-ender'],
    available: true
  },
  {
    id: 'cosmetic-relic-heart-sea',
    name: 'Heart of the Sea',
    description: 'A blue glowing sphere that fuels Conduit Power underwater.',
    rarity: 'rare',
    category: 'relic',
    artworkPath: 'minecraft:heart_of_the_sea',
    unlockCondition: null,
    price: 450,
    supportedEffectIds: ['fx-rainbow', 'fx-sparkle'],
    available: true
  },
  {
    id: 'cosmetic-relic-golden-apple',
    name: 'Enchanted Golden Apple',
    description: 'The mythical Notch Apple conferring Absorption and Fire Resistance.',
    rarity: 'epic',
    category: 'relic',
    artworkPath: 'minecraft:golden_apple',
    unlockCondition: null,
    price: 700,
    supportedEffectIds: ['fx-enchant', 'fx-shine', 'fx-golden'],
    available: true
  },
  {
    id: 'cosmetic-relic-dragon-egg',
    name: 'The Dragon Egg',
    description: 'The sole souvenir from defeating the Ender Dragon atop the obsidian pillar.',
    rarity: 'legendary',
    category: 'relic',
    artworkPath: 'minecraft:dragon_egg',
    unlockCondition: null,
    price: 2000,
    supportedEffectIds: ['fx-enchant', 'fx-sparkle'],
    available: true
  },
  {
    id: 'cosmetic-relic-enchanted-book',
    name: 'Mending Enchanted Book',
    description: 'Inscribed with shimmering runic knowledge that repairs equipment with XP.',
    rarity: 'rare',
    category: 'relic',
    artworkPath: 'minecraft:enchanted_book',
    unlockCondition: null,
    price: 350,
    supportedEffectIds: ['fx-enchant'],
    available: true
  },
  {
    id: 'cosmetic-relic-ender-eye',
    name: 'Eye of Ender',
    description: 'Spins upward through the sky guiding explorers toward the Stronghold.',
    rarity: 'uncommon',
    category: 'relic',
    artworkPath: 'minecraft:ender_eye',
    unlockCondition: null,
    price: 200,
    supportedEffectIds: ['fx-sparkle'],
    available: true
  },
  {
    id: 'cosmetic-relic-end-crystal',
    name: 'Ender Crystal',
    description: 'A glass cube enclosing spinning obsidian plates and healing dragon flame.',
    rarity: 'epic',
    category: 'relic',
    artworkPath: 'minecraft:end_crystal',
    unlockCondition: null,
    price: 600,
    supportedEffectIds: ['fx-rainbow', 'fx-sparkle'],
    available: true
  },
  {
    id: 'cosmetic-relic-soul-lantern',
    name: 'Soul Lantern',
    description: 'Cyan flame that keeps Piglins at bay and lights subterranean crypts.',
    rarity: 'uncommon',
    category: 'relic',
    artworkPath: 'minecraft:soul_lantern',
    unlockCondition: null,
    price: 180,
    supportedEffectIds: ['fx-shine'],
    available: true
  },
  {
    id: 'cosmetic-relic-cookie',
    name: 'Legendary Chocolate Cookie',
    description: 'Mouth-watering treat baked by the master chefs of the Voxel Bakery.',
    rarity: 'rare',
    category: 'relic',
    artworkPath: 'minecraft:cookie',
    unlockCondition: null,
    price: 250,
    supportedEffectIds: ['fx-sparkle'],
    available: true
  }
];

export class CosmeticCatalogue {
  public static getAll(): CosmeticDefinition[] {
    return COSMETIC_CATALOGUE;
  }

  public static getById(id: string): CosmeticDefinition | undefined {
    return COSMETIC_CATALOGUE.find(c => c.id === id);
  }

  public static getEffects(): CosmeticEffect[] {
    return COSMETIC_EFFECTS;
  }

  public static getEffectById(id: string): CosmeticEffect | undefined {
    return COSMETIC_EFFECTS.find(e => e.id === id);
  }
}
