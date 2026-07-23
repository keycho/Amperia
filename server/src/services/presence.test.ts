import { beforeEach, describe, expect, it } from 'vitest';
import { presence } from './presence.js';

describe('cross-district presence registry (map M3)', () => {
  beforeEach(() => presence.reset());

  it('reports round-trip into the tally', () => {
    presence.report('filament', 3);
    presence.report('stacks', 1);
    expect(presence.counts()).toEqual({ filament: 3, stacks: 1 });
  });

  it('notifies listeners only on real changes', () => {
    let fired = 0;
    presence.onChange(() => (fired += 1));
    presence.report('filament', 2);
    presence.report('filament', 2); // same count — silent
    presence.report('filament', 4);
    expect(fired).toBe(2);
  });

  it('unsubscribe stops the notifications', () => {
    let fired = 0;
    const off = presence.onChange(() => (fired += 1));
    presence.report('tangle', 1);
    off();
    presence.report('tangle', 5);
    expect(fired).toBe(1);
  });
});
