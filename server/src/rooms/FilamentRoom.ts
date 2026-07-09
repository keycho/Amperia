import { Client, Room } from 'colyseus';
import { CONFIG, type ToolId } from '@shared/config';
import { rollGather, rollGlintTime } from '@shared/gathering';
import { addItem, makeInventory, makeStarterHotbar, transfer, type Inventory } from '@shared/inventory';
import type { ItemId } from '@shared/items';
import { buildWorldMap, type WorldMap } from '@shared/map';
import {
  amperiteStrikeYield,
  inSweetZone,
  koiYield,
  pickLiveFork,
  pulseIsOn,
  rollBrassRare,
  rollBrassSegmentYield,
  rollKoi,
  rollSignalRare,
  rollSweetZoneStart,
  signalYield,
  targetFrequencyAt,
  tensionValue,
  type KoiRoll,
} from '@shared/minigames';
import {
  effectiveSeconds,
  levelForXp,
  SKILL_BY_NODE,
  type SkillId,
  type SkillXp,
} from '@shared/mastery';
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
  type NodeActionIntent,
  type NodeEventPayload,
  type SelectSlotIntent,
} from '@shared/protocol';
import { makeRng, type Rng } from '@shared/rng';
import { ledger } from '../services/ledger.js';
import { verifyToken } from '../services/auth.js';
import { loadCharacter, persistCharacter } from '../services/persistence.js';
import { FilamentState, NodeState, PlayerState } from './state.js';

type Session =
  | {
      kind: 'junkHeap';
      nodeId: number;
      elapsed: number;
      /** Effective cycle seconds (mastery speed curve applied). */
      seconds: number;
      glintAt: number;
      glintShownAtMs: number | null;
      glintExpired: boolean;
      glintHit: boolean;
    }
  | {
      kind: 'brassSeam';
      nodeId: number;
      phase: 'digging' | 'fork';
      elapsed: number;
      /** Effective segment seconds (mastery speed curve applied). */
      seconds: number;
      segment: number;
      total: number;
      liveSide: 0 | 1;
    }
  | {
      kind: 'amperite';
      nodeId: number;
      elapsed: number;
      phaseSeconds: number;
      strikesLeft: number;
      total: number;
    }
  | {
      kind: 'glowkoi';
      nodeId: number;
      phase: 'shadow' | 'casting' | 'tension';
      elapsed: number;
      koi: KoiRoll;
      sweetStart: number;
    }
  | {
      kind: 'antenna';
      nodeId: number;
      elapsed: number;
      wavePhase: number;
      needle: number;
      lockSeconds: number;
    };

/** Server-side per-player runtime (never synced). */
interface PlayerRuntime {
  accountId: string;
  characterId: string;
  sparkName: string;
  move: MoveState;
  pack: Inventory;
  hotbar: Inventory;
  activeSlot: number;
  skills: SkillXp;
  gatherTargetNode: number | null;
  session: Session | null;
  lastChatAtMs: number;
  /** Cue reaction deltas (ms) — behavioral-entropy logging habit (C7). */
  glintReactionsMs: number[];
}

