export interface ArtworkPreset {
  id: string;
  name: string;
  gradient: string;
  accentColor: string;
  theme: string;
  svgDataUri: string;
}

// Procedural SVG-based Minecraft biome landscape artwork data URIs
function createBiomeSvgUri(bg1: string, bg2: string, motifColor: string, patternType: string): string {
  let innerElements = '';

  if (patternType === 'caves') {
    innerElements = `
      <circle cx="40" cy="90" r="45" fill="${motifColor}" opacity="0.18"/>
      <circle cx="140" cy="30" r="35" fill="${motifColor}" opacity="0.12"/>
      <rect x="0" y="70" width="200" height="50" rx="20" fill="${motifColor}" opacity="0.15"/>
      <path d="M 0,120 Q 50,60 100,120 T 200,120 L 200,120 L 0,120 Z" fill="${motifColor}" opacity="0.25"/>
    `;
  } else if (patternType === 'mountains') {
    innerElements = `
      <polygon points="30,120 70,30 110,120" fill="${motifColor}" opacity="0.25"/>
      <polygon points="90,120 140,20 190,120" fill="${motifColor}" opacity="0.3"/>
      <polygon points="0,120 40,55 80,120" fill="${motifColor}" opacity="0.2"/>
    `;
  } else if (patternType === 'trees') {
    innerElements = `
      <circle cx="50" cy="50" r="30" fill="${motifColor}" opacity="0.25"/>
      <circle cx="80" cy="45" r="25" fill="${motifColor}" opacity="0.3"/>
      <circle cx="150" cy="55" r="32" fill="${motifColor}" opacity="0.2"/>
      <rect x="45" y="70" width="10" height="50" fill="${motifColor}" opacity="0.4"/>
      <rect x="145" y="75" width="10" height="45" fill="${motifColor}" opacity="0.4"/>
    `;
  } else if (patternType === 'pillars') {
    innerElements = `
      <rect x="25" y="25" width="22" height="95" rx="3" fill="${motifColor}" opacity="0.35"/>
      <rect x="75" y="10" width="28" height="110" rx="3" fill="${motifColor}" opacity="0.4"/>
      <rect x="135" y="35" width="20" height="85" rx="3" fill="${motifColor}" opacity="0.3"/>
      <circle cx="89" cy="8" r="4" fill="#fbbf24" opacity="0.8"/>
    `;
  } else {
    innerElements = `
      <path d="M0,100 C40,70 80,110 120,80 C160,50 180,90 200,75 L200,120 L0,120 Z" fill="${motifColor}" opacity="0.28"/>
      <circle cx="160" cy="35" r="20" fill="${motifColor}" opacity="0.2"/>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bg1}" />
        <stop offset="100%" stop-color="${bg2}" />
      </linearGradient>
      <pattern id="pixelGrid" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#bgGrad)"/>
    <rect width="100%" height="100%" fill="url(#pixelGrid)"/>
    ${innerElements}
  </svg>`.replace(/\s+/g, ' ');

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const ARTWORK_PRESETS: ArtworkPreset[] = [
  {
    id: 'preset:lush_caves',
    name: 'Lush Caves',
    gradient: 'linear-gradient(135deg, #022c22 0%, #065f46 50%, #10b981 100%)',
    accentColor: '#10b981',
    theme: 'green',
    svgDataUri: createBiomeSvgUri('#022c22', '#064e3b', '#10b981', 'caves')
  },
  {
    id: 'preset:cherry_grove',
    name: 'Cherry Grove',
    gradient: 'linear-gradient(135deg, #500724 0%, #be185d 50%, #f472b6 100%)',
    accentColor: '#f472b6',
    theme: 'pink',
    svgDataUri: createBiomeSvgUri('#4c0519', '#831843', '#f472b6', 'trees')
  },
  {
    id: 'preset:deep_dark',
    name: 'Deep Dark & Ancient City',
    gradient: 'linear-gradient(135deg, #021a1a 0%, #042f2e 40%, #0891b2 100%)',
    accentColor: '#0891b2',
    theme: 'teal',
    svgDataUri: createBiomeSvgUri('#041f22', '#083344', '#06b6d4', 'caves')
  },
  {
    id: 'preset:nether_fortress',
    name: 'Nether Fortress & Crimson Forest',
    gradient: 'linear-gradient(135deg, #3f0708 0%, #991b1b 50%, #ea580c 100%)',
    accentColor: '#ef4444',
    theme: 'red',
    svgDataUri: createBiomeSvgUri('#450a0a', '#7f1d1d', '#ea580c', 'pillars')
  },
  {
    id: 'preset:end_dimension',
    name: 'The End & Outer Islands',
    gradient: 'linear-gradient(135deg, #13072b 0%, #4c1d95 50%, #c084fc 100%)',
    accentColor: '#c084fc',
    theme: 'purple',
    svgDataUri: createBiomeSvgUri('#1e1035', '#3b0764', '#c084fc', 'pillars')
  },
  {
    id: 'preset:sunset_plains',
    name: 'Sunset Savanna & Plains',
    gradient: 'linear-gradient(135deg, #172554 0%, #b45309 60%, #fbbf24 100%)',
    accentColor: '#f59e0b',
    theme: 'gold',
    svgDataUri: createBiomeSvgUri('#172554', '#78350f', '#f59e0b', 'landscape')
  },
  {
    id: 'preset:mountain_vista',
    name: 'Frozen Peaks & Jagged Mountains',
    gradient: 'linear-gradient(135deg, #0f172a 0%, #2563eb 50%, #93c5fd 100%)',
    accentColor: '#60a5fa',
    theme: 'blue',
    svgDataUri: createBiomeSvgUri('#0f172a', '#1e3a8a', '#60a5fa', 'mountains')
  }
];

// Artwork cache to avoid repeatedly resolving or processing identical artworks
const artworkCache = new Map<string, string>();

export function getArtworkStyle(artwork: string | null | undefined): string {
  const key = artwork || 'default';
  if (artworkCache.has(key)) {
    return artworkCache.get(key)!;
  }

  let result: string;
  if (!artwork) {
    const fallback = ARTWORK_PRESETS[0];
    result = `url("${fallback.svgDataUri}") center/cover no-repeat, ${fallback.gradient}`;
  } else if (artwork.startsWith('preset:')) {
    const found = ARTWORK_PRESETS.find(p => p.id === artwork) || ARTWORK_PRESETS[0];
    result = `url("${found.svgDataUri}") center/cover no-repeat, ${found.gradient}`;
  } else {
    // User custom uploaded data URL / safe cached URI
    // Sanitize quotes in user URL
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
