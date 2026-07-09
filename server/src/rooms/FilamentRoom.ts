import { Client, Room } from 'colyseus';
import { CONFIG } from '@shared/config';
import { rollGather, rollGlintTime } from '@shared/gathering';
import { addItem, makeInventory, transfer, type Inventory } from '@shared/inventory';
import { buildWorldMap, type WorldMap } from '@shared/map';
import { advanceMovement, makeMoveState, setPath, type MoveState } from '@shared/movement';
import { findPath, findPathAdjacent, type PathGrid, type TilePoint } from '@shared/pathfinding';
import {
  CHAT_LIMITS,
  MSG,
  type ChatBroadcast,
  type ChatIntent,
  type GatherIntent,
  type GlintClickIntent,
  type InventorySync,
  type MoveIntent,
  type MoveStackIntent,
} from '@shared/protocol';
import { makeRng, type Rng } from '@shared/rng';
import { ledger } from '../services/ledger.js';
import { verifyToken } from '../services/auth.js';
import { loadCharacter, persistCharacter } from '../services/persistence.js';

interface GatherSession {
  nodeId: number;
  elapsed: number;
  glintAt: number;
  glintShownAtMs: number | null;
  glintExpired: boolean;
  glintHit: boolean;
}

/** Server-side per-player runtime (never synced). */
interface PlayerRuntime {
  accountId: string;
  characterId: string;
  sparkName: string;
  move: MoveState;
  pack: Inventory;
  hotbar: Inventory;
  gatherTargetNode: number | null;
  session: GatherSession | null;
  lastChatAtMs: number;
  /** Glint reaction deltas (ms) — behavioral-entropy logging habit (C7). */
  glintReactionsMs: number[];
}

import { FilamentState, NodeState, PlayerState } from './state.js';

/**
 * The Filament — hub district room. One room instance per ~40 Sparks; the
 * server owns movement, gathering, inventories, and node lifecycles.
 */
export class FilamentRoom extends Room<FilamentState> {
  maxClients = 40;

  private map!: WorldMap;
  private grid!: PathGrid;
  private rng: Rng = makeRng(Date.now() >>> 0);
  private runtimes = new Map<string, PlayerRuntime>();
  private respawnTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private persistTicker = 0;

  onCreate(): void {
    this.state = new FilamentState();
    this.map = buildWorldMap();
    this.grid = { size: this.map.size, walkable: this.map.walkable };
    for (const n of this.map.junkNodes) {
      this.state.nodes.set(String(n.id), new NodeState());
    }

    this.onMessage<MoveIntent>(MSG.move, (client, msg) => this.handleMove(client, msg));
    this.onMessage<GatherIntent>(MSG.gather, (client, msg) => this.handleGather(client, msg));
    this.onMessage<GlintClickIntent>(MSG.glintClick, (client, msg) =>
      this.handleGlintClick(client, msg),
    );
    this.onMessage<MoveStackIntent>(MSG.moveStack, (client, msg) =>
      this.handleMoveStack(client, msg),
    );
    this.onMessage<ChatIntent>(MSG.chat, (client, msg) => this.handleChat(client, msg));

    this.setSimulationInterval((dt) => this.tick(dt), 50);
  }

  async onJoin(client: Client, options: unknown): Promise<void> {
    const token =
      typeof options === 'object' && options !== null
        ? String((options as Record<string, unknown>).token ?? '')
        : '';
    const auth = verifyToken(token); // throws → join rejected
    // One live session per account.
    for (const rt of this.runtimes.values()) {
      if (rt.accountId === auth.accountId) {
        throw new Error('This Spark is already in the city.');
      }
    }
    const character = await loadCharacter(auth.characterId);
    const spawn: TilePoint =
      character.tile !== null && this.map.walkable[character.tile.y]?.[character.tile.x] === true
        ? character.tile
        : CONFIG.player.spawn;

    const runtime: PlayerRuntime = {
      accountId: auth.accountId,
      characterId: auth.characterId,
      sparkName: character.sparkName,
      move: makeMoveState(spawn),
      pack: character.pack ?? makeInventory(CONFIG.inventory.slots),
      hotbar: character.hotbar ?? makeInventory(CONFIG.inventory.hotbarSlots),
      gatherTargetNode: null,
      session: null,
      lastChatAtMs: 0,
      glintReactionsMs: [],
    };
    this.runtimes.set(client.sessionId, runtime);

    const ps = new PlayerState();
    ps.sparkName = character.sparkName;
    ps.tileX = spawn.x;
    ps.tileY = spawn.y;
    this.state.players.set(client.sessionId, ps);

    client.send(MSG.inventory, this.inventorySync(runtime));
  }

  async onLeave(client: Client): Promise<void> {
    const rt = this.runtimes.get(client.sessionId);
    this.runtimes.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (rt !== undefined) await this.persist(rt);
  }

  async onDispose(): Promise<void> {
    for (const t of this.respawnTimers.values()) clearTimeout(t);
    await Promise.all([...this.runtimes.values()].map((rt) => this.persist(rt)));
  }

  // ── intents ────────────────────────────────────────────────────────────

