import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import type { DistrictId } from '@shared/map';
import { MSG } from '@shared/protocol';
import type {
  AppearanceIntent,
  AttackIntent,
  BankIntent,
  GoalClaimIntent,
  InspectIntent,
  WardrobeIntent,
  ChatIntent,
  CraftIntent,
  DonateIntent,
  PlayerTradeIntent,
  QuestIntent,
  ReclaimIntent,
  RepairIntent,
  ShopIntent,
  TradeIntent,
  TravelIntent,
  UseItemIntent,
  BarIntent,
  StoryIntent,
  IdleIntent,
  GatherIntent,
  GlintClickIntent,
  MoveIntent,
  MoveStackIntent,
  NodeActionIntent,
  SelectSlotIntent,
} from '@shared/protocol';

/**
 * Server base URL (D6). Always from VITE_SERVER_URL in real deployments —
 * the localhost fallback exists only in dev builds (import.meta.env.DEV is
 * statically false in `vite build`, so the literal is tree-shaken out).
 * colyseus.js derives ws:// from http:// and wss:// from https:// on its
 * own, so one https URL configures both rails.
 */
function resolveServerUrl(): string {
  const raw = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim().replace(/\/+$/, '');
  if (raw !== undefined && raw !== '') {
    // Accept ws(s):// values too — fetch and colyseus.js both want http(s).
    let url = raw.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
    if (window.location.protocol === 'https:' && url.startsWith('http:')) {
      // An https page cannot call an http backend (mixed content) — upgrade.
      console.warn('[net] VITE_SERVER_URL is http on an https page — using https');
      url = url.replace(/^http:/, 'https:');
    }
    return url;
  }
  if (import.meta.env.DEV) return 'http://localhost:2567';
  throw new Error(
    'AMPERIA client was built without VITE_SERVER_URL — set it in the Vercel project env and rebuild.',
  );
}

/** Server base URL (http[s]; ws[s] derives from it). */
export const SERVER_URL: string = resolveServerUrl();

export interface AuthResponse {
  token: string;
  sparkName: string;
  /** The signed-in wallet (lowercased) — the account identity. */
  walletAddress: string;
  /** Last persisted district — rejoin the Spark where they left off. */
  district: DistrictId;
}

async function authPost(path: string, body: Record<string, unknown>): Promise<AuthResponse> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as AuthResponse & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Request failed.');
  return data;
}

/**
 * Wallet-only auth (W2–W5). `nonce()` fetches a single-use server nonce; the
 * wallet module folds it into an EIP-4361 message, signs it, and `wallet()`
 * posts the message + signature for server-side verification + find-or-create.
 */
export const auth = {
  nonce: async (): Promise<{ nonce: string }> => {
    const res = await fetch(`${SERVER_URL}/auth/nonce`);
    const data = (await res.json()) as { nonce?: string; error?: string };
    if (!res.ok || typeof data.nonce !== 'string') {
      throw new Error(data.error ?? 'Could not start sign-in.');
    }
    return { nonce: data.nonce };
  },
  wallet: (message: string, signature: string) => authPost('/auth/wallet', { message, signature }),
};

export const TOKEN_KEY = 'amperia.token';
/** Mirrors the Spark's district so a stored-token resume rejoins it. */
export const DISTRICT_KEY = 'amperia.district';

const DISTRICTS: readonly DistrictId[] = ['filament', 'tangle', 'stacks', 'terrarium', 'underworks'];

export function rememberedDistrict(): DistrictId {
  const stored = localStorage.getItem(DISTRICT_KEY);
  return (DISTRICTS as readonly string[]).includes(stored ?? '')
    ? (stored as DistrictId)
    : 'filament';
}

/** Live connection to a district room (Filament, Tangle, …). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Colyseus schema state is runtime-typed; access goes through getStateCallbacks proxies.
export type FilamentRoom = Room<any>;

/** Join a district room by id — rooms are registered under their district. */
export async function joinDistrict(token: string, district: DistrictId): Promise<FilamentRoom> {
  const client = new Client(SERVER_URL);
  return client.joinOrCreate(district, { token });
}

