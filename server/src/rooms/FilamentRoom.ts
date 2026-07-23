import { Client, Room } from 'colyseus';
import { CONFIG, type ToolId } from '@shared/config';
import { rollGather, rollGlintTime } from '@shared/gathering';
import {
  addItem,
  makeInventory,
  makeStarterHotbar,
  removeItem,
  sortInventory,
  transfer,
  type Inventory,
  countItem,
} from '@shared/inventory';
import { ITEMS, type ItemId } from '@shared/items';
import { MANIFEST_BY_ID } from '@shared/manifest';
import { buildDistrictMap, type DistrictId, type WorldMap } from '@shared/map';
import { softFilter } from '@shared/profanity';
import { tramHops, tramToll } from '@shared/travel';
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
  makeSkillXp,
  effectiveSeconds,
  levelForXp,
  SKILL_BY_NODE,
  SKILLS,
  type SkillId,
  type SkillXp,
} from '@shared/mastery';
import { chebyshev, nextMobState, type MobAiState } from '@shared/mobs';
import { advanceMovement, makeMoveState, setPath, type MoveState } from '@shared/movement';
import {
  applyProgress,
  canAccept,
  dailyTurnInsToday,
  isComplete,
  questById,
  questDefs,
  type QuestLog,
} from '@shared/quests';
import { findPath, findPathAdjacent, type PathGrid, type TilePoint } from '@shared/pathfinding';
import {
  decodeAppearance,
  DEFAULT_APPEARANCE_CODE,
  SPARK_NAME_RE,
} from '@shared/appearance';
import { assertFreeSpin, type CoilSpinIntent } from '@shared/coil';
import { type GoalEvent, goalWeekKey } from '@shared/goals';
import {
  COSMETICS,
  decodeEquipped,
  encodeEquipped,
  type EquippedMap,
} from '@shared/cosmetics';
import {
  CHAT_LIMITS,
  MSG,
  type AppearanceIntent,
  type AttackIntent,
  type ChatBroadcast,
  type ChatIntent,
  type IdentityEvent,
  type InspectIntent,
  type InspectInfoEvent,
  type ManifestFoundEvent,
  type ManifestSync,
  type GatherIntent,
  type GlintClickIntent,
  type GoalClaimIntent,
  type BankIntent,
  type LoftpodIntent,
  type LoftpodSync,
  type BankSync,
  type CoilResultEvent,
  type CoilShowEvent,
  type CoilStateEvent,
  type GoalsSync,
  type RestedSync,
  type InventorySync,
  type MoveIntent,
  type MoveStackIntent,
  type NodeActionIntent,
  type NodeEventPayload,
  type PlayerTradeIntent,
  type SelectSlotIntent,
  type CraftIntent,
  type CraftedEvent,
  type SortPackIntent,
  type DonateIntent,
  type QuestIntent,
  type ReclaimIntent,
  type RepairIntent,
  type ShopIntent,
  type ShopSyncEvent,
  type TradeEndEvent,
  type TradeSideView,
  type TravelIntent,
  type TradeIntent,
  type WardrobeIntent,
  type UseItemIntent,
  type BarIntent,
  type IdleIntent,
  type DeliveryIntent,
  type TendIntent,
  type EmoteId,
} from '@shared/protocol';
import { makeRng, type Rng } from '@shared/rng';
import { recipeById, repairQuote, toolSpeedMult, weaponDamageMult } from '@shared/crafting';
import { dailySaleHeadroom, dayKey } from '@shared/economy';
import {
  emptyOffer,
  estimateOfferValue,
  isLopsided,
  itemIsTradeable,
  settleTrade,
  validateOffer,
  type TradeOffer,
} from '@shared/trade';
import { charge, type ChargeMeter } from '../services/charge.js';
import { ledger } from '../services/ledger.js';
import { presence } from '../services/presence.js';
import { merchant } from '../services/merchant.js';
import { moderation } from '../services/moderation.js';
import { shops, type StallView } from '../services/shops.js';
import { verifyToken } from '../services/auth.js';
import { loadBank, nextExpansionCost, saveBank, type BankState } from '../services/bank.js';
import { loftpods, type PodView } from '../services/loftpods.js';
import { coilSpunToday, spinCoil } from '../services/coil.js';
import { bumpGoals, claimGoal, loadGoals, saveGoalTokens } from '../services/goals.js';
import { loadManifest, recordEntry, FULL_MANIFEST_TRIM } from '../services/manifest.js';
import { loadCharacter, persistCharacter, saveIdentity } from '../services/persistence.js';
import {
  CacheState,
  FilamentState,
  LampState,
  MobState,
  NodeState,
  PlayerState,
  StallState,
  LoftpodState,
  BloomState,
} from './state.js';

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

/** Pre-wardrobe characters: everything owned goes on (first id per slot). */
function deriveInitialEquipped(owned: readonly string[]): EquippedMap {
  const eq: EquippedMap = {};
  for (const id of owned) {
    const def = COSMETICS[id];
    if (def !== undefined && eq[def.slot] === undefined) eq[def.slot] = id;
  }
  return eq;
}

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
  bolts: number;
  dailySaleBolts: number;
  dailySaleDate: string;
  /** Direct-trade guardrail counters (E1c), UTC-day rollover. */
  tradeDayDate: string;
  tradeDayValueBolts: number;
  tradeDayCount: number;
  accountCreatedAtMs: number;
  quests: QuestLog;
  cosmetics: string[];
  /** Creator appearance code; '' until the first-login creator confirms. */
  appearance: string;
  /** Worn wardrobe cosmetics by slot (validated against `cosmetics`). */
  equipped: EquippedMap;
  /** Untradeable Manifest titles (S1), earn order. */
  titles: string[];
  /** Weekly-goal regalia tokens toward the seasonal cosmetic (S2). */
  goalTokens: number;
  /** Rested Charge (S3): boosted-gathering ms burned + their UTC day. */
  restedMsUsed: number;
  restedDate: string;
  /** The Ledgerhouse (S5): banked slots, loaded on first hall visit. */
  bank: BankState | null;
  hp: number;
  /** Set when the player pays the tram toll; persisted as the district. */
  pendingDistrict: DistrictId | null;
  /** Fractional regen accumulator (hp stays an int on the wire). */
  healAcc: number;
  lastAttackAtMs: number;
  gatherTargetNode: number | null;
  /** L2: the drink in hand expires at this clock ('' state when null). */
  drinkUntilMs: number | null;
  /** L3: the persistent idle loop ('sit'|'lean'|'warm'), null = none. */
  idlePose: string | null;
  session: Session | null;
  lastChatAtMs: number;
  /** H2 rate limit: timestamps of recent messages in the rolling window. */
  chatWindow: number[];
  /** One cooldown notice per burst — never a notice flood. */
  chatCooldownNoticed: boolean;
  /** H2 mutes: account ids this Spark has silenced (persisted). */
  mutes: Set<string>;
  /** U1a: active parcel destination id (null = hands free). */
  delivery: string | null;
  deliveryDayBolts: number;
  deliveryDayDate: string;
  /** U1b: live tend channel, advanced in tick. */
  tend: { bed: number; elapsed: number; cueAt: number; cueHit: boolean } | null;
  tendDayCount: number;
  tendDayDate: string;
  /** Cue reaction deltas (ms) — behavioral-entropy logging habit (C7). */
  glintReactionsMs: number[];
  /** W7 spectate: a no-wallet visitor. Read-only, non-persistent — every value
   *  codepath refuses it server-side; nothing is ever written to the DB. */
  spectator: boolean;
}

/**
 * One live trade window. The server escrows nothing up front — offers are
 * snapshots; the atomic swap re-validates BOTH sides against live packs and
 * commits in one synchronous step (settleTrade), so no path can dupe.
 */
interface PlayerTradeState {
  id: string;
  /** Requester's sessionId. */
  a: string;
  /** Invited Spark's sessionId. */
  b: string;
  /** False until the invited side accepts (no staging before then). */
  accepted: boolean;
  offers: Record<string, TradeOffer>;
  confirmed: Record<string, boolean>;
  lastActivityMs: number;
}

type MobKind = 'scuttlebot' | 'junkhound' | 'sparkwisp' | 'draymule';

/** Server-side per-mob runtime (never synced). */
interface MobRuntime {
  id: string;
  kind: MobKind;
  home: TilePoint;
  move: MoveState;
  hp: number;
  ai: MobAiState;
  targetSessionId: string | null;
  windupElapsed: number;
  cooldownRemaining: number;
  /** Seconds until the next wander leg while idling. */
  wanderWait: number;
  /** Throttles chase repathing. */
  repathWait: number;
  /** Epoch ms to respawn at; null while alive. */
  respawnAtMs: number | null;
  /** U1c: accountIds that landed a hit (Draymule pays the whole crowd). */
  damagedBy?: Set<string>;
}

/**
 * The Filament — hub district room. One room instance per ~40 Sparks; the
 * server owns movement, gathering (all five resources), inventories, mobs,
 * and node lifecycles. Clients send intents and render results.
 */
export class FilamentRoom extends Room<FilamentState> {
  // H3: 40 measured comfortable on one instance (see PROGRESS load test);
  // env override exists for load testing above the line.
  maxClients = Number(process.env.ROOM_MAX_CLIENTS ?? 40);

  private map!: WorldMap;
  private grid!: PathGrid;
  private rng: Rng = makeRng(Date.now() >>> 0);
  private runtimes = new Map<string, PlayerRuntime>();
  private mobs = new Map<string, MobRuntime>();
  // H3 perf: tick-duration ring + intent counter, flushed to one stats
  // line every 15s ([perf] …) — the load test reads these.
  private perfDur: number[] = [];
  private perfMsgs = 0;
  private lamps = new Map<string, { tile: TilePoint; owner: string; expiresAtMs: number }>();
  private lampSeq = 0;
  protected districtId: DistrictId = 'filament';
  private caches = new Map<
    string,
    {
      tile: TilePoint;
      ownerAccountId: string;
      bolts: number;
      stacks: Array<{ itemId: ItemId; qty: number }>;
      expiresAtMs: number;
    }
  >();
  private cacheSeq = 0;
  private respawnTimers = new Map<number, ReturnType<typeof setTimeout>>();
  /** World map M3: unsubscribe from the cross-district presence bus. */
  private presenceUnsub: (() => void) | null = null;
  private persistTicker = 0;
  private restedNotifyAcc = 0;
  private stallTicker = 0;
  /** Live trade windows, by trade id. */
  private trades = new Map<string, PlayerTradeState>();
  /** sessionId → tradeId for anyone in (or invited to) a trade. */
  private tradeBySession = new Map<string, string>();
  private tradeSeq = 0;
  /** Config timeout, overridable by env for integration probes only. */
  private readonly tradeTimeoutMs =
    Number(process.env.TRADE_TIMEOUT_SECONDS ?? CONFIG.economy.trade.timeoutSeconds) * 1000;

  onCreate(): void {
    this.state = new FilamentState();
    this.map = buildDistrictMap(this.districtId);
    // Level-aware grid (R4): ±1 steps cross only at ramp/stair tiles —
    // platform edges are real geometry for players AND mobs.
    this.grid = {
      size: this.map.size,
      walkable: this.map.walkable,
      elevation: this.map.elevation,
      ramp: this.map.ramp,
    };
    for (const n of this.map.nodes) {
      this.state.nodes.set(String(n.id), new NodeState());
    }
    this.spawnMobs();
    this.scheduleDraymule();

    // World map M3: whenever ANY district's seated count changes, tell our
    // clients — "Sparks there now" on the map stays live citywide.
    this.presenceUnsub = presence.onChange(() => {
      this.broadcast(MSG.cityPresence, { counts: presence.counts() });
    });

    // W7 spectate: value-action handlers run through `guarded`, which refuses a
    // read-only visitor with ONE prompt before any value logic — impossible to
    // forget a handler. move / inspect / chargeInfo stay open (looking is free).
    const guarded = <T>(type: string, handler: (client: Client, msg: T) => void): void => {
      this.onMessage<T>(type, (client, msg) => {
        const rt = this.runtimes.get(client.sessionId);
        if (rt?.spectator === true) {
          this.promptConnect(client);
          return;
        }
        handler(client, msg);
      });
    };

    this.onMessage<MoveIntent>(MSG.move, (client, msg) => this.handleMove(client, msg));
    guarded<GatherIntent>(MSG.gather, (client, msg) => this.handleGather(client, msg));
    guarded<GlintClickIntent>(MSG.glintClick, (client, msg) => this.handleGlintClick(client, msg));
    guarded<NodeActionIntent>(MSG.nodeAction, (client, msg) => this.handleNodeAction(client, msg));
    guarded<SelectSlotIntent>(MSG.selectSlot, (client, msg) => {
      const rt = this.runtimes.get(client.sessionId);
      if (rt === undefined || !Number.isInteger(msg.slot)) return;
      if (msg.slot < 0 || msg.slot >= CONFIG.inventory.hotbarSlots) return;
      rt.activeSlot = msg.slot;
    });
    guarded<MoveStackIntent>(MSG.moveStack, (client, msg) => this.handleMoveStack(client, msg));
    guarded<ChatIntent>(MSG.chat, (client, msg) => this.handleChat(client, msg));
    guarded<AppearanceIntent>(MSG.appearance, (client, msg) => {
      void this.handleAppearance(client, msg);
    });
    guarded<WardrobeIntent>(MSG.wardrobe, (client, msg) => this.handleWardrobe(client, msg));
    this.onMessage<InspectIntent>(MSG.inspect, (client, msg) => this.handleInspect(client, msg));
    guarded<GoalClaimIntent>(MSG.goalClaim, (client, msg) => {
      void this.handleGoalClaim(client, msg);
    });
    guarded<SortPackIntent>(MSG.sortPack, (client, _msg) => {
      // F2: server-authoritative Pack sort — merge stacks (per-item caps),
      // order by category/name; nothing is created or destroyed.
      const rt = this.runtimes.get(client.sessionId);
      if (rt === undefined) return;
      rt.pack = sortInventory(rt.pack);
      client.send(MSG.inventory, this.inventorySync(rt));
      void this.persist(rt);
    });
    guarded<BankIntent>(MSG.bank, (client, msg) => {
      void this.handleBank(client, msg).catch((err) =>
        console.error('[bank] action failed', err),
      );
    });
    guarded<LoftpodIntent>(MSG.loftpod, (client, msg) => {
      void this.handleLoftpod(client, msg).catch((err) =>
        console.error('[loftpod] action failed', err),
      );
    });
    guarded<CoilSpinIntent>(MSG.coilSpin, (client, msg) => {
      void this.handleCoilSpin(client, msg).catch((err) => {
        // The no-currency assert tripping is an anomaly worth remembering.
        const rt = this.runtimes.get(client.sessionId);
        if (rt !== undefined) {
          ledger.log({
            type: 'anomaly',
            account: rt.accountId,
            data: { source: 'fortuneCoil', error: String((err as Error).message) },
          });
        }
      });
    });
    guarded<AttackIntent>(MSG.attack, (client, msg) => this.handleAttack(client, msg));
    guarded(MSG.placeHeatlamp, (client: Client) => this.handlePlaceHeatlamp(client));
    guarded<TradeIntent>(MSG.trade, (client, msg) => this.handleTrade(client, msg));
    guarded<PlayerTradeIntent>(MSG.ptrade, (client, msg) => this.handlePlayerTrade(client, msg));
    guarded<ShopIntent>(MSG.shop, (client, msg) => {
      void this.handleShop(client, msg);
    });
    this.onMessage(MSG.chargeInfo, (client) => {
      void this.replyChargeInfo(client);
    });
    if (this.map.shopStalls.length > 0) void this.loadStalls();
    if (this.districtId === 'terrarium') {
      void loftpods
        .getAll()
        .then((pods) => pods.forEach((pod) => this.refreshLoftpodState(pod)))
        .catch((err) => console.error('[loftpod] boot load failed', err));
    }
    void this.refreshCharge(true);
    guarded<UseItemIntent>(MSG.useItem, (client, msg) => this.handleUseItem(client, msg));
    guarded<BarIntent>(MSG.bar, (client, msg) => this.handleBar(client, msg));
    guarded<IdleIntent>(MSG.idle, (client, msg) => this.handleIdle(client, msg));
    guarded<CraftIntent>(MSG.craft, (client, msg) => this.handleCraft(client, msg));
    guarded<RepairIntent>(MSG.repair, (client, msg) => this.handleRepair(client, msg));
    guarded<QuestIntent>(MSG.quest, (client, msg) => this.handleQuest(client, msg));
    guarded<DonateIntent>(MSG.donate, (client, msg) => this.handleDonate(client, msg));
    guarded<TravelIntent>(MSG.travel, (client, msg) => this.handleTravel(client, msg));
    guarded<DeliveryIntent>(MSG.delivery, (client, msg) => this.handleDelivery(client, msg));
    guarded<TendIntent>(MSG.tend, (client, msg) => this.handleTend(client, msg));
    guarded<ReclaimIntent>(MSG.reclaim, (client, msg) => this.handleReclaim(client, msg));
    void merchant.load();

    this.setSimulationInterval((dt) => {
      const t0 = performance.now();
      this.tick(dt);
      this.perfDur.push(performance.now() - t0);
    }, 50);
    this.clock.setInterval(() => this.logPerf(), 15000);
  }

