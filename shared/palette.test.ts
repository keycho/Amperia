import { describe, expect, it } from 'vitest';
import { PALETTE, PALETTE_INT, hexToInt, mixPalette } from './palette';

describe('locked palette', () => {
  it('matches the exact ART-DIRECTION.md hex table', () => {
    expect(PALETTE).toEqual({
      duskSky: '#2C2016',
      ink: '#1A1512',
      structureMid: '#574A3B',
      groundBase: '#6C5843',
      groundAccent: '#9C8064',
      warmGlow: '#FFA033',
      neonAmber: '#FFB84D',
      neonRose: '#FF6F91',
      neonTeal: '#2FD3B8',
      neonCyan: '#5BC0FF',
      solarGreen: '#7BC59A',
      emberOrange: '#FF8C42',
      signalRed: '#C0392B',
      violetNeon: '#B266FF',
    });
  });

  it('converts hex to Phaser ints', () => {
    expect(hexToInt('#2A211A')).toBe(0x2a211a);
    expect(PALETTE_INT.neonTeal).toBe(0x2fd3b8);
  });

  it('mixPalette blends endpoints exactly and clamps t', () => {
    expect(mixPalette('groundBase', 'groundAccent', 0)).toBe(PALETTE_INT.groundBase);
    expect(mixPalette('groundBase', 'groundAccent', 1)).toBe(PALETTE_INT.groundAccent);
    expect(mixPalette('groundBase', 'groundAccent', -5)).toBe(PALETTE_INT.groundBase);
    const mid = mixPalette('ink', 'warmGlow', 0.5);
    expect(mid).toBeGreaterThan(PALETTE_INT.ink);
    expect(mid).toBeLessThan(PALETTE_INT.warmGlow);
  });
});
