import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS } from '@shared/items';
import { buildDistrictMap, DISTRICT_NAMES, type DistrictId, type Prop, type WorldMap } from '@shared/map';
import { tramToll } from '@shared/travel';
import { settings } from '../settings';
import { hoverTip } from '../ui/Tooltip';
import { blendInt, hexToInt, MATERIAL_INT, mixPalette, PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { towerWindows } from '../render/voxelWorldModels';
import type {
  CacheStateShape,
  ChargeStateShape,
  ChargeSyncEvent,
  ChatBroadcast,
  CombatEvent,
  EmoteBroadcast,
  LampStateShape,
  MobStateShape,
  NodeEventPayload,
  NoticeEvent,
  SkillsSync,
  XpGainEvent,
  GatherStartEvent,
  GatherStopEvent,
  GlintHideEvent,
  GlintShowEvent,
  IdentityEvent,
  InspectInfoEvent,
  BankSync,
  CoilResultEvent,
  CoilShowEvent,
  CoilStateEvent,
  GoalsSync,
  ManifestFoundEvent,
  RestedSync,
  ManifestSync,
  InventorySync,
  LootEvent,
  MoveAcceptedEvent,
  PricesSync,
  QuestsSync,
  NodeStateShape,
  PlayerStateShape,
  ShopSyncEvent,
  StallStateShape,
  LoftpodStateShape,
  TradeAskEvent,
  TradeEndEvent,
  TradeSyncEvent,
  TravelGo,
  DeliverySync,
  TendStateEvent,
} from '@shared/protocol';
import { makeRng, type Rng } from '@shared/rng';
import { AmbientScuttlebot } from '../entities/AmbientScuttlebot';
import { JunkHeapNode } from '../entities/JunkHeapNode';
import { Mob } from '../entities/Mob';
import {
  AmperiteNode,
  AntennaNode,
  BrassSeamNode,
  KoiSpotNode,
  TunerPanel,
  type NodeView,
} from '../entities/nodes';
import { Spark } from '../entities/Spark';
import {
  DEPTH_FLOOR,
  DEPTH_SHADOW,
  depthForWorldY,
  ELEV_PX,
  mapWorldBounds,
  setElevationLookup,
  TILE_H,
  TILE_W,
  tileToWorld,
  worldToTileFloor,
} from '../iso/project';
import {
  DISTRICT_KEY,
  getStateCallbacks,
  joinDistrict,
  MSG,
  send,
  TOKEN_KEY,
  type FilamentRoom,
} from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { showCreatorOverlay, type CreatorHandle } from '../ui/creatorOverlay';
import { sound } from '../audio/sound';
import { floatText } from '../render/effects';
import { floorTileKey, floorTileScale, type FloorKind } from '../render/floorTiles';
import { addEmberMotes, addFlicker, addSteamVent } from '../render/life';
import { TEX_SCALE } from '../render/textures';
import { addSkyline, makeSkylineTexture } from '../render/ambience';
import { addVoxelSprite, syncVoxelShadows } from '../render/voxel';
import { VariantPicker } from '../render/propVariants';
import { placeAmbientNpcs } from '../render/ambientNpcs';
import { bloom, worldSpriteTint } from '../render/styleConfig';
import { addLayeredGlow } from '../render/glow';
import { itemThumbKey } from '../render/itemThumbs';
import {
  addBadFlicker,
  addFilmGrain,
  addGodRays,
  addHaze,
  addHueCycle,
  addLampCone,
} from '../render/atmosphere';
import { CameraController } from '../systems/CameraController';
import { GatherView } from '../systems/GatherView';
import { OcclusionFade, type OcclusionTarget } from '../systems/OcclusionFade';
import { gameState } from '../state/GameState';


/**
 * The Filament, rendered from server truth. The client sends intents (move,
 * gather, glint clicks, stack moves) and animates the results — it never
 * decides yields, positions-for-loot, or inventory contents.
 */
export class WorldScene extends Phaser.Scene {
  private map!: WorldMap;
  private cameraCtl!: CameraController;
  private hoverMarker!: Phaser.GameObjects.Image;
  private gatherView!: GatherView;
  /** Creator overlay handle + latest identity snapshot (own Spark). */
  private creator: CreatorHandle | null = null;
  /** Which door the creator opened through (H1 gates the intro on 'first'). */
  private creatorMode: 'first' | 'wardrobe' | null = null;
  private identity: IdentityEvent | null = null;
  /** Last-inspected Spark: their nameplate never fades (S0). */
  private inspectTarget: string | null = null;
  private nameFadeAcc = 0;
  /** T0: tall structures fade when they hide the Spark (§5 amendment). */
  private readonly occlusion = new OcclusionFade();
  /** Photo mode (marketing shots): non-null while a frame is composed. */
  private photoMode: { nameplates: boolean } | null = null;
  /** The Fortune Coil's live face + spin state (S4). */
  private coilWheel: Phaser.GameObjects.Image | null = null;
  private coilSpinning = false;
  private coilSpunToday = false;
  private tuner!: TunerPanel;
  private nodes = new Map<number, NodeView>();
  private sparks = new Map<string, Spark>();
  private mobs = new Map<string, Mob>();
  private lampViews = new Map<string, Phaser.GameObjects.Image[]>();
  private cacheViews = new Map<string, Phaser.GameObjects.Image[]>();
  private ambientBots: AmbientScuttlebot[] = [];
  private room: FilamentRoom | null = null;
  private token = '';
  private district: DistrictId = 'filament';
  private dynamoWorld = { x: 0, y: 0 };
  private stallsWorld = { x: 0, y: 0 };
  /** Shop-stall presence layers (shingle + counter goods), by stall id. */
  private stallFronts = new Map<number, { destroy(): void }>();
  /** D2b: rendered Loftpods keyed by berth id. */
  private loftpodViews = new Map<string, Phaser.GameObjects.GameObject[]>();
  /** Empty-berth pad markers — hidden in photo mode (placement UI). */
  private berthMarkers: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text> = [];
  /** String-light bulb glows — the Citywide Charge scales their density. */
  private stringBulbGlows: Phaser.GameObjects.Image[] = [];
  /** District structural lights (D3): the Stacks window blaze — the same
   *  Charge meter thins or crowds them (festival = a quarter blazing). */
  private chargeWindowGlows: Phaser.GameObjects.Image[] = [];
  /** Terrarium garden lamps (glow-fruit, shed windows): a gentler band —
   *  half lit at low Charge, every lamp on in a festival week. */
  private chargeGardenGlows: Phaser.GameObjects.Image[] = [];
  private chargeLightingTier = 0;
  /** The tramgate stop board (D3), open at most one at a time. */
  private tramBoard: Phaser.GameObjects.Container | null = null;
  /** U1a: the active parcel run + its landing marker objects. */
  private delivery: DeliverySync | null = null;
  private deliveryMarker: Phaser.GameObjects.GameObject[] = [];
  /** U1b: bloom overlays keyed by gardenbed index. */
  private bloomViews = new Map<string, Phaser.GameObjects.GameObject[]>();
  /** U1b: bed index of the live tend channel (cue clicks route to it). */
  private tendingBed: number | null = null;
  /** U3e: true while a leave is intentional (tram hops, shutdown). */
  private expectLeave = false;
  /** Puddle-decal budget per map (R5b). */
  private puddleCount = 0;
  private spatialAt = 0;
  private connectingText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('world');
  }

  init(data: { token?: string; district?: DistrictId }): void {
    this.token = data.token ?? this.token;
    this.district = data.district ?? 'filament';
    // Scene restarts (tram travel) reuse this instance: field initializers
    // don't re-run, so the entity maps still point at destroyed objects.
    this.nodes = new Map();
    this.sparks = new Map();
    this.mobs = new Map();
    this.lampViews = new Map();
    this.cacheViews = new Map();
    this.ambientBots = [];
    this.room = null;
    this.dynamoWorld = { x: 0, y: 0 };
    this.stallsWorld = { x: 0, y: 0 };
    this.activeSessionNode = null;
    this.stallFronts = new Map();
    this.berthMarkers = [];
    this.stringBulbGlows = [];
    this.chargeWindowGlows = [];
    this.chargeGardenGlows = [];
    this.chargeLightingTier = 0;
    this.tramBoard = null;
    this.delivery = null;
    this.deliveryMarker = [];
    this.bloomViews = new Map();
    this.tendingBed = null;
    this.expectLeave = false;
    this.puddleCount = 0;
  }

  create(): void {
    this.map = buildDistrictMap(this.district);
    // Elevation-aware projection (R4): every tile-derived world position
    // lifts by the tile's level from here on.
    setElevationLookup((tx, ty) => this.map.elevation[ty]?.[tx] ?? 0);
    makeSkylineTexture(this);
    this.drawFloor();
    this.placeWorldRim();
    this.placeProps();
    this.placeLoftBerths();
    placeAmbientNpcs(this, this.map.district);
    this.placeRopes();
    this.placeAntennaCables();
    this.placeTangleCables();
    this.placeStacksOverhead();
    // D2: the Terrarium breathes fireflies — the gentlest light in the city.
    if (this.map.district === 'terrarium') {
      for (const [fx2, fy2] of [
        [8, 10], [10, 24], [17, 6], [18, 30], [22, 14], [28, 20], [31, 8], [30, 33], [35, 15],
      ] as const) {
        const w = tileToWorld(fx2, fy2);
        addEmberMotes(this, w.x, w.y - 16, depthForWorldY(w.y) + 3, {
          count: 3,
          radius: 46,
          rise: 22,
          tint: PALETTE_INT.solarGreen,
        });
      }
    }
    this.placeStringLights();
    this.placeCanalLife();
    this.spawnAmbientBots();
    addSkyline(this, -70);
    // Catwalk lighting (I5): warm pools at the tram platform + plaza rim —
    // the spots where a Spark's look gets seen. Light only, never gameplay.
    for (const t of this.map.catwalks) {
      const cw = tileToWorld(t.x, t.y);
      const depth = DEPTH_FLOOR + 3;
      const outer = this.add.ellipse(cw.x, cw.y, 96, 48, PALETTE_INT.warmGlow, 0.09);
      outer.setDepth(depth);
      outer.setBlendMode(Phaser.BlendModes.ADD);
      const inner = this.add.ellipse(cw.x, cw.y, 54, 27, PALETTE_INT.warmGlow, 0.13);
      inner.setDepth(depth);
      inner.setBlendMode(Phaser.BlendModes.ADD);
      addLayeredGlow(this, cw.x, cw.y - 6, PALETTE_INT.warmGlow, 0.55, depth, 0.3);
      // A slow breathing shimmer so the pool feels powered, not painted.
      this.tweens.add({
        targets: [outer, inner],
        alpha: { from: 1, to: 0.72 },
        duration: 2400,
        delay: (t.x * 137) % 900,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inout',
      });
    }
    // Atmosphere (R5c): warm haze over the dense light clusters + a film
    // of grain over the whole frame to kill banding.
    if (this.dynamoWorld.x !== 0) {
      addHaze(this, this.dynamoWorld.x, this.dynamoWorld.y + 40, PALETTE_INT.warmGlow, 2.6);
    }
    if (this.stallsWorld.x !== 0) {
      addHaze(this, this.stallsWorld.x + 60, this.stallsWorld.y + 40, PALETTE_INT.neonAmber, 2.1);
    }
    addFilmGrain(this);
    // Warm ambience overlays live in the UI scene: its camera never zooms,
    // so the grade can't shrink/scale with world zoom (or pixel modes).
    this.setupCamera();
    this.cameraCtl = new CameraController(this);
    this.gatherView = new GatherView(this);
    this.tuner = new TunerPanel(this);
    this.tuner.onNeedle = (nodeId, needle) => {
      if (this.room !== null) send.nodeAction(this.room, { nodeId, action: 'tune', needle });
    };
    this.spawnNodes();
    this.setupInput();

    this.connectingText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Riding the tram in…', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: PALETTE.warmGlow,
        stroke: PALETTE.ink,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1e9);

    void this.connect();
  }

  /**
   * The Fortune Coil's machined face (S4): a segmented disk baked from the
   * CONFIG prize table (same order the server rolls), laid over the voxel
   * housing and rotated live. Segment hues by prize kind — amber Bolts,
   * teal consumables, rose shards, warm Manifest fillers.
   */
  private placeCoilFace(p: Prop, frame: Phaser.GameObjects.Image): void {
    const prizes = CONFIG.coil.prizes;
    const key = 'coil-face';
    if (!this.textures.exists(key)) {
      const R = 46;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      const seg = (Math.PI * 2) / prizes.length;
      prizes.forEach((prize, i) => {
        const base =
          prize.kind === 'shard'
            ? PALETTE_INT.neonRose
            : prize.kind === 'bolts'
              ? PALETTE_INT.neonAmber
              : prize.itemId === 'gildedScrap'
                ? PALETTE_INT.warmGlow
                : PALETTE_INT.neonTeal;
        // Every segment carries its prize hue; odds run deep for contrast.
        g.fillStyle(i % 2 === 0 ? base : blendInt(base, PALETTE_INT.ink, 0.45), 1);
        g.slice(R + 2, R + 2, R, i * seg - Math.PI / 2, (i + 1) * seg - Math.PI / 2, false);
        g.fillPath();
        g.lineStyle(2, PALETTE_INT.ink, 1);
        g.slice(R + 2, R + 2, R, i * seg - Math.PI / 2, (i + 1) * seg - Math.PI / 2, false);
        g.strokePath();
      });
      // Rim + hub.
      g.lineStyle(4, MATERIAL_INT.gunmetalDeep, 1);
      g.strokeCircle(R + 2, R + 2, R);
      g.fillStyle(MATERIAL_INT.gunmetal, 1);
      g.fillCircle(R + 2, R + 2, 9);
      g.fillStyle(PALETTE_INT.neonAmber, 1);
      g.fillCircle(R + 2, R + 2, 4);
      g.generateTexture(key, (R + 2) * 2, (R + 2) * 2);
      g.destroy();
    }
    const { x, y } = tileToWorld(p.x + 1, p.y + 1);
    const wheel = this.add.image(x, y - 78, key);
    wheel.setDepth(frame.depth + 1);
    wheel.setScale(0.9);
    this.coilWheel = wheel;
    // Pointer above the face (the near-miss drama lives at this needle).
    const pointer = this.add.triangle(x, y - 124, 0, 0, 10, 0, 5, 12, PALETTE_INT.neonRose);
    pointer.setDepth(frame.depth + 2);
    addLayeredGlow(this, x - 42, y - 96, PALETTE_INT.neonAmber, 0.3, frame.depth + 2, 0.4);
    addLayeredGlow(this, x + 42, y - 96, PALETTE_INT.neonAmber, 0.3, frame.depth + 2, 0.4);
    // Click to spin — the server holds the daily gate + proximity.
    frame.setInteractive({ useHandCursor: true });
    wheel.setInteractive({ useHandCursor: true });
    const trySpin = (
      ptr: Phaser.Input.Pointer,
      _lx: number,
      _ly: number,
      ev: Phaser.Types.Input.EventData,
    ) => {
      if (!ptr.leftButtonDown() || this.room === null) return;
      ev.stopPropagation();
      if (this.coilSpinning) return;
      if (this.coilSpunToday) {
        session.events.emit(SessionEvents.notice, 'The Coil rests until tomorrow.');
        return;
      }
      send.coilSpin(this.room);
    };
    frame.on('pointerdown', trySpin);
    wheel.on('pointerdown', trySpin);
  }

  /** Spin to the rolled segment: 4 slow turns, ratchet ticks, ease-out
   *  near-miss drama, then the prize moment (own spins only). */
  private animateCoil(index: number, own: boolean, result: CoilResultEvent | null): void {
    const wheel = this.coilWheel;
    if (wheel === null || this.coilSpinning) return;
    this.coilSpinning = true;
    const segAngle = 360 / CONFIG.coil.prizes.length;
    wheel.setAngle(((wheel.angle % 360) + 360) % 360);
    const target = 360 * 4 + (360 - (index + 0.5) * segAngle);
    let lastTick = 0;
    this.tweens.add({
      targets: wheel,
      angle: target,
      duration: 5400,
      ease: 'cubic.out',
      onUpdate: () => {
        const tick = Math.floor(wheel.angle / segAngle);
        if (tick !== lastTick) {
          lastTick = tick;
          sound.coilTick();
        }
      },
      onComplete: () => {
        this.coilSpinning = false;
        wheel.setAngle(wheel.angle % 360);
        if (own && result !== null) this.showCoilPrize(result);
      },
    });
  }

  private showCoilPrize(r: CoilResultEvent): void {
    const wheel = this.coilWheel;
    const good = r.kind === 'shard' || (r.kind === 'bolts' && r.amount >= 40) || r.itemId === 'gildedScrap';
    if (good) sound.rareChime();
    else sound.gatherChirp();
    if (wheel !== null && good) {
      // Confetti motes off the rim on a good hit.
      for (let i = 0; i < 14; i++) {
        const mote = this.add.image(wheel.x, wheel.y, 'fx-spark');
        mote.setDepth(wheel.depth + 2);
        mote.setScale(0.12 + Math.random() * 0.1);
        mote.setTint([PALETTE_INT.neonAmber, PALETTE_INT.neonRose, PALETTE_INT.neonTeal][i % 3] as number);
        mote.setBlendMode(Phaser.BlendModes.ADD);
        const a = Math.random() * Math.PI * 2;
        const d = 30 + Math.random() * 55;
        this.tweens.add({
          targets: mote,
          x: wheel.x + Math.cos(a) * d,
          y: wheel.y + Math.sin(a) * d - 24,
          alpha: 0,
          duration: 700 + Math.random() * 500,
          ease: 'quad.out',
          onComplete: () => mote.destroy(),
        });
      }
    }
    const shardLine =
      r.kind === 'shard' ? ` · shards ${Math.min(r.shards, r.shardsTarget)}/${r.shardsTarget}` : '';
    session.events.emit(SessionEvents.notice, `The Coil settles: ${r.label}${shardLine}`);
    this.coilSpunToday = true;
  }

  update(time: number, deltaMs: number): void {
    this.cameraCtl.update(deltaMs);
    this.updateHoverMarker();
    this.gatherView.update();
    this.tuner.update();
    syncVoxelShadows(this);
    // T0 occlusion fade: towers clear the view to your Spark + hover.
    {
      const targets: OcclusionTarget[] = [];
      const meSpark = this.room !== null ? this.sparks.get(this.room.sessionId) : undefined;
      if (meSpark !== undefined) {
        targets.push({
          x: meSpark.image.x,
          y: meSpark.image.y - 14,
          depth: meSpark.image.depth,
        });
      }
      if (this.hoverMarker !== undefined && this.hoverMarker.visible) {
        targets.push({
          x: this.hoverMarker.x,
          y: this.hoverMarker.y,
          depth: depthForWorldY(this.hoverMarker.y),
        });
      }
      this.occlusion.update(deltaMs, targets);
    }
    // Nameplate proximity fade (S0), throttled to ~6Hz.
    this.nameFadeAcc += deltaMs;
    if (this.nameFadeAcc >= 160) {
      this.nameFadeAcc = 0;
      if ((this.photoMode !== null && !this.photoMode.nameplates) || !settings().nameplates) {
        // Photo mode / the settings toggle: nameplates stand down.
        for (const [, spark] of this.sparks) spark.setNameFade(0);
      } else {
        const cfg = CONFIG.nameplates;
        const room = this.room;
        const me = room !== null ? this.sparks.get(room.sessionId) : undefined;
        const alwaysOn = this.sparks.size <= cfg.alwaysOnAtOrBelow || me === undefined;
        for (const [sid, spark] of this.sparks) {
          if (me !== undefined && sid === room?.sessionId) {
            spark.setNameFade(1);
            continue;
          }
          if (alwaysOn || sid === this.inspectTarget) {
            spark.setNameFade(1);
            continue;
          }
          const d = Math.max(
            Math.abs(spark.settledTile.x - (me as Spark).settledTile.x),
            Math.abs(spark.settledTile.y - (me as Spark).settledTile.y),
          );
          const t =
            d <= cfg.fullTiles
              ? 1
              : d >= cfg.hideTiles
                ? 0
                : cfg.fadedAlpha +
                  (1 - cfg.fadedAlpha) *
                    (1 - (d - cfg.fullTiles) / (cfg.hideTiles - cfg.fullTiles));
          spark.setNameFade(t);
        }
      }
    }
    for (const node of this.nodes.values()) {
      if (node instanceof KoiSpotNode) node.update();
    }
    if (this.ambientBots.length > 0) {
      const sparkTiles = [...this.sparks.values()].map((s) => s.settledTile);
      for (const bot of this.ambientBots) bot.update(time, sparkTiles);
    }
    if (sound.ready && time > this.spatialAt && this.room !== null) {
      this.spatialAt = time + 250;
      const own = this.sparks.get(this.room.sessionId);
      if (own !== undefined) {
        const dDyn = Phaser.Math.Distance.Between(
          own.image.x,
          own.image.y,
          this.dynamoWorld.x,
          this.dynamoWorld.y,
        );
        const dStalls = Phaser.Math.Distance.Between(
          own.image.x,
          own.image.y,
          this.stallsWorld.x,
          this.stallsWorld.y,
        );
        sound.updateSpatial(dDyn, dStalls);
      }
    }
  }

  // ── networking ─────────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    try {
      const room = await joinDistrict(this.token, this.district);
      this.bindRoom(room);
      this.connectingText?.destroy();
      this.connectingText = null;
    } catch (err) {
      // A remembered district can go stale (or its toll be short) — fall
      // back to the Filament once before treating the token as bad.
      if (this.district !== 'filament') {
        console.warn('[net] district join failed — riding home instead', err);
        localStorage.setItem(DISTRICT_KEY, 'filament');
        this.scene.restart({ token: this.token, district: 'filament' });
        return;
      }
      console.error('[net] join failed', err);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(DISTRICT_KEY);
      this.scene.stop('ui');
      this.scene.start('login');
    }
  }

  private bindRoom(room: FilamentRoom): void {
    this.room = room;
    session.room = room;
    // Boundary typing for the runtime-typed Colyseus callback proxy.
    interface EntityProxy {
      onChange(cb: () => void): void;
      listen(prop: string, cb: (v: never) => void): void;
    }
    interface StateProxy {
      players: {
        onAdd(cb: (p: PlayerStateShape, id: string) => void): void;
        onRemove(cb: (p: PlayerStateShape, id: string) => void): void;
      };
      nodes: {
        onAdd(cb: (n: NodeStateShape, key: string) => void): void;
      };
      mobs: {
        onAdd(cb: (m: MobStateShape, id: string) => void): void;
        onRemove(cb: (m: MobStateShape, id: string) => void): void;
      };
      lamps: {
        onAdd(cb: (l: LampStateShape, id: string) => void): void;
        onRemove(cb: (l: LampStateShape, id: string) => void): void;
      };
      caches: {
        onAdd(cb: (c: CacheStateShape, id: string) => void): void;
        onRemove(cb: (c: CacheStateShape, id: string) => void): void;
      };
      stalls: {
        onAdd(cb: (s: StallStateShape, id: string) => void): void;
      };
      loftpods: {
        onAdd(cb: (p: LoftpodStateShape, id: string) => void): void;
        onRemove(cb: (p: LoftpodStateShape, id: string) => void): void;
      };
      blooms: {
        onAdd(cb: (b: { untilMs: number }, id: string) => void): void;
        onRemove(cb: (b: { untilMs: number }, id: string) => void): void;
      };
    }
    const proxy = getStateCallbacks(room) as unknown as (o: unknown) => EntityProxy;
    const $state = proxy(room.state) as unknown as StateProxy;

    $state.players.onAdd((p: PlayerStateShape, sessionId: string) => {
      const spark = new Spark(this, { x: p.tileX, y: p.tileY }, p.sparkName);
      this.sparks.set(sessionId, spark);
      session.events.emit(SessionEvents.presence, this.sparks.size);
      if (sessionId === room.sessionId) {
        this.cameraCtl.followTarget(spark.image);
        spark.onStep = () => sound.footstep();
        session.events.emit(SessionEvents.hp, { hp: p.hp, maxHp: p.maxHp });
        proxy(p).listen('hp', (v: number) =>
          session.events.emit(SessionEvents.hp, { hp: v, maxHp: p.maxHp }),
        );
      }
      // Drift correction: if the server's committed tile diverges while the
      // client isn't animating a path, snap to truth.
      proxy(p).listen('equipped', (v: string) => spark.setEquipped(v));
      spark.setEquipped(p.equipped);
      proxy(p).listen('trim', (v: string) => spark.setTrim(v));
      spark.setTrim(p.trim);
      // Working pose while gathering (server-set, presentation only).
      proxy(p).listen('pose', (v: string) => spark.setPose(v === '' ? null : v));
      spark.setPose(p.pose === '' ? null : p.pose);
      // Creator appearance (server-validated code) + first-login rename.
      proxy(p).listen('appearance', (v: string) => spark.setAppearance(v));
      spark.setAppearance(p.appearance);
      proxy(p).listen('sparkName', (v: string) => spark.setNameLabel(v));
      // Click-to-inspect (I5): meet a person, not a sprite.
      if (sessionId !== room.sessionId) {
        spark.image.setInteractive({ useHandCursor: true });
        spark.image.on(
          'pointerdown',
          (
            pointer: Phaser.Input.Pointer,
            _lx: number,
            _ly: number,
            ev: Phaser.Types.Input.EventData,
          ) => {
            if (!pointer.leftButtonDown() || this.room === null) return;
            ev.stopPropagation();
            this.inspectTarget = sessionId;
            send.inspect(this.room, { sessionId });
          },
        );
      }
      proxy(p).onChange(() => {
        const s = this.sparks.get(sessionId);
        if (s === undefined || s.isMoving) return;
        if (s.tile.x !== p.tileX || s.tile.y !== p.tileY) {
          s.snapTo({ x: p.tileX, y: p.tileY });
        }
      });
    });

    $state.players.onRemove((_p: PlayerStateShape, sessionId: string) => {
      this.sparks.get(sessionId)?.destroy();
      this.sparks.delete(sessionId);
      session.events.emit(SessionEvents.presence, this.sparks.size);
    });

    $state.nodes.onAdd((n: NodeStateShape, key: string) => {
      const node = this.nodes.get(Number(key));
      if (node === undefined) return;
      node.setDepleted(n.depleted);
      proxy(n).listen('depleted', (v: boolean) => node.setDepleted(v));
    });

    $state.mobs.onAdd((m: MobStateShape, id: string) => {
      const mob = new Mob(this, id, m.kind, { x: m.tileX, y: m.tileY }, m.hp, m.maxHp);
      this.mobs.set(id, mob);
      const mp = proxy(m);
      mp.listen('tileX', () => mob.moveTo({ x: m.tileX, y: m.tileY }));
      mp.listen('tileY', () => mob.moveTo({ x: m.tileX, y: m.tileY }));
      mp.listen('hp', (v: number) => mob.setHp(v));
      mp.listen('ai', (v: string) => mob.setAi(v));
      // Click-melee: swing if in reach, otherwise walk up to it.
      mob.image.on(
        'pointerdown',
        (
          pointer: Phaser.Input.Pointer,
          _lx: number,
          _ly: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          if (!pointer.leftButtonDown() || this.room === null) return;
          event.stopPropagation();
          const me = this.sparks.get(this.room.sessionId);
          if (me === undefined) return;
          const t = mob.currentTile;
          const dist = Math.max(
            Math.abs(me.settledTile.x - t.x),
            Math.abs(me.settledTile.y - t.y),
          );
          if (dist <= CONFIG.combat.player.attackRangeTiles) {
            send.attack(this.room, { mobId: mob.id });
            me.lungeToward(mob.image.x, mob.image.y);
            sound.swingWhiff();
          } else {
            const step = this.nearestAdjacentWalkable(t, me.settledTile);
            if (step !== null) send.move(this.room, step);
          }
        },
      );
    });
    $state.mobs.onRemove((_m: MobStateShape, id: string) => {
      this.mobs.get(id)?.poof();
      this.mobs.delete(id);
    });

    room.onMessage(MSG.combat, (e: CombatEvent) => this.handleCombatEvent(e));

    $state.lamps.onAdd((l: LampStateShape, id: string) => this.addLamp(id, l));
    $state.lamps.onRemove((_l: LampStateShape, id: string) => this.removeLamp(id));

    $state.caches.onAdd((c: CacheStateShape, id: string) => this.addCache(id, c));
    $state.caches.onRemove((_c: CacheStateShape, id: string) => this.removeCache(id));

    // Shop stall presence: an occupied pitch shows its owner's shingle and
    // the top goods as counter props — the lane should LOOK stocked (E2d).
    $state.stalls.onAdd((s: StallStateShape, id: string) => {
      this.renderStallFront(Number(id), s);
      proxy(s).onChange(() => this.renderStallFront(Number(id), s));
    });

    // D2b Loftpods: homes on their berths, displays live-updating.
    // U1b: tended planters bloom for everyone — render from synced state.
    $state.blooms.onAdd((_b: { untilMs: number }, id: string) => this.renderBloom(id));
    $state.blooms.onRemove((_b: { untilMs: number }, id: string) => this.removeBloom(id));

    $state.loftpods.onAdd((p2: LoftpodStateShape, id: string) => {
      this.renderLoftpod(id, p2);
      proxy(p2).onChange(() => this.renderLoftpod(id, p2));
    });
    $state.loftpods.onRemove((_p2: LoftpodStateShape, id: string) => this.removeLoftpod(id));

    // The Citywide Charge: lighting density tracks the meter's tier, and
    // the UI scene shows the weekend-buff banner.
    const chargeState = (room.state as { charge?: ChargeStateShape }).charge;
    if (chargeState !== undefined) {
      const apply = () => {
        this.applyChargeLighting(chargeState.tier);
        session.events.emit(SessionEvents.charge, { ...chargeState });
      };
      apply();
      (proxy(chargeState as unknown as object) as unknown as { onChange(cb: () => void): void }).onChange(apply);
    }

    // The tram accepted the toll: hop rooms and rebuild the scene there.
    // U1a: your parcel run — marker at the landing, cleared on delivery.
    room.onMessage(MSG.deliverySync, (e: DeliverySync) => {
      this.clearDeliveryMarker();
      if (e.active && e.landing !== undefined) {
        this.delivery = e;
        this.drawDeliveryMarker(e);
      } else {
        this.delivery = null;
      }
    });
    // U1b: the tend channel began — pulse the bloom cue at the right beat.
    room.onMessage(MSG.tendState, (e: TendStateEvent) => {
      this.tendCue(e);
    });

    room.onMessage(MSG.travelGo, (e: TravelGo) => {
      const to: DistrictId = (CONFIG.travel.line as readonly DistrictId[]).includes(e.to)
        ? e.to
        : 'filament';
      localStorage.setItem(DISTRICT_KEY, to);
      const lines: Record<DistrictId, string> = {
        filament: 'Homeward — the Filament glow ahead.',
        tangle: 'The tram rattles out into the Tangle…',
        stacks: 'Up-line to the Stacks — windows all the way up.',
        terrarium: 'The Terrarium stop — you can smell the green from here.',
      };
      session.events.emit(SessionEvents.notice, lines[to]);
      this.expectLeave = true;
      void room.leave().finally(() => {
        this.scene.restart({ token: this.token, district: to });
      });
    });

    room.onMessage(MSG.moveAccepted, (e: MoveAcceptedEvent) => {
      const spark = this.sparks.get(e.sessionId);
      spark?.walk(e.path);
      if (e.sessionId === room.sessionId && spark !== undefined) {
        this.cameraCtl.followTarget(spark.image);
      }
    });

    room.onMessage(MSG.identity, (e: IdentityEvent) => {
      this.identity = e;
      if (e.error !== undefined) {
        this.creator?.setError(e.error);
        return;
      }
      if (!e.chosen && this.creator === null) {
        // First login: shape your Spark before the city knows you.
        this.openCreator('first');
      } else if (e.chosen && this.creator !== null) {
        this.creator.close();
        this.creator = null;
        // H1: a brand-new Spark steps out of the creator into the intro.
        if (this.creatorMode === 'first') session.events.emit(SessionEvents.howToPlay);
        this.creatorMode = null;
      }
    });
    room.onMessage(MSG.inspectInfo, (e: InspectInfoEvent) =>
      session.events.emit(SessionEvents.inspect, e),
    );
    room.onMessage(MSG.manifest, (e: ManifestSync) =>
      session.events.emit(SessionEvents.manifest, e),
    );
    room.onMessage(MSG.manifestFound, (e: ManifestFoundEvent) =>
      session.events.emit(SessionEvents.manifestFound, e),
    );
    room.onMessage(MSG.goals, (e: GoalsSync) => session.events.emit(SessionEvents.goals, e));
    room.onMessage(MSG.rested, (e: RestedSync) => session.events.emit(SessionEvents.rested, e));
    room.onMessage(MSG.bankSync, (e: BankSync) => session.events.emit(SessionEvents.bank, e));
    room.onMessage(MSG.coilState, (e: CoilStateEvent) => {
      this.coilSpunToday = e.spunToday;
    });
    room.onMessage(MSG.coilResult, (e: CoilResultEvent) => this.animateCoil(e.index, true, e));
    room.onMessage(MSG.coilShow, (e: CoilShowEvent) => this.animateCoil(e.index, false, null));
    session.events.off(SessionEvents.openWardrobe);
    session.events.on(SessionEvents.openWardrobe, () => {
      if (this.creator === null && this.identity !== null) this.openCreator('wardrobe');
    });

    room.onMessage(MSG.gatherStart, (e: GatherStartEvent) => {
      const node = this.nodes.get(e.nodeId);
      this.activeSessionNode = e.nodeId;
      if (node !== undefined) {
        this.gatherView.start(node, e.seconds);
        // Work FACING the node, so the tool pose points at it.
        this.sparks.get(room.sessionId)?.faceTowardWorld(node.image.x, node.image.y);
      }
    });
    room.onMessage(MSG.gatherStop, (e: GatherStopEvent) => {
      this.gatherView.stop();
      this.tuner.stop();
      this.activeSessionNode = null;
      const view = this.nodes.get(e.nodeId);
      if (view instanceof BrassSeamNode) view.hideFork();
      if (view instanceof AmperiteNode) view.stopPulse();
      if (view instanceof KoiSpotNode) {
        view.stopTension();
        view.hideShadow();
      }
    });
    room.onMessage(MSG.nodeEvent, (e: NodeEventPayload) => this.handleNodeEvent(e));
    room.onMessage(MSG.glintShow, (e: GlintShowEvent) => {
      const view = this.nodes.get(e.nodeId);
      if (view instanceof JunkHeapNode) view.showGlint(e.offset);
      sound.glintDing();
    });
    room.onMessage(MSG.glintHide, (e: GlintHideEvent) => {
      const view = this.nodes.get(e.nodeId);
      if (view instanceof JunkHeapNode) view.hideGlint();
    });

    room.onMessage(MSG.loot, (e: LootEvent) => {
      this.gatherView.stop();
      const node = this.nodes.get(e.nodeId);
      const nx = node?.image.x ?? 0;
      const ny = (node?.image.y ?? 0) - 70;
      if (e.qty > 0) {
        floatText(this, nx, ny, `+${e.qty} ${ITEMS[e.itemId].name}`);
        sound.gatherChirp();
      } else {
        floatText(this, nx, ny, 'Pack is full!', PALETTE.neonRose);
      }
      if (e.rare !== null) {
        floatText(this, nx, ny - 20, `+1 ${ITEMS[e.rare].name} ✦`, PALETTE.neonAmber);
        sound.rareChime();
      }
    });

    room.onMessage(MSG.inventory, (sync: InventorySync) => gameState.applySync(sync));
    room.onMessage(MSG.prices, (sync: PricesSync) =>
      session.events.emit(SessionEvents.prices, sync),
    );
    room.onMessage(MSG.quests, (sync: QuestsSync) =>
      session.events.emit(SessionEvents.quests, sync),
    );
    room.onMessage(MSG.skills, (sync: SkillsSync) => gameState.applySkills(sync));
    room.onMessage(MSG.xpGain, (e: XpGainEvent) => {
      const own = this.sparks.get(room.sessionId);
      if (own !== undefined) {
        const label = e.skill.charAt(0).toUpperCase() + e.skill.slice(1);
        floatText(this, own.image.x + 26, own.image.y - 46, `+${e.amount} ${label}`, PALETTE.solarGreen);
      }
    });
    room.onMessage(MSG.chatMsg, (m: ChatBroadcast) => {
      session.events.emit(SessionEvents.chat, m);
      this.sparks.get(m.sessionId)?.showChatBubble(m.text);
    });
    room.onMessage(MSG.emote, (e: EmoteBroadcast) => {
      this.sparks.get(e.sessionId)?.playWave();
      session.events.emit(SessionEvents.notice, `${e.from} waves.`);
    });
    room.onMessage(MSG.notice, (n: NoticeEvent) =>
      session.events.emit(SessionEvents.notice, n.text),
    );

    // Direct trade: the window lives in the UI scene; route the flow there.
    room.onMessage(MSG.tradeAsk, (e: TradeAskEvent) =>
      session.events.emit(SessionEvents.tradeAsk, e),
    );
    room.onMessage(MSG.tradeSync, (e: TradeSyncEvent) =>
      session.events.emit(SessionEvents.tradeSync, e),
    );
    room.onMessage(MSG.tradeEnd, (e: TradeEndEvent) => {
      session.events.emit(SessionEvents.tradeEnd, e);
      session.events.emit(SessionEvents.notice, e.text);
    });
    room.onMessage(MSG.shopSync, (e: ShopSyncEvent) =>
      session.events.emit(SessionEvents.shopSync, e),
    );
    room.onMessage(MSG.chargeSync, (e: ChargeSyncEvent) =>
      session.events.emit(SessionEvents.chargeSync, e),
    );

    room.onLeave(() => {
      session.room = null;
      this.room = null;
      // U3e: an unexpected drop is not a shrug — flicker, then re-light.
      if (!this.expectLeave) this.reconnectFlow();
      this.expectLeave = false;
    });

    // Tram hops restart this scene while the HUD stays up — relaunching an
    // active scene would tear it down and strand its event subscriptions.
    if (!this.scene.isActive('ui')) this.scene.launch('ui');
  }

  /**
   * A fallen Spark's Scrapcache: rust chest + rose claim-beacon. Clicking
   * walks up and asks the server to reclaim (owner-only; it decides).
   */
  private addCache(id: string, c: CacheStateShape): void {
    const { x, y } = tileToWorld(c.tileX, c.tileY);
    const img = addVoxelSprite(this, 'scrapcache', x, y);
    img.setDepth(depthForWorldY(y));
    img.setInteractive({ useHandCursor: true });
    img.on(
      'pointerdown',
      (
        pointer: Phaser.Input.Pointer,
        _lx: number,
        _ly: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        if (!pointer.leftButtonDown() || this.room === null) return;
        event.stopPropagation();
        const me = this.sparks.get(this.room.sessionId);
        if (me === undefined) return;
        const d = Math.max(
          Math.abs(me.settledTile.x - c.tileX),
          Math.abs(me.settledTile.y - c.tileY),
        );
        if (d > 2) {
          const step = this.nearestAdjacentWalkable({ x: c.tileX, y: c.tileY }, me.settledTile);
          if (step !== null) send.move(this.room, step);
          return;
        }
        send.reclaim(this.room, { cacheId: id });
      },
    );
    const beacon = this.add.image(x, y - 30, 'fx-glow');
    beacon.setTint(PALETTE_INT.neonRose);
    beacon.setBlendMode(Phaser.BlendModes.ADD);
    beacon.setScale(0.09);
    beacon.setAlpha(bloom(0.7));
    beacon.setDepth(depthForWorldY(y) + 1);
    addFlicker(this, beacon, bloom(0.7), 0.12);
    img.setScale(img.scaleX, 0.01);
    this.tweens.add({ targets: img, scaleY: 0.5, duration: 240, ease: 'back.out' });
    this.cacheViews.set(id, [img, beacon]);
  }

  private removeCache(id: string): void {
    const parts = this.cacheViews.get(id);
    this.cacheViews.delete(id);
    if (parts === undefined) return;
    for (const part of parts) {
      this.tweens.add({
        targets: part,
        alpha: 0,
        duration: 400,
        onComplete: () => part.destroy(),
      });
    }
  }

  /** A placed Heatlamp: voxel post + flickering glow + its own pool. */
  private addLamp(id: string, l: LampStateShape): void {
    const { x, y } = tileToWorld(l.tileX, l.tileY);
    const anchorY = y + TILE_H / 2;
    const img = addVoxelSprite(this, 'heatlamp', x, anchorY);
    img.setDepth(depthForWorldY(anchorY));
    const glow = this.add.image(x, anchorY - 32, 'fx-glow');
    glow.setTint(PALETTE_INT.warmGlow);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setScale(0.12);
    glow.setAlpha(bloom(0.8));
    glow.setDepth(depthForWorldY(anchorY) + 1);
    addFlicker(this, glow, bloom(0.8), 0.09);
    const pool = this.addGroundPool(x, y, PALETTE_INT.warmGlow, 0.55);
    img.setScale(img.scaleX, 0.01);
    this.tweens.add({ targets: img, scaleY: 0.5, duration: 240, ease: 'back.out' });
    this.lampViews.set(id, [img, glow, pool]);
  }

  private removeLamp(id: string): void {
    const parts = this.lampViews.get(id);
    this.lampViews.delete(id);
    if (parts === undefined) return;
    for (const part of parts) {
      this.tweens.add({
        targets: part,
        alpha: 0,
        duration: 500,
        onComplete: () => part.destroy(),
      });
    }
  }

  /** Closest walkable tile adjacent to `target`, judged from `from`. */
  private nearestAdjacentWalkable(
    target: { x: number; y: number },
    from: { x: number; y: number },
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const t = { x: target.x + dx, y: target.y + dy };
      if (this.map.walkable[t.y]?.[t.x] !== true) continue;
      const d = Math.abs(t.x - from.x) + Math.abs(t.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** Combat feedback — the server decided everything; we act it out. */
  private handleCombatEvent(e: CombatEvent): void {
    const room = this.room;
    if (room === null) return;
    if (e.type === 'playerHit') {
      const mob = this.mobs.get(e.mobId);
      if (mob !== undefined) {
        mob.flashHit();
        floatText(this, mob.image.x, mob.image.y - 34, `-${e.damage}`, PALETTE.neonAmber);
        // Other Sparks' swings play too (own swing already played on click).
        if (e.bySessionId !== room.sessionId) {
          this.sparks.get(e.bySessionId)?.lungeToward(mob.image.x, mob.image.y);
        }
      }
      return;
    }
    if (e.type === 'mobDown') {
      const mob = this.mobs.get(e.mobId);
      if (mob !== undefined && e.bySessionId === room.sessionId) {
        floatText(this, mob.image.x, mob.image.y - 44, 'scrapped!', PALETTE.neonAmber);
      }
      return;
    }
    if (e.type === 'mobBite') {
      const spark = this.sparks.get(e.sessionId);
      const mob = this.mobs.get(e.mobId);
      if (mob !== undefined && spark !== undefined) {
        mob.lungeAt(spark.image.x, spark.image.y);
      }
      if (spark !== undefined) {
        spark.flashHurt();
        floatText(this, spark.image.x, spark.image.y - 64, `-${e.damage}`, PALETTE.neonRose);
      }
      if (e.sessionId === room.sessionId) {
        if (settings().shake) this.cameras.main.shake(110, 0.0035);
        sound.hurtThud();
      }
      return;
    }
    if (e.type === 'youDown') {
      session.events.emit(SessionEvents.deathRecap, e);
      return;
    }
    if (e.type === 'playerDown') {
      const spark = this.sparks.get(e.sessionId);
      const p = (
        room.state as { players: { get(id: string): PlayerStateShape | undefined } }
      ).players.get(e.sessionId);
      if (spark !== undefined && p !== undefined) {
        spark.stop();
        spark.snapTo({ x: p.tileX, y: p.tileY });
        // Arrive back at the Dynamo in a warm jolt of light.
        const jolt = this.add.image(spark.image.x, spark.image.y - 20, 'fx-glow');
        jolt.setTint(PALETTE_INT.warmGlow);
        jolt.setBlendMode(Phaser.BlendModes.ADD);
        jolt.setScale(0.1);
        jolt.setAlpha(0.9);
        jolt.setDepth(spark.image.depth + 2);
        this.tweens.add({
          targets: jolt,
          scale: 0.5,
          alpha: 0,
          duration: 600,
          ease: 'quad.out',
          onComplete: () => jolt.destroy(),
        });
      }
      if (e.sessionId === room.sessionId) {
        this.cameras.main.flash(260, 30, 22, 48);
      }
    }
  }

  // ── input ──────────────────────────────────────────────────────────────

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown() || this.room === null) return;
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const t = worldToTileFloor(world.x, world.y);
      if (this.map.walkable[t.ty]?.[t.tx] === true) {
        send.move(this.room, { x: t.tx, y: t.ty });
        this.gatherView.stop();
        this.pulseTile(t.tx, t.ty);
      }
    });
  }

  private spawnNodes(): void {
    const clickGuard = (
      handler: (pointer: Phaser.Input.Pointer) => void,
    ): ((
      pointer: Phaser.Input.Pointer,
      lx: number,
      ly: number,
      event: Phaser.Types.Input.EventData,
    ) => void) => {
      return (pointer, _lx, _ly, event) => {
        if (!pointer.leftButtonDown() || this.room === null) return;
        event.stopPropagation();
        handler(pointer);
      };
    };

    for (const n of this.map.nodes) {
      let view: NodeView;
      switch (n.kind) {
        case 'junkHeap': {
          const node = new JunkHeapNode(this, n.id, n.x, n.y, this.map.district === 'terrarium');
          node.glintImage.on(
            'pointerdown',
            clickGuard(() => {
              if (this.room === null) return;
              send.glintClick(this.room, { nodeId: node.id });
              node.flashGlintHit();
            }),
          );
          view = node;
          break;
        }
        case 'brassSeam': {
          const node = new BrassSeamNode(this, n.id, n.x, n.y);
          node.forkZones.forEach((fx, side) => {
            fx.on(
              'pointerdown',
              clickGuard(() => {
                if (this.room === null) return;
                send.nodeAction(this.room, {
                  nodeId: node.id,
                  action: 'forkPick',
                  side: side as 0 | 1,
                });
                node.hideFork();
              }),
            );
          });
          view = node;
          break;
        }
        case 'amperite': {
          const node = new AmperiteNode(this, n.id, n.x, n.y);
          view = node;
          break;
        }
        case 'glowkoi': {
          view = new KoiSpotNode(this, n.id, n.x, n.y);
          break;
        }
        case 'antenna': {
          view = new AntennaNode(this, n.id, n.x, n.y);
          break;
        }
      }

      // Main click: gather intent — or the kind's mid-session action.
      view.image.on(
        'pointerdown',
        clickGuard(() => {
          if (this.room === null) return;
          if (view instanceof AmperiteNode && this.activeSessionNode === view.id) {
            send.nodeAction(this.room, { nodeId: view.id, action: 'strike' });
            return;
          }
          if (view instanceof KoiSpotNode && this.activeSessionNode === view.id) {
            send.nodeAction(this.room, {
              nodeId: view.id,
              action: view.inTension ? 'reel' : 'cast',
            });
            return;
          }
          send.gather(this.room, { nodeId: view.id });
        }),
      );
      this.nodes.set(n.id, view);
    }
  }

  /** Node id of the session this client is currently working (UI routing). */
  private activeSessionNode: number | null = null;

  /** Open the creator ('first' = name + look; 'wardrobe' = look only). */
  private openCreator(mode: 'first' | 'wardrobe'): void {
    const identity = this.identity;
    if (identity === null || this.room === null) return;
    const room = this.room;
    this.creatorMode = mode;
    this.creator = showCreatorOverlay({
      scene: this,
      mode,
      currentCode: identity.appearance,
      currentName: identity.sparkName,
      owned: identity.owned,
      currentEquipped: identity.equipped,
      onConfirm: (code, name) => {
        send.appearance(room, name === undefined ? { code } : { code, name });
      },
      onWardrobe: (equipped) => {
        send.wardrobe(room, { equipped });
      },
      onCancel: () => {
        this.creator = null;
      },
    });
  }

  private handleNodeEvent(e: NodeEventPayload): void {
    const view = this.nodes.get(e.nodeId);
    if (view === undefined) return;
    switch (e.type) {
      case 'brassSegment': {
        this.activeSessionNode = e.nodeId;
        floatText(this, view.image.x, view.image.y - 64, `+${e.amount} vein…`, PALETTE.warmGlow);
        break;
      }
      case 'brassFork': {
        if (view instanceof BrassSeamNode) view.showFork(e.liveSide, e.cueSeconds);
        break;
      }
      case 'brassEnd': {
        if (view instanceof BrassSeamNode) view.hideFork();
        this.activeSessionNode = null;
        if (!e.completed && e.total > 0) {
          floatText(this, view.image.x, view.image.y - 80, 'the vein goes cold', PALETTE.neonRose);
        }
        break;
      }
      case 'amperiteStart': {
        this.activeSessionNode = e.nodeId;
        if (view instanceof AmperiteNode) view.startPulse(e.periodSeconds, e.phaseSeconds);
        floatText(this, view.image.x, view.image.y - 70, 'strike on the pulse!', PALETTE.neonCyan);
        break;
      }
      case 'amperiteStrike': {
        if (view instanceof AmperiteNode) {
          view.flashStrike(e.onPulse);
          if (!e.onPulse) {
            floatText(this, view.image.x, view.image.y - 60, 'lattice shatters…', PALETTE.neonRose);
          }
        }
        if (e.strikesLeft <= 0) {
          this.activeSessionNode = null;
          if (view instanceof AmperiteNode) view.stopPulse();
        }
        break;
      }
      case 'koiShadow': {
        this.activeSessionNode = e.nodeId;
        if (view instanceof KoiSpotNode) view.showShadow(e.sizeIdx, e.rare);
        floatText(this, view.image.x, view.image.y - 48, 'a shadow stirs — click to cast', PALETTE.neonCyan);
        break;
      }
      case 'koiTension': {
        if (view instanceof KoiSpotNode) {
          view.startTension(e.periodSeconds, e.sweetStart, e.sweetLen);
        }
        break;
      }
      case 'koiResult': {
        this.activeSessionNode = null;
        if (view instanceof KoiSpotNode) {
          view.stopTension();
          view.hideShadow();
          view.splash(e.caught);
          if (!e.caught) {
            floatText(this, view.image.x, view.image.y - 48, 'it slips away…', PALETTE.neonRose);
          }
        }
        break;
      }
      case 'tuneStart': {
        this.activeSessionNode = e.nodeId;
        this.tuner.start({
          nodeId: e.nodeId,
          seconds: e.seconds,
          phase: e.phase,
          driftSpeed: e.driftSpeed,
          amplitude: e.amplitude,
          tolerance: e.tolerance,
        });
        break;
      }
      case 'tuneResult': {
        this.activeSessionNode = null;
        this.tuner.stop();
        floatText(
          this,
          view.image.x,
          view.image.y - 96,
          `lock ${(e.lockRatio * 100).toFixed(0)}%`,
          e.lockRatio > 0.6 ? PALETTE.neonTeal : PALETTE.warmGlow,
        );
        break;
      }
    }
  }

  // ── presentation (unchanged from M0) ───────────────────────────────────

  /** neonTeal click feedback pulse at a tile. */
  private pulseTile(tx: number, ty: number): void {
    const { x, y } = tileToWorld(tx, ty);
    const pulse = this.add.image(x, y, 'tex-tile-pulse');
    pulse.setScale(TEX_SCALE * 0.55);
    pulse.setAlpha(0.85);
    pulse.setDepth(DEPTH_FLOOR + 2);
    this.tweens.add({
      targets: pulse,
      scale: TEX_SCALE * 1.05,
      alpha: 0,
      duration: 420,
      ease: 'quad.out',
      onComplete: () => pulse.destroy(),
    });
  }

  private updateHoverMarker(): void {
    if (this.hoverMarker === undefined || !this.hoverMarker.active) {
      this.hoverMarker = this.add.image(0, 0, 'tex-tile-marker');
      this.hoverMarker.setScale(TEX_SCALE);
      this.hoverMarker.setAlpha(0.4);
      this.hoverMarker.setVisible(false);
      this.hoverMarker.setDepth(DEPTH_FLOOR + 1);
    }
    if (this.photoMode !== null) {
      this.hoverMarker.setVisible(false);
      return;
    }
    const pointer = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const { tx, ty } = worldToTileFloor(world.x, world.y);
    if (this.map.walkable[ty]?.[tx] === true) {
      const { x, y } = tileToWorld(tx, ty);
      this.hoverMarker.setPosition(x, y);
      this.hoverMarker.setVisible(true);
    } else {
      this.hoverMarker.setVisible(false);
    }
  }

  /**
   * The whole floor is one static Graphics: adjacent diamonds share exact
   * vertices in a single geometry, so there can be no seams at any zoom, and
   * it stays a single draw call.
   */
  private drawFloor(): void {
    const { size, plaza } = this.map;
    const g = this.add.graphics();
    g.setDepth(DEPTH_FLOOR + 1); // curbs/lip/sheen ride above the baked tiles
    const rng: Rng = makeRng(CONFIG.map.seed ^ 0x5eed);

    // Where lamplight lands (tile coords) — the wet glaze catches it there.
    // §B9 light discipline: every sheen spot maps to a REAL glow source.
    const lightSpots: Array<{ x: number; y: number; cool: boolean }> = [];
    for (const p of this.map.props) {
      if (p.kind === 'dynamo') lightSpots.push({ x: p.x + 1.5, y: p.y + 1.5, cool: false });
      if (p.kind === 'stall') lightSpots.push({ x: p.x + 1, y: p.y + 2, cool: false });
      if (p.kind === 'shack') lightSpots.push({ x: p.x, y: p.y + 2, cool: false });
      if (p.kind === 'alleylamp') lightSpots.push({ x: p.x, y: p.y, cool: false });
      if (p.kind === 'merchant') lightSpots.push({ x: p.x, y: p.y, cool: false });
      if (p.kind === 'tinkerbench') lightSpots.push({ x: p.x, y: p.y, cool: true });
      if (p.kind === 'tramgate') lightSpots.push({ x: p.x - 1, y: p.y + 2, cool: false });
    }
    for (const n of this.map.nodes) {
      // Antennas keep an always-on beacon + pool; koi spots glow only while
      // a shadow drifts in, so they don't count as standing light (§3).
      if (n.kind === 'antenna') lightSpots.push({ x: n.x, y: n.y, cool: true });
    }
    // Rug tiles: the row in front of each stall counter (floor-fix §1).
    const rugTiles = new Map<number, number>(); // tileKey -> stall variant
    for (const p of this.map.props) {
      if (p.kind !== 'stall') continue;
      for (let dx = 0; dx < p.w; dx++) {
        rugTiles.set((p.y + p.h) * size + (p.x + dx), p.variant);
      }
    }

    const nearestLight = (tx: number, ty: number) => {
      let best = Infinity;
      let cool = false;
      for (const sp of lightSpots) {
        const d = Math.max(Math.abs(sp.x - tx), Math.abs(sp.y - ty));
        if (d < best) {
          best = d;
          cool = sp.cool;
        }
      }
      return { d: best, cool };
    };

    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const { x, y } = tileToWorld(tx, ty);
        const plazaDist = Math.max(Math.abs(tx - plaza.cx), Math.abs(ty - plaza.cy));

        // Curb lips where walkable plating meets the coolant channel.
        if (this.map.canal[ty]?.[tx] !== true) {
          const curb = (x1: number, y1: number, x2: number, y2: number) => {
            g.lineStyle(2.5, mixPalette('structureMid', 'groundAccent', 0.35), 0.95);
            g.lineBetween(x1, y1, x2, y2);
            g.lineStyle(1.5, mixPalette('duskSky', 'ink', 0.4), 0.9);
            g.lineBetween(x1 + (y2 > y1 ? 2 : -2), y1 + 2, x2 + (y2 > y1 ? 2 : -2), y2 + 2);
          };
          if (this.map.canal[ty]?.[tx + 1] === true) curb(x, y - TILE_H / 2, x + TILE_W / 2, y);
          if (this.map.canal[ty]?.[tx - 1] === true) curb(x - TILE_W / 2, y, x, y + TILE_H / 2);
          if (this.map.canal[ty + 1]?.[tx] === true) curb(x, y + TILE_H / 2, x + TILE_W / 2, y);
          if (this.map.canal[ty - 1]?.[tx] === true) curb(x - TILE_W / 2, y, x, y - TILE_H / 2);
        }

        // Coolant canal: baked coolant tiles (the one zone that stays dark).
        if (this.map.canal[ty]?.[tx] === true) {
          const tile = this.add.image(x, y, floorTileKey('coolant', (tx * 7 + ty * 13) | 0));
          tile.setScale(floorTileScale());
          tile.setDepth(DEPTH_FLOOR);
          continue;
        }

        // Floor-fix §1: per-tile baked diamonds — the zone material changes
        // read the district layout; no drawn gridlines anywhere. The Tangle
        // keeps only the industrial zones: plating fringe, asphalt maze.
        const isTangle = this.map.district === 'tangle';
        const inLane = !isTangle && ty >= 19 && ty <= 21 && tx >= 27 && tx <= 36;
        const onBoardwalk =
          !isTangle && tx === 6 && ty >= CONFIG.canal.yMin && ty <= CONFIG.canal.yMax;
        const inPlaza = plaza.radius > 0 && plazaDist <= plaza.radius;
        const onStepRing = plaza.radius > 0 && plazaDist === plaza.radius;
        const distToEdgeT = Math.min(tx, ty, size - 1 - tx, size - 1 - ty);
        const rugVariant = rugTiles.get(ty * size + tx);
        let kind: FloorKind;
        let seed = (tx * 31 + ty * 17) | 0;
        if (rugVariant !== undefined) {
          kind = 'rug';
          seed = rugVariant;
        } else if (this.map.district === 'terrarium') {
          // D2: the garden tier is WARM WOOD underfoot (§12B) — decked
          // terraces, plated entry apron, never asphalt, never lawn.
          kind = (this.map.elevation[ty]?.[tx] ?? 0) > 0 ? 'deck' : 'plating';
        } else if (inLane || onBoardwalk) kind = 'deck';
        else if (onStepRing) kind = 'paverLight';
        else if (inPlaza) kind = 'paver';
        else if (distToEdgeT <= 6 || (!isTangle && tx >= 27 && ty >= 28)) kind = 'plating';
        else kind = 'asphalt';
        const tile = this.add.image(x, y, floorTileKey(kind, seed));
        tile.setScale(floorTileScale());
        tile.setDepth(DEPTH_FLOOR);

        // Platform edge faces (R4b): where this tile stands above its two
        // screen-front neighbors, drop a material face to their level and
        // throw a shadow band onto the lower ground.
        {
          const e = this.map.elevation[ty]?.[tx] ?? 0;
          const drawFace = (
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            drop: number,
            color: number,
          ) => {
            g.fillStyle(color, 1);
            g.beginPath();
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);
            g.lineTo(x2, y2 + drop);
            g.lineTo(x1, y1 + drop);
            g.closePath();
            g.fillPath();
            // Concrete lip on the exposed top edge.
            g.lineStyle(2, this.lerpColor(color, PALETTE_INT.warmGlow, 0.28), 0.8);
            g.lineBetween(x1, y1, x2, y2);
            // Shade at the foot of the face.
            g.fillStyle(PALETTE_INT.ink, 0.3);
            g.beginPath();
            g.moveTo(x1, y1 + drop);
            g.lineTo(x2, y2 + drop);
            g.lineTo(x2, y2 + drop + 5);
            g.lineTo(x1, y1 + drop + 5);
            g.closePath();
            g.fillPath();
          };
          // D1 the Stacks: deep drops are BUILDING WALLS — window bands
          // turn a plateau face into a lit facade (the Roofline's towers).
          const drawFacadeWindows = (
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            drop: number,
          ) => {
            if (this.map.district !== 'stacks' || drop < ELEV_PX * 2) return;
            for (let row = 8; row < drop - 4; row += 9) {
              for (const t of [0.3, 0.7]) {
                const wx = x1 + (x2 - x1) * t;
                const wy = y1 + (y2 - y1) * t + row;
                const lit = ((tx * 7 + ty * 13 + row) & 3) !== 0;
                g.fillStyle(
                  lit
                    ? mixPalette('warmGlow', 'neonAmber', 0.3)
                    : mixPalette('ink', 'structureMid', 0.4),
                  lit ? 0.9 : 0.8,
                );
                g.fillRect(wx - 1.5, wy, 3, 4);
              }
            }
          };
          const eSE = this.map.elevation[ty]?.[tx + 1];
          if (eSE !== undefined && eSE < e) {
            drawFace(
              x, y + TILE_H / 2, x + TILE_W / 2, y,
              (e - eSE) * ELEV_PX,
              this.lerpColor(MATERIAL_INT.concreteDeep, PALETTE_INT.ink, 0.3),
            );
            drawFacadeWindows(x, y + TILE_H / 2, x + TILE_W / 2, y, (e - eSE) * ELEV_PX);
          }
          const eSW = this.map.elevation[ty + 1]?.[tx];
          if (eSW !== undefined && eSW < e) {
            drawFace(
              x - TILE_W / 2, y, x, y + TILE_H / 2,
              (e - eSW) * ELEV_PX,
              MATERIAL_INT.concreteDeep,
            );
            drawFacadeWindows(x - TILE_W / 2, y, x, y + TILE_H / 2, (e - eSW) * ELEV_PX);
          }
        }

        // Step-ring lip: a bright leading edge + shadow line under it.
        if (onStepRing) {
          g.lineStyle(1.6, this.lerpColor(MATERIAL_INT.concrete, PALETTE_INT.warmGlow, 0.22), 0.5);
          g.lineBetween(x - TILE_W / 2, y, x, y + TILE_H / 2);
          g.lineBetween(x, y + TILE_H / 2, x + TILE_W / 2, y);
          g.lineStyle(1.2, PALETTE_INT.ink, 0.5);
          g.lineBetween(x - TILE_W / 2 + 2, y + 3, x, y + TILE_H / 2 + 3);
          g.lineBetween(x, y + TILE_H / 2 + 3, x + TILE_W / 2 - 2, y + 3);
        }

        // Stains: quiet dark blotches, denser off the lit paths.
        if (!inLane && !onBoardwalk && rng() < (inPlaza ? 0.03 : 0.05)) {
          g.fillStyle(this.lerpColor(MATERIAL_INT.concreteDeep, PALETTE_INT.ink, 0.55), 0.22);
          g.fillEllipse(x - 8 + rng() * 16, y - 4 + rng() * 8, 10 + rng() * 12, 5 + rng() * 5);
        }

        // No grid strokes — the floor reads through shading variation only
        // (ART-DIRECTION §7: kill visual noise; grid lines read as noise).

        // Wet-sheen glaze — now visibly catching the lamplight pools:
        // bright warm streaks inside pool range, near-nothing in the dark.
        {
          const light = nearestLight(tx, ty);
          const inPool = light.d <= 2.5;
          if (rng() < (inPool ? 0.5 : 0.02)) {
            const sheen = inPool
              ? light.cool
                ? mixPalette('neonCyan', 'duskSky', 0.45)
                : mixPalette('warmGlow', 'duskSky', 0.3)
              : mixPalette('groundBase', 'duskSky', 0.55);
            g.lineStyle(1.5, sheen, inPool ? 0.2 + rng() * 0.12 : 0.05);
            const sx = x - 10 + rng() * 8;
            const sy = y - 3 + rng() * 6;
            g.lineBetween(sx, sy, sx + 14, sy - 5);
          }

          // Puddles (R5b): sparse decals near real lights that mirror-smear
          // the light's hue — a flipped gradient blob under a dark glaze.
          if (
            this.puddleCount < 24 &&
            !inLane &&
            rugVariant === undefined &&
            kind !== 'deck' &&
            light.d <= 3.5 &&
            this.map.walkable[ty]?.[tx] === true &&
            rng() < 0.07
          ) {
            this.puddleCount += 1;
            const px = x - 8 + rng() * 16;
            const py = y - 3 + rng() * 6;
            g.fillStyle(mixPalette('ink', 'duskSky', 0.35), 0.42);
            g.fillEllipse(px, py, 22 + rng() * 14, 9 + rng() * 5);
            const smearTint = light.cool ? PALETTE_INT.neonCyan : PALETTE_INT.neonAmber;
            const smear = this.add.image(px, py + 3, 'fx-glow');
            smear.setTint(smearTint);
            smear.setBlendMode(Phaser.BlendModes.ADD);
            smear.setScale(0.055, 0.2);
            smear.setFlipY(true);
            smear.setAlpha(0.22);
            smear.setDepth(DEPTH_FLOOR + 4);
            // Neon shimmer on the wet surface (R5d).
            this.tweens.add({
              targets: smear,
              alpha: { from: 0.15, to: 0.28 },
              scaleX: { from: 0.05, to: 0.062 },
              duration: 1700 + rng() * 900,
              yoyo: true,
              repeat: -1,
              ease: 'sine.inout',
            });
          }
        }

      }
    }

    // WALL SHADOWS (R1c): tiles butting a tall structure on the light-away
    // side sit in its ambient shade, and corridor floors squeezed between
    // two walls darken further — the crisp baked cast shadows layer on top.
    this.drawWallShadows();

    // THE VOID (§B5, amended by G6b): the map ENDS, it doesn't fade. The
    // deck stays readable out to the rim — only a mild dimming settles on
    // the outermost rows; the darkness lives BELOW the deck (the rim's
    // under-structure), never at street level.
    const voidG = this.add.graphics();
    voidG.setDepth(DEPTH_FLOOR + 2);
    const FADE = 3;
    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const distToEdge = Math.min(tx, ty, size - 1 - tx, size - 1 - ty);
        if (distToEdge >= FADE) continue;
        const a = Math.pow((FADE - distToEdge) / FADE, 1.6) * 0.45;
        const { x, y } = tileToWorld(tx, ty);
        voidG.fillStyle(MATERIAL_INT.voidBlack, a);
        this.traceDiamond(voidG, x, y);
        voidG.fillPath();
      }
    }
  }

  /**
   * G6b WORLD EDGES: the city is built on the plant's decking, and the
   * deck visibly ENDS. The two camera-facing borders carry a deck-edge
   * rim (dark metal lip, exposed girders, occasional hazard striping),
   * support trusses descending into the dark BELOW the city, and a few
   * rim lamps so the edge itself is faintly lit. District character per
   * brief: the Tangle's rim is torn open in places, the Filament rails
   * its promenade, the Terrarium spills vines over a wood overhang. Tram
   * trestles march off-map from every gate — the line crosses the void
   * on visible bridgework.
   */
  private placeWorldRim(): void {
    const size = this.map.size;
    const d = this.map.district;
    const place = (name: string, tx: number, ty: number, depthOff: number): void => {
      const w = tileToWorld(tx, ty);
      const img = addVoxelSprite(this, name, w.x, w.y);
      const wt = worldSpriteTint();
      if (wt !== null) img.setTint(wt);
      img.setDepth(depthForWorldY(w.y) + depthOff);
    };
    const lookFor = (i: number, edge: number): string => {
      const o = edge === 0 ? 'y' : 'x';
      const h = ((i * 31 + edge * 17 + size * 7) % 100) / 100;
      if (d === 'tangle' && h < 0.28) return `rim-broken-${o}`;
      if (d === 'terrarium' && i % 3 === 1) return `rim-garden-${o}`;
      if (h > 0.55 && h < 0.67) return `rim-hazard-${o}`;
      return `rim-metal-${o}-${(i * 7 + edge * 13) % 3}`;
    };
    for (let i = 0; i < size; i++) {
      // Camera-facing edges: the full rim treatment.
      place(lookFor(i, 0), size - 1, i, -2);
      place(lookFor(i, 1), i, size - 1, -2);
      if (i % 6 === 3) {
        place('rimtruss', size - 1, i, -3);
        place('rimtruss', i, size - 1, -3);
      }
      // The Filament: promenade rails where the market meets the void.
      if (d === 'filament' && i % 2 === 0 && i > 1 && i < size - 2) {
        place('guardrail-1', size - 1, i, -1);
        place('guardrail-0', i, size - 1, -1);
      }
      // Rim lamps — a handful, so the edge reads at distance.
      if (i % 9 === 4) {
        for (const [tx, ty] of [
          [size - 1, i],
          [i, size - 1],
        ] as const) {
          const w = tileToWorld(tx, ty);
          addLayeredGlow(
            this,
            w.x,
            w.y + 10,
            PALETTE_INT.warmGlow,
            0.22,
            depthForWorldY(w.y) - 1,
            0.28,
          );
        }
      }
      // Far edges: the low curb lip — the deck ends behind the city too.
      place('rimlip-y', 0, i, -2);
      place('rimlip-x', i, 0, -2);
    }
    // Tram trestles: the line leaves the deck on visible bridgework.
    const gate = this.map.props.find((p) => p.kind === 'tramgate');
    if (gate !== undefined) {
      const east = gate.x > size / 2;
      const gy = gate.y + Math.floor(gate.h / 2);
      for (let k = 1; k <= 3; k++) {
        place('trestle-x', east ? size - 1 + k : -k, gy, -2);
      }
    }
  }

  /** Approximate structure heights (voxels) for the ambient shade pass. */
  private static readonly PROP_HEIGHT_VOX: Partial<Record<Prop['kind'], number>> = {
    dynamo: 52,
    shack: 15,
    stall: 14,
    tramgate: 28,
    block: 6,
    crate: 4,
    merchant: 10,
    alleylamp: 8,
    stack: 16,
    cranehulk: 44,
    deadmachine: 10,
    pylon: 12,
  };

  /**
   * Ambient wall shade (R1c): the key light comes from screen top-left
   * (tile −x-ish), so floor tiles with a tall neighbor on that side sit in
   * shade; corridors walled on both sides pool extra darkness.
   */
  private drawWallShadows(): void {
    const { size } = this.map;
    const heights: number[][] = Array.from({ length: size }, () => Array<number>(size).fill(0));
    const stamp = (x: number, y: number, w: number, h: number, hv: number) => {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const row = heights[y + dy];
          if (row !== undefined && row[x + dx] !== undefined) {
            row[x + dx] = Math.max(row[x + dx] as number, hv);
          }
        }
      }
    };
    for (const p of this.map.props) {
      const hv = WorldScene.PROP_HEIGHT_VOX[p.kind];
      if (hv !== undefined) stamp(p.x, p.y, p.w, p.h, hv);
    }
    for (const n of this.map.nodes) {
      if (n.kind === 'antenna') stamp(n.x, n.y, 1, 1, 28);
    }

    const tallAt = (tx: number, ty: number, min = 10): boolean =>
      (heights[ty]?.[tx] ?? 0) >= min;
    const g = this.add.graphics();
    g.setDepth(DEPTH_SHADOW - 1);
    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        if ((heights[ty]?.[tx] ?? 0) > 0) continue; // structures shade themselves
        if (this.map.canal[ty]?.[tx] === true) continue;
        let a = 0;
        // Light-away side: a tall wall to the tile's −x (and the diagonal).
        if (tallAt(tx - 1, ty)) a += 0.18;
        else if (tallAt(tx - 2, ty)) a += 0.09;
        if (tallAt(tx - 1, ty - 1)) a += 0.07;
        // Corridor squeeze: walls on both flanks pool ambient darkness.
        if (tallAt(tx - 1, ty, 6) && tallAt(tx + 1, ty, 6)) a += 0.11;
        if (tallAt(tx, ty - 1, 6) && tallAt(tx, ty + 1, 6)) a += 0.11;
        if (a <= 0) continue;
        const { x, y } = tileToWorld(tx, ty);
        g.fillStyle(PALETTE_INT.ink, Math.min(0.32, a));
        this.traceDiamond(g, x, y);
        g.fillPath();
      }
    }
  }

  /** Plain integer color lerp for material/palette blends in the floor. */
  private lerpColor(a: number, b: number, t: number): number {
    const clamp = Math.max(0, Math.min(1, t));
    const mix = (sa: number, sb: number) => Math.round(sa + (sb - sa) * clamp);
    const r = mix((a >> 16) & 0xff, (b >> 16) & 0xff);
    const gc = mix((a >> 8) & 0xff, (b >> 8) & 0xff);
    const bl = mix(a & 0xff, b & 0xff);
    return (r << 16) | (gc << 8) | bl;
  }

  private traceDiamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    g.beginPath();
    g.moveTo(cx, cy - TILE_H / 2);
    g.lineTo(cx + TILE_W / 2, cy);
    g.lineTo(cx, cy + TILE_H / 2);
    g.lineTo(cx - TILE_W / 2, cy);
    g.closePath();
  }

  /**
   * Warm pool of lamplight on the ground (style B/C: the dark street reads
   * through what the lamps claim back).
   */
  private addGroundPool(
    x: number,
    y: number,
    tint: number,
    scale: number,
  ): Phaser.GameObjects.Image {
    const pool = this.add.image(x, y, 'fx-glow');
    pool.setTint(tint);
    pool.setBlendMode(Phaser.BlendModes.ADD);
    pool.setScale(scale, scale * 0.42);
    pool.setAlpha(0.24);
    pool.setDepth(DEPTH_FLOOR + 4);
    return pool;
  }

  /** Anchor world position for a prop: bottom corner of its footprint. */
  private propAnchor(p: Prop): { x: number; y: number } {
    const nw = tileToWorld(p.x, p.y);
    const se = tileToWorld(p.x + p.w - 1, p.y + p.h - 1);
    return { x: (nw.x + se.x) / 2, y: se.y + TILE_H / 2 };
  }

  /**
   * An occupied stall's public face: the owner's name shingle over the
   * awning and up to three stocked goods as tiny props on the counter.
   * Rebuilt whenever the synced StallState changes.
   */
  private renderStallFront(stallId: number, s: StallStateShape): void {
    this.stallFronts.get(stallId)?.destroy();
    this.stallFronts.delete(stallId);
    const spot = this.map.shopStalls.find((sp) => sp.id === stallId);
    if (spot === undefined || s.ownerName === '') return;
    const { x, y } = this.propAnchor({ kind: 'stall', ...spot, variant: 0 });
    const parts: Phaser.GameObjects.GameObject[] = [];
    const shingle = this.add.text(x, y - 96, s.ownerName, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: PALETTE.warmGlow,
      backgroundColor: PALETTE.ink,
      padding: { x: 5, y: 2 },
    });
    shingle.setOrigin(0.5, 1);
    shingle.setAlpha(0.92);
    shingle.setDepth(depthForWorldY(y) + 2);
    parts.push(shingle);
    const goods = s.goods === '' ? [] : s.goods.split(',');
    goods.slice(0, 3).forEach((itemId, i) => {
      const def = ITEMS[itemId as keyof typeof ITEMS];
      if (def === undefined) return;
      const icon = this.add.image(x - 16 + i * 16, y - 40, itemThumbKey(def));
      icon.setDisplaySize(14, 14);
      if (def.iconTint !== undefined) icon.setTint(PALETTE_INT[def.iconTint as keyof typeof PALETTE_INT]);
      icon.setDepth(depthForWorldY(y) + 2);
      parts.push(icon);
    });
    this.stallFronts.set(stallId, { destroy: () => parts.forEach((p) => p.destroy()) });
  }

  private placeProps(): void {
    let stallSeq = 0;
    // V1: the common props pick their look per position — hash-seeded,
    // adjacency-guarded, so no two identical models sit next to each other.
    const looks = new VariantPicker();
    for (const p of this.map.props) {
      const { x, y } = this.propAnchor(p);
      switch (p.kind) {
        case 'dynamo': {
          this.dynamoWorld = { x, y: y - 90 };
          this.propSprite('dynamo', x, y);
          // Crown halo — the biggest, SOFTEST instance of the glow language
          // (addendum b): hot core + hue bloom + wide skirt, all amber.
          // Biggest and SOFTEST: wide skirt, restrained core — the coil
          // bakes supply the hot metal; the glow must never white them out.
          const halo = addLayeredGlow(
            this,
            x,
            y - 160,
            PALETTE_INT.neonAmber,
            1.5,
            depthForWorldY(y) + 1,
            0.38,
          );
          this.tweens.add({
            targets: [halo.mid, halo.outer],
            alpha: { from: bloom(0.28), to: bloom(0.44) },
            duration: 2200,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inout',
          });
          // Coil-ring blooms aligned to the baked rings.
          [-52, -92, -132].forEach((dy, i) => {
            const coil = this.add.image(x, y + dy, 'fx-glow');
            coil.setTint(PALETTE_INT.neonAmber);
            coil.setBlendMode(Phaser.BlendModes.ADD);
            coil.setAlpha(bloom(0.5));
            coil.setScale(0.5, 0.2);
            coil.setDepth(depthForWorldY(y) + 2);
            this.tweens.add({
              targets: coil,
              alpha: { from: bloom(0.38), to: bloom(0.58) },
              duration: 1500,
              delay: i * 380,
              yoyo: true,
              repeat: -1,
              ease: 'sine.inout',
            });
          });
          // Teal beacon glint on the cap (layered mini-glow, own hue).
          addLayeredGlow(this, x, y - 210, PALETTE_INT.neonTeal, 0.12, depthForWorldY(y) + 2);
          // God-rays (R5a): soft shafts fanning from the crown.
          addGodRays(this, x, y - 190, depthForWorldY(y) + 1);
          const pool = this.addGroundPool(x, y - 6, PALETTE_INT.warmGlow, 1.9);
          this.placeDynamoCables(x, y);
          // Embers boiling off the coil housing.
          addEmberMotes(this, x, y - 70, depthForWorldY(y) + 3, {
            count: 8,
            radius: 56,
            rise: 110,
          });
          // A slow charge-mote orbiting the coil stack: dimmer and smaller on
          // the far side so the circuit reads in iso.
          const orbiter = this.add.image(x, y - 92, 'fx-glow');
          orbiter.setTint(PALETTE_INT.neonAmber);
          orbiter.setBlendMode(Phaser.BlendModes.ADD);
          orbiter.setDepth(depthForWorldY(y) + 2);
          const orbit = { theta: 0 };
          this.tweens.add({
            targets: orbit,
            theta: Math.PI * 2,
            duration: 6400,
            repeat: -1,
            ease: 'linear',
            onUpdate: () => {
              const front = Math.sin(orbit.theta) > 0 ? 1 : 0;
              orbiter.setPosition(
                x + Math.cos(orbit.theta) * 52,
                y - 92 + Math.sin(orbit.theta) * 24,
              );
              orbiter.setAlpha(bloom(front === 1 ? 0.5 : 0.16));
              orbiter.setScale(front === 1 ? 0.11 : 0.08);
            },
          });
          // Heartbeat: every few seconds a deep pulse brightens the pool and
          // rolls a soft ring of light out across the decking.
          this.time.addEvent({
            delay: 7200,
            loop: true,
            callback: () => {
              this.tweens.add({
                targets: pool,
                alpha: 0.42,
                duration: 520,
                yoyo: true,
                ease: 'sine.inout',
              });
              const wave = this.add.image(x, y - 6, 'fx-glow');
              wave.setTint(PALETTE_INT.warmGlow);
              wave.setBlendMode(Phaser.BlendModes.ADD);
              wave.setScale(0.5, 0.5 * 0.42);
              wave.setAlpha(0.3);
              wave.setDepth(DEPTH_FLOOR + 5);
              this.tweens.add({
                targets: wave,
                scaleX: 3.1,
                scaleY: 3.1 * 0.42,
                alpha: 0,
                duration: 1350,
                ease: 'quad.out',
                onComplete: () => wave.destroy(),
              });
            },
          });
          break;
        }
        case 'stall': {
          if (this.stallsWorld.x === 0) this.stallsWorld = { x, y };
          const img = this.propSprite(`stall-${p.variant % 4}`, x, y);
          // Every lane stall is a rentable player pitch: click to browse
          // (the server answers with the stall's detail panel).
          const stallId = stallSeq++;
          img.setInteractive({ useHandCursor: true });
          img.on(
            'pointerdown',
            (
              pointer: Phaser.Input.Pointer,
              _lx: number,
              _ly: number,
              event: Phaser.Types.Input.EventData,
            ) => {
              if (!pointer.leftButtonDown() || this.room === null) return;
              event.stopPropagation();
              const me = this.sparks.get(this.room.sessionId);
              if (me === undefined) return;
              const d = Math.max(
                Math.abs(me.settledTile.x - p.x),
                Math.abs(me.settledTile.y - p.y),
              );
              if (d > CONFIG.economy.shops.reachTiles) {
                floatText(this, img.x, img.y - 70, 'step up to the stall', PALETTE.warmGlow);
                const step = this.nearestAdjacentWalkable({ x: p.x, y: p.y }, me.settledTile);
                if (step !== null) send.move(this.room, step);
                return;
              }
              send.shop(this.room, { action: 'browse', stallId });
            },
          );
          // Lantern glow on the baked lantern voxel (right post, mid-height)
          // — layered core + hue bloom (addendum b).
          const lanternTint = p.variant % 2 === 0 ? PALETTE_INT.neonAmber : PALETTE_INT.neonRose;
          const lantern = addLayeredGlow(this, x + 34, y - 58, lanternTint, 0.14, depthForWorldY(y) + 1);
          addFlicker(this, lantern.mid, bloom(0.5), 0.1);
          addEmberMotes(this, x + 34, y - 52, depthForWorldY(y) + 2, {
            count: 2,
            radius: 8,
            rise: 34,
            tint: p.variant % 2 === 0 ? PALETTE_INT.neonAmber : PALETTE_INT.neonRose,
          });
          // Sign glyph glow (left of center, under the awning) — color per
          // stall so the lit lane reads as a run of different shops (§B9).
          const signTints = [
            PALETTE_INT.neonAmber,
            PALETTE_INT.neonRose,
            PALETTE_INT.neonCyan,
            PALETTE_INT.warmGlow,
          ];
          const sign = this.add.image(x - 6, y - 62, 'fx-glow');
          sign.setTint(signTints[p.variant % 4] as number);
          sign.setAlpha(bloom(0.55));
          sign.setScale(0.07);
          sign.setBlendMode(Phaser.BlendModes.ADD);
          sign.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, sign, bloom(0.55), 0.07);
          this.addGroundPool(x + 10, y - 4, PALETTE_INT.neonAmber, 0.38);
          // A kettle steaming on the counter — night-market food smell.
          addSteamVent(this, x - 8, y - 34, depthForWorldY(y) + 2, {
            periodMs: 1100 + p.variant * 240,
          });
          break;
        }
        case 'crate': {
          this.propSprite(`crate-${looks.pick('crate', p.x, p.y, 4)}`, x, y);
          break;
        }
        // I6 vignette props: variants pick the sub-style bake.
        case 'cablespool':
        case 'barrels':
        case 'pallets':
        case 'gascans':
        case 'tarp':
        case 'scrapbin': {
          this.propSprite(`${p.kind}-${p.variant % 2}`, x, y);
          break;
        }
        // V2 shape vocabulary — fabric / organic families (picker-pooled).
        case 'canopy':
        case 'banner':
        case 'wildbush': {
          this.propSprite(`${p.kind}-${looks.pick(p.kind, p.x, p.y, 3)}`, x, y);
          break;
        }
        case 'laundry':
        case 'vinewall': {
          this.propSprite(`${p.kind}-${p.variant % 2}`, x, y);
          break;
        }
        // V2 tall/thin — the signpost's junction lamp gets its glow.
        case 'signpost': {
          this.propSprite(`signpost-${p.variant % 2}`, x, y);
          const lamp = addLayeredGlow(this, x, y - 86, PALETTE_INT.neonAmber, 0.3, depthForWorldY(y) + 1, 0.35);
          addFlicker(this, lamp.core, 0.55, 0.18);
          break;
        }
        // V2 tall/thin — the stovepipe breathes (steam is life, §12A).
        case 'stovepipe': {
          this.propSprite(`stovepipe-${p.variant % 2}`, x, y);
          addSteamVent(this, x + 2, y - (p.variant % 2 === 0 ? 76 : 64), depthForWorldY(y) + 2, {
            periodMs: 1700,
            drift: 10,
          });
          // The ember slit smoulders.
          const ember = this.add.image(x - 2, y - 10, 'fx-glow');
          ember.setTint(PALETTE_INT.emberOrange);
          ember.setBlendMode(Phaser.BlendModes.ADD);
          ember.setScale(0.16);
          ember.setAlpha(bloom(0.4));
          ember.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, ember, 0.4, 0.22);
          break;
        }
        // V4 unique set pieces — each dressed with its own light and life.
        case 'griddle': {
          this.propSprite('griddle', x, y);
          // The pot steams; the lantern bar spills warmth over the stools.
          addSteamVent(this, x + 22, y - 34, depthForWorldY(y) + 2, { periodMs: 1100, drift: 12 });
          const lantern = addLayeredGlow(this, x - 4, y - 46, PALETTE_INT.warmGlow, 0.5, depthForWorldY(y) + 1, 0.4);
          addFlicker(this, lantern.core, 0.6, 0.1);
          this.addGroundPool(x, y - 4, PALETTE_INT.warmGlow, 0.55);
          const ember = this.add.image(x + 18, y - 12, 'fx-glow');
          ember.setTint(PALETTE_INT.emberOrange);
          ember.setBlendMode(Phaser.BlendModes.ADD);
          ember.setScale(0.14);
          ember.setAlpha(bloom(0.4));
          ember.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, ember, 0.4, 0.2);
          break;
        }
        case 'tramcar': {
          this.propSprite('tramcar', x, y);
          // One squatter-lit window + the route chip's last cyan breath.
          const win = this.add.image(x + 4, y - 34, 'fx-glow');
          win.setTint(PALETTE_INT.warmGlow);
          win.setBlendMode(Phaser.BlendModes.ADD);
          win.setScale(0.09);
          win.setAlpha(bloom(0.42));
          win.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, win, bloom(0.42), 0.06);
          const chip = this.add.image(x - 52, y - 40, 'fx-glow');
          chip.setTint(PALETTE_INT.neonCyan);
          chip.setBlendMode(Phaser.BlendModes.ADD);
          chip.setScale(0.05);
          chip.setAlpha(bloom(0.4));
          chip.setDepth(depthForWorldY(y) + 1);
          addBadFlicker(this, chip, bloom(0.4)); // dying, honestly
          break;
        }
        case 'fountain': {
          this.propSprite('fountain', x, y);
          // Coolant sheen: a soft teal breath over the pool.
          const sheen = addLayeredGlow(this, x, y - 20, PALETTE_INT.neonTeal, 0.42, depthForWorldY(y) + 1, 0.3);
          this.tweens.add({
            targets: [sheen.mid, sheen.outer],
            alpha: { from: bloom(0.2), to: bloom(0.36) },
            duration: 1900,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inout',
          });
          this.addGroundPool(x, y - 2, PALETTE_INT.neonTeal, 0.3);
          break;
        }
        case 'draymule': {
          this.propSprite('draymule', x, y);
          // The rigged work light burns amber over the open panel.
          const work = addLayeredGlow(this, x + 30, y - 40, PALETTE_INT.neonAmber, 0.4, depthForWorldY(y) + 1, 0.4);
          addFlicker(this, work.core, 0.6, 0.14);
          this.addGroundPool(x + 22, y - 2, PALETTE_INT.neonAmber, 0.4);
          break;
        }
        case 'spill': {
          this.propSprite('spill', x, y);
          break;
        }
        // V5: rim rails on the overlook (and anywhere a drop needs one).
        case 'guardrail': {
          this.propSprite(`guardrail-${p.variant % 2}`, x, y);
          break;
        }
        // ── D1 THE STACKS ────────────────────────────────────────────────
        case 'tower': {
          const img = this.propSprite(`tower-${p.variant}`, x, y);
          // The lit windows breathe on slow, staggered cycles — the
          // district's texture. (D3's Charge hook scales the density.)
          towerWindows(p.variant)
            .filter((w) => w.lit)
            .forEach((w, i) => {
              const glow = this.add.image(x + w.dx, y + w.dy, 'fx-glow');
              glow.setTint(PALETTE_INT.warmGlow);
              glow.setBlendMode(Phaser.BlendModes.ADD);
              glow.setScale(0.035);
              glow.setAlpha(bloom(0.4));
              glow.setDepth(img.depth + 1);
              this.tweens.add({
                targets: glow,
                alpha: { from: bloom(0.16), to: bloom(0.5) },
                duration: 5200 + ((p.x * 31 + p.y * 17 + i * 13) % 9) * 900,
                delay: ((p.x * 13 + i * 29) % 11) * 500,
                yoyo: true,
                repeat: -1,
                ease: 'sine.inout',
              });
              this.occlusion.attach(img, [glow]);
              // The Citywide Charge crowds or thins the blaze (D3).
              this.chargeWindowGlows.push(glow);
            });
          break;
        }
        case 'spire': {
          const img = this.propSprite('spire', x, y);
          // The slow red crown beacon — seen from every street.
          const crown = this.add.image(x, y - 272, 'fx-glow');
          crown.setTint(hexToInt(PALETTE.signalRed));
          crown.setBlendMode(Phaser.BlendModes.ADD);
          crown.setScale(0.16);
          crown.setAlpha(bloom(0.1));
          crown.setDepth(img.depth + 1);
          this.tweens.add({
            targets: crown,
            alpha: { from: bloom(0.06), to: bloom(0.62) },
            duration: 1150,
            yoyo: true,
            repeat: -1,
            hold: 300,
            repeatDelay: 900,
            ease: 'sine.inout',
          });
          this.occlusion.attach(img, [crown]);
          break;
        }
        case 'registry': {
          const img = this.propSprite('registry', x, y);
          // The token-layer tie-in stays a CLOSED DOOR until M4's gate —
          // the shopfront exists, the clerk takes no appointments yet.
          img.setInteractive({ useHandCursor: true });
          img.on('pointerdown', (_p: unknown, _lx: unknown, _ly: unknown, ev: Phaser.Types.Input.EventData) => {
            ev.stopPropagation();
            floatText(this, x, y - 96, 'The Vanity Registry — appointments open after the first season.', PALETTE.violetNeon);
          });
          // Main street's ONE licensed violet sign + the always-on shift.
          const sign = this.add.image(x - 44, y - 38, 'fx-glow');
          sign.setTint(PALETTE_INT.violetNeon);
          sign.setBlendMode(Phaser.BlendModes.ADD);
          sign.setScale(0.11);
          sign.setAlpha(bloom(0.6));
          sign.setDepth(img.depth + 1);
          addFlicker(this, sign, bloom(0.6), 0.08);
          const spill = this.add.image(x - 44, y - 6, 'fx-glow');
          spill.setTint(PALETTE_INT.warmGlow);
          spill.setBlendMode(Phaser.BlendModes.ADD);
          spill.setScale(0.12);
          spill.setAlpha(bloom(0.34));
          spill.setDepth(img.depth + 1);
          this.addGroundPool(x - 40, y - 2, PALETTE_INT.violetNeon, 0.3);
          this.occlusion.attach(img, [sign, spill]);
          break;
        }
        case 'noodlecart': {
          const img = this.propSprite('noodlecart', x, y);
          addSteamVent(this, x - 10, y - 53, img.depth + 2, { periodMs: 1200, drift: 10 });
          const lantern = addLayeredGlow(this, x + 18, y - 37, PALETTE_INT.warmGlow, 0.3, img.depth + 1, 0.4);
          addFlicker(this, lantern.core, 0.55, 0.12);
          this.addGroundPool(x, y - 2, PALETTE_INT.warmGlow, 0.45);
          break;
        }
        case 'treeplanter': {
          const img = this.propSprite('treeplanter', x, y);
          const bulb = this.add.image(x - 8, y - 62, 'fx-glow');
          bulb.setTint(PALETTE_INT.warmGlow);
          bulb.setBlendMode(Phaser.BlendModes.ADD);
          bulb.setScale(0.05);
          bulb.setAlpha(bloom(0.45));
          bulb.setDepth(img.depth + 1);
          addFlicker(this, bulb, bloom(0.45), 0.1);
          break;
        }
        case 'shanty': {
          const img = this.propSprite('shanty', x, y);
          const lamp = this.add.image(x + 22, y - 7, 'fx-glow');
          lamp.setTint(PALETTE_INT.warmGlow);
          lamp.setBlendMode(Phaser.BlendModes.ADD);
          lamp.setScale(0.06);
          lamp.setAlpha(bloom(0.4));
          lamp.setDepth(img.depth + 1);
          addFlicker(this, lamp, bloom(0.4), 0.14);
          break;
        }
        // ── D2 THE TERRARIUM ─────────────────────────────────────────────
        case 'mothertrellis': {
          const img = this.propSprite('mothertrellis', x, y);
          // Glow-fruit clusters breathe soft amber-green — the district's
          // lamps — and fireflies drift around the frame.
          for (const [gx, gy, s] of [
            [-38, -84, 0.07], [30, -122, 0.08], [-26, -108, 0.06],
            [22, -158, 0.07], [-2, -168, 0.08], [-30, -60, 0.06],
          ] as const) {
            const fruit = this.add.image(x + gx, y + gy, 'fx-glow');
            fruit.setTint(blendInt(PALETTE_INT.neonAmber, PALETTE_INT.solarGreen, 0.35));
            fruit.setBlendMode(Phaser.BlendModes.ADD);
            fruit.setScale(s);
            fruit.setAlpha(bloom(0.5));
            fruit.setDepth(img.depth + 1);
            this.tweens.add({
              targets: fruit,
              alpha: { from: bloom(0.3), to: bloom(0.6) },
              duration: 2400 + Math.abs(gx) * 20,
              yoyo: true,
              repeat: -1,
              ease: 'sine.inout',
            });
            this.occlusion.attach(img, [fruit]);
            // Garden lamps fill in with the Citywide Charge (D3).
            this.chargeGardenGlows.push(fruit);
          }
          addEmberMotes(this, x, y - 70, img.depth + 2, {
            count: 5,
            radius: 60,
            rise: 30,
            tint: PALETTE_INT.solarGreen,
          });
          this.addGroundPool(x, y - 4, PALETTE_INT.solarGreen, 0.25);
          break;
        }
        case 'gardenbed': {
          const img = this.propSprite(`gardenbed-${p.variant % 3}`, x, y);
          // U1b: click to tend (start), click again on the pulse (cue).
          const bedIdx = this.map.props.filter((pp) => pp.kind === 'gardenbed').indexOf(p);
          img.setInteractive({ useHandCursor: true });
          img.on(
            'pointerdown',
            (
              pointer: Phaser.Input.Pointer,
              _lx: number,
              _ly: number,
              event: Phaser.Types.Input.EventData,
            ) => {
              if (!pointer.leftButtonDown() || this.room === null) return;
              event.stopPropagation();
              if (this.tendingBed === bedIdx) {
                this.room.send(MSG.tend, { action: 'cue' });
                return;
              }
              this.room.send(MSG.tend, { action: 'start', bed: bedIdx });
            },
          );
          break;
        }
        case 'toolshed': {
          const img = this.propSprite(`toolshed-${p.variant % 2}`, x, y);
          const win = this.add.image(x + 14, y - 12, 'fx-glow');
          win.setTint(PALETTE_INT.warmGlow);
          win.setBlendMode(Phaser.BlendModes.ADD);
          win.setScale(0.05);
          win.setAlpha(bloom(0.35));
          win.setDepth(img.depth + 1);
          addFlicker(this, win, bloom(0.35), 0.08);
          this.chargeGardenGlows.push(win);
          break;
        }
        // V2 round-ish — the water tank's level-marker lamp.
        case 'watertank': {
          this.propSprite('watertank', x, y);
          const marker = addLayeredGlow(this, x, y - 96, PALETTE_INT.neonAmber, 0.26, depthForWorldY(y) + 1, 0.3);
          addFlicker(this, marker.core, 0.5, 0.15);
          break;
        }
        case 'ledgerhouse': {
          const img = this.propSprite('ledgerhouse', x, y);
          hoverTip(img, () => ({
            title: 'The Ledgerhouse',
            sub: 'bank · safe from every fall',
            lines: ['Bolts behind the counter stay yours, whatever the Tangle does.'],
          }));
          // Warm hall light + the door lamp — the bank glows like books.
          const hall = tileToWorld(p.x + 2, p.y + 2);
          addLayeredGlow(this, hall.x, hall.y - 24, PALETTE_INT.warmGlow, 0.6, img.depth + 1, 0.4);
          const door = tileToWorld(p.x + 1, p.y + 3);
          addLayeredGlow(this, door.x, door.y - 30, PALETTE_INT.neonAmber, 0.32, img.depth + 1, 0.5);
          img.setInteractive({ useHandCursor: true });
          img.on(
            'pointerdown',
            (
              ptr: Phaser.Input.Pointer,
              _lx: number,
              _ly: number,
              ev: Phaser.Types.Input.EventData,
            ) => {
              if (!ptr.leftButtonDown() || this.room === null) return;
              ev.stopPropagation();
              // The server refuses politely unless you stand in the hall.
              send.bank(this.room, { action: 'open' });
            },
          );
          break;
        }
        case 'fortunecoil': {
          const img = this.propSprite('fortunecoil', x, y);
          img.setInteractive({ useHandCursor: true });
          hoverTip(img, () => ({
            title: 'The Fortune Coil',
            sub: 'one free spin a day',
            lines: ['Cosmetic prizes, nothing else. The wheel owes nobody.'],
          }));
          this.placeCoilFace(p, img);
          break;
        }
        case 'ventbox':
        case 'toolrack': {
          this.propSprite(p.kind, x, y);
          if (p.kind === 'ventbox') {
            // The status lamp hums teal (light is life — §12A).
            addFlicker(this, addLayeredGlow(this, x + 10, y - 26, PALETTE_INT.neonTeal, 0.28, depthForWorldY(y) + 1, 0.35).core, 0.5, 0.2);
          }
          break;
        }
        case 'block': {
          // Map variant sets the FAMILY (0-2 painted Filament, 3 drums,
          // 4-6 the Tangle's rust/gunmetal — §12B accent discipline); the
          // picker chooses color + wear within it, no identical adjacents.
          let name: string;
          if (p.variant === 3) {
            name = `drums-${looks.pick('drums', p.x, p.y, 2)}`;
          } else if (p.variant >= 4) {
            const look = looks.pick('block-rust', p.x, p.y, 6);
            name = look < 3 ? `container-r${look}` : `container-rd${look - 3}`;
          } else {
            const look = looks.pick('block-paint', p.x, p.y, 6);
            name = look < 3 ? `container-${look}` : `container-d${look - 3}`;
          }
          this.propSprite(name, x, y);
          break;
        }
        case 'stack': {
          // Variant: height 2-4, +10 = the occasional hazard-striped one.
          // The picker breaks same-height runs with the alt-jitter twin
          // (reach 1 — canyon walls sit shoulder to shoulder by design).
          const striped = p.variant >= 10;
          const h = Math.min(4, Math.max(2, striped ? p.variant - 10 : p.variant));
          const alt = looks.pick(`stack-${h}${striped ? 's' : ''}`, p.x, p.y, 2, 1) === 1;
          this.propSprite(`stack-${h}${striped ? 's' : ''}${alt ? 'b' : ''}`, x, y);
          break;
        }
        case 'cranehulk': {
          this.propSprite('cranehulk', x, y);
          // The dead Craneking's old beacon: slow rose blink at the apex —
          // visible over the walls from most of the maze (§12B b).
          const beacon = addLayeredGlow(this, x + 10, y - 189, PALETTE_INT.neonRose, 0.16, depthForWorldY(y) + 2, 0.9);
          const blink = { t: 0 };
          this.tweens.add({
            targets: blink,
            t: 1,
            duration: 420,
            hold: 180,
            yoyo: true,
            repeatDelay: 2600,
            repeat: -1,
            ease: 'sine.inout',
            onUpdate: () => {
              beacon.core.setAlpha(bloom(0.15 + blink.t * 0.8));
              beacon.mid.setAlpha(bloom(0.06 + blink.t * 0.42));
              beacon.outer.setAlpha(bloom(0.02 + blink.t * 0.14));
            },
          });
          break;
        }
        case 'deadmachine': {
          this.propSprite(`deadmachine-${p.variant % 3}`, x, y);
          break;
        }
        case 'pylon': {
          this.propSprite('pylon', x, y);
          break;
        }
        case 'planter': {
          this.propSprite(`planter-${looks.pick('planter', p.x, p.y, 4)}`, x, y);
          break;
        }
        case 'dispatchpost': {
          const img = this.propSprite('dispatchpost', x, y);
          hoverTip(img, () => ({
            title: 'Dispatch Post',
            sub: 'parcel runs · the Stacks',
            lines: ['Take a parcel, find the tower, reach the landing.'],
          }));
          // U1a: parcels post here. Click = take one (or hear your status).
          img.setInteractive({ useHandCursor: true });
          img.on(
            'pointerdown',
            (
              pointer: Phaser.Input.Pointer,
              _lx: number,
              _ly: number,
              event: Phaser.Types.Input.EventData,
            ) => {
              if (!pointer.leftButtonDown() || this.room === null) return;
              event.stopPropagation();
              if (this.delivery !== null) {
                floatText(
                  this,
                  img.x,
                  img.y - 70,
                  `${this.delivery.tower}: ${this.delivery.line ?? ''}`,
                  PALETTE.neonAmber,
                );
                return;
              }
              this.room.send(MSG.delivery, { action: 'take' });
            },
          );
          const sign = this.add.image(x + 22, y - 58, 'fx-glow');
          sign.setTint(PALETTE_INT.neonAmber);
          sign.setBlendMode(Phaser.BlendModes.ADD);
          sign.setScale(0.06);
          sign.setAlpha(bloom(0.55));
          sign.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, sign, bloom(0.55), 0.1);
          break;
        }
        case 'tramgate': {
          const img = this.propSprite('tramgate', x, y);
          hoverTip(img, () => ({
            title: 'Tramgate',
            sub: 'every stop on the line',
            lines: ['Tolls charge per hop. Click for the stop board.'],
          }));
          // Ride the tram (D3): click opens the stop board — every other
          // district on the line, tolls charged per hop server-side.
          img.setInteractive({ useHandCursor: true });
          img.on(
            'pointerdown',
            (
              pointer: Phaser.Input.Pointer,
              _lx: number,
              _ly: number,
              event: Phaser.Types.Input.EventData,
            ) => {
              if (!pointer.leftButtonDown() || this.room === null) return;
              event.stopPropagation();
              const me = this.sparks.get(this.room.sessionId);
              if (me === undefined) return;
              const d = Math.max(
                Math.abs(me.settledTile.x - p.x),
                Math.abs(me.settledTile.y - p.y),
              );
              if (d > 4) {
                floatText(this, img.x, img.y - 70, 'the tram leaves from the gate', PALETTE.warmGlow);
                const step = this.nearestAdjacentWalkable({ x: p.x, y: p.y + 2 }, me.settledTile);
                if (step !== null) send.move(this.room, step);
                return;
              }
              this.toggleTramBoard(img.x, img.y - 60);
            },
          );
          // Sign glow over the lane + beacon + arrival pool of light.
          const sign = this.add.image(x - 26, y - 84, 'fx-glow');
          sign.setTint(PALETTE_INT.neonAmber);
          sign.setBlendMode(Phaser.BlendModes.ADD);
          sign.setAlpha(bloom(0.7));
          sign.setScale(0.13);
          sign.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, sign, bloom(0.7), 0.08);
          const beacon = this.add.image(x - 2, y - 122, 'fx-glow');
          beacon.setTint(PALETTE_INT.neonTeal);
          beacon.setBlendMode(Phaser.BlendModes.ADD);
          beacon.setScale(0.09);
          beacon.setAlpha(bloom(0.6));
          beacon.setDepth(depthForWorldY(y) + 1);
          this.addGroundPool(x - 40, y - 10, PALETTE_INT.neonAmber, 0.7);
          break;
        }
        case 'merchant': {
          const img = this.propSprite('merchant', x, y);
          hoverTip(img, () => ({
            title: 'Nightstalls Merchant',
            sub: 'buys the five resources',
            lines: ['Published bands, honest scales. Daily cap applies.'],
          }));
          img.setInteractive({ useHandCursor: true });
          img.on(
            'pointerdown',
            (
              pointer: Phaser.Input.Pointer,
              _lx: number,
              _ly: number,
              event: Phaser.Types.Input.EventData,
            ) => {
              if (!pointer.leftButtonDown() || this.room === null) return;
              event.stopPropagation();
              const me = this.sparks.get(this.room.sessionId);
              if (me === undefined) return;
              const d = Math.max(
                Math.abs(me.settledTile.x - p.x),
                Math.abs(me.settledTile.y - p.y),
              );
              if (d > CONFIG.economy.merchant.tradeRadiusTiles) {
                floatText(this, img.x, img.y - 60, 'step closer to trade', PALETTE.warmGlow);
                const step = this.nearestAdjacentWalkable({ x: p.x, y: p.y }, me.settledTile);
                if (step !== null) send.move(this.room, step);
                return;
              }
              session.events.emit(SessionEvents.openMerchant);
            },
          );
          // Lantern glow + a warm pool: the stand is a real light source.
          const lamp = this.add.image(x + 26, y - 34, 'fx-glow');
          lamp.setTint(PALETTE_INT.neonAmber);
          lamp.setBlendMode(Phaser.BlendModes.ADD);
          lamp.setScale(0.11);
          lamp.setAlpha(bloom(0.8));
          lamp.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, lamp, bloom(0.8), 0.09);
          this.addGroundPool(x + 10, y - 2, PALETTE_INT.neonAmber, 0.4);
          break;
        }
        case 'tinkerbench': {
          const img = this.propSprite('tinkerbench', x, y);
          hoverTip(img, () => ({
            title: 'The Tinkerbench',
            sub: 'craft · repair',
            lines: ['Builds gear, mends what broke. Nothing is ever lost for good.'],
          }));
          img.setInteractive({ useHandCursor: true });
          img.on(
            'pointerdown',
            (
              pointer: Phaser.Input.Pointer,
              _lx: number,
              _ly: number,
              event: Phaser.Types.Input.EventData,
            ) => {
              if (!pointer.leftButtonDown() || this.room === null) return;
              event.stopPropagation();
              const me = this.sparks.get(this.room.sessionId);
              if (me === undefined) return;
              const d = Math.max(
                Math.abs(me.settledTile.x - p.x),
                Math.abs(me.settledTile.y - p.y),
              );
              if (d > CONFIG.gear.benchRadiusTiles) {
                floatText(this, img.x, img.y - 50, 'step up to the bench', PALETTE.warmGlow);
                const step = this.nearestAdjacentWalkable({ x: p.x, y: p.y }, me.settledTile);
                if (step !== null) send.move(this.room, step);
                return;
              }
              session.events.emit(SessionEvents.openBench);
            },
          );
          // The screen is the light: teal glow + a small cool pool.
          const screen = this.add.image(x - 4, y - 20, 'fx-glow');
          screen.setTint(PALETTE_INT.neonTeal);
          screen.setBlendMode(Phaser.BlendModes.ADD);
          screen.setScale(0.09);
          screen.setAlpha(bloom(0.7));
          screen.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, screen, bloom(0.7), 0.07);
          const pool2 = this.addGroundPool(x, y - 2, PALETTE_INT.neonTeal, 0.3);
          pool2.setAlpha(0.16);
          break;
        }
        case 'dispatcher': {
          const img = this.propSprite('dispatcher', x, y);
          img.setInteractive({ useHandCursor: true });
          img.on(
            'pointerdown',
            (
              pointer: Phaser.Input.Pointer,
              _lx: number,
              _ly: number,
              event: Phaser.Types.Input.EventData,
            ) => {
              if (!pointer.leftButtonDown() || this.room === null) return;
              event.stopPropagation();
              const me = this.sparks.get(this.room.sessionId);
              if (me === undefined) return;
              const d = Math.max(
                Math.abs(me.settledTile.x - p.x),
                Math.abs(me.settledTile.y - p.y),
              );
              if (d > CONFIG.quests.npcRadiusTiles) {
                floatText(this, img.x, img.y - 50, 'step up to the board', PALETTE.warmGlow);
                const step = this.nearestAdjacentWalkable({ x: p.x, y: p.y }, me.settledTile);
                if (step !== null) send.move(this.room, step);
                return;
              }
              session.events.emit(SessionEvents.openQuests);
            },
          );
          const glow = this.add.image(x - 8, y - 30, 'fx-glow');
          glow.setTint(PALETTE_INT.neonAmber);
          glow.setBlendMode(Phaser.BlendModes.ADD);
          glow.setScale(0.1);
          glow.setAlpha(bloom(0.7));
          glow.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, glow, bloom(0.7), 0.08);
          this.addGroundPool(x, y - 2, PALETTE_INT.neonAmber, 0.34);
          break;
        }
        case 'warden': {
          const img = this.propSprite('warden', x, y);
          img.setInteractive({ useHandCursor: true });
          img.on(
            'pointerdown',
            (
              pointer: Phaser.Input.Pointer,
              _lx: number,
              _ly: number,
              event: Phaser.Types.Input.EventData,
            ) => {
              if (!pointer.leftButtonDown() || this.room === null) return;
              event.stopPropagation();
              const me = this.sparks.get(this.room.sessionId);
              if (me === undefined) return;
              const d = Math.max(
                Math.abs(me.settledTile.x - p.x),
                Math.abs(me.settledTile.y - p.y),
              );
              if (d > CONFIG.quests.npcRadiusTiles) {
                floatText(this, img.x, img.y - 50, 'the Warden is by the Dynamo', PALETTE.warmGlow);
                const step = this.nearestAdjacentWalkable({ x: p.x, y: p.y }, me.settledTile);
                if (step !== null) send.move(this.room, step);
                return;
              }
              // The Warden's ledger: meter + leaderboard + donate buttons.
              send.chargeInfo(this.room);
            },
          );
          const glow = this.add.image(x + 12, y - 34, 'fx-glow');
          glow.setTint(PALETTE_INT.neonTeal);
          glow.setBlendMode(Phaser.BlendModes.ADD);
          glow.setScale(0.08);
          glow.setAlpha(bloom(0.6));
          glow.setDepth(depthForWorldY(y) + 1);
          this.addGroundPool(x, y - 2, PALETTE_INT.neonTeal, 0.28);
          break;
        }
        case 'alleylamp': {
          this.propSprite('heatlamp', x, y);
          // A single dim lantern for the dark corners — barely holding on,
          // but still a proper core + bloom (addendum b). Tangle junctions
          // run HAZARD AMBER per the district brief (§12B a/d).
          const lampTint =
            this.district === 'tangle' ? PALETTE_INT.neonAmber : PALETTE_INT.warmGlow;
          const glow = addLayeredGlow(this, x, y - 32, lampTint, 0.09, depthForWorldY(y) + 1, 0.55);
          addFlicker(this, glow.mid, bloom(0.28), 0.16);
          addFlicker(this, glow.core, bloom(0.5), 0.12);
          // Faint light cone under the head (R5a).
          addLampCone(this, x, y - 30, lampTint, depthForWorldY(y));
          const pool = this.addGroundPool(x, y - 2, PALETTE_INT.warmGlow, 0.34);
          pool.setAlpha(0.15);
          // V6 density: moths-of-ember drifting around the junction lamps.
          addEmberMotes(this, x, y - 30, depthForWorldY(y) + 2, {
            count: 2,
            radius: 10,
            rise: 22,
            tint: lampTint,
          });
          break;
        }
        case 'ropepost': {
          this.propSprite('ropepost', x, y);
          break;
        }
        case 'shack': {
          // V3: eight building designs, picker-pooled so no street repeats
          // a silhouette next door. FX anchors (sign/window) follow the
          // design's own door and glazing.
          const design = looks.pick('bldg', p.x, p.y, 8, 6); // reach 6: whole streets vary
          const img = this.propSprite(`bldg-${design}`, x, y);
          const signTint = [
            PALETTE_INT.neonRose,
            PALETTE_INT.neonAmber,
            PALETTE_INT.neonTeal,
            PALETTE_INT.neonCyan,
          ][design % 4] as number;
          const FX: Array<{ sign: [number, number]; win: [number, number] }> = [
            { sign: [-22, -34], win: [20, -24] },
            { sign: [-18, -30], win: [18, -20] },
            { sign: [-24, -34], win: [22, -18] },
            { sign: [-14, -30], win: [22, -18] },
            { sign: [0, -30], win: [-14, -20] },
            { sign: [-24, -34], win: [-6, -20] },
            { sign: [-12, -30], win: [0, -70] },
            { sign: [-18, -30], win: [18, -20] },
          ];
          const fx = FX[design] as { sign: [number, number]; win: [number, number] };
          // Neon sign over the door + warm window spill.
          const sign = this.add.image(x + fx.sign[0], y + fx.sign[1], 'fx-glow');
          sign.setTint(signTint);
          sign.setBlendMode(Phaser.BlendModes.ADD);
          sign.setAlpha(bloom(0.66));
          sign.setScale(0.1);
          sign.setDepth(depthForWorldY(y) + 1);
          // Selective animation (R5d): one sign flickers BADLY (character),
          // two cycle their hue lazily; the rest keep the quiet waver.
          if (p.variant === 7) addBadFlicker(this, sign, bloom(0.66));
          else if (p.variant === 2) addHueCycle(this, sign, signTint, PALETTE_INT.violetNeon);
          else if (p.variant === 10) addHueCycle(this, sign, signTint, PALETTE_INT.emberOrange);
          else addFlicker(this, sign, bloom(0.66), 0.12);
          const win = this.add.image(x + fx.win[0], y + fx.win[1], 'fx-glow');
          win.setTint(PALETTE_INT.warmGlow);
          win.setBlendMode(Phaser.BlendModes.ADD);
          win.setAlpha(bloom(0.42));
          win.setScale(0.09);
          win.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, win, bloom(0.42), 0.05);
          // T0: the building's own lights fade with it when it occludes.
          this.occlusion.attach(img, [sign, win]);
          // V6 density: every flue breathes — the city is COOKING dinner.
          const CHIMNEY: Partial<Record<number, [number, number]>> = {
            0: [-24, -56], // parapet roof pipe
            2: [-18, -70], // main-roof stovepipe
            3: [-2, -62], // quonset end chimney
            7: [-16, -72], // cottage chimney
          };
          const flue = CHIMNEY[design];
          if (flue !== undefined) {
            addSteamVent(this, x + flue[0], y + flue[1], depthForWorldY(y) + 2, {
              periodMs: 1500 + design * 260,
              drift: 9,
            });
          }
          // Rooftop marks: the whip antenna / masthead lamp get their glint.
          if (design === 1) {
            const tip = this.add.image(x + 14, y - 92, 'fx-glow');
            tip.setTint(PALETTE_INT.neonTeal);
            tip.setBlendMode(Phaser.BlendModes.ADD);
            tip.setScale(0.06);
            tip.setAlpha(bloom(0.5));
            tip.setDepth(depthForWorldY(y) + 1);
            addFlicker(this, tip, bloom(0.5), 0.2);
          } else if (design === 6) {
            const mast = this.add.image(x + 2, y - 102, 'fx-glow');
            mast.setTint(PALETTE_INT.neonAmber);
            mast.setBlendMode(Phaser.BlendModes.ADD);
            mast.setScale(0.07);
            mast.setAlpha(bloom(0.5));
            mast.setDepth(depthForWorldY(y) + 1);
            addFlicker(this, mast, bloom(0.5), 0.16);
          }
          this.addGroundPool(x + fx.sign[0] + 10, y - 2, signTint, 0.5);
          this.addGroundPool(x + fx.win[0] - 4, y - 2, PALETTE_INT.warmGlow, 0.34);
          break;
        }
      }
    }

    // V5: rail the footbridge decks — one rail on each canal-facing edge.
    for (const fb of this.map.footbridges) {
      const { x, y } = tileToWorld(fb.x, fb.y);
      const anchorY = y + TILE_H / 2;
      const north = addVoxelSprite(this, 'guardrail-0', x + 16, anchorY - 8);
      const south = addVoxelSprite(this, 'guardrail-0', x - 16, anchorY + 8);
      const wt = worldSpriteTint();
      for (const rail of [north, south]) {
        if (wt !== null) rail.setTint(wt);
      }
      north.setDepth(depthForWorldY(anchorY - 8));
      south.setDepth(depthForWorldY(anchorY + 8));
    }
  }

  /**
   * The Tangle's overhead layer (§12B): sagging cable BUNDLES strung
   * between consecutive pylon pairs, crossing the corridors.
   */
  private placeTangleCables(): void {
    const pylons = this.map.props.filter((p) => p.kind === 'pylon');
    if (pylons.length < 2) return;
    const g = this.add.graphics();
    g.setDepth(1e5 - 1);
    for (let i = 0; i + 1 < pylons.length; i += 2) {
      const a = this.propAnchor(pylons[i] as Prop);
      const b = this.propAnchor(pylons[i + 1] as Prop);
      const top = -78; // the crossarm height on the pylon bake
      // Three strands with different sags — a BUNDLE, not a wire.
      for (const [sagMult, alpha] of [
        [1, 0.9],
        [1.22, 0.7],
        [1.45, 0.5],
      ] as const) {
        const sag = Math.min(52, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) * 0.13) * sagMult;
        const mid = {
          x: (a.x + b.x) / 2,
          y: Math.max(a.y + top, b.y + top) + sag,
        };
        const curve = new Phaser.Curves.QuadraticBezier(
          new Phaser.Math.Vector2(a.x, a.y + top),
          new Phaser.Math.Vector2(mid.x, mid.y),
          new Phaser.Math.Vector2(b.x, b.y + top),
        );
        g.lineStyle(2, mixPalette('ink', 'structureMid', 0.4), alpha);
        curve.draw(g, 20);
        // The odd hanging drip line off the lowest strand.
        if (sagMult === 1.45 && (i / 2) % 2 === 0) {
          const p = curve.getPoint(0.4);
          g.lineStyle(2, mixPalette('ink', 'structureMid', 0.35), 0.6);
          g.lineBetween(p.x, p.y, p.x, p.y + 16);
        }
      }
    }
  }

  /**
   * D2b: berth pads — dashed pad outlines with their number, clickable to
   * place your Loftpod (the server checks Bolts + proximity + occupancy).
   */
  /** U1a: the landing marker — a pulsing beacon where the parcel goes. */
  private drawDeliveryMarker(e: DeliverySync): void {
    if (e.landing === undefined) return;
    const w = tileToWorld(e.landing.x, e.landing.y);
    const glow = addLayeredGlow(this, w.x, w.y - 10, PALETTE_INT.neonAmber, 0.5, depthForWorldY(w.y) + 2, 0.5);
    this.tweens.add({
      targets: [glow.core, glow.mid],
      alpha: { from: 0.25, to: 0.8 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    });
    const label = this.add.text(w.x, w.y - 46, `${e.tower ?? 'the landing'}`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: PALETTE.neonAmber,
      backgroundColor: '#1E1930CC',
      padding: { x: 4, y: 2 },
    });
    label.setOrigin(0.5, 1);
    label.setDepth(depthForWorldY(w.y) + 3);
    const zone = this.add.zone(w.x, w.y - 8, TILE_W * 1.6, TILE_H * 2.2);
    zone.setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      if (this.room !== null) this.room.send(MSG.delivery, { action: 'drop' });
    });
    this.deliveryMarker.push(glow.core, glow.mid, glow.outer, label, zone);
  }

  private clearDeliveryMarker(): void {
    for (const o of this.deliveryMarker) o.destroy();
    this.deliveryMarker = [];
  }

  /** U1b: everyone sees a tended planter bloom for the hour. */
  private renderBloom(id: string): void {
    this.removeBloom(id);
    const beds = this.map.props.filter((pp) => pp.kind === 'gardenbed');
    const bed = beds[Number(id)];
    if (bed === undefined) return;
    const w = tileToWorld(bed.x + bed.w / 2, bed.y + bed.h / 2);
    const parts: Phaser.GameObjects.GameObject[] = [];
    const hues = [PALETTE_INT.neonRose, PALETTE_INT.neonAmber, PALETTE_INT.solarGreen];
    for (let i = 0; i < 5; i++) {
      const petal = this.add.image(
        w.x - 20 + ((i * 37) % 44),
        w.y - 14 - ((i * 23) % 12),
        'fx-glow',
      );
      petal.setTint(hues[i % hues.length] as number);
      petal.setBlendMode(Phaser.BlendModes.ADD);
      petal.setScale(0.028);
      petal.setAlpha(bloom(0.5));
      petal.setDepth(depthForWorldY(w.y) + 2);
      this.tweens.add({
        targets: petal,
        alpha: { from: bloom(0.3), to: bloom(0.65) },
        duration: 1600 + i * 300,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inout',
      });
      parts.push(petal);
    }
    this.bloomViews.set(id, parts);
  }

  private removeBloom(id: string): void {
    const parts = this.bloomViews.get(id);
    if (parts === undefined) return;
    for (const o of parts) o.destroy();
    this.bloomViews.delete(id);
  }

  /** U1b: the cue pulse — click the bed again right on the bright beat. */
  private tendCue(e: TendStateEvent): void {
    this.tendingBed = e.bed;
    const beds = this.map.props.filter((pp) => pp.kind === 'gardenbed');
    const bed = beds[e.bed];
    if (bed !== undefined) {
      const w = tileToWorld(bed.x + bed.w / 2, bed.y + bed.h / 2);
      const pulse = this.add.image(w.x, w.y - 12, 'fx-glow');
      pulse.setTint(PALETTE_INT.solarGreen);
      pulse.setBlendMode(Phaser.BlendModes.ADD);
      pulse.setScale(0.03);
      pulse.setAlpha(0);
      pulse.setDepth(depthForWorldY(w.y) + 3);
      this.tweens.add({
        targets: pulse,
        alpha: { from: 0, to: 0.9 },
        scale: { from: 0.03, to: 0.09 },
        delay: e.cueInMs - 180,
        duration: 360,
        yoyo: true,
        onComplete: () => pulse.destroy(),
      });
    }
    this.time.delayedCall(e.seconds * 1000 + 200, () => {
      if (this.tendingBed === e.bed) this.tendingBed = null;
    });
  }

  private placeLoftBerths(): void {
    if (this.map.loftberths.length === 0) return;
    const g = this.add.graphics();
    g.setDepth(DEPTH_FLOOR + 2);
    this.berthMarkers.push(g);
    this.map.loftberths.forEach((b, i) => {
      const nw = tileToWorld(b.x, b.y);
      const se = tileToWorld(b.x + 2, b.y + 2);
      const cx2 = (nw.x + se.x) / 2;
      const cy2 = (nw.y + se.y) / 2 + TILE_H / 2;
      g.lineStyle(1.5, mixPalette('solarGreen', 'structureMid', 0.4), 0.55);
      // The pad: a diamond outline around the 3×3, corner studs.
      const rx = TILE_W * 1.5;
      const ry = TILE_H * 1.5;
      g.strokePoints(
        [
          new Phaser.Math.Vector2(cx2, cy2 - ry),
          new Phaser.Math.Vector2(cx2 + rx, cy2),
          new Phaser.Math.Vector2(cx2, cy2 + ry),
          new Phaser.Math.Vector2(cx2 - rx, cy2),
        ],
        true,
      );
      const label = this.add.text(cx2, cy2 - 6, `berth ${i}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: PALETTE.groundAccent,
      });
      label.setOrigin(0.5);
      label.setAlpha(0.8);
      label.setDepth(DEPTH_FLOOR + 3);
      this.berthMarkers.push(label);
      const zone = this.add.zone(cx2, cy2, TILE_W * 3, TILE_H * 3);
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (this.loftpodViews.has(String(i))) return; // pod handles its own clicks
        if (this.room !== null) this.room.send(MSG.loftpod, { action: 'place', berth: i });
      });
    });
  }

  /** D2b: a pod + its owner's display (shingle, trophy title, banner). */
  private renderLoftpod(id: string, p: LoftpodStateShape): void {
    this.removeLoftpod(id);
    const b = this.map.loftberths[p.berth];
    if (b === undefined) return;
    const nw = tileToWorld(b.x, b.y);
    const se = tileToWorld(b.x + 2, b.y + 2);
    const x = (nw.x + se.x) / 2;
    const y = (se.y + TILE_H / 2) - TILE_H;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const img = addVoxelSprite(this, `loftpod-${Math.min(3, Math.max(1, p.tier))}-${p.dye}`, x, y);
    const wt = worldSpriteTint();
    if (wt !== null) img.setTint(wt);
    img.setDepth(depthForWorldY(y));
    img.setInteractive({ useHandCursor: true });
    img.on('pointerdown', (_p: unknown, _lx: unknown, _ly: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      const lines = [`${p.ownerName}'s Loftpod — tier ${p.tier}`];
      if (p.trophyTitle !== '') lines.push(`“${p.trophyTitle}”`);
      if (p.trophySkill !== '') lines.push(`${p.trophySkill} banner`);
      floatText(this, x, y - 60, lines.join(' · '), PALETTE.warmGlow);
    });
    parts.push(img);
    // The shingle: whose home this is (world flavor, not a nameplate).
    const shingle = this.add.text(x, y - 52, p.ownerName, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: UI_TEXT_WARM,
      backgroundColor: '#1E1930CC',
      padding: { x: 4, y: 2 },
    });
    shingle.setOrigin(0.5, 1);
    shingle.setDepth(depthForWorldY(y) + 2);
    parts.push(shingle);
    if (p.trophyTitle !== '') {
      const title = this.add.text(x, y - 40, `“${p.trophyTitle}”`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: PALETTE.neonAmber,
      });
      title.setOrigin(0.5, 1);
      title.setDepth(depthForWorldY(y) + 2);
      parts.push(title);
    }
    if (p.trophySkill !== '') {
      // The Mastery banner: a small colored pennant on the trophy hooks.
      const hues = [
        PALETTE_INT.neonRose, PALETTE_INT.neonAmber, PALETTE_INT.neonTeal,
        PALETTE_INT.neonCyan, PALETTE_INT.violetNeon, PALETTE_INT.emberOrange,
      ];
      const idx = Math.abs([...p.trophySkill].reduce((a, c) => a * 31 + c.charCodeAt(0), 0)) % hues.length;
      const flag = this.add.graphics();
      flag.fillStyle(hues[idx] as number, 0.9);
      flag.fillTriangle(x + 26, y - 44, x + 26, y - 32, x + 40, y - 38);
      flag.lineStyle(1, PALETTE_INT.ink, 0.8);
      flag.lineBetween(x + 26, y - 46, x + 26, y - 26);
      flag.setDepth(depthForWorldY(y) + 2);
      parts.push(flag);
    }
    // Home light: the round window spills warm.
    const glow = this.add.image(x - 14, y - 14, 'fx-glow');
    glow.setTint(PALETTE_INT.warmGlow);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setScale(0.07);
    glow.setAlpha(bloom(0.4));
    glow.setDepth(depthForWorldY(y) + 1);
    addFlicker(this, glow, bloom(0.4), 0.07);
    parts.push(glow);
    this.loftpodViews.set(id, parts);
  }

  private removeLoftpod(id: string): void {
    for (const obj of this.loftpodViews.get(id) ?? []) obj.destroy();
    this.loftpodViews.delete(id);
  }

  /**
   * D1 the Stacks: the densest overhead layer in the city — cable webs
   * and wash lines strung tower-to-tower across the canyon streets, plus
   * the north/south streets' one licensed violet sign each (main street's
   * lives on the registry).
   */
  private placeStacksOverhead(): void {
    if (this.map.district !== 'stacks') return;
    const g = this.add.graphics();
    g.setDepth(1e5 - 1);
    const cloth = [
      mixPalette('neonRose', 'structureMid', 0.3),
      mixPalette('warmGlow', 'groundAccent', 0.3),
      mixPalette('neonTeal', 'structureMid', 0.4),
    ];
    // Spans across main street (towers at y15-18 ↔ y22-25) + the north
    // street's mouth. Anchored high — these hang over Sparks' heads.
    const spans: Array<{ ax: number; ay: number; bx: number; by: number }> = [
      { ax: 20, ay: 18, bx: 20, by: 22 },
      { ax: 24, ay: 18, bx: 24, by: 22 },
      { ax: 29, ay: 18, bx: 29, by: 22 },
      { ax: 34, ay: 18, bx: 34, by: 22 },
      { ax: 12, ay: 13, bx: 17, by: 13 },
      { ax: 12, ay: 9, bx: 13, by: 5 },
      { ax: 25, ay: 26, bx: 25, by: 30 },
    ];
    spans.forEach((s, si) => {
      const a = tileToWorld(s.ax, s.ay);
      const b = tileToWorld(s.bx, s.by);
      const top = -64 - (si % 3) * 10;
      for (const [sagMult, alpha] of [
        [1, 0.85],
        [1.3, 0.6],
      ] as const) {
        const sag = 16 * sagMult;
        const curve = new Phaser.Curves.QuadraticBezier(
          new Phaser.Math.Vector2(a.x, a.y + top),
          new Phaser.Math.Vector2((a.x + b.x) / 2, Math.max(a.y, b.y) + top + sag),
          new Phaser.Math.Vector2(b.x, b.y + top),
        );
        g.lineStyle(2, mixPalette('ink', 'structureMid', 0.4), alpha);
        curve.draw(g, 16);
        // Wash pinned to the top strand on most spans.
        if (sagMult === 1 && si % 3 !== 2) {
          for (const t of [0.35, 0.55, 0.72]) {
            const pt = curve.getPoint(t);
            g.fillStyle(cloth[(si + Math.round(t * 10)) % 3] as number, 0.9);
            g.fillRect(pt.x - 3, pt.y, 6, 7 + ((si + Math.round(t * 20)) % 3));
          }
        }
      }
    });
    // The north + south streets' licensed violet signs, on tower faces.
    for (const [sx, sy] of [
      [11.4, 13.2],
      [27.6, 23.2],
    ] as const) {
      const w = tileToWorld(sx, sy);
      const sign = this.add.image(w.x, w.y - 44, 'fx-glow');
      sign.setTint(PALETTE_INT.violetNeon);
      sign.setBlendMode(Phaser.BlendModes.ADD);
      sign.setScale(0.09);
      sign.setAlpha(bloom(0.55));
      sign.setDepth(depthForWorldY(w.y) + 2);
      addFlicker(this, sign, bloom(0.55), 0.1);
      this.addGroundPool(w.x, w.y - 2, PALETTE_INT.violetNeon, 0.26);
    }
  }

  /** Cables from each antenna shrine to the nearest shack roof (§B8). */
  private placeAntennaCables(): void {
    const shacks = this.map.props.filter((p) => p.kind === 'shack');
    if (shacks.length === 0) return;
    const g = this.add.graphics();
    g.setDepth(1e5 - 1);
    for (const n of this.map.nodes) {
      if (n.kind !== 'antenna') continue;
      let best: Prop | null = null;
      let bestD = Infinity;
      for (const sh of shacks) {
        const d = Math.max(Math.abs(sh.x - n.x), Math.abs(sh.y - n.y));
        if (d < bestD) {
          bestD = d;
          best = sh;
        }
      }
      if (best === null || bestD > 12) continue;
      const a = tileToWorld(n.x, n.y);
      const mastTop = { x: a.x, y: a.y + TILE_H / 2 - 96 };
      const roofAnchor = this.propAnchor(best);
      const roof = { x: roofAnchor.x, y: roofAnchor.y - 54 };
      const sag = Math.min(40, Phaser.Math.Distance.Between(mastTop.x, mastTop.y, roof.x, roof.y) * 0.14);
      const mid = { x: (mastTop.x + roof.x) / 2, y: Math.max(mastTop.y, roof.y) + sag };
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(mastTop.x, mastTop.y),
        new Phaser.Math.Vector2(mid.x, mid.y),
        new Phaser.Math.Vector2(roof.x, roof.y),
      );
      g.lineStyle(1.5, this.lerpColor(MATERIAL_INT.gunmetalDeep, PALETTE_INT.ink, 0.35), 0.9);
      curve.draw(g, 16);
    }
  }

  /** Sagging rope strung between neighbouring scrap-yard posts (§B11). */
  private placeRopes(): void {
    const posts = this.map.props.filter((p) => p.kind === 'ropepost');
    const g = this.add.graphics();
    g.setDepth(depthForWorldY(tileToWorld(32, 32).y) + 1);
    for (let i = 0; i < posts.length; i++) {
      for (let j = i + 1; j < posts.length; j++) {
        const a = posts[i] as Prop;
        const b = posts[j] as Prop;
        const dist = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        if (dist === 0 || dist > 2) continue; // the entrance gap stays open
        const wa = this.propAnchor(a);
        const wb = this.propAnchor(b);
        const topA = { x: wa.x, y: wa.y - 24 };
        const topB = { x: wb.x, y: wb.y - 24 };
        const mid = { x: (topA.x + topB.x) / 2, y: Math.max(topA.y, topB.y) + 9 };
        const curve = new Phaser.Curves.QuadraticBezier(
          new Phaser.Math.Vector2(topA.x, topA.y),
          new Phaser.Math.Vector2(mid.x, mid.y),
          new Phaser.Math.Vector2(topB.x, topB.y),
        );
        g.lineStyle(2, MATERIAL_INT.rustDeep, 0.95);
        curve.draw(g, 12);
        // A little warning flag mid-rope.
        g.fillStyle(PALETTE_INT.neonAmber, 0.85);
        g.fillTriangle(mid.x, mid.y - 1, mid.x + 5, mid.y + 2, mid.x, mid.y + 5);
      }
    }
  }

  /**
   * Overhead string lights (ART-DIRECTION §4/§5): catenaries strung between
   * the Dynamo, the stall row, and the planter ring, drawn above the player
   * plane with warm bulb glows.
   */
  private placeStringLights(): void {
    const dynamo = this.map.props.find((p) => p.kind === 'dynamo');
    const stalls = this.map.props.filter((p) => p.kind === 'stall');
    const planters = this.map.props.filter((p) => p.kind === 'planter');
    if (dynamo === undefined) return;
    const da = this.propAnchor(dynamo);
    const dTop = { x: da.x, y: da.y - 360 };

    const lines: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
    for (const st of stalls) {
      const a = this.propAnchor(st);
      lines.push([dTop, { x: a.x, y: a.y - 92 }]);
    }
    for (let i = 0; i + 1 < planters.length; i += 2) {
      const a = this.propAnchor(planters[i] as Prop);
      const b = this.propAnchor(planters[i + 1] as Prop);
      lines.push([
        { x: a.x, y: a.y - 64 },
        { x: b.x, y: b.y - 64 },
      ]);
    }

    const g = this.add.graphics();
    g.setDepth(1e5);
    // ~70% warm / 30% cool: amber, rose, amber, teal.
    const bulbTints = [
      PALETTE_INT.neonAmber,
      PALETTE_INT.neonRose,
      PALETTE_INT.neonAmber,
      PALETTE_INT.neonTeal,
    ];
    let bulbIdx = 0;
    for (const [a, b] of lines) {
      const sag = Math.min(60, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) * 0.12);
      const mid = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + sag };
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(a.x, a.y),
        new Phaser.Math.Vector2(mid.x, mid.y),
        new Phaser.Math.Vector2(b.x, b.y),
      );
      g.lineStyle(1.5, mixPalette('ink', 'structureMid', 0.5), 0.85);
      curve.draw(g, 24);
      const bulbs = Math.max(3, Math.floor(curve.getLength() / 34));
      for (let i = 1; i < bulbs; i++) {
        const p = curve.getPoint(i / bulbs);
        const tint = bulbTints[bulbIdx++ % bulbTints.length] as number;
        g.fillStyle(tint, 0.95);
        g.fillCircle(p.x, p.y + 2, 2.2);
        // Glow language (addendum b): hot core + hue bloom per bulb.
        const glow = addLayeredGlow(this, p.x, p.y + 2, tint, 0.08, 1e5 + 1);
        // Every third bulb wavers a touch — strings feel strung, not printed.
        if (i % 3 === 0) addFlicker(this, glow.mid, bloom(0.5), 0.12);
        if (i % 3 === 1) this.addGroundPool(p.x, p.y + 90, tint, 0.22);
        // The Citywide Charge dims/relights these (E3b) — keep the handles.
        this.stringBulbGlows.push(glow.core, glow.mid, glow.outer);
      }
    }
    this.applyChargeLighting(this.chargeLightingTier);
  }

  /**
   * The Citywide Charge's visible payoff (E3b): string-light density
   * scales with the week's meter tier — low charge leaves the lane on
   * sparse bulbs, festival blaze lights every one.
   */
  private applyChargeLighting(tier: number): void {
    this.chargeLightingTier = tier;
    const fraction = Math.min(1, 0.45 + 0.19 * tier);
    this.stringBulbGlows.forEach((glow, i) => {
      // Deterministic thinning: each bulb owns THREE glow layers (core/
      // mid/outer — addendum b), so the lit test keys on the bulb index;
      // lights ADD as the tier climbs, never shuffle.
      const bulb = Math.floor(i / 3);
      const lit = (bulb % 100) / 100 < fraction;
      glow.setVisible(lit);
    });
    // D3, everywhere the hook reaches. The Stacks window BLAZE climbs from
    // an ember baseline to §12B's festival ceiling ("a quarter of windows
    // blazing"); the i*37 stride scatters the lit ones across every tower.
    const blaze = 0.08 + (0.25 - 0.08) * Math.min(1, tier / 3);
    this.chargeWindowGlows.forEach((glow, i) => {
      glow.setVisible(((i * 37) % 100) / 100 < blaze);
    });
    // The Terrarium's garden lamps ride a gentler band: the Mother Trellis
    // never goes dark, it just fills in as the meter climbs.
    const garden = 0.5 + 0.5 * Math.min(1, tier / 3);
    this.chargeGardenGlows.forEach((glow, i) => {
      glow.setVisible(((i * 37) % 100) / 100 < garden);
    });
  }

  /**
   * The tramgate stop board (D3): every other district on the line, the
   * per-hop Bolts toll printed beside each. Click a stop to ride; click
   * the gate again (or ride) to fold the board away.
   */
  private toggleTramBoard(x: number, y: number): void {
    if (this.tramBoard !== null) {
      this.tramBoard.destroy();
      this.tramBoard = null;
      return;
    }
    const stops = (CONFIG.travel.line as readonly DistrictId[]).filter((s) => s !== this.district);
    const rowH = 24;
    const w = 232;
    const h = 26 + stops.length * rowH;
    const board = this.add.container(x, y - h);
    board.setDepth(1e5 + 60);
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE_INT.ink, 0.92);
    bg.fillRoundedRect(-w / 2, 0, w, h, 6);
    bg.lineStyle(1.5, PALETTE_INT.neonAmber, 0.8);
    bg.strokeRoundedRect(-w / 2, 0, w, h, 6);
    board.add(bg);
    const head = this.add.text(0, 8, 'TRAM — ALL STOPS', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: PALETTE.groundAccent,
    });
    head.setOrigin(0.5, 0);
    board.add(head);
    stops.forEach((stop, i) => {
      const toll = tramToll(this.district, stop);
      const row = this.add.text(0, 24 + i * rowH, `${DISTRICT_NAMES[stop]} — ${toll} Bolts`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: UI_TEXT_WARM,
        padding: { x: 6, y: 3 },
      });
      row.setOrigin(0.5, 0);
      row.setInteractive({ useHandCursor: true });
      row.on('pointerover', () => row.setColor(PALETTE.neonAmber));
      row.on('pointerout', () => row.setColor(UI_TEXT_WARM));
      row.on(
        'pointerdown',
        (_p: unknown, _lx: unknown, _ly: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation();
          if (this.room === null) return;
          floatText(this, x, y - 20, `to ${DISTRICT_NAMES[stop]} — ${toll} Bolts`, PALETTE.neonAmber);
          send.travel(this.room, { to: stop });
          this.tramBoard?.destroy();
          this.tramBoard = null;
        },
      );
      board.add(row);
    });
    this.tramBoard = board;
  }

  /**
   * Three harmless Scuttlebots pottering around the plaza edge: pure decor,
   * client-side only. They skitter off when a Spark walks up. The hostile
   * kind (server-owned, in the scrap fringe) is a separate creature.
   */
  private spawnAmbientBots(): void {
    // D1c the Stacks: the rooftop laundry-bot pottering its roofline and
    // a junction skitterer — home-anchored so neither leaves its patch.
    if (this.map.district === 'stacks') {
      const R = CONFIG.stacks.roofline;
      for (const home of [
        { x: R.x0 + 4, y: R.y0 + 3 },
        { x: 13, y: 16 },
      ]) {
        outer: for (let r = 0; r < 4; r++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const t = { x: home.x + dx, y: home.y + dy };
              if (this.map.walkable[t.y]?.[t.x] === true) {
                this.ambientBots.push(new AmbientScuttlebot(this, this.map, t, home));
                break outer;
              }
            }
          }
        }
      }
      return;
    }
    const { cx, cy, radius } = this.map.plaza;
    if (radius <= 0) return; // no plaza (the Tangle) — no pottering decor bots
    const seats: Array<[number, number]> = [
      [cx + radius - 1, cy - 3],
      [cx - radius + 2, cy + 4],
      [cx + 3, cy + radius - 1],
    ];
    for (const [sx, sy] of seats) {
      // Nudge to the nearest walkable tile in a small spiral if occupied.
      outer: for (let r = 0; r < 4; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const t = { x: sx + dx, y: sy + dy };
            if (this.map.walkable[t.y]?.[t.x] === true) {
              this.ambientBots.push(new AmbientScuttlebot(this, this.map, t));
              break outer;
            }
          }
        }
      }
    }
  }

  /**
   * Ambient life in the coolant: koi shadows cruising the channel segments
   * between bridges, with faint cyan surface glints. Pure decor — the
   * gatherable Glowkoi spots are separate server-owned nodes.
   */
  private placeCanalLife(): void {
    if (!this.map.canal.some((row) => row.includes(true))) return; // no coolant here
    const cv = CONFIG.canal;
    const bridgeRows = cv.bridgeRows as readonly number[];
    const segments: Array<[number, number]> = [];
    let segStart: number | null = null;
    for (let y = cv.yMin; y <= cv.yMax + 1; y++) {
      const isCanal = y <= cv.yMax && !bridgeRows.includes(y);
      if (isCanal && segStart === null) segStart = y;
      if (!isCanal && segStart !== null) {
        segments.push([segStart, y - 1]);
        segStart = null;
      }
    }

    for (const [y0, y1] of segments) {
      const count = y1 - y0 > 8 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const tx = cv.xMin + (i % 2 === 0 ? 0.2 : 0.8) * (cv.xMax - cv.xMin);
        const a = tileToWorld(tx, y0 + 0.6);
        const b = tileToWorld(tx, y1 - 0.6);
        const koi = this.add.image(a.x, a.y, 'tex-koi-shadow');
        koi.setAlpha(0.3);
        koi.setScale(0.55);
        koi.setDepth(DEPTH_FLOOR + 6);
        this.tweens.add({
          targets: koi,
          x: b.x,
          y: b.y,
          duration: Phaser.Math.Between(15000, 24000),
          delay: Phaser.Math.Between(0, 7000),
          yoyo: true,
          repeat: -1,
          ease: 'sine.inout',
        });
      }
    }

    // Faint cyan glints where a fin breaks the coolant surface.
    this.time.addEvent({
      delay: 2400,
      loop: true,
      callback: () => {
        if (Math.random() < 0.45 || segments.length === 0) return;
        const seg = segments[Math.floor(Math.random() * segments.length)] as [number, number];
        const ty = seg[0] + Math.random() * (seg[1] - seg[0]);
        const tx = cv.xMin + Math.random() * (cv.xMax - cv.xMin);
        const w = tileToWorld(tx, ty);
        const glint = this.add.image(w.x, w.y, 'fx-spark');
        glint.setTint(PALETTE_INT.neonCyan);
        glint.setBlendMode(Phaser.BlendModes.ADD);
        glint.setScale(0.02);
        glint.setAlpha(0);
        glint.setDepth(DEPTH_FLOOR + 7);
        this.tweens.add({
          targets: glint,
          alpha: { from: 0.55, to: 0 },
          scale: 0.05,
          angle: 40,
          duration: 900,
          ease: 'quad.out',
          onComplete: () => glint.destroy(),
        });
      },
    });
  }

  /** Thick cables running from the Dynamo's base across the plaza floor. */
  private placeDynamoCables(cx: number, cy: number): void {
    const g = this.add.graphics();
    g.setDepth(DEPTH_FLOOR + 3);
    const targets: Array<[number, number]> = [
      [cx - 260, cy + 130],
      [cx + 250, cy + 120],
      [cx - 60, cy + 250],
      [cx + 130, cy - 210],
    ];
    for (const [txp, typ] of targets) {
      const midX = (cx + txp) / 2 + (typ > cy ? 24 : -18);
      const midY = (cy + typ) / 2 + 14;
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(cx + (txp > cx ? 60 : -60), cy - 4),
        new Phaser.Math.Vector2(midX, midY),
        new Phaser.Math.Vector2(txp, typ),
      );
      g.lineStyle(7, mixPalette('duskSky', 'ink', 0.35), 1);
      curve.draw(g, 20);
      g.lineStyle(2.5, mixPalette('neonAmber', 'structureMid', 0.55), 0.5);
      curve.draw(g, 20);
      // Junction box at the far end.
      g.fillStyle(mixPalette('structureMid', 'ink', 0.25), 1);
      g.fillRect(txp - 7, typ - 5, 14, 10);
      g.fillStyle(PALETTE_INT.neonAmber, 0.9);
      g.fillRect(txp + 2, typ - 3, 3, 3);
    }
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    const b = mapWorldBounds(this.map.size);
    const m = CONFIG.camera.boundsMarginPx;
    cam.setBounds(b.x - m, b.y - m, b.w + m * 2, b.h + m * 2);
    const center = tileToWorld(this.map.plaza.cx, this.map.plaza.cy);
    cam.centerOn(center.x, center.y);
  }

  /**
   * The standard prop sprite: tinted, depth-sorted, and — if it's tall
   * enough to hide a Spark — registered for occlusion fade (T0/§5).
   */
  private propSprite(name: string, x: number, y: number): Phaser.GameObjects.Image {
    const img = addVoxelSprite(this, name, x, y);
    const wt = worldSpriteTint();
    if (wt !== null) img.setTint(wt);
    img.setDepth(depthForWorldY(y));
    this.occlusion.register(img);
    return img;
  }

  // ── PHOTO MODE (the marketing-shot handle; window.__amperia.photo) ──────
  // Hides every screen-space UI surface, locks the camera on a composed
  // frame, and (by default) drops player nameplates. World-space flavor —
  // merchant names, stall shingles — stays: it's part of the city. Pure
  // presentation; render size comes from the browser viewport (shoot at
  // 2560×1440 by sizing the window).

  /**
   * Compose a frame: camera to `tile` at `zoom`, all UI hidden.
   * `nameplates: true` keeps player nameplates (default: hidden).
   */
  /**
   * U3e connection UX: a banner while we knock, a clean full-screen state
   * if the city stays dark. Never a silent freeze, never raw error text.
   */
  private reconnectFlow(): void {
    const banner = document.createElement('div');
    banner.id = 'amperia-reconnect';
    banner.textContent = 'the city flickered — re-lighting…';
    banner.style.cssText = [
      'position:fixed',
      'top:14px',
      'left:50%',
      'transform:translateX(-50%)',
      'padding:9px 18px',
      `background:${PALETTE.ink}E6`,
      `color:${PALETTE.warmGlow}`,
      `border:1px solid ${PALETTE.neonAmber}`,
      'border-radius:9px',
      'font-family:monospace',
      'font-size:13px',
      'z-index:30',
    ].join(';');
    document.body.append(banner);
    const tryJoin = (attempt: number): void => {
      if (attempt > 5) {
        banner.remove();
        const dark = document.createElement('div');
        dark.style.cssText = [
          'position:fixed',
          'inset:0',
          `background:${PALETTE.ink}F5`,
          'display:flex',
          'flex-direction:column',
          'align-items:center',
          'justify-content:center',
          'gap:14px',
          'z-index:31',
          'font-family:monospace',
        ].join(';');
        const line = document.createElement('div');
        line.textContent = 'The city flickered out.';
        line.style.cssText = `color:${PALETTE.warmGlow};font-size:20px;letter-spacing:2px;`;
        const sub2 = document.createElement('div');
        sub2.textContent = 'The Dynamo is still turning somewhere — knock again.';
        sub2.style.cssText = `color:${UI_TEXT_WARM};opacity:.8;font-size:13px;`;
        const knock = document.createElement('button');
        knock.textContent = 'Knock again';
        knock.style.cssText = [
          'margin-top:8px',
          'padding:11px 30px',
          `background:${PALETTE.neonAmber}`,
          `color:${PALETTE.ink}`,
          'border:none',
          'border-radius:9px',
          'font-family:monospace',
          'font-size:15px',
          'font-weight:bold',
          'cursor:pointer',
        ].join(';');
        knock.onclick = () => window.location.reload();
        dark.append(line, sub2, knock);
        document.body.append(dark);
        return;
      }
      window.setTimeout(
        () => {
          fetch(`${location.protocol}//${location.hostname}:2567/health`)
            .then(() => {
              banner.remove();
              this.scene.restart({ token: this.token, district: this.district });
            })
            .catch(() => tryJoin(attempt + 1));
        },
        Math.min(8000, 900 * attempt * attempt),
      );
    };
    tryJoin(1);
  }

  enterPhotoMode(opts: { tile: { x: number; y: number }; zoom?: number; nameplates?: boolean }): void {
    this.photoMode = { nameplates: opts.nameplates === true };
    this.scene.setVisible(false, 'ui');
    this.cameraCtl.setLocked(true);
    const cam = this.cameras.main;
    cam.removeBounds();
    if (opts.zoom !== undefined) cam.setZoom(opts.zoom);
    const c = tileToWorld(opts.tile.x, opts.tile.y);
    cam.centerOn(c.x, c.y);
    this.hoverMarker?.setVisible(false);
    // Placement affordances (empty berth pads) read as dev chrome on film.
    for (const m of this.berthMarkers) m.setVisible(false);
  }

  /** Back to gameplay: UI, camera bounds, follow, nameplate fading. */
  exitPhotoMode(): void {
    this.photoMode = null;
    this.scene.setVisible(true, 'ui');
    this.setupCamera();
    this.cameraCtl.setLocked(false);
    for (const m of this.berthMarkers) m.setVisible(true);
    const me = this.room !== null ? this.sparks.get(this.room.sessionId) : undefined;
    if (me !== undefined) this.cameraCtl.followTarget(me.image);
  }
}
