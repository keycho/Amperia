import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { PALETTE_INT } from '@shared/palette';
import type { TilePoint } from '@shared/pathfinding';
import { depthForWorldY, tileToWorld } from '../iso/project';
import { addVoxelSprite } from '../render/voxel';
import { hoverTip } from '../ui/Tooltip';

/**
 * A feral Scuttlebot, rendered from server truth: the server owns AI, HP,
 * and every tile it stands on. This class only animates what it's told.
 */
export class Mob {
  readonly id: string;
  readonly image: Phaser.GameObjects.Image;
  private readonly eye: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private tile: TilePoint;
  private hp: number;
  private maxHp: number;
  private ai = 'idle';
  private stepTween: Phaser.Tweens.Tween | null = null;
  private windupTween: Phaser.Tweens.Tween | null = null;
  private baseScaleY: number;

  private readonly kind: string;

  constructor(
    scene: Phaser.Scene,
    id: string,
    kind: string,
    tile: TilePoint,
    hp: number,
    maxHp: number,
  ) {
    this.scene = scene;
    this.id = id;
    this.kind = kind;
    this.tile = { ...tile };
    this.hp = hp;
    this.maxHp = maxHp;
    const { x, y } = tileToWorld(tile.x, tile.y);
    const TEX: Record<string, string> = {
      junkhound: 'junkhound',
      sparkwisp: 'sparkwisp',
      draymule: 'draymule-mob',
    };
    this.image = addVoxelSprite(scene, TEX[kind] ?? 'scuttlebot-feral', x, y);
    this.image.setDepth(depthForWorldY(y));
    this.image.setInteractive({ useHandCursor: true });
    // U3c: what am I looking at, and will it hurt me.
    const TIPS: Record<string, { sub: string; line: string }> = {
      scuttlebot: { sub: 'feral · bites up close', line: 'Put it down for Brawling. Wears a crest, sometimes.' },
      junkhound: { sub: 'feral · fast and mean', line: 'It hunts in the open. Bring a wrench or bring friends.' },
      sparkwisp: { sub: 'living charge · zaps on touch', line: 'Never chases far. Pops with a filament, sometimes.' },
      draymule: { sub: 'rogue cargo bot · bring friends', line: 'Everyone who lands a hit shares the cargo.' },
    };
    const NAMES: Record<string, string> = {
      scuttlebot: 'Feral Scuttlebot',
      junkhound: 'Junkhound',
      sparkwisp: 'Sparkwisp',
      draymule: 'Rogue Draymule',
    };
    hoverTip(this.image, () => ({
      title: NAMES[kind] ?? kind,
      sub: TIPS[kind]?.sub ?? '',
      lines: [TIPS[kind]?.line ?? ''],
    }));
    this.baseScaleY = this.image.scaleY;
    this.eye = scene.add.image(x + 5, y - 8, 'fx-glow');
    this.eye.setTint(
      kind === 'sparkwisp'
        ? PALETTE_INT.neonTeal
        : kind === 'draymule'
          ? PALETTE_INT.neonAmber
          : PALETTE_INT.neonRose,
    );
    this.eye.setBlendMode(Phaser.BlendModes.ADD);
    this.eye.setScale(0.04);
    this.eye.setAlpha(0.6);
    this.bar = scene.add.graphics();
    this.bar.setVisible(false);
    this.sync();
    // Pop in with a small bounce (fresh off the scrap pile).
    this.image.setScale(this.image.scaleX, 0.01);
    scene.tweens.add({
      targets: this.image,
      scaleY: this.baseScaleY,
      duration: 260,
      ease: 'back.out',
    });
  }

  get currentTile(): TilePoint {
    return this.tile;
  }

  /** Server committed a new tile — walk there at the mob's config speed. */
  moveTo(tile: TilePoint): void {
    this.tile = { ...tile };
    const to = tileToWorld(tile.x, tile.y);
    if (to.x !== this.image.x) this.image.setFlipX(to.x < this.image.x);
    this.stepTween?.stop();
    this.stepTween = this.scene.tweens.add({
      targets: this.image,
      x: to.x,
      y: to.y,
      duration:
        (this.kind === 'junkhound'
          ? CONFIG.junkhound.moveSecondsPerTile
          : CONFIG.combat.scuttlebot.moveSecondsPerTile) * 1000,
      ease: 'linear',
      onUpdate: () => this.sync(),
      onComplete: () => {
        this.stepTween = null;
        this.sync();
      },
    });
  }