  private handleMove(client: Client, msg: MoveIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || !this.isValidTile(msg)) return;
    if (this.map.walkable[msg.y]?.[msg.x] !== true) return;
    const path = findPath(this.grid, this.settledTile(rt), { x: msg.x, y: msg.y });
    if (path === null) return;
    this.cancelGather(client, rt);
    rt.gatherTargetNode = null;
    rt.move = setPath(rt.move, path);
    this.broadcast(MSG.moveAccepted, { sessionId: client.sessionId, path });
  }

  private handleGather(client: Client, msg: GatherIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    const node = this.map.junkNodes.find((n) => n.id === msg.nodeId);
    const nodeState = this.state.nodes.get(String(msg.nodeId));
    if (rt === undefined || node === undefined || nodeState === undefined) return;
    if (nodeState.depleted) return;
    if (rt.session?.nodeId === msg.nodeId) return;
    this.cancelGather(client, rt);

    const path = findPathAdjacent(this.grid, this.settledTile(rt), {
      x: node.x,
      y: node.y,
      w: 1,
      h: 1,
    });
    if (path === null) return;
    rt.gatherTargetNode = msg.nodeId;
    if (path.length > 0) {
      rt.move = setPath(rt.move, path);
      this.broadcast(MSG.moveAccepted, { sessionId: client.sessionId, path });
    }
    // Gather begins in tick() once movement settles next to the node.
  }

  private handleGlintClick(client: Client, msg: GlintClickIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    const s = rt?.session;
    if (rt === undefined || s === undefined || s === null) return;
    if (s.nodeId !== msg.nodeId || s.glintShownAtMs === null || s.glintExpired || s.glintHit) {
      return;
    }
    const reactionMs = Date.now() - s.glintShownAtMs;
    if (reactionMs > CONFIG.gathering.junkHeap.glint.windowSeconds * 1000 + 250) return;
    s.glintHit = true;
    // Behavioral-entropy habit: perfectly consistent reaction times are a
    // bot tell; keep the trail for the anomaly pass (C7).
    rt.glintReactionsMs.push(reactionMs);
    ledger.log({
      type: 'glint',
      account: rt.accountId,
      data: { nodeId: s.nodeId, reactionMs },
    });
  }

  private handleMoveStack(client: Client, msg: MoveStackIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined) return;
    const containers = { pack: rt.pack, hotbar: rt.hotbar };
    const src = containers[msg.from];
    const dst = containers[msg.to];
    if (src === undefined || dst === undefined) return;
    if (!Number.isInteger(msg.fromIdx) || !Number.isInteger(msg.toIdx)) return;
    if (msg.fromIdx < 0 || msg.fromIdx >= src.slots.length) return;
    if (msg.toIdx < 0 || msg.toIdx >= dst.slots.length) return;
    const r = transfer(
      src,
      msg.fromIdx,
      msg.from === msg.to ? src : dst,
      msg.toIdx,
      CONFIG.inventory.stackMax,
    );
    if (msg.from === 'pack') rt.pack = r.src;
    else rt.hotbar = r.src;
    if (msg.to === 'pack') rt.pack = r.dst;
    else rt.hotbar = r.dst;
    if (msg.from === msg.to) {
      if (msg.from === 'pack') rt.pack = r.dst;
      else rt.hotbar = r.dst;
    }
    client.send(MSG.inventory, this.inventorySync(rt));
  }

  private handleChat(client: Client, msg: ChatIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || typeof msg.text !== 'string') return;
    const now = Date.now();
    if (now - rt.lastChatAtMs < CHAT_LIMITS.minIntervalMs) return;
    const text = msg.text.trim().slice(0, CHAT_LIMITS.maxLength);
    if (text.length === 0) return;
    rt.lastChatAtMs = now;
    const out: ChatBroadcast = { from: rt.sparkName, text, ts: now };
    this.broadcast(MSG.chatMsg, out);
  }

  // ── simulation ─────────────────────────────────────────────────────────

  private tick(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const [sessionId, rt] of this.runtimes) {
      // Advance movement.
      if (rt.move.queue.length > 0) {
        rt.move = advanceMovement(rt.move, dt, CONFIG.player.secondsPerTile);
        const ps = this.state.players.get(sessionId);
        if (ps !== undefined) {
          ps.tileX = rt.move.tile.x;
          ps.tileY = rt.move.tile.y;
        }
      }
      // Start a pending gather once settled next to the node.
      if (rt.gatherTargetNode !== null && rt.session === null && rt.move.queue.length === 0) {
        this.beginGather(sessionId, rt);
      }
      // Advance gather session.
      if (rt.session !== null) this.advanceGather(sessionId, rt, dt);
    }

    // Periodic persistence (~every 30s of ticks).
    this.persistTicker += dtMs;
    if (this.persistTicker >= 30_000) {
      this.persistTicker = 0;
      for (const rt of this.runtimes.values()) void this.persist(rt);
    }
  }

  private beginGather(sessionId: string, rt: PlayerRuntime): void {
    const nodeId = rt.gatherTargetNode as number;
    const node = this.map.junkNodes.find((n) => n.id === nodeId);
    const nodeState = this.state.nodes.get(String(nodeId));
    const client = this.clients.find((c) => c.sessionId === sessionId);
    rt.gatherTargetNode = null;
    if (node === undefined || nodeState === undefined || client === undefined) return;
    if (nodeState.depleted) return;
    // Must actually stand next to it (server-checked adjacency).
    const t = rt.move.tile;
    if (Math.abs(t.x - node.x) + Math.abs(t.y - node.y) !== 1) return;

    const cfg = CONFIG.gathering.junkHeap;
    rt.session = {
      nodeId,
      elapsed: 0,
      glintAt: rollGlintTime(cfg, cfg.gatherSeconds, this.rng),
      glintShownAtMs: null,
      glintExpired: false,
      glintHit: false,
    };
    const ps = this.state.players.get(sessionId);
    if (ps !== undefined) ps.gathering = true;
    client.send(MSG.gatherStart, { nodeId, seconds: cfg.gatherSeconds });
  }

  private advanceGather(sessionId: string, rt: PlayerRuntime, dt: number): void {
    const s = rt.session as GatherSession;
    const cfg = CONFIG.gathering.junkHeap;
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (client === undefined) {
      rt.session = null;
      return;
    }
    s.elapsed += dt;

    if (s.glintShownAtMs === null && s.elapsed >= s.glintAt) {
      s.glintShownAtMs = Date.now();
      client.send(MSG.glintShow, {
        nodeId: s.nodeId,
        offset: this.rng(),
        windowSeconds: cfg.glint.windowSeconds,
      });
    } else if (
      s.glintShownAtMs !== null &&
      !s.glintExpired &&
      !s.glintHit &&
      s.elapsed >= s.glintAt + cfg.glint.windowSeconds
    ) {
      s.glintExpired = true;
      client.send(MSG.glintHide, { nodeId: s.nodeId });
    }

    if (s.elapsed >= cfg.gatherSeconds) this.completeGather(sessionId, rt, client);
  }

  private completeGather(sessionId: string, rt: PlayerRuntime, client: Client): void {
    const s = rt.session as GatherSession;
    rt.session = null;
    const ps = this.state.players.get(sessionId);
    if (ps !== undefined) ps.gathering = false;
    const nodeState = this.state.nodes.get(String(s.nodeId));
    if (nodeState === undefined || nodeState.depleted) return;

    const cfg = CONFIG.gathering.junkHeap;
    const roll = rollGather(cfg, s.glintHit, this.rng);
    const r = addItem(rt.pack, 'salvage', roll.amount, CONFIG.inventory.stackMax);
    rt.pack = r.inv;
    let rareGranted: typeof roll.rare = null;
    if (roll.rare !== null) {
      const rr = addItem(rt.pack, roll.rare, 1, CONFIG.inventory.stackMax);
      if (rr.added > 0) {
        rt.pack = rr.inv;
        rareGranted = roll.rare;
      }
    }

    // Every faucet writes to the economy ledger (golden rule 9 habit).
    ledger.log({
      type: 'gather',
      account: rt.accountId,
      data: {
        nodeId: s.nodeId,
        itemId: 'salvage',
        qty: r.added,
        overflow: r.overflow,
        rare: rareGranted,
        glintHit: s.glintHit,
      },
    });

    client.send(MSG.loot, {
      nodeId: s.nodeId,
      itemId: 'salvage',
      qty: r.added,
      rare: rareGranted,
      glintHit: s.glintHit,
    });
    client.send(MSG.inventory, this.inventorySync(rt));

    nodeState.depleted = true;
    const timer = setTimeout(() => {
      nodeState.depleted = false;
      this.respawnTimers.delete(s.nodeId);
    }, cfg.respawnSeconds * 1000);
    this.respawnTimers.set(s.nodeId, timer);
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private cancelGather(client: Client, rt: PlayerRuntime): void {
    if (rt.session !== null) {
      client.send(MSG.gatherStop, { nodeId: rt.session.nodeId });
      rt.session = null;
      const ps = this.state.players.get(client.sessionId);
      if (ps !== undefined) ps.gathering = false;
    }
  }

  private settledTile(rt: PlayerRuntime): TilePoint {
    // Clients don't predict: the server's last committed tile is the truth
    // a new path starts from (mid-walk re-paths replace the queue).
    return rt.move.tile;
  }

  private isValidTile(p: { x: number; y: number }): boolean {
    return (
      Number.isInteger(p.x) &&
      Number.isInteger(p.y) &&
      p.x >= 0 &&
      p.y >= 0 &&
      p.x < this.map.size &&
      p.y < this.map.size
    );
  }

  private inventorySync(rt: PlayerRuntime): InventorySync {
    return { pack: rt.pack.slots, hotbar: rt.hotbar.slots };
  }

  private async persist(rt: PlayerRuntime): Promise<void> {
    await persistCharacter(rt.characterId, {
      tile: rt.move.tile,
      pack: rt.pack,
      hotbar: rt.hotbar,
    });
  }
}
