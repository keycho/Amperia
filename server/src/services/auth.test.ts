import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { linkWallet, validSparkName, verifyToken } from './auth.js';

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

describe('linkWallet (EVM SIWE) pre-DB validation', () => {
  const ADDR = `0x${'a'.repeat(40)}`;

  it('rejects a message that does not reference the account', async () => {
    await expect(linkWallet('acct1', ADDR, 'unrelated message', '0xsig')).rejects.toThrow(
      /reference this account/,
    );
  });

  it('rejects a malformed EVM address before touching the DB', async () => {
    await expect(linkWallet('acct1', '0xnothex', 'msg acct1', '0xsig')).rejects.toThrow(
      /Malformed wallet address/,
    );
  });

  it('stays inactive until the token gate is wired (no live chain call)', async () => {
    // A well-formed request still cannot verify: SIWE verification is a stub
    // until AMP_TOKEN_ADDRESS is set, so linkWallet throws NotActivated.
    await expect(
      linkWallet('acct1', ADDR, 'link acct1 to this wallet', '0xsig'),
    ).rejects.toThrow(/not activated/i);
  });
});
