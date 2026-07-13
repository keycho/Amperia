import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import type { DistrictId } from './map';
import { tramHops, tramToll } from './travel';

describe('the tram line (D3)', () => {
  it('runs Filament ↔ Stacks ↔ Terrarium ↔ Tangle', () => {
    expect(CONFIG.travel.line).toEqual(['filament', 'stacks', 'terrarium', 'tangle']);
  });

  it('counts hops along the line in both directions', () => {
    expect(tramHops('filament', 'stacks')).toBe(1);
    expect(tramHops('stacks', 'filament')).toBe(1);
    expect(tramHops('filament', 'terrarium')).toBe(2);
    expect(tramHops('filament', 'tangle')).toBe(3);
    expect(tramHops('tangle', 'stacks')).toBe(2);
  });

  it('same stop or an unknown stop = no ride', () => {
    expect(tramHops('filament', 'filament')).toBe(0);
    expect(tramHops('filament', 'underworks' as DistrictId)).toBe(0);
  });

  it('charges the Bolts toll per hop', () => {
    const per = CONFIG.travel.tollBolts;
    expect(tramToll('filament', 'tangle')).toBe(3 * per);
    expect(tramToll('terrarium', 'tangle')).toBe(per);
    expect(tramToll('terrarium', 'terrarium')).toBe(0);
  });

  it('PP6: The Stacks rides free from anywhere; distance keeps its price elsewhere', () => {
    const per = CONFIG.travel.tollBolts;
    expect(tramToll('filament', 'stacks')).toBe(0);
    expect(tramToll('tangle', 'stacks')).toBe(0);
    // A ride whose destination is NOT free still pays per hop.
    expect(tramToll('stacks', 'terrarium')).toBe(per);
  });
});
