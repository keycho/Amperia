import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { buildWorldMap, type Prop, type WorldMap } from '@shared/map';
import { mixPalette, PALETTE_INT } from '@shared/palette';
import { findPath } from '@shared/pathfinding';
import { makeRng, type Rng } from '@shared/rng';
import { JunkHeapNode } from '../entities/JunkHeapNode';
import { Spark } from '../entities/Spark';
import {
  depthForWorldY,
  mapWorldBounds,
  TILE_H,
  TILE_W,
  tileToWorld,
  worldToTileFloor,
} from '../iso/project';
import { TEX_SCALE } from '../render/textures';
import { TINTS } from '../render/tints';
import { CameraController } from '../systems/CameraController';
import { GatherController } from '../systems/GatherController';

/** Depth floor for the ground layer; entities use their anchor world-Y. */
const DEPTH_FLOOR = -100000;

export class WorldScene extends Phaser.Scene {
  private map!: WorldMap;
  private cameraCtl!: CameraController;
  private spark!: Spark;
  private hoverMarker!: Phaser.GameObjects.Image;
  private gatherCtl!: GatherController;
  private nodes: JunkHeapNode[] = [];

  constructor() {
    super('world');
  }

  create(): void {
    this.map = buildWorldMap();
    this.drawFloor();
    this.placeProps();
    this.setupCamera();
    this.cameraCtl = new CameraController(this);
    this.spawnSpark();
    this.spawnJunkHeaps();
    this.setupMoveInput();
    this.scene.launch('ui');
  }

  update(_time: number, deltaMs: number): void {
    this.cameraCtl.update(deltaMs);
    this.updateHoverMarker();
    this.gatherCtl.update(deltaMs);
  }

  private spawnJunkHeaps(): void {
    this.gatherCtl = new GatherController(
      this,
      this.spark,
      { size: this.map.size, walkable: this.map.walkable },
      // Session seed: value rolls should differ between sessions.
      Date.now() >>> 0,
    );
    for (const n of this.map.junkNodes) {
      const node = new JunkHeapNode(this, n.id, n.x, n.y);
      node.image.on(
        'pointerdown',
        (
          pointer: Phaser.Input.Pointer,
          _lx: number,
          _ly: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          if (!pointer.leftButtonDown()) return;
          event.stopPropagation();
          this.gatherCtl.requestGather(node);
        },
      );
      // The glint is its own hit target, above the heap.
      node.glintImage.on(
        'pointerdown',
        (
          pointer: Phaser.Input.Pointer,
          _lx: number,
          _ly: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          if (!pointer.leftButtonDown()) return;
          event.stopPropagation();
          this.gatherCtl.onGlintClicked(node);
        },
      );
      this.nodes.push(node);
    }
  }

  private spawnSpark(): void {
    this.spark = new Spark(this, CONFIG.player.spawn);
    this.cameraCtl.followTarget(this.spark.image);

    this.hoverMarker = this.add.image(0, 0, 'tex-tile-marker');
    this.hoverMarker.setScale(TEX_SCALE);
    this.hoverMarker.setAlpha(0.4);
    this.hoverMarker.setVisible(false);
    this.hoverMarker.setDepth(DEPTH_FLOOR + 1);
  }

  private setupMoveInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const t = worldToTileFloor(world.x, world.y);
      this.walkTo(t.tx, t.ty);
    });
  }

  /** Path the Spark to a walkable tile; pulses the destination marker. */
  private walkTo(tx: number, ty: number): boolean {
    if (this.map.walkable[ty]?.[tx] !== true) return false;
    const path = findPath(
      { size: this.map.size, walkable: this.map.walkable },
      this.spark.settledTile,
      { x: tx, y: ty },
    );
    if (path === null) return false;
    // Walking away abandons any gather in progress.
    this.gatherCtl.cancel();
    this.spark.walk(path);
    this.cameraCtl.followTarget(this.spark.image);
    this.pulseTile(tx, ty);
    return true;
  }

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

    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const { x, y } = tileToWorld(tx, ty);
        const plazaDist = Math.max(Math.abs(tx - plaza.cx), Math.abs(ty - plaza.cy));
        const edgeness = Math.min(1, plazaDist / (size / 2));

        let fill: number;
        if (plazaDist <= plaza.radius) {
          // Warm decking on the plaza — the amber heart of the district.
          fill = mixPalette('groundAccent', 'warmGlow', 0.06 + rng() * 0.1);
        } else {
          // Mauve plating outward, cooling gently toward the fringe.
          const accent = Math.max(0, 0.26 - edgeness * 0.2) * rng();
          const coolShift = Math.max(0, edgeness - 0.55) * 0.5;
          fill =
            coolShift > 0.01
              ? mixPalette('groundBase', 'structureMid', coolShift + rng() * 0.08)
              : mixPalette('groundBase', 'groundAccent', accent);
        }

        g.fillStyle(fill);
        this.traceDiamond(g, x, y);
        g.fillPath();

        // Subtle plating seam so the grid reads without shouting.
        g.lineStyle(1, mixPalette('groundBase', 'ink', 0.55), 0.18);
        this.traceDiamond(g, x, y);
        g.strokePath();

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
          const img = this.add.image(x, y + 10, 'tex-dynamo');
          img.setOrigin(0.5, 1);
          img.setScale(TEX_SCALE * 1.35);
          img.setDepth(depthForWorldY(y));
          // Warm halo — the city's hearth glow.
          const halo = this.add.image(x, y - 150, 'fx-glow');
          halo.setTint(PALETTE_INT.warmGlow);
          halo.setAlpha(0.22);
          halo.setScale(0.85);
          halo.setBlendMode(Phaser.BlendModes.ADD);
          halo.setDepth(depthForWorldY(y) + 1);
          this.tweens.add({
            targets: halo,
            alpha: { from: 0.18, to: 0.26 },
            scale: { from: 0.8, to: 0.92 },
            duration: 2200,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inout',
          });
          break;
        }
        case 'stall': {
          const img = this.add.image(x, y + 2, `stall-${p.variant % 4}`);
          img.setOrigin(0.5, 1);
          // Building art is 132px wide for a 2-tile (128px) footprint.
          img.setScale((TILE_W * 2) / 132);
          img.setTint(TINTS.building);
          img.setDepth(depthForWorldY(y));
          // A little lantern dot by the door so stalls read as "market".
          const lantern = this.add.image(x + 14, y - 30, 'fx-glow');
          lantern.setTint(p.variant % 2 === 0 ? PALETTE_INT.neonAmber : PALETTE_INT.neonRose);
          lantern.setAlpha(0.55);
          lantern.setScale(0.09);
          lantern.setBlendMode(Phaser.BlendModes.ADD);
          lantern.setDepth(depthForWorldY(y) + 1);
          break;
        }
        case 'crate': {
          const img = this.add.image(x, y, `crate-${p.variant % 2}`);
          img.setOrigin(0.5, 1);
          img.setScale((TILE_W * 0.78) / 111);
          img.setTint(TINTS.crate);
          img.setDepth(depthForWorldY(y));
          break;
        }
        case 'block': {
          const img = this.add.image(x, y, `block-${p.variant % 4}`);
          img.setOrigin(0.5, 1);
          img.setScale(TILE_W / 111);
          img.setTint(TINTS.block);
          img.setDepth(depthForWorldY(y));
          break;
        }
        case 'planter': {
          const img = this.add.image(x, y, 'tex-planter');
          img.setOrigin(0.5, 0.92);
          img.setScale(TEX_SCALE * 1.3);
          img.setDepth(depthForWorldY(y));
          break;
        }
      }
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
