import Phaser from 'phaser';
import { hoverTip } from '../ui/Tooltip';
import { CONFIG } from '@shared/config';
import { PALETTE_INT } from '@shared/palette';
import { depthForWorldY, TILE_H, tileToWorld } from '../iso/project';
import { voxelHash } from '../render/materials';
import { worldSpriteTint } from '../render/styleConfig';
import { addVoxelSprite, applyVoxelTexture } from '../render/voxel';

/**
 * A clickable junk heap in the world. Handles its own visuals (full/depleted,
 * glint spark, respawn) — the GatherController owns the timing logic.
 */
export class JunkHeapNode {
  readonly kind = 'junkHeap' as const;
  readonly id: number;
  readonly tile: { x: number; y: number };
  readonly image: Phaser.GameObjects.Image;
  /** Public so the scene can attach its pointer handler. */
  readonly glintImage: Phaser.GameObjects.Image;
  private readonly glintHalo: Phaser.GameObjects.Image;
  private readonly scene: Phaser.Scene;
  /** V1/D2: the baked texture family this heap wears. */
  private readonly texBase: string;
  depleted = false;
  private glintTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, id: number, tx: number, ty: number, compost = false) {
    this.scene = scene;
    this.id = id;
    this.tile = { x: tx, y: ty };
    // D2: the Terrarium's heaps are mossy COMPOST — one shared look.
    this.texBase = compost ? 'junk-heap-c' : `junk-heap-${Math.floor(voxelHash(tx, ty, 0, 97) * 3)}`;
    const { x, y } = tileToWorld(tx, ty);
    const anchorY = y + TILE_H / 2;

    this.image = addVoxelSprite(scene, this.texBase, x, anchorY);
    const wt = worldSpriteTint();
    if (wt !== null) this.image.setTint(wt);
    this.image.setDepth(depthForWorldY(anchorY));
    this.image.setInteractive({ useHandCursor: true });
    hoverTip(this.image, () => ({
      title: compost ? 'Compost Heap' : 'Junk Heap',
      sub: 'Scavving · Magclaw',
      lines: [
        compost
          ? 'The gardens keep what the beds lose. Watch for the glint.'
          : 'Salvage under the mess. Watch for the glint.',
      ],
    }));

    this.glintHalo = scene.add.image(x, anchorY - 30, 'fx-glow');
    this.glintHalo.setTint(PALETTE_INT.neonTeal);
    this.glintHalo.setBlendMode(Phaser.BlendModes.ADD);
    this.glintHalo.setDepth(depthForWorldY(anchorY) + 2);
    this.glintHalo.setVisible(false);

    this.glintImage = scene.add.image(x, anchorY - 30, 'fx-spark');
    this.glintImage.setTint(PALETTE_INT.neonTeal);
    this.glintImage.setBlendMode(Phaser.BlendModes.ADD);
    this.glintImage.setDepth(depthForWorldY(anchorY) + 3);
    this.glintImage.setVisible(false);
    // Generous hit circle (in texture coordinates) so grabbing the glint is
    // a relaxing nudge, not a twitch test.
    const fw = this.glintImage.frame.width;
    const fh = this.glintImage.frame.height;
    this.glintImage.setInteractive({
      hitArea: new Phaser.Geom.Circle(fw / 2, fh / 2, fw * 0.6),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      useHandCursor: true,
    });
  }

  /** Show the glint spot at a random offset on the heap. Returns the sprite. */
  showGlint(rngValue: number): Phaser.GameObjects.Image {
    const offsetX = -20 + rngValue * 40;
    const baseX = this.image.x + offsetX;
    const baseY = this.image.y - 18 - rngValue * 12;
    this.glintImage.setPosition(baseX, baseY);
    this.glintHalo.setPosition(baseX, baseY);
    this.glintImage.setVisible(true);
    this.glintHalo.setVisible(true);
    this.glintImage.setScale(0.05);
    this.glintHalo.setScale(0.12);
    this.glintHalo.setAlpha(0.4);
    this.glintTween = this.scene.tweens.add({
      targets: this.glintImage,
      scale: { from: 0.05, to: 0.16 },
      angle: { from: -12, to: 12 },
      duration: CONFIG.gathering.junkHeap.glint.windowSeconds * 1000,
      ease: 'sine.inout',
    });
    return this.glintImage;
  }

  hideGlint(): void {
    this.glintTween?.stop();
    this.glintTween = null;
    this.glintImage.setVisible(false);
    this.glintHalo.setVisible(false);
  }

  /** Flash feedback when the glint is grabbed. */
  flashGlintHit(): void {
    const burst = this.scene.add.image(this.glintImage.x, this.glintImage.y, 'fx-spark');
    burst.setTint(PALETTE_INT.neonTeal);
    burst.setBlendMode(Phaser.BlendModes.ADD);
    burst.setDepth(this.glintImage.depth + 1);
    burst.setScale(0.1);
    this.scene.tweens.add({
      targets: burst,
      scale: 0.34,
      alpha: 0,
      duration: 320,
      ease: 'quad.out',
      onComplete: () => burst.destroy(),
    });
    this.hideGlint();
  }

  setDepleted(depleted: boolean): void {
    this.depleted = depleted;
    applyVoxelTexture(this.image, depleted ? `${this.texBase}-depleted` : this.texBase);
    if (depleted) {
      this.hideGlint();
      this.image.disableInteractive();
    } else {
      this.image.setInteractive({ useHandCursor: true });
      // A small respawn shimmer.
      this.image.setAlpha(0.4);
      this.scene.tweens.add({ targets: this.image, alpha: 1, duration: 350 });
    }
  }
}
