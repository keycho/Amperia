import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS } from '@shared/items';
import { buildWorldMap, type Prop, type WorldMap } from '@shared/map';
import { mixPalette, PALETTE, PALETTE_INT } from '@shared/palette';
import type {
  ChatBroadcast,
  CombatEvent,
  EmoteBroadcast,
  MobStateShape,
  NodeEventPayload,
  NoticeEvent,
  SkillsSync,
  XpGainEvent,
  GatherStartEvent,
  GatherStopEvent,
  GlintHideEvent,
  GlintShowEvent,
  InventorySync,
  LootEvent,
  MoveAcceptedEvent,
  NodeStateShape,
  PlayerStateShape,
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
  depthForWorldY,
  mapWorldBounds,
  TILE_H,
  TILE_W,
  tileToWorld,
  worldToTileFloor,
} from '../iso/project';
import {
  getStateCallbacks,
  joinFilament,
  MSG,
  send,
  TOKEN_KEY,
  type FilamentRoom,
} from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { floatText } from '../render/effects';
import { addEmberMotes, addFlicker, addSteamVent } from '../render/life';
import { TEX_SCALE } from '../render/textures';
import { addSkyline, makeSkylineTexture } from '../render/ambience';
import { addVoxelSprite } from '../render/voxel';
import { bloom, gradeGround, worldSpriteTint } from '../render/styleConfig';
import { CameraController } from '../systems/CameraController';
import { GatherView } from '../systems/GatherView';
import { gameState } from '../state/GameState';

