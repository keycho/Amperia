import Phaser from 'phaser';
import { hoverTip } from '../ui/Tooltip';
import { CONFIG, type NodeKind } from '@shared/config';
import { targetFrequencyAt, tensionValue } from '@shared/minigames';
import { mixPalette, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { depthForWorldY, TILE_H, tileToWorld } from '../iso/project';
import { TEX_SCALE } from '../render/textures';
import { bloom, worldSpriteTint } from '../render/styleConfig';
import { addLayeredGlow, type LayeredGlow } from '../render/glow';
import { sound } from '../audio/sound';
import { addVoxelSprite, applyVoxelTexture } from '../render/voxel';

/** Common surface the WorldScene talks to. */
export interface NodeView {
  readonly id: number;
  readonly kind: NodeKind;
  /** Main clickable object. */
  readonly image: Phaser.GameObjects.Image;
  depleted: boolean;
  setDepleted(depleted: boolean): void;
}

function anchorFor(tx: number, ty: number): { x: number; y: number } {
  const { x, y } = tileToWorld(tx, ty);
  return { x, y: y + TILE_H / 2 };
}

/** Brass seam: warm ore cube; forks show as spark-trail cues on both sides. */
export class BrassSeamNode implements NodeView {
  readonly kind: NodeKind = 'brassSeam';
  readonly image: Phaser.GameObjects.Image;
  readonly forkZones: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  depleted = false;
  private readonly scene: Phaser.Scene;
  private forkTweens: Phaser.Tweens.Tween[] = [];

  constructor(
    scene: Phaser.Scene,
    readonly id: number,
    tx: number,
    ty: number,
  ) {
    this.scene = scene;
    const { x, y } = anchorFor(tx, ty);
    this.image = addVoxelSprite(scene, 'brass-node', x, y);
    const wt = worldSpriteTint();
    if (wt !== null) this.image.setTint(wt);
    this.image.setDepth(depthForWorldY(y));
    this.image.setInteractive({ useHandCursor: true });
    hoverTip(this.image, () => ({
      title: 'Brass Seam',
      sub: 'Delving · Drillhammer',
      lines: ['Follow the live fork. Some seams never cooled.'],
    }));

    const mkFork = (side: 0 | 1): Phaser.GameObjects.Image => {
      const fx = scene.add.image(x + (side === 0 ? -26 : 26), y - 26, 'fx-spark');
      fx.setBlendMode(Phaser.BlendModes.ADD);
      fx.setScale(0.1);
      fx.setDepth(depthForWorldY(y) + 3);
      fx.setVisible(false);
      fx.setInteractive({
        hitArea: new Phaser.Geom.Circle(fx.frame.width / 2, fx.frame.height / 2, fx.frame.width * 0.55),
        hitAreaCallback: Phaser.Geom.Circle.Contains,
        useHandCursor: true,
      });
      return fx;
    };
    this.forkZones = [mkFork(0), mkFork(1)];
  }

  /** Show the fork cue; the live side runs hot amber, the cold side dim. */
  showFork(liveSide: 0 | 1, cueSeconds: number): void {
    this.hideFork();
    this.forkZones.forEach((fx, side) => {
      const live = side === liveSide;
      fx.setVisible(true);
      fx.setTint(live ? PALETTE_INT.neonAmber : mixPalette('structureMid', 'groundBase', 0.5));
      fx.setAlpha(live ? 1 : 0.45);
      fx.setScale(live ? 0.12 : 0.09);
      this.forkTweens.push(
        this.scene.tweens.add({
          targets: fx,
          scale: live ? { from: 0.12, to: 0.2 } : { from: 0.09, to: 0.11 },
          angle: { from: -10, to: 10 },
          duration: (cueSeconds * 1000) / 3,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inout',
        }),
      );
    });
  }

  hideFork(): void {
    for (const t of this.forkTweens) t.stop();
    this.forkTweens = [];
    for (const fx of this.forkZones) fx.setVisible(false);
  }

  setDepleted(depleted: boolean): void {
    this.depleted = depleted;
    this.hideFork();
    applyVoxelTexture(this.image, depleted ? 'brass-node-depleted' : 'brass-node');
    if (depleted) this.image.disableInteractive();
    else {
      this.image.setInteractive({ useHandCursor: true });
      this.image.setAlpha(0.4);
      this.scene.tweens.add({ targets: this.image, alpha: 1, duration: 350 });
    }
  }
}

/** Amperite crystal: pulses; strike on the glow peak. */
export class AmperiteNode implements NodeView {
  readonly kind: NodeKind = 'amperite';
  readonly image: Phaser.GameObjects.Image;
  depleted = false;
  private readonly scene: Phaser.Scene;
  private readonly glow: Phaser.GameObjects.Image;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    readonly id: number,
    tx: number,
    ty: number,
  ) {
    this.scene = scene;
    const { x, y } = anchorFor(tx, ty);
    this.image = addVoxelSprite(scene, 'amperite-node', x, y);
    const wt = worldSpriteTint();
    if (wt !== null) this.image.setTint(wt);
    this.image.setDepth(depthForWorldY(y));
    this.image.setInteractive({ useHandCursor: true });
    hoverTip(this.image, () => ({
      title: 'Amperite Node',
      sub: 'Delving · Drillhammer',
      lines: ['Strike on the pulse — it keeps its own time.'],
    }));

    this.glow = scene.add.image(x, y - 34, 'fx-glow');
    this.glow.setTint(PALETTE_INT.neonTeal);
    this.glow.setBlendMode(Phaser.BlendModes.ADD);
    this.glow.setScale(0.16);
    this.glow.setAlpha(0.0);
    this.glow.setDepth(depthForWorldY(y) + 2);
    // Standing amperite glow (addendum b): the crystal is a light source
    // even between pulses — "something valuable glowing in the dark".
    addLayeredGlow(scene, x, y - 26, PALETTE_INT.neonTeal, 0.14, depthForWorldY(y) + 1, 0.4);
  }

  /** Animate the pulse locally from the server's rhythm parameters. */
  startPulse(periodSeconds: number, phaseSeconds: number): void {
    this.stopPulse();
    const periodMs = periodSeconds * 1000;
    // Delay so glow peaks line up with the server's phase.
    const startDelay = ((phaseSeconds % periodSeconds) + periodSeconds) % periodSeconds;
    this.pulseTween = this.scene.tweens.add({
      targets: this.glow,
      alpha: { from: bloom(0.08), to: bloom(0.78) },
      scale: { from: 0.12, to: 0.22 },
      delay: startDelay * 1000 - periodMs / 4,
      duration: periodMs / 2,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    });
  }

  stopPulse(): void {
    this.pulseTween?.stop();
    this.pulseTween = null;
    this.glow.setAlpha(0);
  }

  flashStrike(onPulse: boolean): void {
    const burst = this.scene.add.image(this.image.x, this.image.y - 34, 'fx-spark');
    burst.setTint(onPulse ? PALETTE_INT.neonTeal : mixPalette('structureMid', 'ink', 0.1));
    burst.setBlendMode(onPulse ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    burst.setScale(onPulse ? 0.14 : 0.08);
    burst.setDepth(this.image.depth + 4);
    this.scene.tweens.add({
      targets: burst,
      scale: onPulse ? 0.3 : 0.14,
      alpha: 0,
      duration: 300,
      onComplete: () => burst.destroy(),
    });
  }

  setDepleted(depleted: boolean): void {
    this.depleted = depleted;
    this.stopPulse();
    applyVoxelTexture(this.image, depleted ? 'amperite-node-depleted' : 'amperite-node');
    if (depleted) this.image.disableInteractive();
    else {
      this.image.setInteractive({ useHandCursor: true });
      this.image.setAlpha(0.4);
      this.scene.tweens.add({ targets: this.image, alpha: 1, duration: 350 });
    }
  }
}

/** Glowkoi spot: a drifting shadow in the coolant; cast, then reel. */
export class KoiSpotNode implements NodeView {
  readonly kind: NodeKind = 'glowkoi';
  readonly image: Phaser.GameObjects.Image;
  depleted = false;
  private readonly scene: Phaser.Scene;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly shimmer: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;
  private driftTween: Phaser.Tweens.Tween | null = null;
  private tension: { startedAt: number; period: number; sweetStart: number; sweetLen: number } | null =
    null;

  constructor(
    scene: Phaser.Scene,
    readonly id: number,
    tx: number,
    ty: number,
  ) {
    this.scene = scene;
    const { x, y } = tileToWorld(tx, ty);
    // The clickable water tile.
    this.image = scene.add.image(x, y, 'tex-tile-pulse');
    this.image.setAlpha(0.001); // invisible hit surface over the coolant
    this.image.setScale(TEX_SCALE);
    this.image.setDepth(depthForWorldY(y) + 1);
    this.image.setInteractive({ useHandCursor: true });
    hoverTip(this.image, () => ({
      title: 'Glowkoi Water',
      sub: 'Skimming · Skimnet',
      lines: ['Cast on the shadow, reel in the sweet zone.'],
    }));

    this.shadow = scene.add.image(x, y, 'tex-koi-shadow');
    this.shadow.setScale(0.8);
    this.shadow.setAlpha(0);
    this.shadow.setDepth(depthForWorldY(y) + 2);

    this.shimmer = scene.add.image(x, y - 4, 'fx-spark');
    this.shimmer.setTint(PALETTE_INT.neonCyan);
    this.shimmer.setBlendMode(Phaser.BlendModes.ADD);
    this.shimmer.setScale(0.06);
    this.shimmer.setAlpha(0);
    this.shimmer.setDepth(depthForWorldY(y) + 3);

    this.bar = scene.add.graphics();
    this.bar.setDepth(1e9 - 2);
    this.bar.setVisible(false);
  }

  /** A koi drifts in: shadow size telegraphs the size class; rare shimmers. */
  showShadow(sizeIdx: number, rare: boolean): void {
    const size = CONFIG.gathering.glowkoi.sizes[sizeIdx];
    const scale = (size?.shadowScale ?? 1) * 0.85;
    this.shadow.setAlpha(0);
    this.shadow.setScale(scale);
    this.scene.tweens.add({ targets: this.shadow, alpha: 0.85, duration: 400 });
    this.driftTween = this.scene.tweens.add({
      targets: this.shadow,
      x: { from: this.image.x - 14, to: this.image.x + 14 },
      y: { from: this.image.y - 5, to: this.image.y + 5 },
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    });
    this.shimmer.setAlpha(rare ? 0.9 : 0);
    if (rare) {
      this.scene.tweens.add({
        targets: this.shimmer,
        angle: 360,
        duration: 2400,
        repeat: -1,
      });
    }
  }

  hideShadow(): void {
    this.driftTween?.stop();
    this.driftTween = null;
    this.shadow.setAlpha(0);
    this.shimmer.setAlpha(0);
  }

  /** Tension phase: animate the bar locally from server params. */
  startTension(periodSeconds: number, sweetStart: number, sweetLen: number): void {
    this.tension = {
      startedAt: this.scene.time.now,
      period: periodSeconds,
      sweetStart,
      sweetLen,
    };
    this.bar.setVisible(true);
  }

  stopTension(): void {
    this.tension = null;
    this.bar.setVisible(false);
  }

  get inTension(): boolean {
    return this.tension !== null;
  }

  splash(caught: boolean): void {
    const ring = this.scene.add.image(this.shadow.x, this.shadow.y, 'tex-splash-ring');
    ring.setScale(0.4);
    ring.setAlpha(caught ? 1 : 0.5);
    ring.setDepth(this.image.depth + 3);
    this.scene.tweens.add({
      targets: ring,
      scale: 1.1,
      alpha: 0,
      duration: 450,
      onComplete: () => ring.destroy(),
    });
  }

  update(): void {
    if (this.tension === null) return;
    const t = this.tension;
    const elapsed = (this.scene.time.now - t.startedAt) / 1000;
    const v = tensionValue(elapsed, t.period);
    const x = this.image.x - 40;
    const y = this.image.y - 52;
    const W = 80;
    this.bar.clear();
    this.bar.fillStyle(PALETTE_INT.ink, 0.75);
    this.bar.fillRoundedRect(x, y, W, 12, 6);
    // Sweet zone.
    this.bar.fillStyle(PALETTE_INT.neonCyan, 0.55);
    this.bar.fillRoundedRect(x + 2 + t.sweetStart * (W - 4), y + 2, t.sweetLen * (W - 4), 8, 4);
    // Needle.
    this.bar.fillStyle(PALETTE_INT.warmGlow, 1);
    this.bar.fillRect(x + 2 + v * (W - 6), y + 1, 3, 10);
  }

  setDepleted(depleted: boolean): void {
    this.depleted = depleted;
    this.hideShadow();
    this.stopTension();
    if (depleted) this.image.disableInteractive();
    else this.image.setInteractive({ useHandCursor: true });
  }
}

/** Antenna-shrine: the Tuning flagship's world anchor. */
export class AntennaNode implements NodeView {
  readonly kind: NodeKind = 'antenna';
  readonly image: Phaser.GameObjects.Image;
  depleted = false;
  private readonly beaconGlow: Phaser.GameObjects.Image;
  private readonly beaconParts: LayeredGlow;

  constructor(
    scene: Phaser.Scene,
    readonly id: number,
    tx: number,
    ty: number,
  ) {
    const { x, y } = anchorFor(tx, ty);
    this.image = addVoxelSprite(scene, 'antenna', x, y);
    const wt = worldSpriteTint();
    if (wt !== null) this.image.setTint(wt);
    this.image.setDepth(depthForWorldY(y));
    this.image.setInteractive({ useHandCursor: true });
    hoverTip(this.image, () => ({
      title: 'Antenna Mast',
      sub: 'Tuning · Tuner',
      lines: ['Hold the needle on the drift. The static talks.'],
    }));

    // Beacon in the glow language (addendum b): hot core + teal bloom;
    // the breathing tween rides the mid layer.
    const beacon = addLayeredGlow(scene, x, y - 108, PALETTE_INT.neonTeal, 0.24, depthForWorldY(y) + 2);
    this.beaconGlow = beacon.mid;
    this.beaconParts = beacon;
    scene.tweens.add({
      targets: this.beaconGlow,
      alpha: { from: bloom(0.3), to: bloom(0.55) },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    });
    {
      const pool = scene.add.image(x, y - 4, 'fx-glow');
      pool.setTint(PALETTE_INT.neonTeal);
      pool.setBlendMode(Phaser.BlendModes.ADD);
      pool.setScale(0.34, 0.15);
      pool.setAlpha(0.2);
      pool.setDepth(depthForWorldY(y) - 1);
    }
  }

  setDepleted(depleted: boolean): void {
    this.depleted = depleted;
    this.beaconParts.core.setVisible(!depleted);
    this.beaconParts.mid.setVisible(!depleted);
    this.beaconParts.outer.setVisible(!depleted);
    this.image.setAlpha(depleted ? 0.75 : 1);
    if (depleted) this.image.disableInteractive();
    else this.image.setInteractive({ useHandCursor: true });
  }
}

/** Screen-space tuner deck for the Signal flagship minigame. */
export class TunerPanel {
  private readonly scene: Phaser.Scene;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private active: {
    nodeId: number;
    startedAt: number;
    seconds: number;
    phase: number;
    driftSpeed: number;
    amplitude: number;
    tolerance: number;
  } | null = null;
  private needle = 0.5;
  private lastSentAt = 0;
  onNeedle: ((nodeId: number, needle: number) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.g = scene.add.graphics();
    this.g.setScrollFactor(0);
    this.g.setDepth(5000);
    this.g.setVisible(false);
    this.label = scene.add.text(0, 0, 'tune the dial — follow the drifting band', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: UI_TEXT_WARM,
    });
    this.label.setScrollFactor(0);
    this.label.setDepth(5001);
    this.label.setVisible(false);
  }

  get isActive(): boolean {
    return this.active !== null;
  }

  start(params: {
    nodeId: number;
    seconds: number;
    phase: number;
    driftSpeed: number;
    amplitude: number;
    tolerance: number;
  }): void {
    this.active = { ...params, startedAt: this.scene.time.now };
    this.needle = 0.5;
    this.g.setVisible(true);
    this.label.setVisible(true);
    sound.tunerStart();
  }

  stop(): void {
    if (this.active !== null) sound.tunerStop();
    this.active = null;
    this.g.setVisible(false);
    this.label.setVisible(false);
  }

  update(): void {
    const a = this.active;
    if (a === null) return;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const trackW = Math.min(520, w - 160);
    const x = (w - trackW) / 2;
    const y = h - 132;
    const elapsed = (this.scene.time.now - a.startedAt) / 1000;

    // Needle follows the pointer across the track.
    const pointer = this.scene.input.activePointer;
    this.needle = Math.min(1, Math.max(0, (pointer.x - x) / trackW));
    if (this.scene.time.now - this.lastSentAt > 80 && this.onNeedle !== null) {
      this.lastSentAt = this.scene.time.now;
      this.onNeedle(a.nodeId, this.needle);
    }

    // Same math as the server (shared/minigames).
    const target = targetFrequencyAt(elapsed, a.phase, {
      driftSpeed: a.driftSpeed,
      amplitude: a.amplitude,
    });
    const locked = Math.abs(this.needle - target) <= a.tolerance;
    const remaining = Math.max(0, a.seconds - elapsed);
    // Static fades and the carrier rises as the needle closes in.
    sound.tunerUpdate(Math.max(0, 1 - Math.abs(this.needle - target) / (a.tolerance * 4)));

    const g = this.g;
    g.clear();
    // Deck panel.
    g.fillStyle(PALETTE_INT.structureMid, 0.95);
    g.fillRoundedRect(x - 18, y - 26, trackW + 36, 74, 12);
    g.lineStyle(2, PALETTE_INT.ink, 1);
    g.strokeRoundedRect(x - 18, y - 26, trackW + 36, 74, 12);
    // Track.
    g.fillStyle(PALETTE_INT.ink, 0.9);
    g.fillRoundedRect(x, y, trackW, 18, 9);
    // Target band (the drifting station).
    const bandW = a.tolerance * 2 * trackW;
    g.fillStyle(locked ? PALETTE_INT.neonTeal : PALETTE_INT.warmGlow, locked ? 0.85 : 0.5);
    g.fillRoundedRect(x + target * trackW - bandW / 2, y + 2, bandW, 14, 7);
    // Needle.
    g.fillStyle(locked ? PALETTE_INT.neonTeal : PALETTE_INT.neonAmber, 1);
    g.fillRect(x + this.needle * trackW - 2, y - 6, 4, 30);
    // Time left.
    g.fillStyle(PALETTE_INT.warmGlow, 0.9);
    g.fillRoundedRect(x, y + 28, trackW * (remaining / a.seconds), 5, 2.5);

    this.label.setPosition(x - 2, y - 22);
  }
}
