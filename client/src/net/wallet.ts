import { createWalletClient, custom, type EIP1193Provider } from 'viem';
import { CHAIN } from '@shared/chain';
import { formatSiweMessage, SIWE_STATEMENT } from '@shared/siwe';
import { auth, type AuthResponse } from './NetClient';

/**
 * CONNECT WALLET (W5) — the only way in. Detect an injected EIP-1193 provider
 * (MetaMask etc.), request the account, ask the wallet to `personal_sign` a
 * server-issued nonce (folded into an EIP-4361 message), and post the message +
 * signature to the server, which verifies it and finds-or-creates the account.
 *
 * viem drives the injected provider; WalletConnect can come later. No "earn" /
 * price talk anywhere — this proves wallet control, nothing more.
 */

/** The injected provider, if a browser wallet is installed. */
function injectedProvider(): EIP1193Provider | null {
  const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  return eth ?? null;
}

/** True when a browser wallet is present to connect. */
export function hasWallet(): boolean {
  return injectedProvider() !== null;
}

/** Thrown when the visitor cancels a wallet prompt — the UI stays put, no error. */
export class WalletRejectedError extends Error {
  constructor() {
    super('Wallet connection was dismissed.');
    this.name = 'WalletRejectedError';
  }
}

/** EIP-1193 user-rejection is code 4001 (or a message that says as much). */
function isUserRejection(err: unknown): boolean {
  const code = (err as { code?: number }).code;
  const name = (err as { name?: string }).name ?? '';
  return code === 4001 || /rejected|denied|dismiss/i.test((err as Error)?.message ?? name);
}

/**
 * If the wallet is on the wrong network, ask it to switch to Robinhood Chain.
 * Guarded on a CONFIRMED chainId — while `CHAIN.chainId` is the placeholder 0
 * (no network published yet) there is nothing to switch to, so this is a no-op.
 */
async function ensureRobinhoodChain(
  client: ReturnType<typeof createWalletClient>,
): Promise<void> {
  if (CHAIN.chainId <= 0) return; // TODO(chain): enforce once the chainId lands
  const current = await client.getChainId();
  if (current === CHAIN.chainId) return;
  try {
    await client.switchChain({ id: CHAIN.chainId });
  } catch (err) {
    if (isUserRejection(err)) throw new WalletRejectedError();
    throw new Error(`Switch your wallet to ${CHAIN.name} to play.`);
  }
}

/**
 * Run the full connect → nonce → sign → verify handshake. Resolves to the
 * server's {@link AuthResponse} (token + Spark + district) on success. Throws
 * {@link WalletRejectedError} if the visitor dismisses a prompt (UI treats that
 * as "not now", not an error).
 */
export async function connectWallet(): Promise<AuthResponse> {
  const provider = injectedProvider();
  if (provider === null) {
    throw new Error('No wallet found — install a browser wallet (e.g. MetaMask) to play.');
  }
  const client = createWalletClient({ transport: custom(provider) });

  let accounts: readonly `0x${string}`[];
  try {
    accounts = await client.requestAddresses(); // eth_requestAccounts (prompts)
  } catch (err) {
    if (isUserRejection(err)) throw new WalletRejectedError();
    throw new Error('Could not reach your wallet — is it unlocked?');
  }
  const address = accounts[0];
  if (address === undefined) throw new Error('No account selected in your wallet.');

  await ensureRobinhoodChain(client);

  const chainId = await client.getChainId();
  const { nonce } = await auth.nonce();
  const message = formatSiweMessage({
    domain: window.location.host,
    address,
    statement: SIWE_STATEMENT,
    uri: window.location.origin,
    version: '1',
    chainId,
    nonce,
    issuedAt: new Date().toISOString(),
  });

  let signature: string;
  try {
    signature = await client.signMessage({ account: address, message }); // personal_sign
  } catch (err) {
    if (isUserRejection(err)) throw new WalletRejectedError();
    throw new Error('Signature was not completed.');
  }

  return auth.wallet(message, signature);
}
