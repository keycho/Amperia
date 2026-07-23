import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticateWallet, validSparkName, verifyToken } from './auth.js';

describe('verifyToken', () => {
  const SECRET = process.env.JWT_SECRET ?? 'amperia-dev-secret-change-me';

  it('accepts a well-formed token', () => {
    const token = jwt.sign({ accountId: 'a1', characterId: 'c1' }, SECRET);
    expect(verifyToken(token)).toEqual({ accountId: 'a1', characterId: 'c1' });
  });

  it('rejects tampered and malformed tokens', () => {
    expect(() => verifyToken('garbage')).toThrow();
    const wrongKey = jwt.sign({ accountId: 'a1', characterId: 'c1' }, 'not-the-secret');
    expect(() => verifyToken(wrongKey)).toThrow();
    const missingFields = jwt.sign({ accountId: 'a1' }, SECRET);
    expect(() => verifyToken(missingFields)).toThrow();
  });
});

describe('validSparkName', () => {
  it('accepts cozy names and rejects junk', () => {
    expect(validSparkName('Volta Redline')).toBe(true);
    expect(validSparkName('Spark-99_x')).toBe(true);
    expect(validSparkName('ab')).toBe(false);
    expect(validSparkName('way too long a name for a spark!!')).toBe(false);
    expect(validSparkName('<script>')).toBe(false);
  });
});

describe('authenticateWallet (SIWE) — rejects before any DB write', () => {
  // The find-or-create half is exercised end-to-end against a live server in
  // the checkpoint (siwe.e2e). Here we prove a bad sign-in never reaches the
  // DB: a malformed message and a bogus signature both throw first.
  it('rejects a malformed sign-in message', async () => {
    await expect(authenticateWallet('not a siwe message', '0xdead')).rejects.toThrow(/malformed/i);
  });

  it('rejects a non-hex signature', async () => {
    const msg = [
      'amperia.example wants you to sign in with your Ethereum account:',
      `0x${'a'.repeat(40)}`,
      '',
      'Sign in to AMPERIA.',
      '',
      'URI: https://amperia.example',
      'Version: 1',
      'Chain ID: 1',
      'Nonce: deadbeef',
      'Issued At: 2026-07-14T00:00:00.000Z',
    ].join('\n');
    await expect(authenticateWallet(msg, 'not-hex')).rejects.toThrow(/verify|expired/i);
  });
});
