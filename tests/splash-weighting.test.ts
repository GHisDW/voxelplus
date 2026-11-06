/**
 * Unit tests for weighted splash text selection.
 *
 * Tests the selectSplashText function with various weight configurations
 * to ensure correct behavior for all edge cases.
 */
import { describe, it, expect, vi } from 'vitest';
import { selectSplashText, SplashText } from '../frontend/src/components/SplashScreen';

describe('selectSplashText', () => {
  it('returns fallback message for empty array', () => {
    const result = selectSplashText([]);
    expect(result).toBe('Loading voxels…');
  });

  it('returns fallback message for null input', () => {
    const result = selectSplashText(null as any);
    expect(result).toBe('Loading voxels…');
  });

  it('returns fallback message for undefined input', () => {
    const result = selectSplashText(undefined as any);
    expect(result).toBe('Loading voxels…');
  });

  it('uses uniform random selection when all weights are zero', () => {
    const splashes: SplashText[] = [
      { text: 'A', weight: 0 },
      { text: 'B', weight: 0 },
      { text: 'C', weight: 0 }
    ];

    // Mock Math.random to return 0.5 (middle value)
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = selectSplashText(splashes);
    
    // With 3 items and random=0.5, should select index 1 (B)
    expect(result).toBe('B');
    vi.restoreAllMocks();
  });

  it('always selects weight-100 message when it is the only nonzero weight', () => {
    const splashes: SplashText[] = [
      { text: 'A', weight: 0 },
      { text: 'B', weight: 100 },
      { text: 'C', weight: 0 }
    ];

    const result = selectSplashText(splashes);
    expect(result).toBe('B');
  });

  it('does not always select weight-100 when multiple nonzero weights exist', () => {
    const splashes: SplashText[] = [
      { text: 'A', weight: 10 },
      { text: 'B', weight: 100 },
      { text: 'C', weight: 20 }
    ];

    // With multiple nonzero weights, it should use weighted selection
    // not the weight-100 special case
    const results = new Set<string>();
    // Run enough times to verify it's not always B (100 vs 10 + 20 has ~23% chance per roll of selecting A or C)
    for (let i = 0; i < 50; i++) {
      results.add(selectSplashText(splashes));
    }
    // Should have at least 2 different results (not always B)
    expect(results.size).toBeGreaterThan(1);
  });

  it('uses weighted selection when at least one weight is nonzero', () => {
    const splashes: SplashText[] = [
      { text: 'A', weight: 10 },
      { text: 'B', weight: 30 },
      { text: 'C', weight: 60 }
    ];

    // Total weight = 100
    // Mock to select A (0-10 range)
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    expect(selectSplashText(splashes)).toBe('A');

    // Mock to select B (10-40 range)
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(selectSplashText(splashes)).toBe('B');

    // Mock to select C (40-100 range)
    vi.spyOn(Math, 'random').mockReturnValue(0.7);
    expect(selectSplashText(splashes)).toBe('C');

    vi.restoreAllMocks();
  });

  it('treats negative weights as zero', () => {
    const splashes: SplashText[] = [
      { text: 'A', weight: -10 },
      { text: 'B', weight: 0 },
      { text: 'C', weight: 0 }
    ];

    // All weights become 0, so uniform selection
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = selectSplashText(splashes);
    expect(result).toBe('B');
    vi.restoreAllMocks();
  });

  it('treats NaN weights as zero', () => {
    const splashes: SplashText[] = [
      { text: 'A', weight: NaN },
      { text: 'B', weight: 0 },
      { text: 'C', weight: 0 }
    ];

    // All weights become 0, so uniform selection
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = selectSplashText(splashes);
    expect(result).toBe('B');
    vi.restoreAllMocks();
  });

  it('treats Infinity weights as zero', () => {
    const splashes: SplashText[] = [
      { text: 'A', weight: Infinity },
      { text: 'B', weight: 0 },
      { text: 'C', weight: 0 }
    ];

    // All weights become 0, so uniform selection
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = selectSplashText(splashes);
    expect(result).toBe('B');
    vi.restoreAllMocks();
  });

  it('treats string weights as zero', () => {
    const splashes: SplashText[] = [
      { text: 'A', weight: '10' as any },
      { text: 'B', weight: 0 },
      { text: 'C', weight: 0 }
    ];

    // All weights become 0, so uniform selection
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = selectSplashText(splashes);
    expect(result).toBe('B');
    vi.restoreAllMocks();
  });

  it('treats missing weight fields as zero', () => {
    const splashes: SplashText[] = [
      { text: 'A', weight: 0 },
      { text: 'B' as any },
      { text: 'C', weight: 0 }
    ];

    // All weights become 0, so uniform selection
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = selectSplashText(splashes);
    expect(result).toBe('B');
    vi.restoreAllMocks();
  });

  it('handles single nonzero weight among zero weights', () => {
    const splashes: SplashText[] = [
      { text: 'A', weight: 0 },
      { text: 'B', weight: 50 },
      { text: 'C', weight: 0 }
    ];

    // Should always select B since it's the only nonzero
    const result = selectSplashText(splashes);
    expect(result).toBe('B');
  });

  it('respects relative weighting ratios', () => {
    const splashes: SplashText[] = [
      { text: 'A', weight: 1 },
      { text: 'B', weight: 10 },
      { text: 'C', weight: 30 }
    ];

    // Total = 41
    // A: 1/41 ≈ 2.4%
    // B: 10/41 ≈ 24.4%
    // C: 30/41 ≈ 73.2%

    // Test selection of A (very low probability)
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    expect(selectSplashText(splashes)).toBe('A');

    // Test selection of B
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    expect(selectSplashText(splashes)).toBe('B');

    // Test selection of C (high probability)
    vi.spyOn(Math, 'random').mockReturnValue(0.8);
    expect(selectSplashText(splashes)).toBe('C');

    vi.restoreAllMocks();
  });

  it('handles edge case of zero total weight with nonzero entries', () => {
    // This shouldn't happen in practice, but test the fallback
    const splashes: SplashText[] = [
      { text: 'A', weight: 0 },
      { text: 'B', weight: 0 }
    ];

    // Should fall back to uniform selection
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = selectSplashText(splashes);
    expect(result).toBe('B');
    vi.restoreAllMocks();
  });

  it('preserves existing behavior with all-zero weights', () => {
    const splashes: SplashText[] = [
      { text: 'Message 1', weight: 0 },
      { text: 'Message 2', weight: 0 },
      { text: 'Message 3', weight: 0 }
    ];

    // Test that it uses uniform random (existing behavior)
    vi.spyOn(Math, 'random').mockReturnValue(0.33);
    expect(selectSplashText(splashes)).toBe('Message 1');

    vi.spyOn(Math, 'random').mockReturnValue(0.66);
    expect(selectSplashText(splashes)).toBe('Message 2');

    vi.restoreAllMocks();
  });
});
