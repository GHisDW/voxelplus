export interface ArtworkPreset {
  id: string;
  name: string;
  gradient: string;
  accentColor: string;
  theme: string;
}

export const ARTWORK_PRESETS: ArtworkPreset[] = [
  {
    id: 'preset:lush_caves',
    name: 'Lush Caves',
    gradient: 'linear-gradient(135deg, #022c22 0%, #065f46 50%, #10b981 100%)',
    accentColor: '#10b981',
    theme: 'green'
  },
  {
    id: 'preset:cherry_grove',
    name: 'Cherry Grove',
    gradient: 'linear-gradient(135deg, #500724 0%, #be185d 50%, #f472b6 100%)',
    accentColor: '#f472b6',
    theme: 'pink'
  },
  {
    id: 'preset:deep_dark',
    name: 'Deep Dark & Ancient City',
    gradient: 'linear-gradient(135deg, #021a1a 0%, #042f2e 40%, #0891b2 100%)',
    accentColor: '#0891b2',
    theme: 'teal'
  },
  {
    id: 'preset:nether_fortress',
    name: 'Nether Fortress & Crimson Forest',
    gradient: 'linear-gradient(135deg, #3f0708 0%, #991b1b 50%, #ea580c 100%)',
    accentColor: '#ef4444',
    theme: 'red'
  },
  {
    id: 'preset:end_dimension',
    name: 'The End & Outer Islands',
    gradient: 'linear-gradient(135deg, #13072b 0%, #4c1d95 50%, #c084fc 100%)',
    accentColor: '#c084fc',
    theme: 'purple'
  },
  {
    id: 'preset:sunset_plains',
    name: 'Sunset Savanna & Plains',
    gradient: 'linear-gradient(135deg, #172554 0%, #b45309 60%, #fbbf24 100%)',
    accentColor: '#f59e0b',
    theme: 'gold'
  },
  {
    id: 'preset:mountain_vista',
    name: 'Frozen Peaks & Jagged Mountains',
    gradient: 'linear-gradient(135deg, #0f172a 0%, #2563eb 50%, #93c5fd 100%)',
    accentColor: '#60a5fa',
    theme: 'blue'
  }
];

export function getArtworkStyle(artwork: string | null | undefined): string {
  if (!artwork) {
    return ARTWORK_PRESETS[0].gradient;
  }
  if (artwork.startsWith('preset:')) {
    const found = ARTWORK_PRESETS.find(p => p.id === artwork);
    return found ? found.gradient : ARTWORK_PRESETS[0].gradient;
  }
  // User custom uploaded data URL
  return `url('${artwork}') center/cover no-repeat`;
}