/** Depth floor for the ground layer; entities use their anchor world-Y. */
const DEPTH_FLOOR = -100000;

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
  private tuner!: TunerPanel;
  private nodes = new Map<number, NodeView>();
  private sparks = new Map<string, Spark>();
  private mobs = new Map<string, Mob>();
  private ambientBots: AmbientScuttlebot[] = [];
  private room: FilamentRoom | null = null;
  private token = '';
  private connectingText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('world');
  }

  init(data: { token?: string }): void {
    this.token = data.token ?? '';
  }

  create(): void {
    this.map = buildWorldMap();
    makeSkylineTexture(this);
    this.drawFloor();
    this.placeProps();
    this.placeStringLights();
    this.placeCanalLife();
    this.spawnAmbientBots();
    addSkyline(this, -70);
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

  update(time: number, deltaMs: number): void {
    this.cameraCtl.update(deltaMs);
    this.updateHoverMarker();
    this.gatherView.update();
    this.tuner.update();
    for (const node of this.nodes.values()) {
      if (node instanceof KoiSpotNode) node.update();
    }
    if (this.ambientBots.length > 0) {
      const sparkTiles = [...this.sparks.values()].map((s) => s.settledTile);
      for (const bot of this.ambientBots) bot.update(time, sparkTiles);
    }
  }

  // ── networking ─────────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    try {
      const room = await joinFilament(this.token);
      this.bindRoom(room);
      this.connectingText?.destroy();
      this.connectingText = null;
    } catch (err) {
      console.error('[net] join failed', err);
      localStorage.removeItem(TOKEN_KEY);
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
    }
    const proxy = getStateCallbacks(room) as unknown as (o: unknown) => EntityProxy;
    const $state = proxy(room.state) as unknown as StateProxy;

    $state.players.onAdd((p: PlayerStateShape, sessionId: string) => {
      const spark = new Spark(this, { x: p.tileX, y: p.tileY }, p.sparkName);
      this.sparks.set(sessionId, spark);
      session.events.emit(SessionEvents.presence, this.sparks.size);
      if (sessionId === room.sessionId) {
        this.cameraCtl.followTarget(spark.image);
        session.events.emit(SessionEvents.hp, { hp: p.hp, maxHp: p.maxHp });
        proxy(p).listen('hp', (v: number) =>
          session.events.emit(SessionEvents.hp, { hp: v, maxHp: p.maxHp }),
        );
      }
      // Drift correction: if the server's committed tile diverges while the
      // client isn't animating a path, snap to truth.
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
      const mob = new Mob(this, id, { x: m.tileX, y: m.tileY }, m.hp, m.maxHp);
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

    room.onMessage(MSG.moveAccepted, (e: MoveAcceptedEvent) => {
      const spark = this.sparks.get(e.sessionId);
      spark?.walk(e.path);
      if (e.sessionId === room.sessionId && spark !== undefined) {
        this.cameraCtl.followTarget(spark.image);
      }
    });

    room.onMessage(MSG.gatherStart, (e: GatherStartEvent) => {
      const node = this.nodes.get(e.nodeId);
      this.activeSessionNode = e.nodeId;
      if (node !== undefined) this.gatherView.start(node, e.seconds);
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
      } else {
        floatText(this, nx, ny, 'Pack is full!', PALETTE.neonRose);
      }
      if (e.rare !== null) {
        floatText(this, nx, ny - 20, `+1 ${ITEMS[e.rare].name} ✦`, PALETTE.neonAmber);
      }
    });

    room.onMessage(MSG.inventory, (sync: InventorySync) => gameState.applySync(sync));
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
    room.onMessage(MSG.notice, (n: NoticeEvent) =>
      session.events.emit(SessionEvents.notice, n.text),
    );

    room.onLeave(() => {
      session.room = null;
      this.room = null;
    });

    this.scene.launch('ui');
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
    if (this.hoverMarker === undefined) {
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
    g.setDepth(DEPTH_FLOOR);
    const rng: Rng = makeRng(CONFIG.map.seed ^ 0x5eed);

    // Where lamplight lands (tile coords) — the wet glaze catches it there.
    const lightSpots: Array<{ x: number; y: number; cool: boolean }> = [];
    for (const p of this.map.props) {
      if (p.kind === 'dynamo') lightSpots.push({ x: p.x + 1.5, y: p.y + 1.5, cool: false });
      if (p.kind === 'stall') lightSpots.push({ x: p.x + 1, y: p.y + 2, cool: false });
      if (p.kind === 'planter') lightSpots.push({ x: p.x, y: p.y, cool: false });
    }
    for (const n of this.map.nodes) {
      if (n.kind === 'antenna') lightSpots.push({ x: n.x, y: n.y, cool: true });
      if (n.kind === 'glowkoi') lightSpots.push({ x: n.x, y: n.y, cool: true });
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
        const edgeness = Math.min(1, plazaDist / (size / 2));

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

        // Coolant canal: a dark built channel with cyan glints.
        if (this.map.canal[ty]?.[tx] === true) {
          g.fillStyle(gradeGround(mixPalette('duskSky', 'ink', 0.45 + rng() * 0.1)));
          this.traceDiamond(g, x, y);
          g.fillPath();
          if (rng() < 0.22) {
            // Faint coolant ripple, barely catching the neon.
            g.lineStyle(1, mixPalette('neonCyan', 'duskSky', 0.72), 0.16 + rng() * 0.06);
            const gx = x - 10 + rng() * 20;
            const gy = y - 3 + rng() * 6;
            g.lineBetween(gx - 8, gy, gx + 8, gy);
          }
          continue;
        }

        let fill: number;
        const inPlaza = plazaDist <= plaza.radius;
        if (inPlaza) {
          // Night market at night: even the plaza is deep plum — the warmth
          // on it comes from lamplight pools, not from the ground color.
          fill = mixPalette('duskSky', 'groundBase', 0.24 + rng() * 0.08);
        } else {
          // Streets: deep ink-plum, sinking toward ink at the fringe.
          const t = 0.12 + edgeness * 0.3 + rng() * 0.06;
          fill = mixPalette('duskSky', 'ink', Math.min(0.55, t));
        }

        g.fillStyle(gradeGround(fill));
        this.traceDiamond(g, x, y);
        g.fillPath();

        // Plaza decking planks (subtle seams along the NE facet).
        if (inPlaza && (tx + ty) % 2 === 0) {
          g.lineStyle(1, mixPalette('groundAccent', 'ink', 0.3), 0.1);
          g.lineBetween(x - TILE_W / 4, y - TILE_H / 4 + 2, x + TILE_W / 4, y + TILE_H / 4 + 2);
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
        }

        // Occasional rivets on the plating.
        if (rng() < 0.07 && plazaDist > plaza.radius) {
          g.fillStyle(mixPalette('groundBase', 'ink', 0.4), 0.8);
          g.fillCircle(x - 6 + rng() * 12, y - 3 + rng() * 6, 1.6);
        }
      }
    }
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

  private placeProps(): void {
    for (const p of this.map.props) {
      const { x, y } = this.propAnchor(p);
      switch (p.kind) {
        case 'dynamo': {
          const img = addVoxelSprite(this, 'dynamo', x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          // Crown halo — the biggest light in the city.
          const halo = this.add.image(x, y - 168, 'fx-glow');
          halo.setTint(PALETTE_INT.warmGlow);
          halo.setAlpha(bloom(0.44));
          halo.setScale(1.35);
          halo.setBlendMode(Phaser.BlendModes.ADD);
          halo.setDepth(depthForWorldY(y) + 1);
          this.tweens.add({
            targets: halo,
            alpha: { from: bloom(0.36), to: bloom(0.52) },
            scale: { from: 1.28, to: 1.42 },
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
          // Teal beacon glint on the cap.
          const beacon = this.add.image(x, y - 210, 'fx-glow');
          beacon.setTint(PALETTE_INT.neonTeal);
          beacon.setBlendMode(Phaser.BlendModes.ADD);
          beacon.setScale(0.12);
          beacon.setAlpha(bloom(0.6));
          beacon.setDepth(depthForWorldY(y) + 2);
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
          const img = addVoxelSprite(this, `stall-${p.variant % 4}`, x, y);
          const wt = worldSpriteTint();
          if (wt !== null) img.setTint(wt);
          img.setDepth(depthForWorldY(y));
          // Lantern glow on the baked lantern voxel (right post, mid-height).
          const lantern = this.add.image(x + 34, y - 58, 'fx-glow');
          lantern.setTint(p.variant % 2 === 0 ? PALETTE_INT.neonAmber : PALETTE_INT.neonRose);
          lantern.setAlpha(bloom(0.88));
          lantern.setScale(0.14);
          lantern.setBlendMode(Phaser.BlendModes.ADD);
          lantern.setDepth(depthForWorldY(y) + 1);
          addFlicker(this, lantern, bloom(0.88), 0.1);
          addEmberMotes(this, x + 34, y - 52, depthForWorldY(y) + 2, {
            count: 2,
            radius: 8,
            rise: 34,
            tint: p.variant % 2 === 0 ? PALETTE_INT.neonAmber : PALETTE_INT.neonRose,
          });
          // Sign glyph glow (left of center, under the awning).
          const sign = this.add.image(x - 6, y - 62, 'fx-glow');
          sign.setTint(PALETTE_INT.neonAmber);
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
        case 'block': {
          const name = p.variant % 4 === 3 ? 'drums' : `container-${p.variant % 3}`;
          const img = addVoxelSprite(this, name, x, y);
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
          addFlicker(this, sign, bloom(0.66), 0.12);
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
        const glow = this.add.image(p.x, p.y + 2, 'fx-glow');
        glow.setTint(tint);
        glow.setBlendMode(Phaser.BlendModes.ADD);
        glow.setScale(0.062);
        glow.setAlpha(bloom(0.85));
        glow.setDepth(1e5 + 1);
        // Every third bulb wavers a touch — strings feel strung, not printed.
        if (i % 3 === 0) addFlicker(this, glow, bloom(0.85), 0.09);
        if (i % 3 === 1) this.addGroundPool(p.x, p.y + 90, tint, 0.22);
      }
    }
  }

  /**
   * Three harmless Scuttlebots pottering around the plaza edge: pure decor,
   * client-side only. They skitter off when a Spark walks up. The hostile
   * kind (server-owned, in the scrap fringe) is a separate creature.
   */
  private spawnAmbientBots(): void {
    const { cx, cy, radius } = this.map.plaza;
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
