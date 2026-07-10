import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import type { DistrictId } from '@shared/map';
import { MSG } from '@shared/protocol';
import type {
  AppearanceIntent,
  AttackIntent,
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
  GatherIntent,
  GlintClickIntent,
  MoveIntent,
  MoveStackIntent,
  NodeActionIntent,
  SelectSlotIntent,
} from '@shared/protocol';

/** Server base URL (http; ws derives from it). */
export const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://localhost:2567';

export interface AuthResponse {
  token: string;
  sparkName: string;
  email: string | null;
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

export const auth = {
  register: (email: string, password: string, sparkName: string) =>
    authPost('/auth/register', { email, password, sparkName }),
  login: (email: string, password: string) => authPost('/auth/login', { email, password }),
  guest: (sparkName?: string) => authPost('/auth/guest', sparkName ? { sparkName } : {}),
};

export const TOKEN_KEY = 'amperia.token';
/** Mirrors the Spark's district so a stored-token resume rejoins it. */
export const DISTRICT_KEY = 'amperia.district';

export function rememberedDistrict(): DistrictId {
  return localStorage.getItem(DISTRICT_KEY) === 'tangle' ? 'tangle' : 'filament';
}

/** Live connection to a district room (Filament, Tangle, …). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Colyseus schema state is runtime-typed; access goes through getStateCallbacks proxies.
export type FilamentRoom = Room<any>;

/** Join a district room by id — rooms are registered under their district. */
export async function joinDistrict(token: string, district: DistrictId): Promise<FilamentRoom> {
  const client = new Client(SERVER_URL);
  return client.joinOrCreate(district, { token });
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
};
