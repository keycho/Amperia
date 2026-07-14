/**
 * SIWE — Sign-In-With-Ethereum (EIP-4361) message format + parse.
 *
 * PURE + ISOMORPHIC. No crypto, no network, no viem — just the canonical text
 * of the message a wallet signs. The client builds the message with
 * {@link formatSiweMessage} and asks the wallet to `personal_sign` it; the
 * server re-parses it with {@link parseSiweMessage} to recover the claimed
 * address + nonce before verifying the signature (server-side, viem).
 *
 * This layer needs NO token address and NO RPC — it is the front door that
 * works before $AMP even exists (W2). Signature verification and any balance
 * read live server-side.
 */

/** The subset of EIP-4361 fields AMPERIA uses. */
export interface SiweFields {
  /** The site requesting the sign-in (e.g. `amperia.example`). */
  domain: string;
  /** The wallet address (EIP-55 checksummed on the wire; compared lowercased). */
  address: string;
  /** Human-readable line shown in the wallet prompt (comms-clean). */
  statement: string;
  /** The origin URI (e.g. `https://amperia.example`). */
  uri: string;
  /** EIP-4361 message version — always '1'. */
  version: '1';
  /** The chain the wallet should be on. */
  chainId: number;
  /** Server-issued single-use nonce (replay protection). */
  nonce: string;
  /** ISO-8601 timestamp the message was created. */
  issuedAt: string;
}

/** The comms-clean statement shown in the signing prompt — never "earn"/price. */
export const SIWE_STATEMENT =
  'Sign in to AMPERIA. This proves you control this wallet — it costs nothing and moves no funds.';

const HEADER_SUFFIX = ' wants you to sign in with your Ethereum account:';

/**
 * Build the exact EIP-4361 message string. Deterministic: the same fields
 * always produce the same bytes, so the server's parse round-trips a
 * client-built message. `statement` defaults to {@link SIWE_STATEMENT}.
 */
export function formatSiweMessage(f: SiweFields): string {
  return [
    `${f.domain}${HEADER_SUFFIX}`,
    f.address,
    '',
    f.statement,
    '',
    `URI: ${f.uri}`,
    `Version: ${f.version}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
  ].join('\n');
}

/**
 * Parse an EIP-4361 message back into fields. Returns null when a required
 * field is missing or the header line is malformed — the caller then rejects
 * the sign-in rather than trusting a half-parsed message. Tolerant of an
 * absent statement.
 */
export function parseSiweMessage(message: string): SiweFields | null {
  const lines = message.split('\n');
  const header = lines[0];
  if (header === undefined || !header.endsWith(HEADER_SUFFIX)) return null;
  const domain = header.slice(0, -HEADER_SUFFIX.length);
  const address = lines[1]?.trim();
  if (domain === '' || address === undefined || address === '') return null;

  // Key: value pairs live in the tail block; scan for the ones we need.
  const field = (key: string): string | undefined => {
    const prefix = `${key}: `;
    for (const line of lines) if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
    return undefined;
  };
  const uri = field('URI');
  const version = field('Version');
  const chainIdRaw = field('Chain ID');
  const nonce = field('Nonce');
  const issuedAt = field('Issued At');
  if (
    uri === undefined ||
    version !== '1' ||
    chainIdRaw === undefined ||
    nonce === undefined ||
    nonce === '' ||
    issuedAt === undefined
  ) {
    return null;
  }
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId)) return null;

  // The statement (optional) is the non-empty line 3, when present.
  const statement = lines[3] !== undefined && lines[3] !== '' && !lines[3].includes(': ')
    ? lines[3]
    : '';

  return { domain, address, statement, uri, version: '1', chainId, nonce, issuedAt };
}
