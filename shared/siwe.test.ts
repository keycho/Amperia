import { describe, expect, it } from 'vitest';
import { formatSiweMessage, parseSiweMessage, SIWE_STATEMENT, type SiweFields } from './siwe';

const FIELDS: SiweFields = {
  domain: 'amperia.example',
  address: '0xAbC0000000000000000000000000000000000001',
  statement: SIWE_STATEMENT,
  uri: 'https://amperia.example',
  version: '1',
  chainId: 42,
  nonce: 'abc123nonce',
  issuedAt: '2026-07-14T00:00:00.000Z',
};

describe('SIWE message format + parse', () => {
  it('round-trips every field', () => {
    const parsed = parseSiweMessage(formatSiweMessage(FIELDS));
    expect(parsed).toEqual(FIELDS);
  });

  it('puts the address on line 2 and the header on line 1', () => {
    const lines = formatSiweMessage(FIELDS).split('\n');
    expect(lines[0]).toBe('amperia.example wants you to sign in with your Ethereum account:');
    expect(lines[1]).toBe(FIELDS.address);
  });

  it('recovers the nonce, chainId and address a verifier needs', () => {
    const parsed = parseSiweMessage(formatSiweMessage({ ...FIELDS, nonce: 'N-42', chainId: 7 }));
    expect(parsed?.nonce).toBe('N-42');
    expect(parsed?.chainId).toBe(7);
    expect(parsed?.address).toBe(FIELDS.address);
  });

  it('rejects a malformed header', () => {
    expect(parseSiweMessage('not a siwe message')).toBeNull();
  });

  it('rejects a message missing the nonce', () => {
    const msg = formatSiweMessage(FIELDS).replace(/\nNonce: .*/, '');
    expect(parseSiweMessage(msg)).toBeNull();
  });

  it('rejects a non-numeric chain id', () => {
    const msg = formatSiweMessage(FIELDS).replace('Chain ID: 42', 'Chain ID: notanumber');
    expect(parseSiweMessage(msg)).toBeNull();
  });

  it('tolerates an absent statement', () => {
    const parsed = parseSiweMessage(formatSiweMessage({ ...FIELDS, statement: '' }));
    expect(parsed?.statement).toBe('');
    expect(parsed?.nonce).toBe(FIELDS.nonce);
  });
});
