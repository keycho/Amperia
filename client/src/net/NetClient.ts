import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import { MSG } from '@shared/protocol';
import type {
  AttackIntent,
  ChatIntent,
  CraftIntent,
  RepairIntent,
  TradeIntent,
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

/** Live connection to the Filament district. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Colyseus schema state is runtime-typed; access goes through getStateCallbacks proxies.
export type FilamentRoom = Room<any>;

export async function joinFilament(token: string): Promise<FilamentRoom> {
  const client = new Client(SERVER_URL);
  return client.joinOrCreate('filament', { token });
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
  useItem: (room: FilamentRoom, msg: UseItemIntent) => room.send(MSG.useItem, msg),
  craft: (room: FilamentRoom, msg: CraftIntent) => room.send(MSG.craft, msg),
  repair: (room: FilamentRoom, msg: RepairIntent) => room.send(MSG.repair, msg),
  selectSlot: (room: FilamentRoom, msg: SelectSlotIntent) => room.send(MSG.selectSlot, msg),
  moveStack: (room: FilamentRoom, msg: MoveStackIntent) => room.send(MSG.moveStack, msg),
  chat: (room: FilamentRoom, msg: ChatIntent) => room.send(MSG.chat, msg),
};
