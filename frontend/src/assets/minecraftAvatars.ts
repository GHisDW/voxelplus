// Authentic Minecraft Pixel-Art Heads for Avatar Presets
// Crisp, pixelated SVGs following official Minecraft character textures

function createPixelSvg(pixels: string[][], size = 8): string {
  let rects = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = pixels[y]?.[x];
      if (color && color !== 'transparent') {
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}" />`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${rects}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 8x8 Steve Head
const STEVE_PIXELS: string[][] = [
  ['#4d3324', '#4d3324', '#4d3324', '#4d3324', '#4d3324', '#4d3324', '#4d3324', '#4d3324'],
  ['#4d3324', '#4d3324', '#4d3324', '#4d3324', '#4d3324', '#4d3324', '#4d3324', '#4d3324'],
  ['#4d3324', '#b88364', '#b88364', '#b88364', '#b88364', '#b88364', '#b88364', '#4d3324'],
  ['#b88364', '#b88364', '#b88364', '#b88364', '#b88364', '#b88364', '#b88364', '#b88364'],
  ['#b88364', '#ffffff', '#2e388f', '#b88364', '#b88364', '#2e388f', '#ffffff', '#b88364'],
  ['#b88364', '#b88364', '#b88364', '#995f40', '#995f40', '#b88364', '#b88364', '#b88364'],
  ['#b88364', '#b88364', '#4d3324', '#4d3324', '#4d3324', '#4d3324', '#b88364', '#b88364'],
  ['#b88364', '#b88364', '#b88364', '#b88364', '#b88364', '#b88364', '#b88364', '#b88364']
];

// 8x8 Alex Head
const ALEX_PIXELS: string[][] = [
  ['#a05126', '#a05126', '#a05126', '#a05126', '#a05126', '#a05126', '#a05126', '#a05126'],
  ['#a05126', '#a05126', '#a05126', '#a05126', '#a05126', '#a05126', '#a05126', '#a05126'],
  ['#a05126', '#d69e80', '#d69e80', '#d69e80', '#d69e80', '#d69e80', '#d69e80', '#a05126'],
  ['#a05126', '#d69e80', '#d69e80', '#d69e80', '#d69e80', '#d69e80', '#d69e80', '#a05126'],
  ['#a05126', '#ffffff', '#3f7a4e', '#d69e80', '#d69e80', '#3f7a4e', '#ffffff', '#a05126'],
  ['#d69e80', '#d69e80', '#d69e80', '#b5795c', '#b5795c', '#d69e80', '#d69e80', '#d69e80'],
  ['#d69e80', '#d69e80', '#b15a4e', '#b15a4e', '#b15a4e', '#b15a4e', '#d69e80', '#d69e80'],
  ['#d69e80', '#d69e80', '#d69e80', '#d69e80', '#d69e80', '#d69e80', '#d69e80', '#d69e80']
];

// 8x8 Creeper Head
const CREEPER_PIXELS: string[][] = [
  ['#45a83a', '#45a83a', '#3da033', '#45a83a', '#3da033', '#45a83a', '#45a83a', '#3da033'],
  ['#3da033', '#45a83a', '#3da033', '#45a83a', '#45a83a', '#3da033', '#45a83a', '#45a83a'],
  ['#45a83a', '#000000', '#000000', '#45a83a', '#45a83a', '#000000', '#000000', '#45a83a'],
  ['#45a83a', '#000000', '#000000', '#45a83a', '#45a83a', '#000000', '#000000', '#3da033'],
  ['#3da033', '#45a83a', '#45a83a', '#000000', '#000000', '#45a83a', '#45a83a', '#45a83a'],
  ['#45a83a', '#45a83a', '#000000', '#000000', '#000000', '#000000', '#45a83a', '#3da033'],
  ['#3da033', '#45a83a', '#000000', '#000000', '#000000', '#000000', '#45a83a', '#45a83a'],
  ['#45a83a', '#3da033', '#000000', '#45a83a', '#45a83a', '#000000', '#3da033', '#45a83a']
];

// 8x8 Enderman Head
const ENDERMAN_PIXELS: string[][] = [
  ['#141414', '#141414', '#101010', '#141414', '#141414', '#101010', '#141414', '#141414'],
  ['#141414', '#101010', '#141414', '#141414', '#101010', '#141414', '#141414', '#101010'],
  ['#101010', '#141414', '#141414', '#101010', '#141414', '#141414', '#101010', '#141414'],
  ['#141414', '#141414', '#101010', '#141414', '#141414', '#101010', '#141414', '#141414'],
  ['#b038db', '#f58eff', '#b038db', '#141414', '#141414', '#b038db', '#f58eff', '#b038db'],
  ['#141414', '#101010', '#141414', '#141414', '#101010', '#141414', '#141414', '#101010'],
  ['#101010', '#141414', '#141414', '#101010', '#141414', '#141414', '#101010', '#141414'],
  ['#141414', '#141414', '#101010', '#141414', '#141414', '#101010', '#141414', '#141414']
];

// 8x8 Blaze Head
const BLAZE_PIXELS: string[][] = [
  ['#9c3403', '#d95d07', '#ff8400', '#ff8400', '#ff8400', '#ff8400', '#d95d07', '#9c3403'],
  ['#d95d07', '#ff8400', '#ffa726', '#ffa726', '#ffa726', '#ffa726', '#ff8400', '#d95d07'],
  ['#ff8400', '#ffa726', '#ffea00', '#ffa726', '#ffa726', '#ffea00', '#ffa726', '#ff8400'],
  ['#ff8400', '#ffffff', '#d95d07', '#ffa726', '#ffa726', '#ffffff', '#d95d07', '#ff8400'],
  ['#d95d07', '#ff8400', '#ffa726', '#ffa726', '#ffa726', '#ffa726', '#ff8400', '#d95d07'],
  ['#ff8400', '#ffa726', '#d95d07', '#d95d07', '#d95d07', '#d95d07', '#ffa726', '#ff8400'],
  ['#d95d07', '#ff8400', '#ffa726', '#ffa726', '#ffa726', '#ffa726', '#ff8400', '#d95d07'],
  ['#9c3403', '#d95d07', '#ff8400', '#ff8400', '#ff8400', '#ff8400', '#d95d07', '#9c3403']
];

// 8x8 Skeleton Head
const SKELETON_PIXELS: string[][] = [
  ['#b8b8b8', '#b8b8b8', '#b8b8b8', '#b8b8b8', '#b8b8b8', '#b8b8b8', '#b8b8b8', '#b8b8b8'],
  ['#b8b8b8', '#d1d1d1', '#d1d1d1', '#d1d1d1', '#d1d1d1', '#d1d1d1', '#d1d1d1', '#b8b8b8'],
  ['#b8b8b8', '#d1d1d1', '#d1d1d1', '#d1d1d1', '#d1d1d1', '#d1d1d1', '#d1d1d1', '#b8b8b8'],
  ['#b8b8b8', '#2e2e2e', '#2e2e2e', '#d1d1d1', '#d1d1d1', '#2e2e2e', '#2e2e2e', '#b8b8b8'],
  ['#b8b8b8', '#2e2e2e', '#2e2e2e', '#d1d1d1', '#d1d1d1', '#2e2e2e', '#2e2e2e', '#b8b8b8'],
  ['#b8b8b8', '#b8b8b8', '#b8b8b8', '#2e2e2e', '#2e2e2e', '#b8b8b8', '#b8b8b8', '#b8b8b8'],
  ['#b8b8b8', '#2e2e2e', '#b8b8b8', '#2e2e2e', '#2e2e2e', '#b8b8b8', '#2e2e2e', '#b8b8b8'],
  ['#9e9e9e', '#9e9e9e', '#9e9e9e', '#9e9e9e', '#9e9e9e', '#9e9e9e', '#9e9e9e', '#9e9e9e']
];

export interface MinecraftAvatarDef {
  id: string;
  name: string;
  desc: string;
  dataUrl: string;
}

export const MINECRAFT_AVATARS: Record<string, MinecraftAvatarDef> = {
  avatar_steve: {
    id: 'avatar_steve',
    name: 'Steve',
    desc: 'The iconic hero of Minecraft',
    dataUrl: createPixelSvg(STEVE_PIXELS)
  },
  avatar_alex: {
    id: 'avatar_alex',
    name: 'Alex',
    desc: 'Master wilderness explorer and builder',
    dataUrl: createPixelSvg(ALEX_PIXELS)
  },
  avatar_creeper: {
    id: 'avatar_creeper',
    name: 'Creeper',
    desc: 'Silent ticking menace of the dark',
    dataUrl: createPixelSvg(CREEPER_PIXELS)
  },
  avatar_ender: {
    id: 'avatar_ender',
    name: 'Enderman',
    desc: 'Teleporting wanderer from the End',
    dataUrl: createPixelSvg(ENDERMAN_PIXELS)
  },
  avatar_blaze: {
    id: 'avatar_blaze',
    name: 'Blaze',
    desc: 'Fiery guardian of the Nether fortress',
    dataUrl: createPixelSvg(BLAZE_PIXELS)
  },
  avatar_skeleton: {
    id: 'avatar_skeleton',
    name: 'Skeleton',
    desc: 'Undead archer of the deep caverns',
    dataUrl: createPixelSvg(SKELETON_PIXELS)
  }
};

export function getAvatarDataUrl(presetOrUrl: string): string {
  if (!presetOrUrl) return MINECRAFT_AVATARS.avatar_steve.dataUrl;
  if (presetOrUrl.startsWith('http://') || presetOrUrl.startsWith('https://') || presetOrUrl.startsWith('data:')) {
    return presetOrUrl;
  }
  return MINECRAFT_AVATARS[presetOrUrl]?.dataUrl || MINECRAFT_AVATARS.avatar_steve.dataUrl;
}