/**
 * Join a district as a read-only spectator (W7) — no token, no account. The
 * server seats a temporary, non-persistent Visitor; every value action is
 * refused with a "connect your wallet" prompt until they connect one.
 */
export async function joinDistrictSpectate(district: DistrictId): Promise<FilamentRoom> {
  const client = new Client(SERVER_URL);
  return client.joinOrCreate(district, { spectate: true });
}

export { getStateCallbacks, MSG };

/** Typed intent senders. */
export const send = {
  move: (room: FilamentRoom, msg: MoveIntent) => room.send(MSG.move, msg),
  gather: (room: FilamentRoom, msg: GatherIntent) => room.send(MSG.gather, msg),
  glintClick: (room: FilamentRoom, msg: GlintClickIntent) => room.send(MSG.glintClick, msg),
  nodeAction: (room: FilamentRoom, msg: NodeActionIntent) => room.send(MSG.nodeAction, msg),
  attack: (room: FilamentRoom, msg: AttackIntent) => room.send(MSG.attack, msg),
  placeHeatlamp: (room: FilamentRoom) => room.send(MSG.placeHeatlamp, {}),
  trade: (room: FilamentRoom, msg: TradeIntent) => room.send(MSG.trade, msg),
  ptrade: (room: FilamentRoom, msg: PlayerTradeIntent) => room.send(MSG.ptrade, msg),
  shop: (room: FilamentRoom, msg: ShopIntent) => room.send(MSG.shop, msg),
  chargeInfo: (room: FilamentRoom) => room.send(MSG.chargeInfo, {}),
  useItem: (room: FilamentRoom, msg: UseItemIntent) => room.send(MSG.useItem, msg),
  bar: (room: FilamentRoom, msg: BarIntent) => room.send(MSG.bar, msg),
  story: (room: FilamentRoom, msg: StoryIntent) => room.send(MSG.story, msg),
  idle: (room: FilamentRoom, msg: IdleIntent) => room.send(MSG.idle, msg),
  craft: (room: FilamentRoom, msg: CraftIntent) => room.send(MSG.craft, msg),
  repair: (room: FilamentRoom, msg: RepairIntent) => room.send(MSG.repair, msg),
  quest: (room: FilamentRoom, msg: QuestIntent) => room.send(MSG.quest, msg),
  donate: (room: FilamentRoom, msg: DonateIntent) => room.send(MSG.donate, msg),
  travel: (room: FilamentRoom, msg: TravelIntent) => room.send(MSG.travel, msg),
  reclaim: (room: FilamentRoom, msg: ReclaimIntent) => room.send(MSG.reclaim, msg),
  selectSlot: (room: FilamentRoom, msg: SelectSlotIntent) => room.send(MSG.selectSlot, msg),
  moveStack: (room: FilamentRoom, msg: MoveStackIntent) => room.send(MSG.moveStack, msg),
  chat: (room: FilamentRoom, msg: ChatIntent) => room.send(MSG.chat, msg),
  appearance: (room: FilamentRoom, msg: AppearanceIntent) => room.send(MSG.appearance, msg),
  wardrobe: (room: FilamentRoom, msg: WardrobeIntent) => room.send(MSG.wardrobe, msg),
  inspect: (room: FilamentRoom, msg: InspectIntent) => room.send(MSG.inspect, msg),
  goalClaim: (room: FilamentRoom, msg: GoalClaimIntent) => room.send(MSG.goalClaim, msg),
  /** The Fortune Coil: the spin takes NOTHING — free: true is the whole payload. */
  coilSpin: (room: FilamentRoom) => room.send(MSG.coilSpin, { free: true }),
  bank: (room: FilamentRoom, msg: BankIntent) => room.send(MSG.bank, msg),
  /** F2: server-authoritative Pack sort. */
  sortPack: (room: FilamentRoom) => room.send(MSG.sortPack, { target: 'pack' }),
};
