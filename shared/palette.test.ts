import { describe, expect, it } from 'vitest';
import { PALETTE, PALETTE_INT, hexToInt, mixPalette } from './palette';

describe('locked palette', () => {
  it('matches the exact ART-DIRECTION.md hex table', () => {
    expect(PALETTE).toEqual({
      duskSky: '#35284F',
      ink: '#1E1930',
      structureMid: '#4E4560',
      groundBase: '#6B5E70',
      groundAccent: '#9A8574',
      warmGlow: '#FFD9A0',
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
    expect(hexToInt('#35284F')).toBe(0x35284f);
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