/**
 * The Filament — hub district room. One room instance per ~40 Sparks; the
 * server owns movement, gathering (all five resources), inventories, and
 * node lifecycles. Clients send intents and render results.
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
    for (const n of this.map.nodes) {
      this.state.nodes.set(String(n.id), new NodeState());
    }

    this.onMessage<MoveIntent>(MSG.move, (client, msg) => this.handleMove(client, msg));
    this.onMessage<GatherIntent>(MSG.gather, (client, msg) => this.handleGather(client, msg));
    this.onMessage<GlintClickIntent>(MSG.glintClick, (client, msg) =>
      this.handleGlintClick(client, msg),
    );
    this.onMessage<NodeActionIntent>(MSG.nodeAction, (client, msg) =>
      this.handleNodeAction(client, msg),
    );
    this.onMessage<SelectSlotIntent>(MSG.selectSlot, (client, msg) => {
      const rt = this.runtimes.get(client.sessionId);
      if (rt === undefined || !Number.isInteger(msg.slot)) return;
      if (msg.slot < 0 || msg.slot >= CONFIG.inventory.hotbarSlots) return;
      rt.activeSlot = msg.slot;
    });
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
      hotbar: character.hotbar ?? makeStarterHotbar(),
      activeSlot: 0,
      skills: character.skills,
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
    client.send(MSG.skills, { xp: runtime.skills });
    this.broadcast(
      MSG.notice,
      { text: `${character.sparkName} stepped off the tram.` },
      { except: client },
    );
  }

  async onLeave(client: Client): Promise<void> {
    const rt = this.runtimes.get(client.sessionId);
    this.runtimes.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (rt !== undefined) {
      // Partial veins/strikes pay out what was worked.
      this.settleSession(client, rt, false);
      this.broadcast(MSG.notice, { text: `${rt.sparkName} rode the tram out.` });
      await this.persist(rt);
    }
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
    const path = findPath(this.grid, rt.move.tile, { x: msg.x, y: msg.y });
    if (path === null) return;
    this.cancelGather(client, rt);
    rt.gatherTargetNode = null;
    rt.move = setPath(rt.move, path);
    this.broadcast(MSG.moveAccepted, { sessionId: client.sessionId, path });
  }

  private handleGather(client: Client, msg: GatherIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    const node = this.map.nodes.find((n) => n.id === msg.nodeId);
    const nodeState = this.state.nodes.get(String(msg.nodeId));
    if (rt === undefined || node === undefined || nodeState === undefined) return;
    if (nodeState.depleted) return;
    if (rt.session?.nodeId === msg.nodeId) return;

    // The right tool must be in the ACTIVE hotbar slot (config-driven).
    const required = CONFIG.tools.requiredByNode[node.kind] as ToolId;
    const held = rt.hotbar.slots[rt.activeSlot];
    if (held === null || held === undefined || held.itemId !== required) {
      client.send(MSG.notice, {
        text: `You need your ${required.charAt(0).toUpperCase()}${required.slice(1)} in hand for that.`,
      });
      return;
    }

    this.cancelGather(client, rt);
    const path = findPathAdjacent(this.grid, rt.move.tile, {
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
    // The session begins in tick() once movement settles next to the node.
  }

  private handleGlintClick(client: Client, msg: GlintClickIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    const s = rt?.session;
    if (rt === undefined || s === undefined || s === null || s.kind !== 'junkHeap') return;
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

  private handleNodeAction(client: Client, msg: NodeActionIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    const s = rt?.session;
    if (rt === undefined || s === undefined || s === null || s.nodeId !== msg.nodeId) return;

    switch (msg.action) {
      case 'forkPick': {
        if (s.kind !== 'brassSeam' || s.phase !== 'fork') return;
        if (msg.side !== 0 && msg.side !== 1) return;
        rt.glintReactionsMs.push(Math.round(s.elapsed * 1000));
        if (msg.side === s.liveSide) {
          s.segment += 1;
          s.phase = 'digging';
          s.elapsed = 0;
        } else {
          this.endBrass(client, rt, s, false);
        }
        break;
      }
      case 'strike': {
        if (s.kind !== 'amperite') return;
        const cfg = CONFIG.gathering.amperite;
        const onPulse = pulseIsOn(
          s.elapsed,
          s.phaseSeconds,
          cfg.pulsePeriodSeconds,
          cfg.pulseWindowSeconds,
        );
        const amount = amperiteStrikeYield(cfg, onPulse);
        s.total += amount;
        s.strikesLeft -= 1;
        this.grantXp(client, rt, SKILL_BY_NODE.amperite, CONFIG.mastery.xpByNode.amperite);
        this.sendNodeEvent(client, {
          type: 'amperiteStrike',
          nodeId: s.nodeId,
          onPulse,
          amount,
          strikesLeft: s.strikesLeft,
        });
        if (s.strikesLeft <= 0) {
          const rtSession = rt.session as Session;
          rt.session = null;
          this.setGatheringFlag(client.sessionId, false);
          this.grantLoot(client, rt, rtSession.nodeId, 'amperite', s.total, null, {
            kind: 'amperite',
          });
          this.depleteNode(rtSession.nodeId, CONFIG.gathering.amperite.respawnSeconds);
        }
        break;
      }
      case 'cast': {
        if (s.kind !== 'glowkoi' || s.phase !== 'shadow') return;
        s.phase = 'casting';
        s.elapsed = 0;
        break;
      }
      case 'reel': {
        if (s.kind !== 'glowkoi' || s.phase !== 'tension') return;
        const cfg = CONFIG.gathering.glowkoi;
        const v = tensionValue(s.elapsed, cfg.tensionPeriodSeconds);
        const caught = inSweetZone(v, s.sweetStart, cfg.sweetZoneFraction);
        rt.glintReactionsMs.push(Math.round(s.elapsed * 1000));
        rt.session = null;
        this.setGatheringFlag(client.sessionId, false);
        this.sendNodeEvent(client, { type: 'koiResult', nodeId: s.nodeId, caught });
        if (caught) {
          const amount = koiYield(cfg, s.koi);
          const rare = s.koi.rare ? (cfg.rareFindItem as ItemId) : null;
          this.grantLoot(client, rt, s.nodeId, 'glowkoi', amount, rare, {
            kind: 'glowkoi',
            sizeIdx: s.koi.sizeIdx,
          });
          this.grantXp(client, rt, SKILL_BY_NODE.glowkoi, CONFIG.mastery.xpByNode.glowkoi);
          this.depleteNode(s.nodeId, cfg.respawnSeconds);
        }
        break;
      }
      case 'tune': {
        if (s.kind !== 'antenna') return;
        if (typeof msg.needle !== 'number' || Number.isNaN(msg.needle)) return;
        s.needle = Math.min(1, Math.max(0, msg.needle));
        break;
      }
    }
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
    if (text.startsWith('/')) {
      this.handleCommand(client, rt, text);
      return;
    }
    const out: ChatBroadcast = { from: rt.sparkName, text, ts: now };
    this.broadcast(MSG.chatMsg, out);
  }

  /** Slash commands (CLAUDE.md world nouns: /near /help for now). */
  private handleCommand(client: Client, rt: PlayerRuntime, text: string): void {
    const cmd = text.split(/\s+/)[0];
    if (cmd === '/near') {
      const me = rt.move.tile;
      const near: string[] = [];
      for (const [sid, other] of this.runtimes) {
        if (sid === client.sessionId) continue;
        const d = Math.max(Math.abs(other.move.tile.x - me.x), Math.abs(other.move.tile.y - me.y));
        if (d <= CONFIG.chat.nearRadiusTiles) near.push(`${other.sparkName} (${d} tiles)`);
      }
      client.send(MSG.notice, {
        text: near.length > 0 ? `Nearby Sparks: ${near.join(', ')}` : 'No Sparks nearby.',
      });
    } else if (cmd === '/help') {
      client.send(MSG.notice, { text: 'Commands: /near /help — more as the city grows.' });
    } else {
      client.send(MSG.notice, { text: `The city doesn't know ${cmd ?? 'that'} yet.` });
    }
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
      // Advance the active session.
      if (rt.session !== null) this.advanceSession(sessionId, rt, dt);
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
    const node = this.map.nodes.find((n) => n.id === nodeId);
    const nodeState = this.state.nodes.get(String(nodeId));
    const client = this.clients.find((c) => c.sessionId === sessionId);
    rt.gatherTargetNode = null;
    if (node === undefined || nodeState === undefined || client === undefined) return;
    if (nodeState.depleted) return;
    // Must actually stand next to it (server-checked adjacency).
    const t = rt.move.tile;
    if (Math.abs(t.x - node.x) + Math.abs(t.y - node.y) !== 1) return;

    switch (node.kind) {
      case 'junkHeap': {
        const cfg = CONFIG.gathering.junkHeap;
        const seconds = effectiveSeconds(cfg.gatherSeconds, levelForXp(rt.skills.scavving));
        rt.session = {
          kind: 'junkHeap',
          nodeId,
          elapsed: 0,
          seconds,
          glintAt: rollGlintTime(cfg, seconds, this.rng),
          glintShownAtMs: null,
          glintExpired: false,
          glintHit: false,
        };
        client.send(MSG.gatherStart, { nodeId, seconds });
        break;
      }
      case 'brassSeam': {
        const seconds = effectiveSeconds(
          CONFIG.gathering.brassSeam.segmentSeconds,
          levelForXp(rt.skills.delving),
        );
        rt.session = {
          kind: 'brassSeam',
          nodeId,
          phase: 'digging',
          elapsed: 0,
          seconds,
          segment: 1,
          total: 0,
          liveSide: 0,
        };
        client.send(MSG.gatherStart, { nodeId, seconds });
        break;
      }
      case 'amperite': {
        const cfg = CONFIG.gathering.amperite;
        rt.session = {
          kind: 'amperite',
          nodeId,
          elapsed: 0,
          phaseSeconds: this.rng() * cfg.pulsePeriodSeconds,
          strikesLeft: cfg.strikes,
          total: 0,
        };
        this.sendNodeEvent(client, {
          type: 'amperiteStart',
          nodeId,
          periodSeconds: cfg.pulsePeriodSeconds,
          phaseSeconds: (rt.session as Extract<Session, { kind: 'amperite' }>).phaseSeconds,
          windowSeconds: cfg.pulseWindowSeconds,
          strikes: cfg.strikes,
        });
        break;
      }
      case 'glowkoi': {
        const cfg = CONFIG.gathering.glowkoi;
        const koi = rollKoi(cfg, this.rng);
        rt.session = {
          kind: 'glowkoi',
          nodeId,
          phase: 'shadow',
          elapsed: 0,
          koi,
          sweetStart: 0,
        };
        this.sendNodeEvent(client, {
          type: 'koiShadow',
          nodeId,
          sizeIdx: koi.sizeIdx,
          rare: koi.rare,
          shadowSeconds: cfg.shadowSeconds,
        });
        break;
      }
      case 'antenna': {
        const cfg = CONFIG.gathering.antenna;
        rt.session = {
          kind: 'antenna',
          nodeId,
          elapsed: 0,
          wavePhase: this.rng() * Math.PI * 2,
          needle: 0.5,
          lockSeconds: 0,
        };
        this.sendNodeEvent(client, {
          type: 'tuneStart',
          nodeId,
          seconds: cfg.tuneSeconds,
          phase: (rt.session as Extract<Session, { kind: 'antenna' }>).wavePhase,
          driftSpeed: cfg.driftSpeed,
          amplitude: cfg.amplitude,
          tolerance: cfg.lockTolerance,
        });
        break;
      }
    }
    this.setGatheringFlag(sessionId, true);
  }

  private advanceSession(sessionId: string, rt: PlayerRuntime, dt: number): void {
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (client === undefined) {
      rt.session = null;
      return;
    }
    const s = rt.session as Session;
    s.elapsed += dt;

    switch (s.kind) {
      case 'junkHeap': {
        const cfg = CONFIG.gathering.junkHeap;
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
        if (s.elapsed >= s.seconds) {
          const roll = rollGather(cfg, s.glintHit, this.rng);
          rt.session = null;
          this.setGatheringFlag(sessionId, false);
          this.grantLoot(client, rt, s.nodeId, 'salvage', roll.amount, roll.rare, {
            kind: 'junkHeap',
            glintHit: s.glintHit,
          });
          this.grantXp(client, rt, SKILL_BY_NODE.junkHeap, CONFIG.mastery.xpByNode.junkHeap);
          this.depleteNode(s.nodeId, cfg.respawnSeconds);
        }
        break;
      }
      case 'brassSeam': {
        const cfg = CONFIG.gathering.brassSeam;
        if (s.phase === 'digging' && s.elapsed >= s.seconds) {
          const amount = rollBrassSegmentYield(cfg, this.rng);
          s.total += amount;
          this.grantXp(client, rt, SKILL_BY_NODE.brassSeam, CONFIG.mastery.xpByNode.brassSeam);
          this.sendNodeEvent(client, {
            type: 'brassSegment',
            nodeId: s.nodeId,
            segment: s.segment,
            amount,
          });
          if (s.segment >= cfg.maxSegments) {
            this.endBrass(client, rt, s, true);
          } else {
            s.phase = 'fork';
            s.elapsed = 0;
            s.liveSide = pickLiveFork(this.rng);
            this.sendNodeEvent(client, {
              type: 'brassFork',
              nodeId: s.nodeId,
              liveSide: s.liveSide,
              cueSeconds: cfg.forkCueSeconds,
            });
          }
        } else if (s.phase === 'fork' && s.elapsed >= cfg.forkCueSeconds) {
          // The trail went cold.
          this.endBrass(client, rt, s, false);
        }
        break;
      }
      case 'amperite': {
        // Player-paced striking; nothing to advance beyond the clock.
        break;
      }
      case 'glowkoi': {
        const cfg = CONFIG.gathering.glowkoi;
        if (s.phase === 'shadow' && s.elapsed >= cfg.shadowSeconds) {
          rt.session = null;
          this.setGatheringFlag(sessionId, false);
          this.sendNodeEvent(client, { type: 'koiResult', nodeId: s.nodeId, caught: false });
        } else if (s.phase === 'casting' && s.elapsed >= cfg.castSeconds) {
          s.phase = 'tension';
          s.elapsed = 0;
          s.sweetStart = rollSweetZoneStart(cfg, this.rng);
          this.sendNodeEvent(client, {
            type: 'koiTension',
            nodeId: s.nodeId,
            periodSeconds: cfg.tensionPeriodSeconds,
            sweetStart: s.sweetStart,
            sweetLen: cfg.sweetZoneFraction,
          });
        } else if (s.phase === 'tension' && s.elapsed >= cfg.tensionPeriodSeconds * 3) {
          // Held too long; the koi slips the net.
          rt.session = null;
          this.setGatheringFlag(sessionId, false);
          this.sendNodeEvent(client, { type: 'koiResult', nodeId: s.nodeId, caught: false });
        }
        break;
      }
      case 'antenna': {
        const cfg = CONFIG.gathering.antenna;
        const target = targetFrequencyAt(s.elapsed, s.wavePhase, cfg);
        if (Math.abs(s.needle - target) <= cfg.lockTolerance) {
          s.lockSeconds += dt;
        }
        if (s.elapsed >= cfg.tuneSeconds) {
          const lockRatio = Math.min(1, s.lockSeconds / cfg.tuneSeconds);
          const amount = signalYield(cfg, lockRatio);
          const rare = rollSignalRare(cfg, lockRatio, this.rng)
            ? (cfg.rareFindItem as ItemId)
            : null;
          rt.session = null;
          this.setGatheringFlag(sessionId, false);
          this.sendNodeEvent(client, { type: 'tuneResult', nodeId: s.nodeId, lockRatio });
          this.grantLoot(client, rt, s.nodeId, 'signal', amount, rare, {
            kind: 'antenna',
            lockRatio: Number(lockRatio.toFixed(3)),
          });
          this.grantXp(client, rt, SKILL_BY_NODE.antenna, CONFIG.mastery.xpByNode.antenna);
          this.depleteNode(s.nodeId, cfg.respawnSeconds);
        }
        break;
      }
    }
  }

  private endBrass(
    client: Client,
    rt: PlayerRuntime,
    s: Extract<Session, { kind: 'brassSeam' }>,
    completed: boolean,
  ): void {
    const cfg = CONFIG.gathering.brassSeam;
    rt.session = null;
    this.setGatheringFlag(client.sessionId, false);
    this.sendNodeEvent(client, {
      type: 'brassEnd',
      nodeId: s.nodeId,
      total: s.total,
      completed,
    });
    const rare = rollBrassRare(cfg, completed, this.rng) ? (cfg.rareFindItem as ItemId) : null;
    if (s.total > 0 || rare !== null) {
      this.grantLoot(client, rt, s.nodeId, 'brass', s.total, rare, {
        kind: 'brassSeam',
        completed,
      });
    }
    this.depleteNode(s.nodeId, cfg.respawnSeconds);
  }

  /** Cancel/abandon: veins and strikes pay what was worked; the rest fizzle. */
  private settleSession(client: Client, rt: PlayerRuntime, notify: boolean): void {
    const s = rt.session;
    if (s === null) return;
    if (s.kind === 'brassSeam') {
      this.endBrass(client, rt, s, false);
      return;
    }
    if (s.kind === 'amperite' && s.total > 0) {
      rt.session = null;
      this.setGatheringFlag(client.sessionId, false);
      this.grantLoot(client, rt, s.nodeId, 'amperite', s.total, null, {
        kind: 'amperite',
        partial: true,
      });
      this.depleteNode(s.nodeId, CONFIG.gathering.amperite.respawnSeconds);
      return;
    }
    rt.session = null;
    this.setGatheringFlag(client.sessionId, false);
    if (notify) client.send(MSG.gatherStop, { nodeId: s.nodeId });
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private cancelGather(client: Client, rt: PlayerRuntime): void {
    if (rt.session !== null) {
      const nodeId = rt.session.nodeId;
      this.settleSession(client, rt, false);
      client.send(MSG.gatherStop, { nodeId });
    }
  }

  private setGatheringFlag(sessionId: string, gathering: boolean): void {
    const ps = this.state.players.get(sessionId);
    if (ps !== undefined) ps.gathering = gathering;
  }

  private sendNodeEvent(client: Client, payload: NodeEventPayload): void {
    client.send(MSG.nodeEvent, payload);
  }

  private grantXp(client: Client, rt: PlayerRuntime, skill: SkillId, amount: number): void {
    if (amount <= 0) return;
    rt.skills[skill] += amount;
    client.send(MSG.xpGain, { skill, amount });
    client.send(MSG.skills, { xp: rt.skills });
  }

  private grantLoot(
    client: Client,
    rt: PlayerRuntime,
    nodeId: number,
    itemId: ItemId,
    qty: number,
    rare: ItemId | null,
    ledgerData: Record<string, unknown>,
  ): void {
    let added = 0;
    if (qty > 0) {
      const r = addItem(rt.pack, itemId, qty, CONFIG.inventory.stackMax);
      rt.pack = r.inv;
      added = r.added;
    }
    let rareGranted: ItemId | null = null;
    if (rare !== null) {
      const rr = addItem(rt.pack, rare, 1, CONFIG.inventory.stackMax);
      if (rr.added > 0) {
        rt.pack = rr.inv;
        rareGranted = rare;
      }
    }
    // Every faucet writes to the economy ledger (golden rule 9 habit).
    ledger.log({
      type: 'gather',
      account: rt.accountId,
      data: { nodeId, itemId, qty: added, rare: rareGranted, ...ledgerData },
    });
    client.send(MSG.loot, {
      nodeId,
      itemId,
      qty: added,
      rare: rareGranted,
      glintHit: ledgerData.glintHit === true,
    });
    client.send(MSG.inventory, this.inventorySync(rt));
  }

  private depleteNode(nodeId: number, respawnSeconds: number): void {
    const nodeState = this.state.nodes.get(String(nodeId));
    if (nodeState === undefined || nodeState.depleted) return;
    nodeState.depleted = true;
    const timer = setTimeout(() => {
      nodeState.depleted = false;
      this.respawnTimers.delete(nodeId);
    }, respawnSeconds * 1000);
    this.respawnTimers.set(nodeId, timer);
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
      skills: rt.skills,
    });
  }
}
