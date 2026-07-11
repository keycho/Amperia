import { describe, expect, it } from 'vitest';
import {
  ACCESSORIES,
  decodeAppearance,
  DEFAULT_APPEARANCE,
  DEFAULT_APPEARANCE_CODE,
  encodeAppearance,
  HAIR_COLORS,
  HAIR_STYLES,
  JACKET_COLORS,
  SKIN_TONES,
  SPARK_NAME_RE,
} from './appearance';

describe('appearance option tables', () => {
  it('meets the creator spec ranges (I2, expanded by U2b)', () => {
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(7);
    expect(SKIN_TONES.length).toBeLessThanOrEqual(9);
    expect(HAIR_STYLES.length).toBeGreaterThanOrEqual(10);
    expect(HAIR_STYLES.length).toBeLessThanOrEqual(12);
    expect(HAIR_COLORS.length).toBeGreaterThanOrEqual(4);
    expect(JACKET_COLORS.length).toBeGreaterThanOrEqual(8);
    expect(ACCESSORIES.length).toBeGreaterThanOrEqual(7);
  });

  it('index 0 everywhere is the mascot preset', () => {
    expect(DEFAULT_APPEARANCE).toEqual({
      skin: 0,
      hair: 0,
      hairColor: 0,
      jacket: 0,
      accessory: 0,
    });
    expect(HAIR_STYLES[0]?.id).toBe('mop');
    expect(ACCESSORIES[0]?.id).toBe('none');
  });
});

describe('encode/decode', () => {
  it('round-trips every valid combination', () => {
    for (let s = 0; s < SKIN_TONES.length; s++) {
      for (let h = 0; h < HAIR_STYLES.length; h++) {
        const a = { skin: s, hair: h, hairColor: h % HAIR_COLORS.length, jacket: s % JACKET_COLORS.length, accessory: s % ACCESSORIES.length };
        expect(decodeAppearance(encodeAppearance(a))).toEqual(a);
      }
    }
  });

  it('default code decodes to the mascot', () => {
    expect(decodeAppearance(DEFAULT_APPEARANCE_CODE)).toEqual(DEFAULT_APPEARANCE);
  });

  it('rejects malformed and out-of-range codes', () => {
    expect(decodeAppearance('')).toBeNull();
    expect(decodeAppearance('1:0:0:0:0')).toBeNull(); // short
    expect(decodeAppearance('2:0:0:0:0:0')).toBeNull(); // bad version
    expect(decodeAppearance('1:0:0:0:0:99')).toBeNull(); // out of range
    expect(decodeAppearance(`1:${SKIN_TONES.length}:0:0:0:0`)).toBeNull();
    expect(decodeAppearance('1:-1:0:0:0:0')).toBeNull();
    expect(decodeAppearance('1:a:0:0:0:0')).toBeNull();
    expect(decodeAppearance('1:0.5:0:0:0:0')).toBeNull();
  });
});

describe('spark name rule', () => {
  it('accepts sensible names and rejects junk', () => {
    expect(SPARK_NAME_RE.test('Tin Lottie')).toBe(true);
    expect(SPARK_NAME_RE.test('Koivu_9')).toBe(true);
    expect(SPARK_NAME_RE.test('ab')).toBe(false); // too short
    expect(SPARK_NAME_RE.test('a'.repeat(17))).toBe(false); // too long
    expect(SPARK_NAME_RE.test('9lead')).toBe(false); // must start with a letter
    expect(SPARK_NAME_RE.test('bad<script>')).toBe(false);
  });
});
