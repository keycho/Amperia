import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { formatSiweMessage, SIWE_STATEMENT } from '@shared/siwe';
import { consumeNonce, issueNonce, verifySignIn, verifySiweSignature } from './siwe.js';

// A well-known throwaway dev private key — deterministic, never used for value.
// This stands in for the browser wallet: it signs exactly what a real
// `personal_sign` would, so the verify path is exercised end-to-end.
const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const account = privateKeyToAccount(PK);

function messageFor(nonce: string): string {
  return formatSiweMessage({
    domain: 'amperia.example',
    address: account.address,
    statement: SIWE_STATEMENT,
    uri: 'https://amperia.example',
    version: '1',
    chainId: 1,
    nonce,
    issuedAt: '2026-07-14T00:00:00.000Z',
  });
}

describe('SIWE signature verification (viem, local EC-recover — no RPC)', () => {
  it('accepts a signature that recovers to the claimed address', async () => {
    const msg = messageFor('n1');
    const sig = await account.signMessage({ message: msg });
    expect(await verifySiweSignature(msg, sig, account.address)).toBe(true);
  });

  it('rejects a signature checked against a different address', async () => {
    const msg = messageFor('n2');
    const sig = await account.signMessage({ message: msg });
    expect(await verifySiweSignature(msg, sig, `0x${'b'.repeat(40)}`)).toBe(false);
  });

  it('rejects a tampered message', async () => {
    const msg = messageFor('n3');
    const sig = await account.signMessage({ message: msg });
    expect(await verifySiweSignature(`${msg} `, sig, account.address)).toBe(false);
  });

  it('rejects a non-hex signature without throwing', async () => {
    expect(await verifySiweSignature(messageFor('n4'), 'not-hex', account.address)).toBe(false);
  });
});

describe('verifySignIn — full round-trip with a single-use nonce', () => {
  it('verifies a real sign-in and returns the lowercased wallet', async () => {
    const nonce = issueNonce();
    const msg = messageFor(nonce);
    const sig = await account.signMessage({ message: msg });
    const { address } = await verifySignIn(msg, sig);
    expect(address).toBe(account.address.toLowerCase());
  });

  it('burns the nonce — replaying the same message+signature is refused', async () => {
    const nonce = issueNonce();
    const msg = messageFor(nonce);
    const sig = await account.signMessage({ message: msg });
    await verifySignIn(msg, sig);
    await expect(verifySignIn(msg, sig)).rejects.toThrow(/expired/i);
  });

  it('refuses a message whose nonce was never issued', async () => {
    const msg = messageFor('never-issued-nonce');
    const sig = await account.signMessage({ message: msg });
    await expect(verifySignIn(msg, sig)).rejects.toThrow(/expired/i);
  });

  it('a bad signature does not burn the nonce; a correct re-sign then works', async () => {
    const nonce = issueNonce();
    const msg = messageFor(nonce);
    const wrongSig = await account.signMessage({ message: messageFor('a-different-nonce') });
    await expect(verifySignIn(msg, wrongSig)).rejects.toThrow(/verify/i);
    const goodSig = await account.signMessage({ message: msg });
    const { address } = await verifySignIn(msg, goodSig);
    expect(address).toBe(account.address.toLowerCase());
    expect(consumeNonce(nonce)).toBe(false); // the success already burned it
  });
});
