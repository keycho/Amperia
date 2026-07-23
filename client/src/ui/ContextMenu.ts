import Phaser from 'phaser';
import { kitButton, kitPlate, SPACE } from './kit';

/**
 * F2 — the slot context menu: a small kit plate of actions at the pointer
 * (right-click on a filled slot → Use / Split, only where relevant). One
 * instance per scene; opening replaces the previous menu; any click outside
 * or Escape closes it. Actions are INTENTS — the server stays authoritative.
 */

export interface MenuAction {
  label: string;
  onPick(): void;
}

export class ContextMenu {
  private readonly scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Any press that isn't on the menu's own buttons closes it (buttons
    // stopPropagation, so this only fires for outside clicks).
    scene.input.on('pointerdown', () => this.close());
    scene.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  get open(): boolean {
    return this.container !== null;
  }

  show(x: number, y: number, actions: readonly MenuAction[]): void {
    this.close();
    if (actions.length === 0) return;
    const w = 132;
    const h = SPACE.sm * 2 + actions.length * 30 + (actions.length - 1) * 6;
    const cam = this.scene.cameras.main;
    const px = Math.min(Math.max(4, x), cam.width - w - 4);
    const py = Math.min(Math.max(4, y), cam.height - h - 4);
    const c = this.scene.add.container(Math.round(px), Math.round(py));
    c.setDepth(2100);
    c.add(kitPlate(this.scene, w, h, 8));
    actions.forEach((a, i) => {
      c.add(
        kitButton(this.scene, SPACE.sm, SPACE.sm + i * 36, a.label, {
          width: w - SPACE.sm * 2,
          height: 30,
          onClick: () => {
            this.close();
            a.onPick();
          },
        }),
      );
    });
    this.container = c;
  }

  close(): void {
    this.container?.destroy();
    this.container = null;
  }
}
