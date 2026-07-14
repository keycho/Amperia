/**
 * AMPERIA chain config — the ONE central source of truth for every chain
 * assumption (M1, Robinhood Chain migration).
 *
 * $AMP is an ERC-20 on **Robinhood Chain** — an Ethereum L2 built on
 * Arbitrum Orbit whose native gas currency is **ETH** — fair-launched via
 * **hood.fun**. Fixed supply of 1,000,000,000, 18 decimals, LP permanently
 * locked, mint renounced. No emission is possible, ever.
 *
 * SPEC / CONFIG ONLY. Nothing here performs an on-chain call, and no token
 * is deployed yet — `AMP_TOKEN_ADDRESS` is unset until the fair launch
 * settles. The economy service (`/economy`) and the token gate
 * (`server/src/services/tokenGate.ts`) read these constants; they stay
 * inert until the address exists. Secrets (RPC key, treasury key, addresses)
 * are read from `process.env` server-side ONLY — only the env var *names*
 * live here, never their values.
 */

/** The chain itself. */
export const CHAIN = {
  name: 'Robinhood Chain',
  /** Ethereum L2 on Arbitrum Orbit; native gas + ops currency is ETH. */
  kind: 'evm-l2-arbitrum-orbit',
  nativeCurrency: 'ETH',
  /**
   * TODO(chain): confirm the canonical Robinhood Chain chainId before ANY
   * live call — placeholder until hood.fun / the RPC publishes it. Nothing
   * signs or broadcasts against this until it is confirmed and a token
   * address exists.
   */
  chainId: 0,
  /** Fair-launch venue. */
  launchpad: 'hood.fun',
  /** Where the LP lives (permanently locked). */
  dex: 'Uniswap v3',
} as const;

/** The $AMP token (standard ERC-20 — no custom transfer logic assumed). */
export const AMP = {
  symbol: '$AMP',
  standard: 'ERC-20',
  decimals: 18,
  /** Fixed supply, minted once at fair launch, mint renounced. */
  totalSupply: 1_000_000_000n,
  /** Supply in base units (1e9 × 10^18). */
  totalSupplyBase: 1_000_000_000n * 10n ** 18n,
} as const;

/**
 * Server-side environment variable NAMES. Values are secrets/addresses read
 * from `process.env` server-side only — never hard-code an RPC URL, token
 * address, treasury address, or key in the repo or ship it to the client.
 */
export const CHAIN_ENV = {
  /** Robinhood Chain JSON-RPC endpoint (balance reads, later txs). */
  rpcUrl: 'ROBINHOOD_RPC_URL',
  /** The $AMP ERC-20 contract address. UNSET until the fair launch settles —
   *  the token gate and economy service stay inert while it is empty. */
  tokenAddress: 'AMP_TOKEN_ADDRESS',
  /** The treasury wallet address (receives the 70% share; never sells). */
  treasury: 'TREASURY_ADDRESS',
  /** The treasury signer key — server-side ONLY, never client/repo. */
  treasuryPrivateKey: 'TREASURY_PRIVATE_KEY',
  /** M3 flag: hood.fun creator rewards / buyback. OFF until volume + creator
   *  fees are confirmed; flipping to 'true' re-adds the monthly buyback. */
  creatorRewardsEnabled: 'CREATOR_REWARDS_ENABLED',
} as const;

/**
 * The Charged-membership token gate (M4). Holding at least this much $AMP in
 * a linked wallet is the "key" that opens access — checked server-side via
 * ERC-20 `balanceOf`, never client-reported.
 */
export const TOKEN_GATE = {
  /** Whole $AMP required to hold the key. */
  minTokens: 1_000n,
  /** In base units: 1,000 × 10^18. `balanceOf` ≥ this ⇒ access. */
  minTokensBase: 1_000n * 10n ** 18n,
  /** Grace on a dip below the threshold before access is revoked — the
   *  Spark is warned in-game, never instantly booted (M4). */
  graceHours: 24,
} as const;

/**
 * The burn split on every $AMP spend (M3): 30% is burned on-chain at the
 * till (ERC-20 transfer to {@link DEAD_ADDRESS}); 70% goes to the treasury
 * wallet, whose ONLY outflows are burns and the champions' purse.
 */
export const SPEND_SPLIT = { burnPct: 30, treasuryPct: 70 } as const;

/**
 * The buyback split IF {@link CHAIN_ENV.creatorRewardsEnabled} is ever
 * flipped on (M3): bought-back $AMP is half burned, half routed to the
 * champions' purse. Source would be hood.fun ETH creator rewards. Inert
 * while the flag is false.
 */
export const BUYBACK_SPLIT = { burnPct: 50, pursePct: 50 } as const;

/**
 * The ERC-20 burn sink — tokens transferred here leave circulating supply
 * forever (standard EVM dead address; no one holds its key).
 */
export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';
