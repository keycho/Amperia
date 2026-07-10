import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS } from '@shared/items';
import { buildDistrictMap, type DistrictId, type Prop, type WorldMap } from '@shared/map';
import { blendInt, MATERIAL_INT, mixPalette, PALETTE, PALETTE_INT } from '@shared/palette';
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
  TradeAskEvent,
  TradeEndEvent,
  TradeSyncEvent,
  TravelGo,
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
import { floorTileKey, type FloorKind } from '../render/floorTiles';
import { addEmberMotes, addFlicker, addSteamVent } from '../render/life';
import { TEX_SCALE } from '../render/textures';
import { addSkyline, makeSkylineTexture } from '../render/ambience';
import { addVoxelSprite, syncVoxelShadows } from '../render/voxel';
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
  private identity: IdentityEvent | null = null;
  /** Last-inspected Spark: their nameplate never fades (S0). */
  private inspectTarget: string | null = null;
  private nameFadeAcc = 0;
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
  /** String-light bulb glows — the Citywide Charge scales their density. */
  private stringBulbGlows: Phaser.GameObjects.Image[] = [];
  private chargeLightingTier = 0;
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
    this.stringBulbGlows = [];
    this.chargeLightingTier = 0;
    this.puddleCount = 0;
  }

  create(): void {
    this.map = buildDistrictMap(this.district);
    // Elevation-aware projection (R4): every tile-derived world position
    // lifts by the tile's level from here on.
    setElevationLookup((tx, ty) => this.map.elevation[ty]?.[tx] ?? 0);
    makeSkylineTexture(this);
    this.drawFloor();
    this.placeProps();
    this.placeRopes();
    this.placeAntennaCables();
    this.placeTangleCables();
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
    // Nameplate proximity fade (S0), throttled to ~6Hz.
    this.nameFadeAcc += deltaMs;
    if (this.nameFadeAcc >= 160) {
      this.nameFadeAcc = 0;
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
    room.onMessage(MSG.travelGo, (e: TravelGo) => {
      const to: DistrictId = e.to === 'tangle' ? 'tangle' : 'filament';
      localStorage.setItem(DISTRICT_KEY, to);
      session.events.emit(
        SessionEvents.notice,
        to === 'tangle' ? 'The tram rattles out into the Tangle…' : 'Homeward — the Filament glow ahead.',
      );
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
        this.cameras.main.shake(110, 0.0035);
        sound.hurtThud();
      }
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
          const node = new JunkHeapNode(this, n.id, n.x, n.y);
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
          tile.setScale(0.5);
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
        } else if (inLane || onBoardwalk) kind = 'deck';
        else if (onStepRing) kind = 'paverLight';
        else if (inPlaza) kind = 'paver';
        else if (distToEdgeT <= 6 || (!isTangle && tx >= 27 && ty >= 28)) kind = 'plating';
        else kind = 'asphalt';
        const tile = this.add.image(x, y, floorTileKey(kind, seed));
        tile.setScale(0.5);
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
          const eSE = this.map.elevation[ty]?.[tx + 1];
          if (eSE !== undefined && eSE < e) {
            drawFace(
              x, y + TILE_H / 2, x + TILE_W / 2, y,
              (e - eSE) * ELEV_PX,
              this.lerpColor(MATERIAL_INT.concreteDeep, PALETTE_INT.ink, 0.3),
            );
          }
          const eSW = this.map.elevation[ty + 1]?.[tx];
          if (eSW !== undefined && eSW < e) {
            drawFace(
              x - TILE_W / 2, y, x, y + TILE_H / 2,
              (e - eSW) * ELEV_PX,
              MATERIAL_INT.concreteDeep,
            );
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

    // THE VOID (§B5): the map is an island of light — its last rows fade
    // into near-black so screenshot corners are dark, not plum.
    const voidG = this.add.graphics();
    voidG.setDepth(DEPTH_FLOOR + 2);
    const FADE = 5;
    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const distToEdge = Math.min(tx, ty, size - 1 - tx, size - 1 - ty);
        if (distToEdge >= FADE) continue;
        const a = Math.pow((FADE - distToEdge) / FADE, 1.6) * 0.92;
        const { x, y } = tileToWorld(tx, ty);
        voidG.fillStyle(MATERIAL_INT.voidBlack, a);
        this.traceDiamond(voidG, x, y);
        voidG.fillPath();
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
    for (const p of this.map.props) {
      const { x, y } = this.propAnchor(p);
      switch (p.kind) {
        case 'dynamo': {
          this.dynamoWorld = { x, y: y - 90 };
          const img = addVoxelSprite(this, 'dynamo', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
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
          const img = addVoxelSprite(this, `stall-${p.variant % 4}`, x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
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
          const img = addVoxelSprite(this, 'crate', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          break;
        }
        // I6 vignette props: variants pick the sub-style bake.
        case 'cablespool':
        case 'barrels':
        case 'pallets':
        case 'gascans':
        case 'tarp':
        case 'scrapbin': {
          const img = addVoxelSprite(this, `${p.kind}-${p.variant % 2}`, x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          break;
        }
        case 'fortunecoil': {
          const img = addVoxelSprite(this, 'fortunecoil', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          this.placeCoilFace(p, img);
          break;
        }
        case 'ventbox':
        case 'toolrack': {
          const img = addVoxelSprite(this, p.kind, x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          if (p.kind === 'ventbox') {
            // The status lamp hums teal (light is life — §12A).
            addFlicker(this, addLayeredGlow(this, x + 10, y - 26, PALETTE_INT.neonTeal, 0.28, depthForWorldY(y) + 1, 0.35).core, 0.5, 0.2);
          }
          break;
        }
        case 'block': {
          // Variants: 0-2 painted (Filament), 3 drums, 4-6 the Tangle's
          // rust/gunmetal family (§12B accent discipline — no confetti).
          const name =
            p.variant === 3
              ? 'drums'
              : p.variant >= 4
                ? `container-r${(p.variant - 4) % 3}`
                : `container-${p.variant % 3}`;
          const img = addVoxelSprite(this, name, x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          break;
        }
        case 'stack': {
          // Variant: height 2-4, +10 = the occasional hazard-striped one.
          const h = Math.min(4, Math.max(2, p.variant >= 10 ? p.variant - 10 : p.variant));
          const img = addVoxelSprite(this, `stack-${h}${p.variant >= 10 ? 's' : ''}`, x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          break;
        }
        case 'cranehulk': {
          const img = addVoxelSprite(this, 'cranehulk', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
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
          const img = addVoxelSprite(this, `deadmachine-${p.variant % 3}`, x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          break;
        }
        case 'pylon': {
          const img = addVoxelSprite(this, 'pylon', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          break;
        }
        case 'planter': {
          const img = addVoxelSprite(this, 'planter', x, y);
          const pt = worldSpriteTint();
          if (pt !== null) img.setTint(pt);
          img.setDepth(depthForWorldY(y));
          break;
        }
        case 'tramgate': {
          const img = addVoxelSprite(this, 'tramgate', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          // Ride the tram: click sends the travel intent (server checks the
          // gate distance and takes the Bolts toll before the hop).
          const dest: DistrictId = this.district === 'filament' ? 'tangle' : 'filament';
          const destName = dest === 'tangle' ? 'the Tangle' : 'the Filament';
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
              floatText(
                this,
                img.x,
                img.y - 70,
                `to ${destName} — ${CONFIG.travel.tollBolts} Bolts`,
                PALETTE.neonAmber,
              );
              send.travel(this.room, { to: dest });
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
          const img = addVoxelSprite(this, 'merchant', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
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
          const img = addVoxelSprite(this, 'tinkerbench', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
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
          const img = addVoxelSprite(this, 'dispatcher', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
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
          const img = addVoxelSprite(this, 'warden', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
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
          const img = addVoxelSprite(this, 'heatlamp', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
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
          break;
        }
        case 'ropepost': {
          const img = addVoxelSprite(this, 'ropepost', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          break;
        }
        case 'shack': {
          const img = addVoxelSprite(this, `shack-${p.variant % 3}`, x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          const signTint = [PALETTE_INT.neonRose, PALETTE_INT.neonAmber, PALETTE_INT.neonTeal][
            p.variant % 3
          ] as number;
          // Neon sign over the door (front-left face) + warm window spill.
          const sign = this.add.image(x - 22, y - 34, 'fx-glow');
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
          const win = this.add.image(x + 20, y - 24, 'fx-glow');
          win.setTint(PALETTE_INT.warmGlow);
          win.setBlendMode(Phaser.BlendModes.ADD);
          win.setAlpha(bloom(0.42));
          win.setScale(0.09);
          win.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, win, bloom(0.42), 0.05);
          this.addGroundPool(x - 12, y - 2, signTint, 0.5);
          this.addGroundPool(x + 16, y - 2, PALETTE_INT.warmGlow, 0.34);
          break;
        }
      }
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
    if (this.stringBulbGlows.length === 0) return;
    const fraction = Math.min(1, 0.45 + 0.19 * tier);
    this.stringBulbGlows.forEach((glow, i) => {
      // Deterministic thinning: each bulb owns THREE glow layers (core/
      // mid/outer — addendum b), so the lit test keys on the bulb index;
      // lights ADD as the tier climbs, never shuffle.
      const bulb = Math.floor(i / 3);
      const lit = (bulb % 100) / 100 < fraction;
      glow.setVisible(lit);
    });
  }

  /**
   * Three harmless Scuttlebots pottering around the plaza edge: pure decor,
   * client-side only. They skitter off when a Spark walks up. The hostile
   * kind (server-owned, in the scrap fringe) is a separate creature.
   */
  private spawnAmbientBots(): void {
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
}