  async onJoin(client: Client, options: unknown): Promise<void> {
    const opts =
      typeof options === 'object' && options !== null
        ? (options as Record<string, unknown>)
        : {};
    const token = String(opts.token ?? '');
    // W7 spectate: no token + spectate:true → a read-only visitor. A real
    // player MUST present a valid JWT, so a client can never claim non-spectator
    // without one; the spectator flag is set here, server-side, and every value
    // handler refuses it.
    if (token === '' && opts.spectate === true) {
      this.joinSpectator(client);
      return;
    }
    const auth = verifyToken(token); // throws → join rejected
    // One live session per account.
    for (const rt of this.runtimes.values()) {
      if (rt.accountId === auth.accountId) {
        throw new Error('This Spark is already in the city.');
      }
    }
    const character = await loadCharacter(auth.characterId);
    // Joining a district you're not persisted in IS a tram ride: the toll
    // is charged here too, so no client can dodge the sink by joining the
    // room directly. The honest path (handleTravel) persists the new
    // district BEFORE travelGo, so arrivals never pay twice.
    let bolts = character.bolts;
    if (character.district !== this.districtId) {
      const hops = Math.max(1, tramHops(character.district as DistrictId, this.districtId));
      const toll = tramToll(character.district as DistrictId, this.districtId);
      if (bolts < toll) throw new Error(`The tram toll is ${toll} Bolts.`);
      bolts -= toll;
      // PP6 (amended): a free leg (Filament ↔ Stacks) charges nothing → no sink log.
      if (toll > 0) {
        ledger.log({
          type: 'spend',
          account: auth.accountId,
          data: { sink: 'tramToll', bolts: toll, hops, to: this.districtId, via: 'join' },
        });
      }
    }
    const gate: TilePoint = this.gateSpawn(CONFIG.player.spawn);
    const spawn: TilePoint =
      character.district === this.districtId &&
      character.tile !== null &&
      this.map.walkable[character.tile.y]?.[character.tile.x] === true
        ? character.tile
        : gate;

    const runtime: PlayerRuntime = {
      accountId: auth.accountId,
      characterId: auth.characterId,
      sparkName: character.sparkName,
      move: makeMoveState(spawn),
      pack: character.pack ?? makeInventory(CONFIG.inventory.slots),
      hotbar: character.hotbar ?? makeStarterHotbar(),
      activeSlot: 0,
      skills: character.skills,
      bolts,
      dailySaleBolts: character.dailySaleBolts,
      dailySaleDate: character.dailySaleDate,
      tradeDayDate: character.tradeDayDate,
      tradeDayValueBolts: character.tradeDayValueBolts,
      tradeDayCount: character.tradeDayCount,
      accountCreatedAtMs: character.accountCreatedAtMs,
      quests: character.quests as QuestLog,
      cosmetics: character.cosmetics,
      appearance: character.appearance,
      // '' = pre-wardrobe character: auto-equip everything owned (keeps
      // old looks); 'none'/wire = the player's explicit choice.
      equipped:
        character.equipped === ''
          ? deriveInitialEquipped(character.cosmetics)
          : decodeEquipped(
              character.equipped === 'none' ? '' : character.equipped,
              character.cosmetics,
            ),
      titles: character.titles,
      goalTokens: character.goalTokens,
      restedMsUsed: character.restedMsUsed,
      restedDate: character.restedDate,
      bank: null,
      hp: CONFIG.combat.player.maxHp,
      pendingDistrict: null,
      healAcc: 0,
      lastAttackAtMs: 0,
      gatherTargetNode: null,
      session: null,
      drinkUntilMs: null,
      idlePose: null,
      lastChatAtMs: 0,
      chatWindow: [],
      chatCooldownNoticed: false,
      mutes: await moderation.loadMutes(auth.accountId),
      delivery: null,
      deliveryDayBolts: character.deliveryDayBolts,
      deliveryDayDate: character.deliveryDayDate,
      tend: null,
      tendDayCount: character.tendDayCount,
      tendDayDate: character.tendDayDate,
      glintReactionsMs: [],
      spectator: false,
    };
    this.runtimes.set(client.sessionId, runtime);

    const ps = new PlayerState();
    ps.sparkName = character.sparkName;
    ps.tileX = spawn.x;
    ps.tileY = spawn.y;
    ps.hp = runtime.hp;
    ps.maxHp = CONFIG.combat.player.maxHp;
    ps.equipped = encodeEquipped(runtime.equipped);
    ps.trim = runtime.equipped.nameGlow ?? '';
    ps.appearance =
      runtime.appearance !== '' ? runtime.appearance : DEFAULT_APPEARANCE_CODE;
    this.state.players.set(client.sessionId, ps);
    // Identity snapshot: chosen=false pops the first-login creator.
    client.send(MSG.identity, this.identitySnapshot(runtime));
    void this.deliverChargeAwards(client, runtime);

    client.send(MSG.inventory, this.inventorySync(runtime));
    client.send(MSG.skills, { xp: runtime.skills });
    this.sendRested(client, runtime);
    void coilSpunToday(auth.characterId, Date.now()).then((spun) => {
      if (this.runtimes.get(client.sessionId) !== runtime) return;
      client.send(MSG.coilState, {
        spunToday: spun,
        shards: 0, // detail arrives with the first spin; join keeps it light
        shardsTarget: CONFIG.coil.shardsForCosmetic,
      } satisfies CoilStateEvent);
      if (!spun) {
        client.send(MSG.notice, { text: 'The Fortune Coil is wound — one free spin today.' });
      }
    });
    {
      const wk = goalWeekKey(Date.now());
      void loadGoals(auth.accountId, wk).then((rows) => {
        if (this.runtimes.get(client.sessionId) !== runtime) return;
        client.send(MSG.goals, {
          weekKey: wk,
          rows,
          claimsUsed: rows.filter((r) => r.claimed).length,
          tokens: runtime.goalTokens,
        } satisfies GoalsSync);
      });
    }
    void loadManifest(auth.accountId).then((entries) => {
      if (this.runtimes.get(client.sessionId) !== runtime) return;
      client.send(MSG.manifest, {
        entries: entries.map((e) => ({
          entryId: e.entryId,
          count: e.count,
          firstAtMs: e.firstAtMs,
        })),
        titles: [...runtime.titles],
      } satisfies ManifestSync);
    });
    client.send(MSG.prices, { buy: merchant.prices(Date.now()) });
    client.send(MSG.quests, { log: runtime.quests });
    // Stall mail: expired-stall returns + the "sold while you were away"
    // toast (Filament only — the stalls live on this lane).
    if (this.map.shopStalls.length > 0) void this.deliverShopMail(client, runtime);
    this.broadcast(
      MSG.notice,
      { text: `${character.sparkName} stepped off the tram.` },
      { except: client },
    );
    // World map M3: report the new seated count + seed this client's tally.
    this.reportPresence();
    client.send(MSG.cityPresence, { counts: presence.counts() });
  }

  /** Seated (non-spectator) Sparks in this room → the presence registry. */
  private reportPresence(): void {
    let seated = 0;
    for (const rt of this.runtimes.values()) if (!rt.spectator) seated += 1;
    presence.report(this.districtId, seated);
  }

  /**
   * W7 — seat a read-only spectator: a no-wallet visitor with a temporary,
   * NON-PERSISTENT Spark. It can move and see the world + live players, but
   * every value handler refuses it (server-authoritative) and {@link persist}
   * never touches the DB for it. No account is created, nothing is written.
   */
  private joinSpectator(client: Client): void {
    const spawn: TilePoint = this.gateSpawn(CONFIG.player.spawn);
    const runtime: PlayerRuntime = {
      // Synthetic ids so the one-session-per-account check never collides; they
      // are NEVER used as a DB key (persist() bails for spectators).
      accountId: `spectator:${client.sessionId}`,
      characterId: `spectator:${client.sessionId}`,
      sparkName: 'Visitor',
      move: makeMoveState(spawn),
      pack: makeInventory(CONFIG.inventory.slots),
      hotbar: makeStarterHotbar(),
      activeSlot: 0,
      skills: makeSkillXp(),
      bolts: 0,
      dailySaleBolts: 0,
      dailySaleDate: '',
      tradeDayDate: '',
      tradeDayValueBolts: 0,
      tradeDayCount: 0,
      accountCreatedAtMs: 0,
      quests: {} as QuestLog,
      cosmetics: [],
      appearance: '',
      equipped: {},
      titles: [],
      goalTokens: 0,
      restedMsUsed: 0,
      restedDate: '',
      bank: null,
      hp: CONFIG.combat.player.maxHp,
      pendingDistrict: null,
      healAcc: 0,
      lastAttackAtMs: 0,
      gatherTargetNode: null,
      session: null,
      drinkUntilMs: null,
      idlePose: null,
      lastChatAtMs: 0,
      chatWindow: [],
      chatCooldownNoticed: false,
      mutes: new Set(),
      delivery: null,
      deliveryDayBolts: 0,
      deliveryDayDate: '',
      tend: null,
      tendDayCount: 0,
      tendDayDate: '',
      glintReactionsMs: [],
      spectator: true,
    };
    this.runtimes.set(client.sessionId, runtime);

    const ps = new PlayerState();
    ps.sparkName = 'Visitor';
    ps.tileX = spawn.x;
    ps.tileY = spawn.y;
    ps.hp = runtime.hp;
    ps.maxHp = CONFIG.combat.player.maxHp;
    ps.equipped = '';
    ps.trim = '';
    ps.appearance = DEFAULT_APPEARANCE_CODE;
    this.state.players.set(client.sessionId, ps);

    // chosen:true so the client never pops the creator for a visitor.
    client.send(MSG.identity, {
      appearance: DEFAULT_APPEARANCE_CODE,
      sparkName: 'Visitor',
      chosen: true,
      owned: [],
      equipped: '',
    });
    client.send(MSG.inventory, this.inventorySync(runtime));
    client.send(MSG.notice, { text: 'Spectating — connect your wallet to play.' });
  }

  /** The single spectator refusal (W7) — one prompt for any value action. */
  private promptConnect(client: Client): void {
    client.send(MSG.notice, { text: 'Connect your wallet to play.' });
  }

  async onLeave(client: Client): Promise<void> {
    // A vanished trader closes the window; the swap either fully happened
    // before this or not at all (settleTrade commits synchronously).
    this.cancelTradeFor(client.sessionId, 'disconnected', 'The other Spark left mid-trade.');
    const rt = this.runtimes.get(client.sessionId);
    this.runtimes.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.reportPresence();
    if (rt !== undefined) {
      // A spectator leaves no trace: no session to settle, no DB write, no
      // "rode the tram out" (it never rode in).
      if (rt.spectator) return;
      // Partial veins/strikes pay out what was worked.
      this.settleSession(client, rt, false);
      this.broadcast(MSG.notice, { text: `${rt.sparkName} rode the tram out.` });
      await this.persist(rt);
    }
  }

  async onDispose(): Promise<void> {
    this.presenceUnsub?.();
    this.presenceUnsub = null;
    presence.report(this.districtId, 0);
    for (const t of this.respawnTimers.values()) clearTimeout(t);
    await Promise.all([...this.runtimes.values()].map((rt) => this.persist(rt)));
  }

  // ── intents ────────────────────────────────────────────────────────────

  /** H3: one stats line per 15s window — tick percentiles, intent rate,
   *  memory. Grep `[perf]` during load tests; quiet rooms stay quiet. */
  private logPerf(): void {
    if (this.perfDur.length === 0 || this.clients.length === 0) {
      this.perfDur = [];
      this.perfMsgs = 0;
      return;
    }
    const s = [...this.perfDur].sort((a, b) => a - b);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
    const mem = process.memoryUsage();
    console.log(
      `[perf] ${this.districtId} clients=${this.clients.length} ticks=${s.length} ` +
        `tick_p50=${q(0.5).toFixed(1)}ms p95=${q(0.95).toFixed(1)}ms max=${(s[s.length - 1] ?? 0).toFixed(1)}ms ` +
        `intents/s=${(this.perfMsgs / 15).toFixed(1)} rss=${(mem.rss / 1048576).toFixed(0)}MB heap=${(mem.heapUsed / 1048576).toFixed(0)}MB`,
    );
    this.perfDur = [];
    this.perfMsgs = 0;
  }

