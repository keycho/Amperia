import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
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

describe('linkWallet signature checks (pre-DB validation)', () => {
  it('rejects a message that does not reference the account', async () => {
    await expect(linkWallet('acct1', 'x', 'unrelated message', 'x')).rejects.toThrow(
      /reference this account/,
    );
  });

  it('rejects malformed keys and bad signatures before touching the DB', async () => {
    await expect(linkWallet('acct1', '!!notbase58!!', 'msg acct1', 'sig')).rejects.toThrow();
    const kp = nacl.sign.keyPair();
    const msg = 'link acct1 to this wallet';
    const wrongSig = nacl.sign.detached(new TextEncoder().encode('other'), kp.secretKey);
    await expect(
      linkWallet('acct1', bs58.encode(kp.publicKey), msg, bs58.encode(wrongSig)),
    ).rejects.toThrow(/does not verify/);
  });
});