  setHp(hp: number): void {
    this.hp = hp;
    this.drawBar();
  }

  /** Telegraphs: squat + eye flare during windup; release on exit. */
  setAi(ai: string): void {
    if (ai === this.ai) return;
    const was = this.ai;
    this.ai = ai;
    if (ai === 'windup') {
      this.windupTween?.stop();
      this.windupTween = this.scene.tweens.add({
        targets: this.image,
        scaleY: this.baseScaleY * 0.8,
        duration: 140,
        ease: 'quad.out',
      });
      this.scene.tweens.add({
        targets: this.eye,
        alpha: 1,
        scale: 0.085,
        duration:
          (this.kind === 'junkhound'
            ? CONFIG.junkhound.windupSeconds
            : CONFIG.combat.scuttlebot.windupSeconds) * 1000,
        ease: 'quad.in',
      });
    } else if (was === 'windup') {
      this.windupTween?.stop();
      this.windupTween = null;
      this.scene.tweens.killTweensOf(this.eye);
      this.eye.setAlpha(0.6);
      this.eye.setScale(0.04);
      this.scene.tweens.add({
        targets: this.image,
        scaleY: this.baseScaleY,
        duration: 160,
        ease: 'back.out',
      });
    }
  }

  /** The bite lands: a quick lunge toward the victim's position. */
  lungeAt(worldX: number, worldY: number): void {
    const ox = this.image.x;
    const oy = this.image.y;
    const dx = Math.sign(worldX - ox) * 10;
    const dy = Math.sign(worldY - oy) * 5;
    this.scene.tweens.add({
      targets: this.image,
      x: ox + dx,
      y: oy + dy,
      duration: 90,
      yoyo: true,
      ease: 'quad.out',
      onUpdate: () => this.sync(),
    });
  }

  /** Struck by a Spark: warm flash + a small flinch away. */
  flashHit(): void {
    this.image.setTintFill(PALETTE_INT.warmGlow);
    this.scene.time.delayedCall(80, () => {
      if (this.image.active) this.image.clearTint();
    });
    this.scene.tweens.add({
      targets: this.image,
      angle: { from: -4, to: 4 },
      duration: 60,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.image.setAngle(0),
    });
  }

  /** Death poof — scale-down + a few sparks; the entity is then destroyed. */
  poof(): void {
    const burst = this.scene.add.image(this.image.x, this.image.y - 8, 'fx-spark');
    burst.setTint(PALETTE_INT.neonRose);
    burst.setBlendMode(Phaser.BlendModes.ADD);
    burst.setScale(0.08);
    burst.setDepth(this.image.depth + 2);
    this.scene.tweens.add({
      targets: burst,
      scale: 0.24,
      alpha: 0,
      angle: 90,
      duration: 380,
      onComplete: () => burst.destroy(),
    });
    this.scene.tweens.add({
      targets: this.image,
      scaleY: 0.02,
      alpha: 0.2,
      duration: 220,
      ease: 'quad.in',
      onComplete: () => this.destroy(),
    });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.image);
    this.scene.tweens.killTweensOf(this.eye);
    this.eye.destroy();
    this.bar.destroy();
    this.image.destroy();
  }

  private sync(): void {
    this.image.setDepth(depthForWorldY(this.image.y));
    this.eye.setPosition(this.image.x + (this.image.flipX ? -5 : 5), this.image.y - 8);
    this.eye.setDepth(this.image.depth + 1);
    this.drawBar();
  }

  private drawBar(): void {
    if (this.hp >= this.maxHp || this.hp <= 0) {
      this.bar.setVisible(false);
      return;
    }
    this.bar.setVisible(true);
    const x = this.image.x - 14;
    const y = this.image.y - this.image.displayHeight - 8;
    this.bar.clear();
    this.bar.fillStyle(PALETTE_INT.ink, 0.7);
    this.bar.fillRoundedRect(x, y, 28, 5, 2.5);
    this.bar.fillStyle(PALETTE_INT.neonRose, 0.95);
    this.bar.fillRoundedRect(x + 1, y + 1, Math.max(2, 26 * (this.hp / this.maxHp)), 3, 1.5);
    this.bar.setDepth(this.image.depth + 2);
  }
}
