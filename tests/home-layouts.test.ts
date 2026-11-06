import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getArtworkStyle, ARTWORK_PRESETS } from '../frontend/src/assets/artworks';
import { InstanceMetadata } from '../electron/types';

describe('Home Page Layouts and Artwork', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      voxelApi: {
        updateInstance: async () => {},
        launchInstance: async () => ({ success: true }),
        stopInstance: async () => true,
        deleteInstance: async () => true,
        openInstanceFolder: async () => true,
        duplicateInstance: async () => null,
        exportInstance: async () => true
      }
    };
    (globalThis as any).document = {
      createElement: (tag: string) => {
        const el: any = {
          tagName: tag.toUpperCase(),
          className: '',
          style: {
            setProperty: () => {}
          },
          attributes: {} as Record<string, string>,
          children: [] as any[],
          innerHTML: '',
          setAttribute: (k: string, v: string) => { el.attributes[k] = v; },
          getAttribute: (k: string) => el.attributes[k],
          querySelector: (sel: string) => ({
            onclick: null,
            style: { setProperty: () => {} },
            textContent: '',
            classList: { contains: () => false, add: () => {}, remove: () => {} },
            querySelectorAll: () => []
          }),
          querySelectorAll: () => [],
          appendChild: (c: any) => el.children.push(c)
        };
        return el;
      },
      addEventListener: () => {}
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  it('renders horizontal and vertical layouts correctly', async () => {
    const { InstanceCard } = await import('../frontend/src/components/InstanceCard');

    const mockInstance: InstanceMetadata = {
      schemaVersion: 1,
      id: 'test-inst-1',
      name: 'Redstone Testing Lab',
      minecraft: { version: '1.21.1' },
      loader: { type: 'fabric', version: '0.16.9' },
      runtime: { memoryMb: 4096, java: 'auto' },
      appearance: { artwork: 'preset:lush_caves', item: 'minecraft:redstone' },
      isFavorite: true,
      createdAt: new Date().toISOString(),
      lastPlayedAt: new Date().toISOString(),
      totalPlaytimeMs: 7200000, // 2 hours
      status: 'READY'
    };

    const dummyEvents = {
      onOpenDetails: () => {},
      onRefresh: () => {},
      onViewLogs: () => {}
    };

    const horizCard = InstanceCard.render(mockInstance, dummyEvents, 'horizontal');
    expect(horizCard.className).toContain('instance-card');
    expect(horizCard.innerHTML).toContain('Redstone Testing Lab');
    expect(horizCard.innerHTML).toContain('2.0 hrs played');
    expect(horizCard.innerHTML).toContain('Minecraft 1.21.1');
    expect(horizCard.innerHTML).toContain('FABRIC v0.16.9');

    const vertCard = InstanceCard.render(mockInstance, dummyEvents, 'vertical');
    expect(vertCard.className).toContain('instance-card-vertical');
    expect(vertCard.innerHTML).toContain('Redstone Testing Lab');
    expect(vertCard.innerHTML).toContain('card-poster-artwork');
    expect(vertCard.innerHTML).toContain('2.0 hrs played');
    expect(vertCard.innerHTML).toContain('FABRIC v0.16.9');
  });

  it('generates high quality procedural Minecraft SVG fallback artwork styles with local caching', () => {
    const style1 = getArtworkStyle('preset:grass_block');
    expect(style1).toContain('data:image/svg+xml;utf8');
    expect(style1).toContain('linear-gradient');

    const styleDefault = getArtworkStyle(null);
    expect(styleDefault).toContain('data:image/svg+xml;utf8');

    // Repeated call hits cache
    const styleCached = getArtworkStyle('preset:grass_block');
    expect(styleCached).toBe(style1);
  });

  it('validates user artwork format and falls back gracefully for invalid strings', () => {
    const validDataUri = 'data:image/png;base64,iVBORw0KGgo=';
    const style1 = getArtworkStyle(validDataUri);
    expect(style1).toContain(validDataUri);

    const invalidArtwork = 'javascript:alert(1)';
    const style2 = getArtworkStyle(invalidArtwork);
    expect(style2).toContain('data:image/svg+xml;utf8');
  });
});
