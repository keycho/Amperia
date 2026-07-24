import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { freshLamp, lampTick, lightRadiusTiles, withinLight } from './underworks';

const cfg = CONFIG.underworks.lamp;

describe('U1 — the Wicklamp burn', () => {
  it('consumes a stick only at boundaries and burns it down', () => {
    let r = lampTick(freshLamp(), 1, true, 3);
    expect(r.consumed).toBe(1); // first stick lights the lamp
    expect(r.lit).toBe(true);
    expect(r.state.burnLeft).toBeCloseTo(cfg.burnSecondsPerCellwax);
    r = lampTick(r.state, cfg.burnSecondsPerCellwax / 2, true, 2);
    expect(r.consumed).toBe(0); // mid-stick: nothing new consumed
    expect(r.state.burnLeft).toBeCloseTo(cfg.burnSecondsPerCellwax / 2);
  });

  it('rolls to the next stick when one burns out', () => {
    let r = lampTick(freshLamp(), 1, true, 2);
    r = lampTick(r.state, cfg.burnSecondsPerCellwax + 5, true, 1);
    expect(r.consumed).toBe(1);
    expect(r.lit).toBe(true);
  });

  it('out of fuel: the ember dies over emberSeconds and holds, never dark', () => {
    let r = lampTick(freshLamp(), 1, true, 1); // the only stick
    r = lampTick(r.state, cfg.burnSecondsPerCellwax + 1, true, 0); // burnt out
    expect(r.lit).toBe(false);
    expect(r.state.emberT).toBeLessThan(1);
    r = lampTick(r.state, cfg.emberSeconds * 2, true, 0);
    expect(r.state.emberT).toBe(0);
    // The ember floor holds — radius never reaches zero (no-stranding).
    expect(lightRadiusTiles(false, 0)).toBeCloseTo(cfg.emberRadiusTiles);
  });

  it('no lamp in the pack = no light at all', () => {
    const r = lampTick(freshLamp(), 1, false, 10);
    expect(r.lit).toBe(false);
    expect(r.consumed).toBe(0);
    expect(r.state.emberT).toBe(0);
  });

  it('radius interpolates lit -> ember and gates interaction', () => {
    expect(lightRadiusTiles(true, 1)).toBeCloseTo(cfg.radiusTiles);
    const mid = lightRadiusTiles(false, 0.5);
    expect(mid).toBeGreaterThan(cfg.emberRadiusTiles);
    expect(mid).toBeLessThan(cfg.radiusTiles);
    expect(withinLight(cfg.radiusTiles, true, 1)).toBe(true);
    expect(withinLight(cfg.radiusTiles + 1, true, 1)).toBe(false);
    expect(withinLight(cfg.emberRadiusTiles, false, 0)).toBe(true);
  });
});