  private handleMove(client: Client, msg: MoveIntent): void {
    this.perfMsgs += 1;
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || !this.isValidTile(msg)) return;
    if (this.map.walkable[msg.y]?.[msg.x] !== true) return;
    const path = findPath(this.grid, rt.move.tile, { x: msg.x, y: msg.y });
    if (path === null) return;
    this.cancelGather(client, rt);
    rt.gatherTargetNode = null;
    this.clearIdle(client.sessionId, rt);
    rt.move = setPath(rt.move, path);
    this.broadcast(MSG.moveAccepted, { sessionId: client.sessionId, path });
  }

  private handleGather(client: Client, msg: GatherIntent): void {
    this.perfMsgs += 1;
    const rt = this.runtimes.get(client.sessionId);
    const node = this.map.nodes.find((n) => n.id === msg.nodeId);
    const nodeState = this.state.nodes.get(String(msg.nodeId));
    if (rt === undefined || node === undefined || nodeState === undefined) return;
    if (nodeState.depleted) return;
    if (rt.session?.nodeId === msg.nodeId) return;

    // The right tool KIND must be in the ACTIVE hotbar slot (tiers all
    // qualify), and broken gear refuses to work (never lost, though).
    const required = CONFIG.tools.requiredByNode[node.kind] as ToolId;
    const held = rt.hotbar.slots[rt.activeSlot];
    const heldDef = held !== null && held !== undefined ? ITEMS[held.itemId] : undefined;
    if (heldDef === undefined || heldDef.toolKind !== required) {
      client.send(MSG.notice, {
        text: `You need your ${required.charAt(0).toUpperCase()}${required.slice(1)} in hand for that.`,
      });
      return;
    }
    if ((held?.durability ?? 1) <= 0) {
      client.send(MSG.notice, { text: `Your ${heldDef.name} is broken — the Tinkerbench can mend it.` });
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
    // F2 split: an optional qty moves part of the stack (validated in the
    // pure transfer — partial onto a mismatched stack is refused there).
    const qty =
      typeof msg.qty === 'number' && Number.isInteger(msg.qty) && msg.qty > 0
        ? msg.qty
        : undefined;
    const r = transfer(src, msg.fromIdx, msg.from === msg.to ? src : dst, msg.toIdx, qty);
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

  /**
   * Creator confirm (I2): validate the code against the shared tables,
   * allow a name pick ONLY on first login (appearance still unset), persist,
   * then broadcast via PlayerState so every client re-bakes this Spark.
   * Appearance is presentation-only — it never touches gameplay numbers.
   */
  private async handleAppearance(client: Client, msg: AppearanceIntent): Promise<void> {
    const rt = this.runtimes.get(client.sessionId);
    const ps = this.state.players.get(client.sessionId);
    if (rt === undefined || ps === undefined) return;
    const fail = (error: string) => client.send(MSG.identity, this.identitySnapshot(rt, error));

    const code = typeof msg.code === 'string' ? msg.code : '';
    if (decodeAppearance(code) === null) return fail('That look did not scan.');

    let rename: string | undefined;
    const wantName = typeof msg.name === 'string' ? msg.name.trim() : '';
    if (wantName !== '' && wantName !== rt.sparkName) {
      if (rt.appearance !== '') return fail('Names are set when a Spark first steps in.');
      if (!SPARK_NAME_RE.test(wantName)) {
        return fail('Names are 3-16 letters, digits, spaces, - or _.');
      }
      rename = wantName;
    }

    const saved = await saveIdentity(rt.characterId, code, rename);
    if (!saved.ok) return fail(saved.error);
    rt.appearance = code;
    if (rename !== undefined) {
      rt.sparkName = rename;
      ps.sparkName = rename;
    }
    ps.appearance = code;
    client.send(MSG.identity, this.identitySnapshot(rt));
  }

  private identitySnapshot(rt: PlayerRuntime, error?: string): IdentityEvent {
    const base: IdentityEvent = {
      appearance: rt.appearance !== '' ? rt.appearance : DEFAULT_APPEARANCE_CODE,
      sparkName: rt.sparkName,
      chosen: rt.appearance !== '',
      owned: [...rt.cosmetics],
      equipped: encodeEquipped(rt.equipped),
    };
    return error === undefined ? base : { ...base, error };
  }

  /**
   * Tick the Manifest (S1) off a REAL grant path. First discoveries send
   * the moment (toast + chime client-side); page/full completion awards
   * untradeable titles and, for the whole book, the Archivist trim.
   */
  private recordManifest(client: Client, rt: PlayerRuntime, entryId: string): void {
    void recordEntry(rt.accountId, entryId, rt.titles)
      .then((res) => {
        if (res === null || this.runtimes.get(client.sessionId) !== rt) return;
        if (!res.first) return;
        ledger.log({
          type: 'trophy',
          account: rt.accountId,
          data: { manifest: entryId, count: res.count },
        });
        // EBT: a first find pays out Bolts (10–25 by page), its own faucet.
        const find = CONFIG.economy.onboarding.manifestFind;
        const page = MANIFEST_BY_ID[entryId]?.page;
        const findBolts = (page !== undefined ? find.byPage[page] : undefined) ?? find.default;
        rt.bolts += findBolts;
        ledger.log({
          type: 'quest',
          account: rt.accountId,
          data: { source: 'manifestFind', manifest: entryId, bolts: findBolts },
        });
        client.send(MSG.inventory, this.inventorySync(rt));
        client.send(MSG.notice, {
          text: `A first for the Manifest — the city rewards you ${findBolts} Bolts.`,
        });
        client.send(MSG.manifestFound, {
          entryId,
          count: res.count,
          first: true,
          newTitles: res.newTitles,
        } satisfies ManifestFoundEvent);
        this.goalEvent(client, rt.accountId, { kind: 'discover', qty: 1 });
        for (const title of res.newTitles) {
          rt.titles.push(title);
          ledger.log({
            type: 'cosmetic',
            account: rt.accountId,
            data: { title, source: 'manifest completion' },
          });
          client.send(MSG.notice, { text: `The Manifest remembers: you are ${title}.` });
        }
        if (res.fullComplete) this.grantCosmetic(client, rt, FULL_MANIFEST_TRIM, 'the whole Manifest');
        if (res.newTitles.length > 0) void this.persist(rt);
      })
      .catch((err) => console.error('[manifest] record failed', err));
  }

  /**
   * Grant an untradeable cosmetic (I3). The ONLY way cosmetics enter a
   * wardrobe: quest rewards, the junk-heap beanie roll, the Tinkerbench
   * brass-skin recipe, and Charge trims. Ledger-logged, auto-equipped into
   * a free slot, persisted. Never gameplay, never tradeable, never drops.
   */
  private grantCosmetic(client: Client, rt: PlayerRuntime, id: string, source: string): boolean {
    const def = COSMETICS[id];
    if (def === undefined || rt.cosmetics.includes(id)) return false;
    rt.cosmetics.push(id);
    if (rt.equipped[def.slot] === undefined) {
      rt.equipped[def.slot] = id;
      this.applyEquipState(client.sessionId, rt);
    }
    ledger.log({
      type: 'cosmetic',
      account: rt.accountId,
      data: { id, slot: def.slot, source },
    });
    client.send(MSG.notice, { text: `Wardrobe: ${def.label} is yours.` });
    client.send(MSG.identity, this.identitySnapshot(rt));
    this.recordManifest(client, rt, id);
    void this.persist(rt);
    return true;
  }

  private applyEquipState(sessionId: string, rt: PlayerRuntime): void {
    const ps = this.state.players.get(sessionId);
    if (ps === undefined) return;
    ps.equipped = encodeEquipped(rt.equipped);
    ps.trim = rt.equipped.nameGlow ?? '';
  }

  /** Full worn-state set from the wardrobe UI, validated against OWNED. */
  private handleWardrobe(client: Client, msg: WardrobeIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined) return;
    rt.equipped = decodeEquipped(String(msg.equipped ?? ''), rt.cosmetics);
    this.applyEquipState(client.sessionId, rt);
    void this.persist(rt);
  }

  /**
   * Click-to-inspect (I5): presentation-safe facts only — name, look,
   * worn cosmetics, top Mastery lines. Never inventories, never Bolts.
   */
  private handleInspect(client: Client, msg: InspectIntent): void {
    if (typeof msg.sessionId !== 'string') return;
    const target = this.runtimes.get(msg.sessionId);
    if (target === undefined) return;
    const topSkills = SKILLS.map((skill) => ({
      skill,
      level: levelForXp(target.skills[skill]),
    }))
      .filter((s2) => s2.level >= 2)
      .sort((a, b) => b.level - a.level)
      .slice(0, 3);
    client.send(MSG.inspectInfo, {
      sessionId: msg.sessionId,
      sparkName: target.sparkName,
      crew: null,
      title: target.titles.length > 0 ? (target.titles[target.titles.length - 1] as string) : null,
      appearance: target.appearance !== '' ? target.appearance : DEFAULT_APPEARANCE_CODE,
      equipped: encodeEquipped(target.equipped),
      topSkills,
    } satisfies InspectInfoEvent);
  }

  /**
   * Weekly-goal progress (S2): fired ONLY from server-verified actions
   * (the same paths that grant loot, settle trades, credit sales). Fire
   * and forget; partial rows stream to the client for live bars.
   */
  private goalEvent(client: Client | null, accountId: string, ev: GoalEvent): void {
    const wk = goalWeekKey(Date.now());
    void bumpGoals(accountId, wk, ev)
      .then((rows) => {
        if (rows.length === 0 || client === null) return;
        client.send(MSG.goals, { weekKey: wk, rows } satisfies GoalsSync);
      })
      .catch((err) => console.error('[goals] bump failed', err));
  }

  /** Claim: Bolts on any completed goal, any-5 ceiling; 5th claim = token. */
  private async handleGoalClaim(client: Client, msg: GoalClaimIntent): Promise<void> {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || typeof msg.goalId !== 'string') return;
    const wk = goalWeekKey(Date.now());
    const res = await claimGoal(rt.accountId, wk, msg.goalId);
    if (this.runtimes.get(client.sessionId) !== rt) return;
    if (!res.ok) {
      client.send(MSG.notice, { text: res.error ?? 'Not yet.' });
      return;
    }
    rt.bolts += res.bolts ?? 0;
    ledger.log({
      type: 'quest',
      account: rt.accountId,
      data: { source: 'weeklyGoal', goalId: msg.goalId, bolts: res.bolts ?? 0 },
    });
    client.send(MSG.notice, { text: `The board rewards you: ${res.bolts} Bolts.` });
    if (res.tokenAwarded === true) {
      rt.goalTokens += 1;
      await saveGoalTokens(rt.characterId, rt.goalTokens);
      ledger.log({
        type: 'cosmetic',
        account: rt.accountId,
        data: { source: 'weeklyGoal', token: rt.goalTokens },
      });
      client.send(MSG.notice, {
        text: `Regalia token ${Math.min(rt.goalTokens, CONFIG.goals.tokensForSeasonal)}/${CONFIG.goals.tokensForSeasonal} toward the ${COSMETICS[CONFIG.goals.seasonalCosmetic]?.label ?? 'seasonal regalia'}.`,
      });
      if (rt.goalTokens >= CONFIG.goals.tokensForSeasonal) {
        this.grantCosmetic(client, rt, CONFIG.goals.seasonalCosmetic, 'weekly goal regalia');
      }
    }
    const rows = await loadGoals(rt.accountId, wk);
    client.send(MSG.goals, {
      weekKey: wk,
      rows,
      claimsUsed: rows.filter((r) => r.claimed).length,
      tokens: rt.goalTokens,
    } satisfies GoalsSync);
    client.send(MSG.inventory, this.inventorySync(rt));
  }

  /**
   * The Fortune Coil (S4): ONE free spin daily, at the wheel. HARD RULE
   * asserted right here — the intent carries no currency field, this
   * handler never reads or debits Bolts/$AMP/ETH, and no other spin
   * entry point exists. Prizes are all untradeable. (CLAUDE.md rule 6:
   * $AMP never touches the wheel on either side.)
   */
  private async handleCoilSpin(client: Client, msg: CoilSpinIntent): Promise<void> {
    assertFreeSpin(msg); // throws if any payload smuggles a currency key
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0) return;
    const coil = this.map.props.find((p) => p.kind === 'fortunecoil');
    if (coil === undefined) {
      client.send(MSG.notice, { text: 'The Coil lives at the Nightstalls, in the Filament.' });
      return;
    }
    const t = rt.move.tile;
    if (Math.max(Math.abs(t.x - coil.x), Math.abs(t.y - coil.y)) > 3) {
      client.send(MSG.notice, { text: 'Step up to the Coil to give it a spin.' });
      return;
    }
    const owned = rt.cosmetics.includes(CONFIG.coil.cosmetic);
    const res = await spinCoil(
      rt.characterId,
      owned,
      Date.now(),
      Math.floor(this.rng() * 2_147_483_647),
    );
    if (this.runtimes.get(client.sessionId) !== rt) return;
    if (!res.ok) {
      client.send(MSG.notice, { text: res.error });
      return;
    }
    const prize = res.roll.prize;
    // Grant — every branch ledger-logged; nothing here ever debits.
    if (prize.kind === 'bolts') {
      rt.bolts += prize.amount;
    } else if (prize.kind === 'item') {
      const add = addItem(rt.pack, prize.itemId as ItemId, prize.amount);
      rt.pack = add.inv;
      if (prize.itemId === 'gildedScrap' && add.added > 0) {
        this.recordManifest(client, rt, 'gildedScrap');
      }
      if (add.added < prize.amount) {
        client.send(MSG.notice, { text: 'Your Pack is full — part of the prize slipped away.' });
      }
    }
    ledger.log({
      type: 'quest',
      account: rt.accountId,
      data: {
        source: 'fortuneCoil',
        prize: prize.id,
        kind: prize.kind,
        amount: prize.amount,
        converted: res.roll.converted,
        shards: res.shards,
      },
    });
    if (res.cosmeticEarned) {
      this.grantCosmetic(client, rt, CONFIG.coil.cosmetic, 'Coil shards, patiently');
    }
    client.send(MSG.coilResult, {
      index: res.roll.index,
      label: prize.label,
      kind: prize.kind,
      amount: prize.amount,
      ...(prize.itemId !== undefined ? { itemId: prize.itemId } : {}),
      converted: res.roll.converted,
      shards: res.shards,
      shardsTarget: CONFIG.coil.shardsForCosmetic,
    } satisfies CoilResultEvent);
    this.broadcast(
      MSG.coilShow,
      { sessionId: client.sessionId, index: res.roll.index } satisfies CoilShowEvent,
      { except: client },
    );
    client.send(MSG.inventory, this.inventorySync(rt));
    void this.persist(rt);
  }

  /**
   * The Ledgerhouse (S5). Every action re-checks the hall tiles — the
   * bank exists ONLY inside the building. Death never touches banked
   * items: the Scrapcache drop reads rt.pack and nothing in the death
   * path references rt.bank (integration-probed: deposit → die → safe).
   */
  private async handleBank(client: Client, msg: BankIntent): Promise<void> {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0) return;
    const t = rt.move.tile;
    const inside = this.map.bankInterior.some((h) => h.x === t.x && h.y === t.y);
    if (!inside) {
      client.send(MSG.notice, { text: 'The Ledgerhouse keeps its books indoors.' });
      return;
    }
    if (rt.bank === null) rt.bank = await loadBank(rt.characterId);
    if (this.runtimes.get(client.sessionId) !== rt) return;
    const bank = rt.bank;

    if (msg.action === 'deposit' || msg.action === 'withdraw') {
      const slot = Math.floor(Number(msg.slot));
      const qty = Math.max(1, Math.floor(Number(msg.qty)));
      const from = msg.action === 'deposit' ? rt.pack : bank.inv;
      const to = msg.action === 'deposit' ? bank.inv : rt.pack;
      const stack = from.slots[slot];
      if (stack === null || stack === undefined) return;
      const moving = Math.min(qty, stack.qty);
      const add = addItem(to, stack.itemId as ItemId, moving);
      if (add.added <= 0) {
        client.send(MSG.notice, {
          text: msg.action === 'deposit' ? 'The vault shelf is full.' : 'Your Pack is full.',
        });
        return;
      }
      if (msg.action === 'deposit') {
        bank.inv = to === bank.inv ? add.inv : bank.inv;
        rt.pack = removeItem(rt.pack, stack.itemId as ItemId, add.added).inv;
      } else {
        rt.pack = add.inv;
        bank.inv = removeItem(bank.inv, stack.itemId as ItemId, add.added).inv;
      }
      ledger.log({
        type: 'system',
        account: rt.accountId,
        data: { source: 'ledgerhouse', action: msg.action, itemId: stack.itemId, qty: add.added },
      });
      await saveBank(rt.characterId, bank);
    } else if (msg.action === 'expand') {
      const cost = nextExpansionCost(bank.slots);
      if (cost === null) {
        client.send(MSG.notice, { text: 'The vault holds no more shelves.' });
        return;
      }
      if (rt.bolts < cost) {
        client.send(MSG.notice, { text: `The next shelf runs ${cost} Bolts.` });
        return;
      }
      rt.bolts -= cost;
      bank.slots += CONFIG.bank.slotsPerExpansion;
      const grown = makeInventory(bank.slots);
      bank.inv.slots.forEach((sl, i) => {
        grown.slots[i] = sl;
      });
      bank.inv = grown;
      ledger.log({
        type: 'spend',
        account: rt.accountId,
        data: { sink: 'bankSlots', bolts: cost, slots: bank.slots },
      });
      await saveBank(rt.characterId, bank);
      client.send(MSG.inventory, this.inventorySync(rt));
    }
    client.send(MSG.bankSync, {
      slots: bank.inv.slots,
      slotCount: bank.slots,
      nextCost: nextExpansionCost(bank.slots),
    } satisfies BankSync);
    if (msg.action !== 'open') client.send(MSG.inventory, this.inventorySync(rt));
  }

  private handleChat(client: Client, msg: ChatIntent): void {
    this.perfMsgs += 1;
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
    // H2 rate limit: a rolling window on top of the per-message interval.
    const rate = CONFIG.chat.rate;
    const windowStart = now - rate.windowSeconds * 1000;
    rt.chatWindow = rt.chatWindow.filter((t) => t >= windowStart);
    if (rt.chatWindow.length >= rate.maxPerWindow) {
      if (!rt.chatCooldownNoticed) {
        rt.chatCooldownNoticed = true;
        const wait = Math.ceil(((rt.chatWindow[0] ?? now) + rate.windowSeconds * 1000 - now) / 1000);
        client.send(MSG.notice, {
          text: `Easy — the channel needs a breath. Try again in ~${Math.max(1, wait)}s.`,
        });
      }
      return;
    }
    rt.chatWindow.push(now);
    rt.chatCooldownNoticed = false;
    // H2 soft filter: masked, never blocked.
    const out: ChatBroadcast = {
      from: rt.sparkName,
      sessionId: client.sessionId,
      text: softFilter(text),
      ts: now,
    };
    // H2 mutes: delivery skips anyone who silenced this Spark — chat and
    // bubbles both, since bubbles render from this same message.
    for (const c of this.clients) {
      const listener = this.runtimes.get(c.sessionId);
      if (listener !== undefined && listener.mutes.has(rt.accountId)) continue;
      c.send(MSG.chatMsg, out);
    }
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
    } else if (cmd === '/w' || cmd === '/whisper') {
      // U4c: a quiet line to one Spark in this district. Delivered to the
      // two parties only; mutes still silence it; softFilter still applies.
      const rest = text.slice(cmd.length).trim();
      const gap = rest.indexOf(' ');
      const name = (gap > 0 ? rest.slice(0, gap) : rest).toLowerCase();
      const body = gap > 0 ? rest.slice(gap + 1).trim() : '';
      if (name === '' || body === '') {
        client.send(MSG.notice, { text: 'Usage: /w <Spark name> <message>' });
        return;
      }
      let targetSid: string | null = null;
      for (const [sid, other] of this.runtimes) {
        if (sid !== client.sessionId && other.sparkName.toLowerCase() === name) {
          targetSid = sid;
          break;
        }
      }
      const targetRt = targetSid !== null ? this.runtimes.get(targetSid) : undefined;
      if (targetSid === null || targetRt === undefined) {
        client.send(MSG.notice, { text: `No Spark called '${name}' in this district.` });
        return;
      }
      const out: ChatBroadcast = {
        from: rt.sparkName,
        sessionId: client.sessionId,
        text: softFilter(body),
        ts: Date.now(),
        whisperTo: targetRt.sparkName,
      };
      // The echo always lands; the delivery skips a target who muted the
      // sender — silently, so mutes stay invisible.
      client.send(MSG.chatMsg, out);
      if (!targetRt.mutes.has(rt.accountId)) {
        this.clients.find((c) => c.sessionId === targetSid)?.send(MSG.chatMsg, out);
      }
    } else if (cmd === '/wave' || cmd === '/sit' || cmd === '/cheer' || cmd === '/point') {
      // U4b: the social flourishes — broadcast-only, no gameplay effect.
      this.broadcast(MSG.emote, {
        sessionId: client.sessionId,
        from: rt.sparkName,
        emote: cmd.slice(1) as EmoteId,
      });
      // L3: /sit is now a PERSISTENT idle loop, not just the flourish —
      // late joiners see the sitter too (the old broadcast desynced them).
      if (cmd === '/sit') this.handleIdle(client, { pose: 'sit' });
    } else if (cmd === '/lean' || cmd === '/warm') {
      // L3: the other idle loops, command-started anywhere.
      this.handleIdle(client, { pose: cmd.slice(1) as 'lean' | 'warm' });
    } else if (cmd === '/stand') {
      this.handleIdle(client, { pose: '' });
    } else if (cmd === '/trade') {
      const name = text.slice(cmd.length).trim().toLowerCase();
      if (name === '') {
        client.send(MSG.notice, { text: 'Usage: /trade <Spark name>' });
        return;
      }
      let targetSid: string | null = null;
      for (const [sid, other] of this.runtimes) {
        if (sid !== client.sessionId && other.sparkName.toLowerCase() === name) targetSid = sid;
      }
      if (targetSid === null) {
        client.send(MSG.notice, { text: `No Spark called "${name}" here.` });
        return;
      }
      this.requestTrade(client, rt, targetSid);
    } else if (cmd === '/pod') {
      const rest = text.slice(cmd.length).trim();
      const [sub, ...args] = rest.split(/\s+/);
      void (async () => {
        try {
          if (sub === 'upgrade') {
            await this.handleLoftpod(client, { action: 'upgrade' });
          } else if (sub === 'dye') {
            await this.handleLoftpod(client, { action: 'dye', dye: (args[0] ?? '').toLowerCase() });
          } else if (sub === 'trophy') {
            const want = args.join(' ').toLowerCase();
            const title = rt.titles.find((t) => t.toLowerCase() === want) ?? (want === 'off' ? '' : undefined);
            if (title === undefined) {
              client.send(MSG.notice, {
                text: rt.titles.length > 0
                  ? `Your titles: ${rt.titles.join(', ')} (or "/pod trophy off").`
                  : 'No titles earned yet — the Manifest pages award them.',
              });
              return;
            }
            await this.handleLoftpod(client, { action: 'trophy', title });
          } else if (sub === 'banner') {
            const skill = (args[0] ?? '') === 'off' ? '' : (args[0] ?? '').toLowerCase();
            await this.handleLoftpod(client, { action: 'trophy', skill });
          } else {
            const mine = await loftpods.getMine(rt.accountId);
            const taken = new Set<number>();
            for (const [, st] of this.state.loftpods) taken.add(st.berth);
            const free = this.map.loftberths.map((_, i) => i).filter((i) => !taken.has(i));
            const cfg = CONFIG.loftpods;
            client.send(MSG.notice, {
              text:
                mine === null
                  ? `No home yet — click a berth pad to place a Loftpod (${cfg.placeCostBolts} Bolts). Free berths: ${free.join(', ') || 'none'}.`
                  : `Your Loftpod: berth ${mine.berth}, tier ${mine.tier}, ${mine.dye}. ` +
                    `Commands: /pod upgrade · /pod dye <${cfg.dyes.join('|')}> (${cfg.dyeCostBolts}) · ` +
                    `/pod trophy <title|off> · /pod banner <skill|off> · /haul <berth> (${cfg.haulCostBolts}). ` +
                    `Free berths: ${free.join(', ') || 'none'}.`,
            });
            await this.sendLoftpodSync(client, rt);
          }
        } catch (err) {
          console.error('[loftpod] /pod failed', err);
        }
      })();
    } else if (cmd === '/haul') {
      const berth = Number.parseInt(text.slice(cmd.length).trim(), 10);
      if (Number.isNaN(berth)) {
        client.send(MSG.notice, { text: 'Usage: /haul <berth number> — stand by the pad.' });
        return;
      }
      void this.handleLoftpod(client, { action: 'haul', berth }).catch((err) =>
        console.error('[loftpod] haul failed', err),
      );
    } else if (cmd === '/charge') {
      void (async () => {
        try {
          const now = Date.now();
          const m = await charge.meter(now);
          const top = await charge.leaderboard(m.weekKey, CONFIG.charge.topContributors);
          const tierLine =
            m.tier >= m.thresholds.length
              ? 'festival blaze'
              : `tier ${m.tier} — ${m.thresholds[m.tier] ?? 0} Amperite lights tier ${m.tier + 1}`;
          client.send(MSG.notice, {
            text: `Citywide Charge (week of ${m.weekKey}): ${m.total} Amperite · ${tierLine}.`,
          });
          if (charge.xpMultiplier(now) > 1) {
            client.send(MSG.notice, {
              text: `The weekend buff glows: +${m.buffPct}% gather XP citywide.`,
            });
          }
          client.send(MSG.notice, {
            text:
              top.length > 0
                ? `Brightest Sparks: ${top
                    .slice(0, 10)
                    .map((t, i) => `${i + 1}. ${t.sparkName} (${t.amperite})`)
                    .join(' · ')}`
                : 'No donations yet this week — the Dynamo waits.',
          });
        } catch (err) {
          console.error('[charge] /charge failed', err);
        }
      })();
    } else if (cmd === '/mute' || cmd === '/unmute') {
      const name = text.slice(cmd.length).trim();
      if (name === '') {
        client.send(MSG.notice, { text: `Usage: ${cmd} <Spark name>` });
        return;
      }
      if (name.toLowerCase() === rt.sparkName.toLowerCase()) {
        client.send(MSG.notice, { text: 'The one voice you cannot silence.' });
        return;
      }
      void (async () => {
        const target = await moderation.accountByName(name);
        if (target === null) {
          client.send(MSG.notice, { text: `The city doesn't know a Spark named ${name}.` });
          return;
        }
        if (cmd === '/mute') {
          await moderation.mute(rt.accountId, target.id);
          rt.mutes.add(target.id);
          client.send(MSG.notice, {
            text: `You won't hear ${target.name} anymore. /unmute ${target.name} undoes it.`,
          });
        } else {
          await moderation.unmute(rt.accountId, target.id);
          rt.mutes.delete(target.id);
          client.send(MSG.notice, { text: `${target.name} is back in your channel.` });
        }
      })();
    } else if (cmd === '/report') {
      const rest = text.slice(cmd.length).trim();
      const sp = rest.indexOf(' ');
      const name = sp === -1 ? rest : rest.slice(0, sp);
      const reason = sp === -1 ? '' : rest.slice(sp + 1).trim();
      if (name === '' || reason === '') {
        client.send(MSG.notice, { text: 'Usage: /report <Spark name> <reason>' });
        return;
      }
      void (async () => {
        const target = await moderation.accountByName(name);
        if (target === null) {
          client.send(MSG.notice, { text: `The city doesn't know a Spark named ${name}.` });
          return;
        }
        await moderation.report(rt.accountId, target.id, target.name, reason);
        ledger.log({
          type: 'report',
          account: rt.accountId,
          data: { reported: target.id, reportedName: target.name, reason: reason.slice(0, 200) },
        });
        // Quiet confirm — no drama, no broadcast.
        client.send(MSG.notice, { text: 'Noted. The city keeps the record.' });
      })();
    } else if (cmd === '/help') {
      // H1: /help speaks the four intro cards, compressed.
      client.send(MSG.notice, {
        text:
          'The city in four breaths — 1) Click to walk; click a glowing node to work it; watch for the glint. ' +
          '2) Right tool in hand (1–6); Mastery levels as you work; the Tinkerbench crafts and mends. ' +
          '3) Goals G · Manifest M · skills K · map TAB · bank at the Ledgerhouse · the Coil spins free daily. ' +
          `4) The Tangle bites — bank first, travel light. Commands: /near /w <name> <msg> /wave /sit /cheer /point /trade <name> /charge /pod /haul <berth> /mute <name> /unmute <name> /report <name> <reason> /help. H rivets a Heatlamp (${CONFIG.combat.heatlamp.costSalvage} Salvage). The [?] button replays the full intro.`,
      });
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
      // U1b: advance a live tend channel.
      if (rt.tend !== null) {
        rt.tend.elapsed += dt;
        if (rt.tend.elapsed >= CONFIG.tending.seconds) this.finishTend(sessionId, rt);
      }
      // Start a pending gather once settled next to the node.
      if (rt.gatherTargetNode !== null && rt.session === null && rt.move.queue.length === 0) {
        this.beginGather(sessionId, rt);
      }
      // Advance the active session.
      if (rt.session !== null) this.advanceSession(sessionId, rt, dt);
    }

    this.tickMobs(dt);
    this.tickHealing(dt);
    this.tickCaches();
    this.tickTrades();

    // Rested Charge (S3): the daily clock burns ONLY while gathering.
    for (const [sid, rt] of this.runtimes) {
      if (rt.session === null) continue;
      const before = this.restedMsLeft(rt, Date.now());
      if (before <= 0) continue;
      rt.restedMsUsed += dtMs;
      const after = this.restedMsLeft(rt, Date.now());
      this.restedNotifyAcc += 0; // (throttle below)
      if (after <= 0) {
        const c = this.clients.find((cc) => cc.sessionId === sid);
        if (c !== undefined) this.sendRested(c, rt);
      }
    }
    this.restedNotifyAcc += dtMs;
    if (this.restedNotifyAcc >= 20_000) {
      this.restedNotifyAcc = 0;
      for (const [sid, rt] of this.runtimes) {
        if (rt.session === null) continue;
        const c = this.clients.find((cc) => cc.sessionId === sid);
        if (c !== undefined) this.sendRested(c, rt);
      }
    }
    // L2: finished drinks — the glass comes back (visual state only).
    {
      const now = Date.now();
      for (const [sid, rt] of this.runtimes.entries()) {
        if (rt.drinkUntilMs !== null && now >= rt.drinkUntilMs) {
          rt.drinkUntilMs = null;
          const ps = this.state.players.get(sid);
          if (ps !== undefined) ps.drink = '';
        }
      }
    }
    // Periodic persistence (~every 30s of ticks).
    this.persistTicker += dtMs;
    if (this.persistTicker >= 30_000) {
      this.persistTicker = 0;
      for (const rt of this.runtimes.values()) void this.persist(rt);
    }

    // Slow sweep (~every 60s): lapsed stalls vacate even if nobody touches
    // them, and the Charge meter refreshes (+ past weeks finalize).
    this.stallTicker += dtMs;
    if (this.stallTicker >= 60_000) {
      this.stallTicker = 0;
      if (this.map.shopStalls.length > 0) {
        void shops
          .getAll(Date.now())
          .then((views) => {
            for (const v of views) this.refreshStallState(v);
          })
          .catch((err) => console.error('[shops] sweep failed', err));
      }
      void this.refreshCharge(true);
    }
  }

  // ── the Citywide Charge (E3) ────────────────────────────────────────────

  /** Mirror the weekly meter into synced state (lighting reads the tier). */
  private syncChargeMeter(m: ChargeMeter): void {
    const c = this.state.charge;
    c.weekTotal = m.total;
    c.tier = m.tier;
    c.t1 = m.thresholds[0] ?? 0;
    c.t2 = m.thresholds[1] ?? 0;
    c.t3 = m.thresholds[2] ?? 0;
    c.buffActive = charge.xpMultiplier(Date.now()) > 1;
    c.buffPct = m.buffPct;
  }

  /** Refresh the meter (and optionally finalize finished weeks). */
  private async refreshCharge(finalize: boolean): Promise<void> {
    try {
      if (finalize) await charge.finalizePastWeeks(Date.now());
      this.syncChargeMeter(await charge.meter(Date.now()));
    } catch (err) {
      console.error('[charge] refresh failed', err);
    }
  }

  /** The warden's panel / detail view: meter + weekly leaderboard. */
  private async replyChargeInfo(client: Client): Promise<void> {
    try {
      const now = Date.now();
      const m = await charge.meter(now);
      const top = await charge.leaderboard(m.weekKey, CONFIG.charge.topContributors);
      this.syncChargeMeter(m);
      client.send(MSG.chargeSync, {
        weekKey: m.weekKey,
        total: m.total,
        tier: m.tier,
        thresholds: m.thresholds,
        activePlayers: m.activePlayers,
        buffActive: charge.xpMultiplier(now) > 1,
        buffPct: m.buffPct,
        top,
      });
    } catch (err) {
      console.error('[charge] info failed', err);
    }
  }

  /**
   * Top-contributor trims waiting from finalized weeks land on login:
   * the untradeable name-glow trim + a Manifest entry. REGALIA ONLY —
   * never Bolts, never tradeable (load-bearing; see shared/charge.ts).
   */
  private async deliverChargeAwards(client: Client, rt: PlayerRuntime): Promise<void> {
    try {
      const awards = await charge.undeliveredAwards(rt.accountId);
      for (const award of awards) {
        if (this.runtimes.get(client.sessionId) !== rt) return;
        this.grantCosmetic(
          client,
          rt,
          CONFIG.charge.trimCosmetic,
          `Citywide Charge rank ${award.rank}, week ${award.weekKey}`,
        );
        await charge.markDelivered(award.id);
        client.send(MSG.notice, {
          text: `The city remembers: rank ${award.rank} on the week of ${award.weekKey}'s Citywide Charge — your name carries the glow.`,
        });
      }
    } catch (err) {
      console.error('[charge] award delivery failed', err);
    }
  }

  /**
   * Brawling click-melee: one server-validated swing per intent. Range,
   * cooldown, and damage all come from config; XP lands on the kill.
   */
  private handleAttack(client: Client, msg: AttackIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0 || typeof msg.mobId !== 'string') return;
    const m = this.mobs.get(msg.mobId);
    if (m === undefined || m.respawnAtMs !== null) return;
    const cfg = CONFIG.combat.player;
    const now = Date.now();
    if (now - rt.lastAttackAtMs < cfg.attackCooldownSeconds * 1000) return;
    if (chebyshev(rt.move.tile, m.move.tile) > cfg.attackRangeTiles) return;
    rt.lastAttackAtMs = now;

    // Sparkwrench tiers multiply the swing (bare hands still work).
    const heldW = rt.hotbar.slots[rt.activeSlot];
    const wieldingWrench =
      heldW !== null &&
      heldW !== undefined &&
      ITEMS[heldW.itemId].toolKind === 'sparkwrench' &&
      (heldW.durability ?? 1) > 0;
    const dmg = Math.round(
      cfg.attackDamage * (wieldingWrench ? weaponDamageMult(heldW.itemId) : 1),
    );
    if (wieldingWrench) this.wearActiveTool(client, rt);

    if (m.kind === 'draymule') {
      (m.damagedBy ??= new Set()).add(rt.accountId);
    }
    m.hp = Math.max(0, m.hp - dmg);
    const ms = this.state.mobs.get(m.id);
    if (ms !== undefined) ms.hp = m.hp;
    this.broadcast(MSG.combat, {
      type: 'playerHit',
      mobId: m.id,
      bySessionId: client.sessionId,
      damage: dmg,
      hp: m.hp,
    });
    if (m.hp <= 0) this.downMob(m, client, rt);
  }

  /** Mob death: poof, respawn clock, Brawling XP. NO Bolts, NO stack loot. */
  private downMob(m: MobRuntime, client: Client, rt: PlayerRuntime): void {
    m.respawnAtMs = Date.now() + this.mobCfg(m.kind).respawnSeconds * 1000;
    m.ai = 'idle';
    m.targetSessionId = null;
    this.state.mobs.delete(m.id);
    this.broadcast(MSG.combat, {
      type: 'mobDown',
      mobId: m.id,
      bySessionId: client.sessionId,
    });
    this.grantXp(client, rt, 'brawling', this.mobCfg(m.kind).xpBrawlingPerKill);

    this.goalEvent(client, rt.accountId, { kind: 'brawl', qty: 1 });
    // Trophies per kind (server-rolled, ledger-logged). Mobs never print
    // Bolts; the Draymule's cargo is the one design-briefed exception in
    // GOODS (U1c) — rate-limited by its own slow spawn clock.
    const TROPHY: Record<MobKind, ItemId> = {
      scuttlebot: 'dentedCrest',
      junkhound: 'dentedCrest',
      sparkwisp: 'wispFilament',
      draymule: 'drayPlate',
    };
    const trophy = TROPHY[m.kind];
    const grantTrophy = (c: Client, r: PlayerRuntime): void => {
      const rr = addItem(r.pack, trophy, 1);
      if (rr.added <= 0) return;
      r.pack = rr.inv;
      ledger.log({
        type: 'trophy',
        account: r.accountId,
        data: { source: m.kind, itemId: trophy, qty: 1 },
      });
      c.send(MSG.loot, { nodeId: -1, itemId: trophy, qty: 0, rare: trophy, glintHit: false });
      c.send(MSG.inventory, this.inventorySync(r));
      this.recordManifest(c, r, trophy);
    };
    if (m.kind === 'draymule') {
      // U1c: everyone who landed a hit gets the trophy AND the cargo.
      const crowd = m.damagedBy ?? new Set([rt.accountId]);
      const dm = CONFIG.draymule;
      for (const c of this.clients) {
        const r = this.runtimes.get(c.sessionId);
        if (r === undefined || !crowd.has(r.accountId)) continue;
        grantTrophy(c, r);
        const salvage =
          dm.salvageMin + Math.floor(this.rng() * (dm.salvageMax - dm.salvageMin + 1));
        const brass = dm.brassMin + Math.floor(this.rng() * (dm.brassMax - dm.brassMin + 1));
        r.pack = addItem(r.pack, 'salvage', salvage).inv;
        r.pack = addItem(r.pack, 'brass', brass).inv;
        ledger.log({
          type: 'gather',
          account: r.accountId,
          data: { kind: 'draymule', itemId: 'salvage', qty: salvage, brass },
        });
        c.send(MSG.notice, {
          text: `The Draymule's cargo spills: ${salvage} Salvage, ${brass} Brass.`,
        });
        c.send(MSG.inventory, this.inventorySync(r));
        this.goalEvent(c, r.accountId, { kind: 'hunt', qty: 1 });
      }
      this.broadcast(MSG.notice, { text: 'The rogue Draymule folds with a groan of plate.' });
      this.scheduleDraymule();
      return;
    }
    if (this.rng() < this.mobCfg(m.kind).trophyChance) grantTrophy(client, rt);
  }

  /** U1c: the Tangle's slow clock — a rogue Draymule visits, eventually. */
  private scheduleDraymule(): void {
    if (this.districtId !== 'tangle') return;
    const dm = CONFIG.draymule;
    // DRAYMULE_TEST_MINUTES: dev knob so probes don't wait half an hour.
    const minutes =
      process.env.DRAYMULE_TEST_MINUTES !== undefined
        ? Number(process.env.DRAYMULE_TEST_MINUTES)
        : dm.spawnMinutesMin + this.rng() * (dm.spawnMinutesMax - dm.spawnMinutesMin);
    this.clock.setTimeout(() => this.spawnDraymule(), minutes * 60 * 1000);
  }

  private spawnDraymule(): void {
    // One at a time — if the last one still walks, check back later.
    for (const m of this.mobs.values()) {
      if (m.kind === 'draymule' && m.respawnAtMs === null) {
        this.scheduleDraymule();
        return;
      }
    }
    const dm = CONFIG.draymule;
    const seat = this.findMobSeat(dm.homeBox);
    if (seat === null) {
      this.scheduleDraymule();
      return;
    }
    const id = `draymule-${Date.now() % 100000}`;
    const mob: MobRuntime = {
      id,
      kind: 'draymule',
      home: seat,
      move: makeMoveState(seat),
      hp: dm.maxHp,
      ai: 'idle',
      targetSessionId: null,
      windupElapsed: 0,
      cooldownRemaining: 0,
      wanderWait: 1,
      repathWait: 0,
      respawnAtMs: null,
      damagedBy: new Set(),
    };
    this.mobs.set(id, mob);
    const ms = new MobState();
    ms.kind = 'draymule';
    ms.tileX = seat.x;
    ms.tileY = seat.y;
    ms.hp = dm.maxHp;
    ms.maxHp = dm.maxHp;
    this.state.mobs.set(id, ms);
    this.broadcast(MSG.notice, {
      text: 'Heavy plate clatters in the maze — a rogue Draymule is loose in the Tangle.',
    });
  }

  /** First open walkable seat in a box (draymule placement). */
  private findMobSeat(box: { x0: number; y0: number; x1: number; y1: number }): TilePoint | null {
    for (let tries = 0; tries < 60; tries++) {
      const x = box.x0 + Math.floor(this.rng() * (box.x1 - box.x0 + 1));
      const y = box.y0 + Math.floor(this.rng() * (box.y1 - box.y0 + 1));
      if (this.map.walkable[y]?.[x] === true) return { x, y };
    }
    return null;
  }

  /**
   * Rivet a Heatlamp together on the spot: consumes Salvage (a real sink,
   * ledger-logged), places a timed warm pool that mends nearby Sparks.
   */
  private handlePlaceHeatlamp(client: Client): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0) return;
    const cfg = CONFIG.combat.heatlamp;
    const mine = [...this.lamps.values()].filter((l) => l.owner === client.sessionId);
    if (mine.length >= cfg.maxActivePerSpark) {
      client.send(MSG.notice, { text: 'Your Heatlamp is still burning somewhere.' });
      return;
    }
    const tile = rt.move.tile;
    for (const l of this.lamps.values()) {
      if (chebyshev(l.tile, tile) <= cfg.radiusTiles) {
        client.send(MSG.notice, { text: 'There is already warmth here.' });
        return;
      }
    }
    const r = removeItem(rt.pack, 'salvage', cfg.costSalvage);
    if (r.removed < cfg.costSalvage) {
      client.send(MSG.notice, {
        text: `A Heatlamp takes ${cfg.costSalvage} Salvage to rivet together.`,
      });
      return;
    }
    rt.pack = r.inv;
    const id = `lamp-${this.lampSeq++}`;
    this.lamps.set(id, {
      tile: { ...tile },
      owner: client.sessionId,
      expiresAtMs: Date.now() + cfg.durationSeconds * 1000,
    });
    const ls = new LampState();
    ls.tileX = tile.x;
    ls.tileY = tile.y;
    this.state.lamps.set(id, ls);
    // Sinks log to the economy ledger just like faucets (golden rule 9).
    ledger.log({
      type: 'spend',
      account: rt.accountId,
      data: { sink: 'heatlamp', itemId: 'salvage', qty: cfg.costSalvage },
    });
    client.send(MSG.inventory, this.inventorySync(rt));
    client.send(MSG.notice, { text: 'The Heatlamp hums to life.' });
  }

  /** Regen from the Dynamo's warmth and any burning Heatlamp. */
  private tickHealing(dt: number): void {
    const pc = CONFIG.combat.player;
    const lampCfg = CONFIG.combat.heatlamp;
    const now = Date.now();
    for (const [id, lamp] of this.lamps) {
      if (now >= lamp.expiresAtMs) {
        this.lamps.delete(id);
        this.state.lamps.delete(id);
      }
    }
    const plazaCenter = { x: this.map.plaza.cx, y: this.map.plaza.cy };
    for (const [sessionId, rt] of this.runtimes) {
      if (rt.hp <= 0 || rt.hp >= pc.maxHp) continue;
      let rate = 0;
      // Only the Filament has the Dynamo's warmth; the Tangle heals nobody.
      if (
        this.districtId === 'filament' &&
        chebyshev(rt.move.tile, plazaCenter) <= pc.dynamoHealRadiusTiles
      ) {
        rate = pc.dynamoHealPerSecond;
      }
      for (const lamp of this.lamps.values()) {
        if (chebyshev(rt.move.tile, lamp.tile) <= lampCfg.radiusTiles) {
          rate = Math.max(rate, lampCfg.healPerSecond);
        }
      }
      if (rate <= 0) continue;
      rt.healAcc += rate * dt;
      const whole = Math.floor(rt.healAcc);
      if (whole > 0) {
        rt.healAcc -= whole;
        rt.hp = Math.min(pc.maxHp, rt.hp + whole);
        const ps = this.state.players.get(sessionId);
        if (ps !== undefined) ps.hp = rt.hp;
      }
    }
  }

  /**
   * Nightstalls merchant trades. Server checks reach, stock, the published
   * price bands, and the per-account daily NPC-sale cap (the anti-Sybil
   * throttle). Every Bolt movement writes a ledger row.
   */
  private handleTrade(client: Client, msg: TradeIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0) return;
    const stand = this.map.props.find((p) => p.kind === 'merchant');
    if (stand === undefined) return;
    const reach = CONFIG.economy.merchant.tradeRadiusTiles;
    if (chebyshev(rt.move.tile, { x: stand.x, y: stand.y }) > reach) {
      client.send(MSG.notice, { text: 'Step up to the stand to trade.' });
      return;
    }
    const now = Date.now();

    if (msg.action === 'sellResource') {
      const qtyWanted = Math.floor(Number(msg.qty));
      if (!Number.isFinite(qtyWanted) || qtyWanted <= 0) return;
      if (typeof msg.itemId !== 'string' || !merchant.isResource(msg.itemId)) return;
      const resource = msg.itemId;
      // Daily cap headroom (rolls over on a new UTC day).
      const head = dailySaleHeadroom(
        rt.dailySaleBolts,
        rt.dailySaleDate,
        now,
        CONFIG.economy.merchant.dailySaleCapBolts,
      );
      rt.dailySaleDate = head.day;
      rt.dailySaleBolts = head.soldToday;
      if (head.headroom <= 0) {
        client.send(MSG.notice, {
          text: 'The merchant is stocked up on your goods for today — come back tomorrow.',
        });
        return;
      }
      const have = rt.pack.slots.reduce(
        (acc, sl) => (sl !== null && sl.itemId === resource ? acc + sl.qty : acc),
        0,
      );
      const askQty = Math.min(qtyWanted, have);
      if (askQty <= 0) {
        client.send(MSG.notice, { text: 'Nothing of that in your Pack.' });
        return;
      }
      // Dry-run first: trim the sale to the daily headroom, THEN commit —
      // the price pressure must not slide for a refused sale.
      const quote = merchant.quoteWithinCap(resource, askQty, head.headroom, now);
      if (quote.qty <= 0) {
        client.send(MSG.notice, {
          text: 'That would pass your daily stand limit — come back tomorrow.',
        });
        return;
      }
      const qty = quote.qty;
      const r = removeItem(rt.pack, resource, qty);
      if (r.removed < qty) {
        client.send(MSG.notice, { text: 'Nothing of that in your Pack.' });
        return;
      }
      rt.pack = r.inv;
      const paid = merchant.sell(resource, qty, now);
      rt.bolts += paid;
      rt.dailySaleBolts += paid;
      ledger.log({
        type: 'trade',
        account: rt.accountId,
        data: { side: 'npcBuys', itemId: resource, qty, bolts: paid },
      });
      client.send(MSG.inventory, this.inventorySync(rt));
      this.broadcast(MSG.prices, { buy: merchant.prices(now) });
      client.send(MSG.notice, { text: `Sold ${qty} ${resource} for ${paid} Bolts.` });
      this.goalEvent(client, rt.accountId, { kind: 'sellNpc', qty });
      this.questProgress(client, rt, { type: 'sellNpc', qty });
      return;
    }

    if (msg.action === 'buyItem') {
      const ware = CONFIG.economy.merchant.sells.find((w) => w.itemId === msg.itemId);
      if (ware === undefined) return;
      if (rt.bolts < ware.price) {
        client.send(MSG.notice, { text: `That costs ${ware.price} Bolts.` });
        return;
      }
      const add = addItem(rt.pack, ware.itemId as ItemId, 1);
      if (add.added < 1) {
        client.send(MSG.notice, { text: 'Your Pack is full.' });
        return;
      }
      rt.pack = add.inv;
      rt.bolts -= ware.price;
      ledger.log({
        type: 'trade',
        account: rt.accountId,
        data: { side: 'npcSells', itemId: ware.itemId, qty: 1, bolts: -ware.price },
      });
      client.send(MSG.inventory, this.inventorySync(rt));
      client.send(MSG.notice, { text: `Bought 1 ${ware.itemId} for ${ware.price} Bolts.` });
    }
  }

  // ── player↔player direct trade (E1) ─────────────────────────────────────

  /**
   * The trade window flow: request → accept → both stage → both confirm →
   * atomic swap. All value decisions run server-side against live packs;
   * clients only reference their own pack slots.
   */
  private handlePlayerTrade(client: Client, msg: PlayerTradeIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0) return;

    if (msg.action === 'request') {
      if (typeof msg.targetSessionId !== 'string') return;
      this.requestTrade(client, rt, msg.targetSessionId);
      return;
    }

    if (typeof msg.tradeId !== 'string') return;
    const trade = this.trades.get(msg.tradeId);
    if (trade === undefined) return;
    if (trade.a !== client.sessionId && trade.b !== client.sessionId) return;
    trade.lastActivityMs = Date.now();

    switch (msg.action) {
      case 'accept': {
        if (client.sessionId !== trade.b || trade.accepted) return;
        trade.accepted = true;
        this.syncTrade(trade);
        break;
      }
      case 'decline': {
        if (client.sessionId !== trade.b || trade.accepted) return;
        this.endTrade(trade, 'declined', 'The trade was declined.');
        break;
      }
      case 'cancel': {
        this.endTrade(trade, 'cancelled', 'The trade was called off.');
        break;
      }
      case 'stage': {
        if (!trade.accepted) return;
        const offer = this.buildOffer(rt, msg.bolts, msg.items);
        if (offer === null) {
          client.send(MSG.notice, { text: 'That offer does not match your Pack.' });
          return;
        }
        trade.offers[client.sessionId] = offer;
        // Any change to either side un-confirms BOTH — nobody swaps on
        // goods they haven't re-read.
        trade.confirmed[trade.a] = false;
        trade.confirmed[trade.b] = false;
        this.syncTrade(trade);
        break;
      }
      case 'unconfirm': {
        if (!trade.accepted) return;
        trade.confirmed[client.sessionId] = false;
        this.syncTrade(trade);
        break;
      }
      case 'confirm': {
        if (!trade.accepted) return;
        trade.confirmed[client.sessionId] = true;
        if (trade.confirmed[trade.a] === true && trade.confirmed[trade.b] === true) {
          this.executeTrade(trade);
        } else {
          this.syncTrade(trade);
        }
        break;
      }
    }
  }

  /** Roll a Spark's trade-day counters over on a new UTC day. */
  private rollTradeDay(rt: PlayerRuntime, now: number): void {
    const today = dayKey(now);
    if (rt.tradeDayDate !== today) {
      rt.tradeDayDate = today;
      rt.tradeDayValueBolts = 0;
      rt.tradeDayCount = 0;
    }
  }

  /**
   * Young-account + rate guardrails (E1c). Deliberately GENEROUS numbers —
   * the mechanism is what matters: it's the throttle the token layer's
   * anti-RMT posture depends on. Returns a player-facing refusal, or null.
   */
  private tradeGuardProblem(rt: PlayerRuntime, now: number): string | null {
    const cfg = CONFIG.economy.trade;
    const ageHours = (now - rt.accountCreatedAtMs) / 3_600_000;
    if (ageHours < cfg.minAccountAgeHours) {
      return 'Fresh Sparks settle in for a day before trading.';
    }
    this.rollTradeDay(rt, now);
    if (rt.tradeDayCount >= cfg.dailyTradeCountCap) {
      return 'The stalls are closed on you for today — too many trades.';
    }
    return null;
  }

  /** Open a trade window with a nearby Spark (also used by /trade). */
  private requestTrade(client: Client, rt: PlayerRuntime, targetSessionId: string): void {
    const cfg = CONFIG.economy.trade;
    if (targetSessionId === client.sessionId) return;
    const target = this.runtimes.get(targetSessionId);
    const targetClient = this.clients.find((c) => c.sessionId === targetSessionId);
    if (target === undefined || targetClient === undefined || target.hp <= 0) {
      client.send(MSG.notice, { text: 'No such Spark to trade with here.' });
      return;
    }
    const now = Date.now();
    const mine = this.tradeGuardProblem(rt, now);
    if (mine !== null) {
      client.send(MSG.notice, { text: mine });
      return;
    }
    if (this.tradeGuardProblem(target, now) !== null) {
      client.send(MSG.notice, { text: `${target.sparkName} can't trade right now.` });
      return;
    }
    if (this.tradeBySession.has(client.sessionId)) {
      client.send(MSG.notice, { text: 'You already have a trade window open.' });
      return;
    }
    if (this.tradeBySession.has(targetSessionId)) {
      client.send(MSG.notice, { text: `${target.sparkName} is already trading.` });
      return;
    }
    if (chebyshev(rt.move.tile, target.move.tile) > cfg.requestRadiusTiles) {
      client.send(MSG.notice, { text: `Step closer to ${target.sparkName} to trade.` });
      return;
    }
    const trade: PlayerTradeState = {
      id: `trade-${this.tradeSeq++}`,
      a: client.sessionId,
      b: targetSessionId,
      accepted: false,
      offers: { [client.sessionId]: emptyOffer(), [targetSessionId]: emptyOffer() },
      confirmed: { [client.sessionId]: false, [targetSessionId]: false },
      lastActivityMs: Date.now(),
    };
    this.trades.set(trade.id, trade);
    this.tradeBySession.set(client.sessionId, trade.id);
    this.tradeBySession.set(targetSessionId, trade.id);
    targetClient.send(MSG.tradeAsk, {
      tradeId: trade.id,
      fromSessionId: client.sessionId,
      fromName: rt.sparkName,
    });
    client.send(MSG.notice, { text: `Trade offered to ${target.sparkName}…` });
  }

  /**
   * Turn client slot references into a server-snapshotted offer: itemIds,
   * quantities and durabilities all read from the live pack — the client
   * never names an item, only points at its own slots.
   */
  private buildOffer(
    rt: PlayerRuntime,
    bolts: number,
    items: Array<{ slot: number; qty: number }>,
  ): TradeOffer | null {
    if (!Number.isInteger(bolts) || bolts < 0 || !Array.isArray(items)) return null;
    if (items.length > rt.pack.slots.length) return null;
    const offer: TradeOffer = { bolts, items: [] };
    const seen = new Set<number>();
    for (const line of items) {
      if (!Number.isInteger(line.slot) || !Number.isInteger(line.qty) || line.qty <= 0) return null;
      if (seen.has(line.slot)) return null;
      seen.add(line.slot);
      const slot = rt.pack.slots[line.slot];
      if (slot === null || slot === undefined) return null;
      if (!itemIsTradeable(slot.itemId)) return null;
      if (slot.durability !== undefined) {
        offer.items.push({ itemId: slot.itemId, qty: 1, durability: slot.durability });
      } else {
        offer.items.push({ itemId: slot.itemId, qty: Math.min(line.qty, slot.qty) });
      }
    }
    if (validateOffer(rt.pack, rt.bolts, offer) !== null) return null;
    return offer;
  }

  /** Push the full window snapshot to both traders (idempotent render). */
  private syncTrade(trade: PlayerTradeState): void {
    for (const [mine, theirs] of [
      [trade.a, trade.b],
      [trade.b, trade.a],
    ] as const) {
      const c = this.clients.find((cl) => cl.sessionId === mine);
      const partner = this.runtimes.get(theirs);
      if (c === undefined || partner === undefined) continue;
      const view = (sid: string): TradeSideView => ({
        bolts: trade.offers[sid]?.bolts ?? 0,
        items: trade.offers[sid]?.items ?? [],
        confirmed: trade.confirmed[sid] === true,
      });
      c.send(MSG.tradeSync, {
        tradeId: trade.id,
        partnerName: partner.sparkName,
        you: view(mine),
        them: view(theirs),
      });
    }
  }

  /**
   * Both confirmed: run the escrowed atomic swap. settleTrade re-validates
   * both offers against the LIVE packs/balances and computes the result on
   * clones; we commit only a fully-successful swap, synchronously — the
   * abort/timeout/disconnect paths can never leave half a trade applied.
   */
  private executeTrade(trade: PlayerTradeState): void {
    const rtA = this.runtimes.get(trade.a);
    const rtB = this.runtimes.get(trade.b);
    const clientA = this.clients.find((c) => c.sessionId === trade.a);
    const clientB = this.clients.find((c) => c.sessionId === trade.b);
    if (rtA === undefined || rtB === undefined || clientA === undefined || clientB === undefined) {
      this.endTrade(trade, 'disconnected', 'The other Spark is gone.');
      return;
    }
    const offerA = trade.offers[trade.a] ?? emptyOffer();
    const offerB = trade.offers[trade.b] ?? emptyOffer();

    // Guardrails re-check at the moment of truth (E1c). The trade's counted
    // value for BOTH accounts is the larger staged side — that reads mule
    // flows in either direction.
    const now = Date.now();
    const tradeCfg = CONFIG.economy.trade;
    const countedValue = Math.max(estimateOfferValue(offerA), estimateOfferValue(offerB));
    for (const [rt, c] of [
      [rtA, clientA],
      [rtB, clientB],
    ] as const) {
      const hardBlock = this.tradeGuardProblem(rt, now);
      if (hardBlock !== null) {
        clientA.send(MSG.notice, { text: hardBlock });
        clientB.send(MSG.notice, { text: hardBlock });
        this.endTrade(trade, 'failed', 'The trade could not go through.');
        return;
      }
      const ageDays = (now - rt.accountCreatedAtMs) / 86_400_000;
      if (
        ageDays < tradeCfg.youngAccountDays &&
        rt.tradeDayValueBolts + countedValue > tradeCfg.youngDailyValueCapBolts
      ) {
        const text = `${rt.sparkName}'s account is young — today's trade value limit would be passed.`;
        clientA.send(MSG.notice, { text });
        clientB.send(MSG.notice, { text });
        c.send(MSG.notice, {
          text: 'Young accounts trade under a daily value cap for their first week.',
        });
        trade.confirmed[trade.a] = false;
        trade.confirmed[trade.b] = false;
        this.syncTrade(trade);
        return;
      }
    }

    const r = settleTrade(
      rtA.pack,
      rtA.bolts,
      offerA,
      rtB.pack,
      rtB.bolts,
      offerB,
    );
    if (!r.ok) {
      // Nothing moved. Stale offers (pack changed since staging) come back
      // for re-staging; full packs just need shuffling.
      trade.confirmed[trade.a] = false;
      trade.confirmed[trade.b] = false;
      if (r.reason === 'aInvalid' || r.reason === 'bInvalid') {
        const who = r.reason === 'aInvalid' ? trade.a : trade.b;
        trade.offers[who] = emptyOffer();
        const text = 'An offer went stale — stage it again.';
        clientA.send(MSG.notice, { text });
        clientB.send(MSG.notice, { text });
      } else {
        const text =
          r.reason === 'aPackFull'
            ? `${rtA.sparkName}'s Pack can't hold the goods.`
            : `${rtB.sparkName}'s Pack can't hold the goods.`;
        clientA.send(MSG.notice, { text });
        clientB.send(MSG.notice, { text });
      }
      this.syncTrade(trade);
      return;
    }

    rtA.pack = r.packA;
    rtA.bolts = r.boltsA;
    rtB.pack = r.packB;
    rtB.bolts = r.boltsB;

    // Bump the per-day guardrail counters (persisted with the character).
    for (const rt of [rtA, rtB]) {
      this.rollTradeDay(rt, now);
      rt.tradeDayValueBolts += countedValue;
      rt.tradeDayCount += 1;
    }

    // Ledger rows for BOTH sides with the estimated (NPC-band) valuation —
    // this is what trade-anomaly detection reads later (E1b).
    const valueA = estimateOfferValue(offerA);
    const valueB = estimateOfferValue(offerB);
    const row = (giver: PlayerRuntime, taker: PlayerRuntime, gave: TradeOffer, gaveValue: number, gotValue: number) =>
      ledger.log({
        type: 'trade',
        account: giver.accountId,
        data: {
          side: 'playerTrade',
          tradeId: trade.id,
          counterpartyAccount: taker.accountId,
          gaveBolts: gave.bolts,
          gaveItems: gave.items,
          gaveEstValue: gaveValue,
          gotEstValue: gotValue,
        },
      });
    row(rtA, rtB, offerA, valueA, valueB);
    row(rtB, rtA, offerB, valueB, valueA);

    // Lopsided-trade flag (E1d): instrumentation only — never blocks.
    if (isLopsided(valueA, valueB, CONFIG.economy.trade.lopsidedFactor)) {
      ledger.log({
        type: 'anomaly',
        account: valueA > valueB ? rtA.accountId : rtB.accountId,
        data: {
          kind: 'lopsidedTrade',
          tradeId: trade.id,
          accountA: rtA.accountId,
          accountB: rtB.accountId,
          estValueA: valueA,
          estValueB: valueB,
          factor: CONFIG.economy.trade.lopsidedFactor,
        },
      });
    }

    clientA.send(MSG.inventory, this.inventorySync(rtA));
    clientB.send(MSG.inventory, this.inventorySync(rtB));
    this.endTrade(trade, 'completed', 'Trade complete — a fair swap under the string lights.');
  }

  /** Close a trade window for both sides (nothing has moved unless completed). */
  private endTrade(trade: PlayerTradeState, outcome: TradeEndEvent['outcome'], text: string): void {
    this.trades.delete(trade.id);
    this.tradeBySession.delete(trade.a);
    this.tradeBySession.delete(trade.b);
    const payload: TradeEndEvent = { tradeId: trade.id, outcome, text };
    for (const sid of [trade.a, trade.b]) {
      const c = this.clients.find((cl) => cl.sessionId === sid);
      c?.send(MSG.tradeEnd, payload);
    }
  }

  /** Called from tick(): idle trade windows close themselves. */
  private tickTrades(): void {
    if (this.trades.size === 0) return;
    const now = Date.now();
    for (const trade of [...this.trades.values()]) {
      if (now - trade.lastActivityMs > this.tradeTimeoutMs) {
        this.endTrade(trade, 'timeout', 'The trade window gathered dust and closed.');
      }
    }
  }

  /** Cancel whatever trade a departing/downed Spark was in. */
  private cancelTradeFor(sessionId: string, outcome: TradeEndEvent['outcome'], text: string): void {
    const tradeId = this.tradeBySession.get(sessionId);
    if (tradeId === undefined) return;
    const trade = this.trades.get(tradeId);
    if (trade !== undefined) this.endTrade(trade, outcome, text);
  }

  // ── player shop stalls (E2) ─────────────────────────────────────────────

  /** Boot the stall rows + synced shingles (Filament market lane only). */
  private async loadStalls(): Promise<void> {
    try {
      await shops.ensureRows(this.map.shopStalls.length);
      for (const v of await shops.getAll(Date.now())) this.refreshStallState(v);
    } catch (err) {
      console.error('[shops] load failed', err);
    }
  }

  /** Mirror a stall's public face (shingle + counter goods) into state. */
  private refreshStallState(v: StallView): void {
    let st = this.state.stalls.get(String(v.id));
    if (st === undefined) {
      st = new StallState();
      this.state.stalls.set(String(v.id), st);
    }
    st.ownerName = v.ownerName;
    st.goods = v.stock
      .slice(0, 3)
      .map((l) => l.itemId)
      .join(',');
  }

  /** Chebyshev reach to the nearest tile of the stall's footprint. */
  private nearStallSpot(rt: PlayerRuntime, stallId: number): boolean {
    const spot = this.map.shopStalls.find((s) => s.id === stallId);
    if (spot === undefined) return false;
    let best = Number.MAX_SAFE_INTEGER;
    for (let dy = 0; dy < spot.h; dy++) {
      for (let dx = 0; dx < spot.w; dx++) {
        best = Math.min(best, chebyshev(rt.move.tile, { x: spot.x + dx, y: spot.y + dy }));
      }
    }
    return best <= CONFIG.economy.shops.reachTiles;
  }

  private sendShopSync(client: Client, v: StallView, rt: PlayerRuntime): void {
    const mine = v.ownerAccountId === rt.accountId;
    const payload: ShopSyncEvent = {
      stallId: v.id,
      ownerName: v.ownerName,
      mine,
      rentPaidUntilMs: v.rentPaidUntilMs,
      stock: v.stock,
      cashboxBolts: mine ? v.cashboxBolts : 0,
    };
    client.send(MSG.shopSync, payload);
  }

  /** Re-read a stall, refresh its shingle, and answer the asking client. */
  private async replyStall(client: Client, rt: PlayerRuntime, stallId: number): Promise<void> {
    const v = await shops.get(stallId, Date.now());
    this.refreshStallState(v);
    if (this.runtimes.get(client.sessionId) === rt) this.sendShopSync(client, v, rt);
  }

  /**
   * Shop stall intents. The pattern for every value movement: mutate the
   * LIVE runtime synchronously first (deduct Bolts / remove goods), then
   * await the guarded DB step, and refund the runtime if it refused —
   * the single-threaded room makes the synchronous half atomic, and the
   * version guard makes the DB half safe across room instances.
   */
  private async handleShop(client: Client, msg: ShopIntent): Promise<void> {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0) return;
    if (!Number.isInteger(msg.stallId)) return;
    if (!this.nearStallSpot(rt, msg.stallId)) {
      client.send(MSG.notice, { text: 'Step up to the stall first.' });
      return;
    }
    const now = Date.now();
    const notice = (text: string) => client.send(MSG.notice, { text });

    switch (msg.action) {
      case 'browse': {
        await this.replyStall(client, rt, msg.stallId);
        return;
      }

      case 'rent': {
        const rent = CONFIG.economy.shops.rentBoltsPerWeek;
        if (rt.bolts < rent) {
          notice(`A week at this stall costs ${rent} Bolts.`);
          return;
        }
        rt.bolts -= rent;
        const err = await shops.rent(msg.stallId, rt.accountId, rt.sparkName, now);
        if (err !== null) {
          rt.bolts += rent;
          notice(err);
          return;
        }
        // Rent is DESTROYED — a real recurring sink (golden rule 9).
        ledger.log({
          type: 'spend',
          account: rt.accountId,
          data: { sink: 'stallRent', stallId: msg.stallId, bolts: rent },
        });
        client.send(MSG.inventory, this.inventorySync(rt));
        notice('The stall is yours for the week — hang your shingle.');
        await this.replyStall(client, rt, msg.stallId);
        return;
      }

      case 'renew': {
        const rent = CONFIG.economy.shops.rentBoltsPerWeek;
        if (rt.bolts < rent) {
          notice(`Another week costs ${rent} Bolts.`);
          return;
        }
        rt.bolts -= rent;
        const err = await shops.renew(msg.stallId, rt.accountId, now);
        if (err !== null) {
          rt.bolts += rent;
          notice(err);
          return;
        }
        ledger.log({
          type: 'spend',
          account: rt.accountId,
          data: { sink: 'stallRent', stallId: msg.stallId, bolts: rent, renewal: true },
        });
        client.send(MSG.inventory, this.inventorySync(rt));
        notice('Rent paid ahead — the shingle stays up.');
        await this.replyStall(client, rt, msg.stallId);
        return;
      }

      case 'stock': {
        if (!Number.isInteger(msg.slot) || !Number.isInteger(msg.qty) || msg.qty <= 0) return;
        const slot = rt.pack.slots[msg.slot];
        if (slot === null || slot === undefined) {
          notice('Nothing in that Pack slot.');
          return;
        }
        if (!itemIsTradeable(slot.itemId)) {
          notice('Regalia never goes on sale.');
          return;
        }
        // Snapshot + remove from the pack synchronously (escrow starts now).
        const isGear = slot.durability !== undefined;
        const qty = isGear ? 1 : Math.min(msg.qty, slot.qty);
        const line = {
          itemId: slot.itemId,
          qty,
          priceBolts: Math.floor(Number(msg.priceBolts)),
          ...(isGear ? { durability: slot.durability } : {}),
        };
        if (isGear) rt.pack.slots[msg.slot] = null;
        else rt.pack = removeItem(rt.pack, slot.itemId, qty).inv;
        const err = await shops.stock(msg.stallId, rt.accountId, line, now);
        if (err !== null) {
          // Hand it back (the pack can't have filled — we just emptied it).
          if (isGear) {
            const back = rt.pack.slots[msg.slot];
            if (back === null) rt.pack.slots[msg.slot] = { itemId: line.itemId, qty: 1, durability: line.durability };
            else rt.pack = addItem(rt.pack, line.itemId, 1).inv;
          } else {
            rt.pack = addItem(rt.pack, line.itemId, qty).inv;
          }
          notice(err);
          client.send(MSG.inventory, this.inventorySync(rt));
          return;
        }
        // Escrow move, not a sale yet: conservation row for the dashboard.
        ledger.log({
          type: 'trade',
          account: rt.accountId,
          data: { side: 'stallStock', stallId: msg.stallId, itemId: line.itemId, qty: line.qty, priceBolts: line.priceBolts },
        });
        client.send(MSG.inventory, this.inventorySync(rt));
        await this.replyStall(client, rt, msg.stallId);
        return;
      }

      case 'unstock': {
        if (!Number.isInteger(msg.lineIdx) || !Number.isInteger(msg.qty)) return;
        const r = await shops.unstock(msg.stallId, rt.accountId, msg.lineIdx, msg.qty, now);
        if ('error' in r) {
          notice(r.error);
          return;
        }
        if (this.runtimes.get(client.sessionId) !== rt) return;
        const add = addItem(rt.pack, r.taken.itemId, r.taken.qty);
        rt.pack = add.inv;
        if (add.overflow > 0) {
          // Pack filled mid-flight: park the rest in the mailbox, no loss.
          await shops.parkOverflow(
            rt.accountId,
            [{ itemId: r.taken.itemId, qty: add.overflow, ...(r.taken.durability === undefined ? {} : { durability: r.taken.durability }) }],
            'unstockOverflow',
          );
          notice('Your Pack filled up — the rest waits for your next visit.');
        }
        ledger.log({
          type: 'trade',
          account: rt.accountId,
          data: { side: 'stallUnstock', stallId: msg.stallId, itemId: r.taken.itemId, qty: r.taken.qty },
        });
        client.send(MSG.inventory, this.inventorySync(rt));
        await this.replyStall(client, rt, msg.stallId);
        return;
      }

      case 'setPrice': {
        if (!Number.isInteger(msg.lineIdx)) return;
        const err = await shops.setPrice(
          msg.stallId,
          rt.accountId,
          msg.lineIdx,
          Math.floor(Number(msg.priceBolts)),
          now,
        );
        if (err !== null) notice(err);
        await this.replyStall(client, rt, msg.stallId);
        return;
      }

      case 'buy': {
        if (!Number.isInteger(msg.lineIdx) || !Number.isInteger(msg.qty) || msg.qty <= 0) return;
        // Quote from the current stock, take the Bolts synchronously, then
        // let the guarded DB step settle it. Any mismatch refunds in full.
        const before = await shops.get(msg.stallId, now);
        if (this.runtimes.get(client.sessionId) !== rt) return;
        const line = before.stock[msg.lineIdx];
        if (line === undefined) {
          notice('That shelf just emptied.');
          await this.replyStall(client, rt, msg.stallId);
          return;
        }
        const qty = Math.min(msg.qty, line.qty);
        const quoted = line.priceBolts * qty;
        if (rt.bolts < quoted) {
          notice(`That costs ${quoted} Bolts.`);
          return;
        }
        rt.bolts -= quoted;
        const r = await shops.buy(msg.stallId, rt.accountId, msg.lineIdx, qty, now);
        const stillHere = this.runtimes.get(client.sessionId) === rt;
        if ('error' in r || r.gross !== quoted) {
          rt.bolts += quoted;
          if (!('error' in r)) {
            // Price changed under us: undo the sale we just made.
            await shops.stock(msg.stallId, before.ownerAccountId ?? '', r.bought, now);
          }
          if (stillHere) {
            notice('error' in r ? r.error : 'The price just changed — look again.');
            await this.replyStall(client, rt, msg.stallId);
          }
          return;
        }
        const add = addItem(rt.pack, r.bought.itemId, r.bought.qty);
        rt.pack = add.inv;
        if (r.bought.durability !== undefined) {
          // Gear travels with its wear: stamp it onto the slot just added.
          for (let i = rt.pack.slots.length - 1; i >= 0; i--) {
            const s = rt.pack.slots[i];
            if (s !== null && s !== undefined && s.itemId === r.bought.itemId) {
              s.durability = r.bought.durability;
              break;
            }
          }
        }
        if (add.overflow > 0) {
          await shops.parkOverflow(
            rt.accountId,
            [{ itemId: r.bought.itemId, qty: add.overflow, ...(r.bought.durability === undefined ? {} : { durability: r.bought.durability }) }],
            'buyOverflow',
          );
          if (stillHere) notice('Your Pack filled up — the rest waits for your next visit.');
        }
        if (stillHere) {
          client.send(MSG.inventory, this.inventorySync(rt));
          notice(`Bought ${r.bought.qty} ${ITEMS[r.bought.itemId].name} for ${r.gross} Bolts.`);
          await this.replyStall(client, rt, msg.stallId);
        }
        return;
      }

      case 'collect': {
        const r = await shops.collect(msg.stallId, rt.accountId, now);
        if ('error' in r) {
          notice(r.error);
          return;
        }
        if (this.runtimes.get(client.sessionId) !== rt) return;
        rt.bolts += r.bolts;
        // Conservation: cashbox → pocket (the sale rows already ledgered).
        ledger.log({
          type: 'trade',
          account: rt.accountId,
          data: { side: 'shopCollect', stallId: msg.stallId, bolts: r.bolts },
        });
        client.send(MSG.inventory, this.inventorySync(rt));
        notice(`${r.bolts} Bolts from the cashbox, warm from the till.`);
        await this.replyStall(client, rt, msg.stallId);
        return;
      }
    }
  }

  /**
   * Login mail: expired-stall returns + overflow parcels land in the pack,
   * and an owner with away-sales gets the "sold while you were away" toast.
   * Applied to the live runtime BEFORE the mailbox row settles, so a crash
   * can at worst re-deliver — never lose goods.
   */
  private async deliverShopMail(client: Client, rt: PlayerRuntime): Promise<void> {
    try {
      const mail = await shops.returnsFor(rt.accountId);
      for (const parcel of mail) {
        if (this.runtimes.get(client.sessionId) !== rt) return;
        rt.bolts += parcel.bolts;
        const leftover: typeof parcel.stock = [];
        for (const item of parcel.stock) {
          const add = addItem(rt.pack, item.itemId, item.qty);
          rt.pack = add.inv;
          if (item.durability !== undefined && add.added > 0) {
            for (let i = rt.pack.slots.length - 1; i >= 0; i--) {
              const s = rt.pack.slots[i];
              if (s !== null && s !== undefined && s.itemId === item.itemId) {
                s.durability = item.durability;
                break;
              }
            }
          }
          if (add.overflow > 0) {
            leftover.push({ itemId: item.itemId, qty: add.overflow, ...(item.durability === undefined ? {} : { durability: item.durability }) });
          }
        }
        ledger.log({
          type: 'trade',
          account: rt.accountId,
          data: { side: 'stallReturnDelivered', bolts: parcel.bolts, stock: parcel.stock, reason: parcel.reason },
        });
        await shops.settleReturn(parcel.id, leftover);
        client.send(MSG.inventory, this.inventorySync(rt));
        client.send(MSG.notice, {
          text:
            parcel.reason === 'rentExpired'
              ? `Your stall's rent ran out while you were away — the goods${parcel.bolts > 0 ? ' and cashbox' : ''} came back to you.`
              : 'A parcel that could not fit before found its way to your Pack.',
        });
      }
      const own = await shops.ownedBy(rt.accountId, Date.now());
      if (own !== null && own.awaySaleBolts > 0 && this.runtimes.get(client.sessionId) === rt) {
        client.send(MSG.notice, {
          text: `Sold while you were away: ${own.awaySaleBolts} Bolts of goods — collect at your stall.`,
        });
      }
    } catch (err) {
      console.error('[shops] mail delivery failed', err);
    }
  }

  /** Consumables from the Pack (Warmcup now; Cellwax lands with durability). */
  private handleUseItem(client: Client, msg: UseItemIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0 || !Number.isInteger(msg.slot)) return;
    const slot = rt.pack.slots[msg.slot];
    if (slot === null || slot === undefined) return;
    if (slot.itemId === 'warmcup') {
      const maxHp = CONFIG.combat.player.maxHp;
      if (rt.hp >= maxHp) {
        client.send(MSG.notice, { text: 'Already warm through.' });
        return;
      }
      const r = removeItem(rt.pack, 'warmcup', 1);
      if (r.removed < 1) return;
      rt.pack = r.inv;
      rt.hp = Math.min(maxHp, rt.hp + CONFIG.economy.warmcupHeal);
      const ps = this.state.players.get(client.sessionId);
      if (ps !== undefined) ps.hp = rt.hp;
      ledger.log({
        type: 'spend',
        account: rt.accountId,
        data: { sink: 'warmcup', itemId: 'warmcup', qty: 1 },
      });
      client.send(MSG.inventory, this.inventorySync(rt));
      client.send(MSG.notice, { text: 'The Warmcup does its work.' });
      return;
    }
    if (slot.itemId === 'cellwax') {
      const held = rt.hotbar.slots[rt.activeSlot];
      if (held === null || held === undefined || held.durability === undefined) {
        client.send(MSG.notice, { text: 'Hold the gear you want waxed.' });
        return;
      }
      const def = ITEMS[held.itemId];
      const max = CONFIG.gear.maxDurability[def.tier ?? 1] ?? 100;
      if (held.durability >= max) {
        client.send(MSG.notice, { text: `${def.name} is good as built.` });
        return;
      }
      const r = removeItem(rt.pack, 'cellwax', 1);
      if (r.removed < 1) return;
      rt.pack = r.inv;
      held.durability = Math.min(max, held.durability + CONFIG.economy.cellwaxDurability);
      ledger.log({
        type: 'spend',
        account: rt.accountId,
        data: { sink: 'cellwax', itemId: held.itemId, qty: 1 },
      });
      client.send(MSG.inventory, this.inventorySync(rt));
      client.send(MSG.notice, { text: `Cellwax worked into the ${def.name}.` });
    }
  }

  /**
   * THE AMPED BAR (city-life L2). Drinks are Bolts-priced PURE SINKS:
   * poured straight into the hand (ps.drink drives the mug visual), never
   * into the pack, never into stats — golden rule 3 has no bar exception.
   * 'round' pours for every seated-or-standing Spark within reach of the
   * venue and toasts the room; the buyer pays for every glass.
   */
  private handleBar(client: Client, msg: BarIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0) return;
    if (!this.nearProp(rt, 'ampedbar', CONFIG.bar.reachTiles)) {
      client.send(MSG.notice, { text: 'The Amped Bar is south of the stalls.' });
      return;
    }
    const drink = CONFIG.bar.drinks.find((d) => d.id === msg.drinkId);
    if (drink === undefined) return;

    const pour = (target: PlayerRuntime, sid: string): void => {
      target.drinkUntilMs = Date.now() + CONFIG.bar.drinkSeconds * 1000;
      const ps = this.state.players.get(sid);
      if (ps !== undefined) ps.drink = drink.id;
    };

    if (msg.action === 'buy') {
      if (rt.bolts < drink.price) {
        client.send(MSG.notice, { text: `That's ${drink.price} Bolts.` });
        return;
      }
      rt.bolts -= drink.price;
      pour(rt, client.sessionId);
      ledger.log({
        type: 'spend',
        account: rt.accountId,
        data: { sink: 'barDrink', drinkId: drink.id, bolts: drink.price },
      });
      client.send(MSG.inventory, this.inventorySync(rt));
      client.send(MSG.notice, { text: 'Vessa slides it over.' });
      return;
    }

    // 'round' — every non-spectator Spark within reach gets a glass.
    const patrons: Array<{ sid: string; rt: PlayerRuntime }> = [];
    for (const [sid, other] of this.runtimes.entries()) {
      if (other.spectator || other.hp <= 0) continue;
      if (this.nearProp(other, 'ampedbar', CONFIG.bar.reachTiles)) {
        patrons.push({ sid, rt: other });
      }
    }
    const total = drink.price * patrons.length;
    if (patrons.length < 2) {
      client.send(MSG.notice, { text: "It's just you at the bar — buy a glass instead." });
      return;
    }
    if (rt.bolts < total) {
      client.send(MSG.notice, { text: `A round here is ${total} Bolts.` });
      return;
    }
    rt.bolts -= total;
    for (const p of patrons) pour(p.rt, p.sid);
    ledger.log({
      type: 'spend',
      account: rt.accountId,
      data: { sink: 'barRound', drinkId: drink.id, sparks: patrons.length, bolts: total },
    });
    client.send(MSG.inventory, this.inventorySync(rt));
    this.broadcast(MSG.notice, { text: `${rt.sparkName} bought a round.` });
  }

  /**
   * City-life L3: persistent idle loops. Presentation only — the pose
   * replicates through ps.pose (the same wire the working pose uses) so
   * everyone, including late joiners, sees a sitter sitting. Moving or
   * gathering stands you up; the server stays the single pose authority.
   */
  private handleIdle(client: Client, msg: IdleIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0) return;
    if (rt.session !== null) return; // mid-gather: the tool owns the pose
    const pose = msg.pose;
    if (pose !== 'sit' && pose !== 'lean' && pose !== 'warm' && pose !== '') return;
    rt.idlePose = pose === '' ? null : pose;
    const ps = this.state.players.get(client.sessionId);
    if (ps !== undefined) ps.pose = pose;
  }

  /** Stand up out of an idle loop (movement, gathering, logout capture). */
  private clearIdle(sessionId: string, rt: PlayerRuntime): void {
    if (rt.idlePose === null) return;
    rt.idlePose = null;
    const ps = this.state.players.get(sessionId);
    if (ps !== undefined && ps.gathering === false) ps.pose = '';
  }

  /** Decrement the active tool's durability; 0 = broken (kept, unusable). */
  private wearActiveTool(client: Client, rt: PlayerRuntime): void {
    const slot = rt.hotbar.slots[rt.activeSlot];
    if (slot === null || slot === undefined || slot.durability === undefined) return;
    if (slot.durability <= 0) return;
    slot.durability = Math.max(0, slot.durability - CONFIG.gear.durabilityPerUse);
    if (slot.durability === 0) {
      client.send(MSG.notice, {
        text: `${ITEMS[slot.itemId].name} gives out — the Tinkerbench can mend it.`,
      });
    }
    client.send(MSG.inventory, this.inventorySync(rt));
  }

  private nearTinkerbench(rt: PlayerRuntime): boolean {
    const bench = this.map.props.find((p) => p.kind === 'tinkerbench');
    if (bench === undefined) return false;
    return (
      chebyshev(rt.move.tile, { x: bench.x, y: bench.y }) <= CONFIG.gear.benchRadiusTiles
    );
  }

  /** Tinkerbench crafting: Bolts + resources → gear (ledger-logged sink). */
  private handleCraft(client: Client, msg: CraftIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0 || typeof msg.recipeId !== 'string') return;
    if (!this.nearTinkerbench(rt)) {
      client.send(MSG.notice, { text: 'The Tinkerbench is over by the plaza.' });
      return;
    }
    const recipe = recipeById(msg.recipeId);
    if (recipe === undefined) return;
    const cosmeticId = recipe.output.startsWith('cosmetic:')
      ? recipe.output.slice('cosmetic:'.length)
      : null;
    if (cosmeticId !== null && rt.cosmetics.includes(cosmeticId)) {
      client.send(MSG.notice, { text: 'Your wardrobe already has that shine.' });
      return;
    }
    const missingBolts = recipe.bolts - rt.bolts;
    if (missingBolts > 0) {
      client.send(MSG.notice, { text: `That takes ${recipe.bolts} Bolts.` });
      return;
    }
    for (const [mid, qty] of Object.entries(recipe.materials)) {
      const have = rt.pack.slots.reduce(
        (acc, sl) => (sl !== null && sl.itemId === mid ? acc + sl.qty : acc),
        0,
      );
      if (have < qty) {
        client.send(MSG.notice, { text: `Short on ${mid} (${have}/${qty}).` });
        return;
      }
    }
    // Consume, then grant.
    for (const [mid, qty] of Object.entries(recipe.materials)) {
      rt.pack = removeItem(rt.pack, mid as ItemId, qty).inv;
    }
    if (cosmeticId !== null) {
      // Cosmetic recipe (I3): shine only, zero stats, untradeable.
      rt.bolts -= recipe.bolts;
      ledger.log({
        type: 'spend',
        account: rt.accountId,
        data: { sink: 'craft', recipeId: recipe.id, output: recipe.output, bolts: recipe.bolts, materials: recipe.materials },
      });
      this.grantCosmetic(client, rt, cosmeticId, 'crafted at the Tinkerbench');
      this.goalEvent(client, rt.accountId, { kind: 'craft', qty: 1 });
      client.send(MSG.inventory, this.inventorySync(rt));
      return;
    }
    const add = addItem(rt.pack, recipe.output as ItemId, 1);
    if (add.added < 1) {
      // Refund materials if the pack is full — crafts never eat inputs.
      for (const [mid, qty] of Object.entries(recipe.materials)) {
        rt.pack = addItem(rt.pack, mid as ItemId, qty).inv;
      }
      client.send(MSG.notice, { text: 'Your Pack is full.' });
      return;
    }
    rt.pack = add.inv;
    rt.bolts -= recipe.bolts;
    ledger.log({
      type: 'spend',
      account: rt.accountId,
      data: { sink: 'craft', recipeId: recipe.id, output: recipe.output, bolts: recipe.bolts, materials: recipe.materials },
    });
    this.goalEvent(client, rt.accountId, {
      kind: 'craft',
      qty: 1,
      tier: ITEMS[recipe.output as ItemId].tier ?? 1,
    });
    client.send(MSG.inventory, this.inventorySync(rt));
    client.send(MSG.notice, { text: `Crafted: ${ITEMS[recipe.output as ItemId].name}.` });
    // F3: the result-card moment on the client rides this dedicated event.
    client.send(MSG.crafted, { itemId: recipe.output } satisfies CraftedEvent);
    this.questProgress(client, rt, { type: 'craft' });
  }

  /** Tinkerbench repair: Bolts + a material fraction restore durability. */
  private handleRepair(client: Client, msg: RepairIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0 || !Number.isInteger(msg.slot)) return;
    if (msg.source !== 'pack' && msg.source !== 'hotbar') return;
    if (!this.nearTinkerbench(rt)) {
      client.send(MSG.notice, { text: 'The Tinkerbench is over by the plaza.' });
      return;
    }
    const inv = msg.source === 'pack' ? rt.pack : rt.hotbar;
    const slot = inv.slots[msg.slot];
    if (slot === null || slot === undefined || slot.durability === undefined) return;
    const def = ITEMS[slot.itemId];
    const max = CONFIG.gear.maxDurability[def.tier ?? 1] ?? 100;
    const missing = max - slot.durability;
    if (missing <= 0) {
      client.send(MSG.notice, { text: 'Good as built already.' });
      return;
    }
    const quote = repairQuote(slot.itemId, missing);
    if (rt.bolts < quote.bolts) {
      client.send(MSG.notice, { text: `The mend costs ${quote.bolts} Bolts.` });
      return;
    }
    for (const m of quote.materials) {
      const have = rt.pack.slots.reduce(
        (acc, sl) => (sl !== null && sl.itemId === m.itemId ? acc + sl.qty : acc),
        0,
      );
      if (have < m.qty) {
        client.send(MSG.notice, { text: `The mend needs ${m.qty} ${m.itemId}.` });
        return;
      }
    }
    for (const m of quote.materials) {
      rt.pack = removeItem(rt.pack, m.itemId as ItemId, m.qty).inv;
    }
    rt.bolts -= quote.bolts;
    slot.durability = max;
    ledger.log({
      type: 'spend',
      account: rt.accountId,
      data: { sink: 'repair', itemId: slot.itemId, bolts: quote.bolts, materials: quote.materials },
    });
    client.send(MSG.inventory, this.inventorySync(rt));
    client.send(MSG.notice, { text: `${def.name} mended.` });
  }

  private questProgress(
    client: Client,
    rt: PlayerRuntime,
    event: Parameters<typeof applyProgress>[1],
  ): void {
    if (applyProgress(rt.quests, event)) {
      client.send(MSG.quests, { log: rt.quests });
    }
  }

  private nearProp(rt: PlayerRuntime, kind: string, radius: number): boolean {
    const prop = this.map.props.find((p) => p.kind === kind);
    if (prop === undefined) return false;
    // Distance to the prop's BOX, not its origin — a 2×5 tramgate used to
    // refuse Sparks standing at its south face (U7 playthrough finding).
    const t = rt.move.tile;
    const dx = Math.max(prop.x - t.x, 0, t.x - (prop.x + prop.w - 1));
    const dy = Math.max(prop.y - t.y, 0, t.y - (prop.y + prop.h - 1));
    return Math.max(dx, dy) <= radius;
  }

  /** Dispatcher quests: accept + turn in (rewards are Bolts ± a cosmetic). */
  private handleQuest(client: Client, msg: QuestIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || typeof msg.id !== 'string') return;
    if (!this.nearProp(rt, 'dispatcher', CONFIG.quests.npcRadiusTiles)) {
      client.send(MSG.notice, { text: 'The Dispatcher waits by the Tramgate.' });
      return;
    }
    const def = questById(msg.id);
    if (def === undefined) return;
    const now = Date.now();

    if (msg.action === 'accept') {
      if (!canAccept(rt.quests, def, now)) return;
      rt.quests[def.id] = { state: 'active', progress: 0 };
      client.send(MSG.quests, { log: rt.quests });
      client.send(MSG.notice, { text: `Quest accepted: ${def.name}.` });
      return;
    }

    if (msg.action === 'turnIn') {
      const st = rt.quests[def.id];
      if (!isComplete(def, st)) {
        client.send(MSG.notice, { text: 'Not finished yet.' });
        return;
      }
      if (
        def.repeatable === 'daily' &&
        dailyTurnInsToday(rt.quests, now) >= CONFIG.quests.dailyTurnInCap
      ) {
        client.send(MSG.notice, { text: 'The Dispatcher is out of daily work — tomorrow.' });
        return;
      }
      // EBT starter welcome bonus: a Spark's first N one-shot quest turn-ins
      // pay a multiple. Counted over one-shots only (they turn in exactly
      // once, so no double-grant); dailies never carry the bonus.
      const sqb = CONFIG.economy.onboarding.starterQuestBonus;
      const priorStarters = questDefs().filter(
        (d) => d.repeatable === null && rt.quests[d.id]?.state === 'turnedIn',
      ).length;
      const bonusApplies = def.repeatable === null && priorStarters < sqb.count;
      rt.quests[def.id] = {
        state: 'turnedIn',
        progress: def.step.qty,
        day: new Date(now).toISOString().slice(0, 10),
      };
      const base = def.rewards.bolts;
      const bonus = bonusApplies ? base * (sqb.multiplier - 1) : 0;
      rt.bolts += base + bonus;
      ledger.log({
        type: 'quest',
        account: rt.accountId,
        data: { questId: def.id, bolts: base, cosmetic: def.rewards.cosmetic ?? null },
      });
      if (bonus > 0) {
        ledger.log({
          type: 'quest',
          account: rt.accountId,
          data: { source: 'starterBonus', questId: def.id, bolts: bonus },
        });
      }
      if (def.rewards.cosmetic !== undefined) {
        this.grantCosmetic(client, rt, def.rewards.cosmetic, `quest: ${def.name}`);
      }
      client.send(MSG.quests, { log: rt.quests });
      client.send(MSG.inventory, this.inventorySync(rt));
      client.send(MSG.notice, {
        text:
          bonus > 0
            ? `Quest complete: ${def.name} — reward ${base + bonus} Bolts (welcome bonus).`
            : `Quest complete: ${def.name} — reward ${base} Bolts.`,
      });
      return;
    }
  }

  /** Donations at the Charge Warden — Amperite feeds the Citywide Charge. */
  private handleDonate(client: Client, msg: DonateIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || typeof msg.itemId !== 'string') return;
    const qty = Math.floor(Number(msg.qty));
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (!this.nearProp(rt, 'warden', CONFIG.quests.npcRadiusTiles)) {
      client.send(MSG.notice, { text: 'The Charge Warden stands by the Dynamo.' });
      return;
    }
    const r = removeItem(rt.pack, msg.itemId as ItemId, qty);
    if (r.removed < qty) {
      client.send(MSG.notice, { text: 'Not enough of that in your Pack.' });
      return;
    }
    rt.pack = r.inv;
    ledger.log({
      type: 'quest',
      account: rt.accountId,
      data: { sink: 'donation', itemId: msg.itemId, qty },
    });
    client.send(MSG.inventory, this.inventorySync(rt));
    this.goalEvent(client, rt.accountId, { kind: 'donate', qty });
    this.questProgress(client, rt, { type: 'donate', itemId: msg.itemId, qty });
    if (msg.itemId === 'amperite') {
      // The communal loop: the donation climbs the week's meter (rewards
      // are regalia only — no Bolts, nothing tradeable; shared/charge.ts).
      void charge
        .donate(rt.accountId, rt.sparkName, qty, Date.now())
        .then((m) => {
          this.syncChargeMeter(m);
          const next = m.thresholds.find((t) => m.total < t);
          client.send(MSG.notice, {
            text:
              `The Dynamo drinks in ${qty} Amperite — the Citywide Charge stands at ${m.total}` +
              (next !== undefined ? `/${next} toward tier ${m.tier + 1}.` : ` — festival blaze!`),
          });
        })
        .catch((err) => console.error('[charge] donate failed', err));
    } else {
      client.send(MSG.notice, { text: `The Warden logs your ${qty} ${msg.itemId} for the city.` });
    }
  }

  /** U1a parcel runs: take at the dispatch post, drop at the landing. */
  private handleDelivery(client: Client, msg: DeliveryIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0 || this.districtId !== 'stacks') return;
    const cfg = CONFIG.deliveries;
    const dests = cfg.destinations;
    if (msg.action === 'take') {
      if (!this.nearProp(rt, 'dispatchpost', 3)) {
        client.send(MSG.notice, { text: 'Parcels are posted at the dispatch post.' });
        return;
      }
      if (rt.delivery !== null) {
        const d = dests.find((dd) => dd.id === rt.delivery);
        client.send(MSG.notice, {
          text: `Hands full — ${d?.tower ?? 'a tower'} is still waiting on you.`,
        });
        return;
      }
      const d = dests[Math.floor(this.rng() * dests.length)];
      if (d === undefined) return;
      rt.delivery = d.id;
      client.send(MSG.deliverySync, {
        active: true,
        destId: d.id,
        tower: d.tower,
        recipient: d.recipient,
        line: d.line,
        landing: d.landing,
      });
      client.send(MSG.notice, {
        text: `Parcel for ${d.recipient} — ${d.tower}. ${d.line}`,
      });
      return;
    }
    // drop
    if (rt.delivery === null) return;
    const d = dests.find((dd) => dd.id === rt.delivery);
    if (d === undefined) {
      rt.delivery = null;
      return;
    }
    const me = rt.move.tile;
    const level = this.map.elevation[me.y]?.[me.x] ?? 0;
    if (chebyshev(me, d.landing) > 1 || level !== d.level) {
      client.send(MSG.notice, { text: `${d.tower}'s landing is marked — get to it.` });
      return;
    }
    rt.delivery = null;
    // Daily cap: the parity purse never prints past it.
    const today = new Date().toISOString().slice(0, 10);
    if (rt.deliveryDayDate !== today) {
      rt.deliveryDayDate = today;
      rt.deliveryDayBolts = 0;
    }
    const room = Math.max(0, cfg.dailyCapBolts - rt.deliveryDayBolts);
    const paid = Math.min(cfg.rewardBolts, room);
    if (paid > 0) {
      rt.bolts += paid;
      rt.deliveryDayBolts += paid;
      ledger.log({
        type: 'quest',
        account: rt.accountId,
        data: { questId: 'delivery', bolts: paid, dest: d.id },
      });
    }
    // The occasional tip: a Manifest keepsake, never currency.
    let tipped = false;
    if (this.rng() < cfg.rareTipChance) {
      const rr = addItem(rt.pack, 'waxChit', 1);
      if (rr.added > 0) {
        rt.pack = rr.inv;
        tipped = true;
        ledger.log({
          type: 'trophy',
          account: rt.accountId,
          data: { source: 'delivery', itemId: 'waxChit', qty: 1 },
        });
        this.recordManifest(client, rt, 'waxChit');
      }
    }
    client.send(MSG.deliverySync, { active: false });
    client.send(MSG.inventory, this.inventorySync(rt));
    client.send(MSG.notice, {
      text:
        paid > 0
          ? `${d.recipient} signs for it. +${paid} Bolts${tipped ? ' — and a wax-sealed something.' : '.'}`
          : `${d.recipient} signs for it. The day's purse is flat — the thanks are real though.`,
    });
    this.goalEvent(client, rt.accountId, { kind: 'deliver', qty: 1 });
  }

  /** U1b: the channel ran its course — bloom for everyone, roll the herb. */
  private finishTend(sessionId: string, rt: PlayerRuntime): void {
    const t = rt.tend;
    rt.tend = null;
    if (t === null) return;
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (client === undefined) return;
    const cfg = CONFIG.tending;
    const bloom = new BloomState();
    bloom.untilMs = Date.now() + cfg.bloomSeconds * 1000;
    this.state.blooms.set(String(t.bed), bloom);
    this.clock.setTimeout(
      () => this.state.blooms.delete(String(t.bed)),
      cfg.bloomSeconds * 1000,
    );
    rt.tendDayCount += 1;
    const chance = t.cueHit ? cfg.rareChanceGood : cfg.rareChancePlain;
    let rare: ItemId | null = null;
    if (this.rng() < chance) {
      const pool = CONFIG.terrarium.rares;
      rare = pool[Math.floor(this.rng() * pool.length)] as ItemId;
      const rr = addItem(rt.pack, rare, 1);
      if (rr.added > 0) {
        rt.pack = rr.inv;
        this.recordManifest(client, rt, rare);
        client.send(MSG.loot, { nodeId: -1, itemId: rare, qty: 0, rare, glintHit: t.cueHit });
        client.send(MSG.inventory, this.inventorySync(rt));
      } else {
        rare = null;
      }
    }
    ledger.log({
      type: 'gather',
      account: rt.accountId,
      data: { kind: 'tend', bed: t.bed, clean: t.cueHit, rare },
    });
    client.send(MSG.notice, {
      text: t.cueHit
        ? rare !== null
          ? 'The planter drinks deep — and gives something back.'
          : 'The planter drinks deep. It will bloom for hours.'
        : rare !== null
          ? 'Tended. Something glints under the leaves.'
          : 'Tended. The beds remember their friends.',
    });
    this.goalEvent(client, rt.accountId, { kind: 'tend', qty: 1 });
  }

  /** U1b tending: a short channel with one bloom cue; clean hits bloom
   *  brighter odds. Tends grant RARE ROLLS only — never resource volume. */
  private handleTend(client: Client, msg: TendIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0 || this.districtId !== 'terrarium') return;
    const cfg = CONFIG.tending;
    if (msg.action === 'cue') {
      const t = rt.tend;
      if (t === null || t.cueHit) return;
      if (Math.abs(t.elapsed - t.cueAt) * 1000 <= cfg.cueWindowMs) t.cueHit = true;
      return;
    }
    // start
    if (rt.tend !== null) return;
    const beds = this.map.props.filter((p) => p.kind === 'gardenbed');
    const bed = typeof msg.bed === 'number' ? beds[msg.bed] : undefined;
    if (bed === undefined) return;
    const me = rt.move.tile;
    if (chebyshev(me, { x: bed.x, y: bed.y }) > 3) {
      client.send(MSG.notice, { text: 'Step up to the planter first.' });
      return;
    }
    if (this.state.blooms.get(String(msg.bed)) !== undefined) {
      client.send(MSG.notice, { text: 'That planter is already blooming. Pick a thirsty one.' });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (rt.tendDayDate !== today) {
      rt.tendDayDate = today;
      rt.tendDayCount = 0;
    }
    if (rt.tendDayCount >= cfg.dailyCapTends) {
      client.send(MSG.notice, { text: 'The gardens have had all the care they need from you today.' });
      return;
    }
    const cueAt = cfg.cueEarliest + this.rng() * (cfg.cueLatest - cfg.cueEarliest);
    rt.tend = { bed: msg.bed as number, elapsed: 0, cueAt, cueHit: false };
    client.send(MSG.tendState, {
      bed: msg.bed,
      seconds: cfg.seconds,
      cueInMs: Math.round(cueAt * 1000),
    });
  }

  /** Tram travel between districts: a Bolts toll per hop, then a room hop. */
  private async handleTravel(client: Client, msg: TravelIntent): Promise<void> {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0) return;
    // Hop count doubles as validation: 0 = same stop or not on the line.
    const hops = tramHops(this.districtId, msg.to);
    if (hops === 0) return;
    if (!this.nearProp(rt, 'tramgate', CONFIG.travel.gateRadiusTiles)) {
      client.send(MSG.notice, { text: 'The tram leaves from the gate.' });
      return;
    }
    const toll = tramToll(this.districtId, msg.to);
    if (rt.bolts < toll) {
      client.send(MSG.notice, { text: `The tram toll is ${toll} Bolts.` });
      return;
    }
    rt.bolts -= toll;
    rt.pendingDistrict = msg.to;
    // PP6 (amended): a free leg (Filament ↔ Stacks) charges nothing → no sink log.
    if (toll > 0) {
      ledger.log({
        type: 'spend',
        account: rt.accountId,
        data: { sink: 'tramToll', bolts: toll, hops, to: msg.to },
      });
    }
    this.goalEvent(client, rt.accountId, { kind: 'travel', qty: 1, district: msg.to });
    client.send(MSG.inventory, this.inventorySync(rt));
    // Commit the new district BEFORE the go-ahead: the arrival room's join
    // must see it (it charges the toll itself on any district mismatch).
    await this.persist(rt);
    client.send(MSG.travelGo, { to: msg.to });
  }

  /**
   * Tangle death: carried resources + Bolts drop into a Scrapcache the
   * owner can reclaim within the window for a small fee. Equipped gear
   * (the hotbar) NEVER drops; nothing but the five resources leaves the
   * Pack. Filament death stays free (handled by the caller).
   */
  private dropScrapcache(
    rt: PlayerRuntime,
    tile: TilePoint,
  ): { bolts: number; stacks: number } {
    const RESOURCES: ItemId[] = ['salvage', 'brass', 'amperite', 'glowkoi', 'signal'];
    const stacks: Array<{ itemId: ItemId; qty: number }> = [];
    for (const res of RESOURCES) {
      const have = rt.pack.slots.reduce(
        (acc, sl) => (sl !== null && sl.itemId === res ? acc + sl.qty : acc),
        0,
      );
      if (have > 0) {
        stacks.push({ itemId: res, qty: have });
        rt.pack = removeItem(rt.pack, res, have).inv;
      }
    }
    const bolts = rt.bolts;
    rt.bolts = 0;
    if (stacks.length === 0 && bolts <= 0) return { bolts: 0, stacks: 0 };
    const id = `cache-${this.cacheSeq++}`;
    this.caches.set(id, {
      tile: { ...tile },
      ownerAccountId: rt.accountId,
      bolts,
      stacks,
      expiresAtMs: Date.now() + CONFIG.tangle.scrapcache.windowSeconds * 1000,
    });
    const cs = new CacheState();
    cs.tileX = tile.x;
    cs.tileY = tile.y;
    this.state.caches.set(id, cs);
    ledger.log({
      type: 'trade',
      account: rt.accountId,
      data: { side: 'scrapcacheDrop', cacheId: id, bolts, stacks },
    });
    return { bolts, stacks: stacks.length };
  }

  /** Owner reclaims a Scrapcache for the config fee (from its Bolts). */
  private handleReclaim(client: Client, msg: ReclaimIntent): void {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0 || typeof msg.cacheId !== 'string') return;
    const cache = this.caches.get(msg.cacheId);
    if (cache === undefined) return;
    if (cache.ownerAccountId !== rt.accountId) {
      client.send(MSG.notice, { text: 'That Scrapcache is not yours to open.' });
      return;
    }
    if (chebyshev(rt.move.tile, cache.tile) > 2) {
      client.send(MSG.notice, { text: 'Step up to your Scrapcache.' });
      return;
    }
    const fee = Math.min(CONFIG.tangle.scrapcache.reclaimFeeBolts, cache.bolts);
    rt.bolts += cache.bolts - fee;
    for (const stack of cache.stacks) {
      rt.pack = addItem(rt.pack, stack.itemId, stack.qty).inv;
    }
    this.caches.delete(msg.cacheId);
    this.state.caches.delete(msg.cacheId);
    ledger.log({
      type: 'trade',
      account: rt.accountId,
      data: {
        side: 'scrapcacheReclaim',
        cacheId: msg.cacheId,
        boltsReturned: cache.bolts - fee,
        feeBolts: fee,
        stacks: cache.stacks,
      },
    });
    client.send(MSG.inventory, this.inventorySync(rt));
    client.send(MSG.notice, {
      text: `Scrapcache reclaimed (${fee} Bolts handling fee).`,
    });
  }

  /** Expire abandoned Scrapcaches (their contents sink for good). */
  private tickCaches(): void {
    const now = Date.now();
    for (const [id, cache] of this.caches) {
      if (now < cache.expiresAtMs) continue;
      this.caches.delete(id);
      this.state.caches.delete(id);
      ledger.log({
        type: 'spend',
        account: cache.ownerAccountId,
        data: { sink: 'scrapcacheExpired', cacheId: id, bolts: cache.bolts, stacks: cache.stacks },
      });
    }
  }

  // ── mobs ────────────────────────────────────────────────────────────────

  /** Per-kind mob tuning (junkhounds share the scuttlebot brain). */
  private mobCfg(kind: MobKind): typeof CONFIG.combat.scuttlebot {
    if (kind === 'sparkwisp') {
      return CONFIG.sparkwisp as unknown as typeof CONFIG.combat.scuttlebot;
    }
    if (kind === 'draymule') {
      return CONFIG.draymule as unknown as typeof CONFIG.combat.scuttlebot;
    }
    return kind === 'junkhound'
      ? (CONFIG.junkhound as unknown as typeof CONFIG.combat.scuttlebot)
      : CONFIG.combat.scuttlebot;
  }

  /** Deterministic spawn seats: spaced walkable tiles in the home box. */
  /** A district's arrival tile (home districts fall back to `fallback`). */
  protected static districtGate(district: DistrictId, fallback: TilePoint): TilePoint {
    if (district === 'tangle') return CONFIG.travel.tangleSpawn;
    if (district === 'stacks') return CONFIG.travel.stacksSpawn;
    if (district === 'terrarium') return CONFIG.travel.terrariumSpawn;
    return fallback;
  }

  protected gateSpawn(fallback: TilePoint): TilePoint {
    return FilamentRoom.districtGate(this.districtId, fallback);
  }


  // ── LOFTPODS (D2b): housing as identity — display + sinks only ─────────

  private refreshLoftpodState(pod: PodView): void {
    // A pod that hauled leaves its old berth behind: drop stale entries.
    for (const [key, st] of this.state.loftpods) {
      if (st.ownerName === pod.ownerName && Number(key) !== pod.berth) {
        this.state.loftpods.delete(key);
      }
    }
    let st = this.state.loftpods.get(String(pod.berth));
    if (st === undefined) {
      st = new LoftpodState();
      this.state.loftpods.set(String(pod.berth), st);
    }
    st.berth = pod.berth;
    st.tier = pod.tier;
    st.dye = pod.dye;
    st.ownerName = pod.ownerName;
    st.trophyTitle = pod.trophyTitle;
    st.trophySkill = pod.trophySkill;
  }

  private async sendLoftpodSync(client: Client, rt: PlayerRuntime): Promise<void> {
    const mine = await loftpods.getMine(rt.accountId);
    const taken = new Set<number>();
    for (const [, st] of this.state.loftpods) taken.add(st.berth);
    const freeBerths = this.map.loftberths
      .map((_, i) => i)
      .filter((i) => !taken.has(i) || mine?.berth === i);
    const cfg = CONFIG.loftpods;
    const nextUpgrade =
      mine !== null && mine.tier - 1 < cfg.upgrades.length
        ? (cfg.upgrades[mine.tier - 1] as { bolts: number; materials: Record<string, number> })
        : null;
    const sync: LoftpodSync = {
      pod:
        mine === null
          ? null
          : {
              berth: mine.berth,
              tier: mine.tier,
              dye: mine.dye,
              trophyTitle: mine.trophyTitle,
              trophySkill: mine.trophySkill,
            },
      freeBerths,
      nextUpgrade,
      placeCostBolts: cfg.placeCostBolts,
      haulCostBolts: cfg.haulCostBolts,
      dyeCostBolts: cfg.dyeCostBolts,
      dyes: [...cfg.dyes],
      titles: [...rt.titles],
    };
    client.send(MSG.loftpodSync, sync);
  }

  private nearBerth(rt: PlayerRuntime, berth: number): boolean {
    const b = this.map.loftberths[berth];
    if (b === undefined) return false;
    const t = rt.move.tile;
    return Math.max(Math.abs(t.x - (b.x + 1)), Math.abs(t.y - (b.y + 1))) <= 4;
  }

  private async handleLoftpod(client: Client, msg: LoftpodIntent): Promise<void> {
    const rt = this.runtimes.get(client.sessionId);
    if (rt === undefined || rt.hp <= 0) return;
    if (this.districtId !== 'terrarium') {
      client.send(MSG.notice, { text: 'Loftpods berth in the Terrarium.' });
      return;
    }
    const notice = (text: string) => client.send(MSG.notice, { text });
    const cfg = CONFIG.loftpods;

    switch (msg.action) {
      case 'place':
      case 'haul': {
        const berth = Math.floor(Number(msg.berth));
        if (this.map.loftberths[berth] === undefined) return;
        if (!this.nearBerth(rt, berth)) {
          notice('Step up to the berth pad first.');
          return;
        }
        const cost = msg.action === 'place' ? cfg.placeCostBolts : cfg.haulCostBolts;
        if (rt.bolts < cost) {
          notice(`That takes ${cost} Bolts.`);
          return;
        }
        const before = await loftpods.getMine(rt.accountId);
        if (msg.action === 'place' && before !== null) {
          notice('You already have a home — /haul moves it.');
          return;
        }
        if (msg.action === 'haul' && before === null) {
          notice('No pod to haul yet — place one first.');
          return;
        }
        const result =
          msg.action === 'place'
            ? await loftpods.place(rt.accountId, berth)
            : await loftpods.haul(rt.accountId, berth);
        if (typeof result === 'string') {
          notice(result);
          return;
        }
        rt.bolts -= cost;
        ledger.log({
          type: 'spend',
          account: rt.accountId,
          data: { sink: msg.action === 'place' ? 'loftpodPlace' : 'loftpodHaul', bolts: cost, berth },
        });
        this.refreshLoftpodState(result);
        client.send(MSG.inventory, this.inventorySync(rt));
        notice(msg.action === 'place' ? 'Home. The berth is yours.' : 'Hauled — new view, same kettle.');
        await this.sendLoftpodSync(client, rt);
        return;
      }

      case 'upgrade': {
        const mine = await loftpods.getMine(rt.accountId);
        if (mine === null) {
          notice('No pod to upgrade yet.');
          return;
        }
        if (!this.nearBerth(rt, mine.berth)) {
          notice('Stand by your pod to work on it.');
          return;
        }
        const up = cfg.upgrades[mine.tier - 1];
        if (up === undefined) {
          notice('Your Loftpod is already at full stretch.');
          return;
        }
        if (rt.bolts < up.bolts) {
          notice(`The next tier takes ${up.bolts} Bolts and materials.`);
          return;
        }
        for (const [itemId, qty] of Object.entries(up.materials)) {
          if (countItem(rt.pack, itemId as ItemId) < qty) {
            notice(`You still need ${qty} ${itemId} for the next tier.`);
            return;
          }
        }
        const result = await loftpods.upgrade(rt.accountId, mine.tier + 1);
        if (typeof result === 'string') {
          notice(result);
          return;
        }
        rt.bolts -= up.bolts;
        for (const [itemId, qty] of Object.entries(up.materials)) {
          rt.pack = removeItem(rt.pack, itemId as ItemId, qty).inv;
        }
        ledger.log({
          type: 'spend',
          account: rt.accountId,
          data: { sink: 'loftpodUpgrade', bolts: up.bolts, materials: up.materials, tier: result.tier },
        });
        this.refreshLoftpodState(result);
        client.send(MSG.inventory, this.inventorySync(rt));
        notice(`Tier ${result.tier} — the neighbours noticed.`);
        await this.sendLoftpodSync(client, rt);
        return;
      }

      case 'dye': {
        const mine = await loftpods.getMine(rt.accountId);
        if (mine === null || !this.nearBerth(rt, mine.berth)) {
          notice('Stand by your pod to repaint it.');
          return;
        }
        const dye = String(msg.dye);
        if (!(cfg.dyes as readonly string[]).includes(dye)) return;
        if (rt.bolts < cfg.dyeCostBolts) {
          notice(`A repaint takes ${cfg.dyeCostBolts} Bolts.`);
          return;
        }
        const result = await loftpods.decorate(rt.accountId, { dye });
        if (typeof result === 'string') {
          notice(result);
          return;
        }
        rt.bolts -= cfg.dyeCostBolts;
        ledger.log({
          type: 'spend',
          account: rt.accountId,
          data: { sink: 'loftpodDye', bolts: cfg.dyeCostBolts, dye },
        });
        this.refreshLoftpodState(result);
        client.send(MSG.inventory, this.inventorySync(rt));
        await this.sendLoftpodSync(client, rt);
        return;
      }

      case 'trophy': {
        const mine = await loftpods.getMine(rt.accountId);
        if (mine === null || !this.nearBerth(rt, mine.berth)) {
          notice('Stand by your pod to hang trophies.');
          return;
        }
        const title = typeof msg.title === 'string' ? msg.title : mine.trophyTitle;
        const skill = typeof msg.skill === 'string' ? msg.skill : mine.trophySkill;
        // Only YOUR earned titles hang on YOUR hooks (display integrity).
        if (title !== '' && !rt.titles.includes(title)) {
          notice('That title is not yours to hang.');
          return;
        }
        if (skill !== '' && !(SKILLS as readonly string[]).includes(skill)) return;
        const result = await loftpods.decorate(rt.accountId, {
          trophyTitle: title,
          trophySkill: skill,
        });
        if (typeof result === 'string') {
          notice(result);
          return;
        }
        this.refreshLoftpodState(result);
        await this.sendLoftpodSync(client, rt);
        return;
      }
    }
  }

  private spawnMobs(): void {
    // The Terrarium is where people rest — no ferals in the gardens (D2).
    // The Stacks carries only Sparkwisps: an ambient hazard, not a hunt.
    if (this.districtId === 'terrarium') return;
    const packs: Array<{ kind: MobKind; count: number; box: { x0: number; y0: number; x1: number; y1: number } }> =
      this.districtId === 'stacks'
        ? [
            {
              kind: 'sparkwisp',
              count: CONFIG.sparkwisp.count,
              box: CONFIG.sparkwisp.homeBox,
            },
          ]
        : this.districtId === 'tangle'
        ? [
            {
              kind: 'scuttlebot',
              count: CONFIG.tangle.scuttlebotCount,
              box: CONFIG.tangle.scuttlebotHomeBox,
            },
            { kind: 'junkhound', count: CONFIG.junkhound.count, box: CONFIG.junkhound.homeBox },
          ]
        : [
            {
              kind: 'scuttlebot',
              count: CONFIG.combat.scuttlebot.count,
              box: CONFIG.combat.scuttlebot.homeBox,
            },
          ];
    let seq = 0;
    for (const pack of packs) {
      const seats: TilePoint[] = [];
      for (let y = pack.box.y0; y <= pack.box.y1 && seats.length < pack.count; y += 1) {
        for (let x = pack.box.x0; x <= pack.box.x1 && seats.length < pack.count; x += 1) {
          if (this.map.walkable[y]?.[x] !== true) continue;
          if (seats.some((s) => chebyshev(s, { x, y }) < 3)) continue;
          seats.push({ x, y });
        }
      }
      const cfg = this.mobCfg(pack.kind);
      for (const seat of seats) {
        const id = `mob-${seq++}`;
        this.mobs.set(id, {
          id,
          kind: pack.kind,
          home: { ...seat },
          move: makeMoveState(seat),
          hp: cfg.maxHp,
          ai: 'idle',
          targetSessionId: null,
          windupElapsed: 0,
          cooldownRemaining: 0,
          wanderWait: 1 + (seq % 3),
          repathWait: 0,
          respawnAtMs: null,
        });
        this.state.mobs.set(id, this.makeMobState(pack.kind, seat, cfg.maxHp));
      }
    }
  }

  private makeMobState(kind: MobKind, tile: TilePoint, hp: number): MobState {
    const ms = new MobState();
    ms.kind = kind;
    ms.tileX = tile.x;
    ms.tileY = tile.y;
    ms.hp = hp;
    ms.maxHp = this.mobCfg(kind).maxHp;
    ms.ai = 'idle';
    return ms;
  }

  private tickMobs(dt: number): void {
    const now = Date.now();
    for (const m of this.mobs.values()) {
      const cfg = this.mobCfg(m.kind);
      // Dead: wait out the respawn clock, then pop back at home.
      if (m.respawnAtMs !== null) {
        if (now >= m.respawnAtMs) {
          m.respawnAtMs = null;
          m.hp = cfg.maxHp;
          m.ai = 'idle';
          m.move = makeMoveState(m.home);
          m.targetSessionId = null;
          m.cooldownRemaining = 0;
          this.state.mobs.set(m.id, this.makeMobState(m.kind, m.home, m.hp));
        }
        continue;
      }

      m.cooldownRemaining = Math.max(0, m.cooldownRemaining - dt);
      m.repathWait = Math.max(0, m.repathWait - dt);

      // Nearest living Spark (and its distance from this mob's home).
      let target: { sid: string; dist: number; distHome: number; tile: TilePoint } | null = null;
      for (const [sid, rt] of this.runtimes) {
        if (rt.hp <= 0) continue;
        const dist = chebyshev(rt.move.tile, m.move.tile);
        if (target === null || dist < target.dist) {
          target = {
            sid,
            dist,
            distHome: chebyshev(rt.move.tile, m.home),
            tile: rt.move.tile,
          };
        }
      }

      const before = m.ai;
      const decision = nextMobState(
        {
          state: m.ai,
          mobTile: m.move.tile,
          homeTile: m.home,
          targetDist: target?.dist ?? null,
          targetDistFromHome: target?.distHome ?? null,
          windupElapsed: m.windupElapsed,
          onCooldown: m.cooldownRemaining > 0,
        },
        cfg,
      );
      m.ai = decision.state;

      if (decision.bite && target !== null) this.applyBite(m, target.sid);

      // Transition side effects.
      if (before !== 'windup' && m.ai === 'windup') {
        m.windupElapsed = 0;
        m.move = setPath(m.move, []); // plant feet for the telegraph
      }
      if (before === 'windup' && m.ai !== 'windup') {
        m.cooldownRemaining = cfg.attackCooldownSeconds;
      }
      if (before !== 'chase' && m.ai === 'chase') m.repathWait = 0;

      // State behavior.
      switch (m.ai) {
        case 'idle': {
          m.wanderWait -= dt;
          if (m.wanderWait <= 0) {
            const leg = this.pickWanderLeg(m);
            if (leg !== null) {
              m.move = setPath(m.move, leg);
              m.ai = 'wander';
            } else {
              m.wanderWait = 1.5;
            }
          }
          break;
        }
        case 'wander': {
          if (m.move.queue.length === 0) {
            m.ai = 'idle';
            m.wanderWait = 1.2 + ((now / 997) % 2.6); // cheap desync, not value RNG
          }
          break;
        }
        case 'chase': {
          m.targetSessionId = target?.sid ?? null;
          if (target !== null && m.repathWait <= 0) {
            m.repathWait = 0.35;
            const path = findPathAdjacent(this.grid, m.move.tile, {
              x: target.tile.x,
              y: target.tile.y,
              w: 1,
              h: 1,
            });
            if (path !== null) m.move = setPath(m.move, path);
          }
          break;
        }
        case 'windup': {
          m.windupElapsed += dt;
          break;
        }
        case 'return': {
          m.targetSessionId = null;
          if (m.move.queue.length === 0) {
            const path = findPath(this.grid, m.move.tile, m.home);
            if (path !== null) m.move = setPath(m.move, path);
          }
          if (chebyshev(m.move.tile, m.home) <= 1) m.hp = cfg.maxHp; // shakes it off
          break;
        }
      }

      // Advance movement (windup stands still by construction).
      if (m.move.queue.length > 0) {
        m.move = advanceMovement(m.move, dt, cfg.moveSecondsPerTile);
      }

      // Sync.
      const ms = this.state.mobs.get(m.id);
      if (ms !== undefined) {
        ms.tileX = m.move.tile.x;
        ms.tileY = m.move.tile.y;
        ms.hp = m.hp;
        ms.ai = m.ai;
      }
    }
  }

  /** Short random walk near home (movement flavor only — not value RNG). */
  private pickWanderLeg(m: MobRuntime): TilePoint[] | null {
    for (let tries = 0; tries < 6; tries++) {
      const dx = Math.floor(this.rng() * 7) - 3;
      const dy = Math.floor(this.rng() * 7) - 3;
      const t = { x: m.home.x + dx, y: m.home.y + dy };
      if (t.x === m.move.tile.x && t.y === m.move.tile.y) continue;
      if (this.map.walkable[t.y]?.[t.x] !== true) continue;
      const path = findPath(this.grid, m.move.tile, t);
      if (path !== null && path.length <= 8) return path;
    }
    return null;
  }

  private applyBite(m: MobRuntime, sessionId: string): void {
    const rt = this.runtimes.get(sessionId);
    const ps = this.state.players.get(sessionId);
    if (rt === undefined || ps === undefined || rt.hp <= 0) return;
    const dmg = this.mobCfg(m.kind).contactDamage;
    rt.hp = Math.max(0, rt.hp - dmg);
    ps.hp = rt.hp;
    this.broadcast(MSG.combat, {
      type: 'mobBite',
      mobId: m.id,
      sessionId,
      damage: dmg,
      hp: rt.hp,
    });
    if (rt.hp <= 0) this.downPlayer(sessionId, rt, ps);
  }

  /**
   * A downed Spark is hauled back to the Dynamo's warmth: full heal, NO item
   * loss (Game Bible B7 — cozy death). Any active gather is cancelled with
   * its usual partial payout.
   */
  private downPlayer(sessionId: string, rt: PlayerRuntime, ps: PlayerState): void {
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (client !== undefined) this.cancelGather(client, rt);
    rt.gatherTargetNode = null;
    this.cancelTradeFor(sessionId, 'cancelled', 'The trade fell apart in the scuffle.');
    // Tangle death has teeth: carried resources + Bolts drop where you
    // fell. The Filament stays free (Game Bible B7 cozy death).
    let cache = { bolts: 0, stacks: 0 };
    if (this.districtId === 'tangle') {
      cache = this.dropScrapcache(rt, rt.move.tile);
      // The drop emptied the pockets — tell the owner right away.
      if (client !== undefined) client.send(MSG.inventory, this.inventorySync(rt));
    }
    // U3d: the fallen Spark gets the recap facts before the respawn snap.
    if (client !== undefined) {
      client.send(MSG.combat, {
        type: 'youDown',
        district: this.districtId,
        cacheBolts: cache.bolts,
        cacheStacks: cache.stacks,
      });
    }
    const spawn =
      this.gateSpawn(CONFIG.combat.player.respawnTile);
    rt.move = makeMoveState(spawn);
    rt.hp = CONFIG.combat.player.maxHp;
    ps.tileX = spawn.x;
    ps.tileY = spawn.y;
    ps.hp = rt.hp;
    ps.gathering = false;
    ps.pose = '';
    this.broadcast(MSG.combat, { type: 'playerDown', sessionId });
    this.broadcast(MSG.notice, {
      text: `${rt.sparkName} got knocked flat by a Scuttlebot — hauled back to the Dynamo.`,
    });
  }

  /** Mastery speed curve × held-tool tier multiplier (config-driven). */
  private gatherSecondsFor(rt: PlayerRuntime, base: number, skillXp: number): number {
    const held = rt.hotbar.slots[rt.activeSlot];
    const mult = toolSpeedMult(held?.itemId ?? null);
    return effectiveSeconds(base, levelForXp(skillXp)) * mult;
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
        const seconds = this.gatherSecondsFor(rt, cfg.gatherSeconds, rt.skills.scavving);
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
        const seconds = this.gatherSecondsFor(rt, CONFIG.gathering.brassSeam.segmentSeconds, rt.skills.delving);
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
    {
      const c = this.clients.find((cc) => cc.sessionId === sessionId);
      const rt2 = this.runtimes.get(sessionId);
      if (c !== undefined && rt2 !== undefined) this.sendRested(c, rt2);
    }
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
          // D2c: the Terrarium's compost gives up GARDEN rares instead —
          // same odds, same glint discipline, its own Manifest page.
          if (this.districtId === 'terrarium' && roll.rare !== null) {
            const pool = CONFIG.terrarium.rares;
            roll.rare = pool[Math.floor(this.rng() * pool.length)] as ItemId;
          }
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
          let amount = signalYield(cfg, lockRatio);
          // D1c: the Roofline's shrines carry the city's best Signal —
          // a LOCATION bonus (free to reach, never sold, same for all).
          const node = this.map.nodes[s.nodeId];
          const R = CONFIG.stacks.roofline;
          const onRoofline =
            this.districtId === 'stacks' &&
            node !== undefined &&
            node.x >= R.x0 && node.x <= R.x1 && node.y >= R.y0 && node.y <= R.y1;
          if (onRoofline) amount = Math.round(amount * CONFIG.stacks.rooflineSignalMult);
          const rare = rollSignalRare(cfg, lockRatio, this.rng)
            ? (cfg.rareFindItem as ItemId)
            : null;
          rt.session = null;
          this.setGatheringFlag(sessionId, false);
          this.sendNodeEvent(client, { type: 'tuneResult', nodeId: s.nodeId, lockRatio });
          this.grantLoot(client, rt, s.nodeId, 'signal', amount, rare, {
            kind: 'antenna',
            lockRatio: Number(lockRatio.toFixed(3)),
            ...(onRoofline ? { roofline: true } : {}),
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

  /** Boosted ms left today; flips the day-bucket on UTC midnight. */
  private restedMsLeft(rt: PlayerRuntime, now: number): number {
    const day = new Date(now).toISOString().slice(0, 10);
    if (rt.restedDate !== day) {
      rt.restedDate = day;
      rt.restedMsUsed = 0;
    }
    return Math.max(0, CONFIG.restedCharge.dailyMinutes * 60_000 - rt.restedMsUsed);
  }

  private sendRested(client: Client, rt: PlayerRuntime): void {
    client.send(MSG.rested, {
      msLeft: this.restedMsLeft(rt, Date.now()),
      multiplier: CONFIG.restedCharge.xpMultiplier,
    } satisfies RestedSync);
  }

  private setGatheringFlag(sessionId: string, gathering: boolean): void {
    const ps = this.state.players.get(sessionId);
    if (ps === undefined) return;
    ps.gathering = gathering;
    // Working pose (presentation only): the tool the session's node needs.
    // L3: starting work stands you out of an idle loop; ending work falls
    // back to the idle pose if one is somehow still set (belt + braces).
    const rt = this.runtimes.get(sessionId);
    if (gathering && rt !== undefined) rt.idlePose = null;
    const kind = rt?.session?.kind;
    ps.pose =
      gathering && kind !== undefined
        ? CONFIG.tools.requiredByNode[kind]
        : (rt?.idlePose ?? '');
  }

  private sendNodeEvent(client: Client, payload: NodeEventPayload): void {
    client.send(MSG.nodeEvent, payload);
  }

  private grantXp(client: Client, rt: PlayerRuntime, skill: SkillId, amount: number): void {
    if (amount <= 0) return;
    // Weekend city buff (E3): the Charge meter's tier boosts GATHER XP on
    // Sat/Sun — never combat, never drops, never Bolts.
    let boosted =
      skill === 'brawling' ? amount : Math.round(amount * charge.xpMultiplier(Date.now()));
    // Rested Charge (S3): the first N daily minutes of gathering boost
    // GATHER XP ONLY — never combat XP, never resources (the faucet is
    // untouched; XP is pacing, not value).
    if (skill !== 'brawling' && this.restedMsLeft(rt, Date.now()) > 0) {
      boosted = Math.round(boosted * CONFIG.restedCharge.xpMultiplier);
    }
    rt.skills[skill] += boosted;
    client.send(MSG.xpGain, { skill, amount: boosted });
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
      const r = addItem(rt.pack, itemId, qty);
      rt.pack = r.inv;
      added = r.added;
    }
    let rareGranted: ItemId | null = null;
    if (rare !== null) {
      const rr = addItem(rt.pack, rare, 1);
      if (rr.added > 0) {
        rt.pack = rr.inv;
        rareGranted = rare;
        this.recordManifest(client, rt, rare);
      }
    }
    // The Alley Beanie (I3): a rare junk-heap COSMETIC roll — presentation
    // only, untradeable, once ever, server-rolled like everything else.
    if (ledgerData.kind === 'junkHeap') {
      const rc = CONFIG.gathering.junkHeap.rareCosmetic;
      if (!rt.cosmetics.includes(rc.id) && this.rng() < rc.chance) {
        this.grantCosmetic(client, rt, rc.id, 'a rare find in a junk heap');
      }
    }
    this.wearActiveTool(client, rt);
    if (added > 0) {
      this.goalEvent(client, rt.accountId, {
        kind: 'gather',
        itemId,
        qty: added,
        district: this.districtId,
      });
      this.questProgress(client, rt, {
        type: 'gather',
        itemId,
        qty: added,
        skill: SKILL_BY_NODE[(ledgerData.kind ?? 'junkHeap') as keyof typeof SKILL_BY_NODE],
      });
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
    return { pack: rt.pack.slots, hotbar: rt.hotbar.slots, bolts: rt.bolts };
  }

  private async persist(rt: PlayerRuntime): Promise<void> {
    // W7: a spectator is non-persistent — never write it to the DB (this one
    // guard covers onLeave, onDispose, the 30s tick, and every inline call).
    if (rt.spectator) return;
    const district = rt.pendingDistrict ?? this.districtId;
    // A tram rider's saved tile belongs to the ORIGIN district's geometry —
    // persist the destination gate instead so arrivals step off the tram.
    const tile =
      district === this.districtId
        ? rt.move.tile
        : FilamentRoom.districtGate(district, CONFIG.player.spawn);
    await persistCharacter(rt.characterId, {
      tile,
      pack: rt.pack,
      hotbar: rt.hotbar,
      bolts: rt.bolts,
      dailySaleBolts: rt.dailySaleBolts,
      dailySaleDate: rt.dailySaleDate,
      deliveryDayBolts: rt.deliveryDayBolts,
      deliveryDayDate: rt.deliveryDayDate,
      tendDayCount: rt.tendDayCount,
      tendDayDate: rt.tendDayDate,
      tradeDayDate: rt.tradeDayDate,
      tradeDayValueBolts: rt.tradeDayValueBolts,
      tradeDayCount: rt.tradeDayCount,
      quests: rt.quests,
      cosmetics: rt.cosmetics,
      district,
      skills: rt.skills,
      equipped: encodeEquipped(rt.equipped) === '' ? 'none' : encodeEquipped(rt.equipped),
      titles: rt.titles,
      restedMsUsed: rt.restedMsUsed,
      restedDate: rt.restedDate,
    });
  }
}
