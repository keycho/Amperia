import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';
import { sound } from '../audio/sound';
import { HEADER_H, kitButton, kitHeader, kitPanelPop, kitPlate, kitText, SPACE } from './kit';

const W = 380;

/**
 * THE AMPED BAR menu (city-life L2): the drinks list, Bolts-priced, and
 * the buy-a-round button. Every line comms-clean — drinks are drinks,
 * a round is a round, nothing here touches stats and the copy says so.
 * L3 adds the take-a-seat flow at the bottom.
 */
export class BarPanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private lastH = 300;
  visible = false;
  /** L3: the seat flow — UIScene wires this to walk-to-stool + sit. */
  onTakeSeat: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);
    session.events.on(SessionEvents.openBar, () => this.setVisible(true));
  }

  pixelSize(): { w: number; h: number } {
    return { w: W, h: this.lastH };
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (v) {
      this.container.setVisible(true);
      this.refresh();
    }
    kitPanelPop(this.scene, this.container, { w: W, h: this.lastH }, v);
  }

  refresh(): void {
    this.container.removeAll(true);
    let y = HEADER_H + SPACE.sm;

    const line = (x: number, yy: number, text: string, color = UI_TEXT_WARM, bold = false) => {
      const t = kitText(this.scene, x, yy, text, 'body', { color, bold });
      this.container.add(t);
      return t;
    };

    line(SPACE.md, y, `Bolts ⚙ ${gameState.bolts}`, PALETTE.warmGlow);
    y += 24;
    const blurb = line(SPACE.md, y, 'Poured for here. Warmth only — no drink ever moves a stat.', PALETTE.groundAccent);
    blurb.setWordWrapWidth(W - SPACE.md * 2);
    y += Math.ceil(blurb.height) + 10;

    for (const d of CONFIG.bar.drinks) {
      const swatch = this.scene.add.graphics();
      const tint = PALETTE_INT[d.tint as keyof typeof PALETTE_INT] ?? PALETTE_INT.warmGlow;
      swatch.fillStyle(PALETTE_INT.ink, 0.7);
      swatch.fillRoundedRect(SPACE.md, y + 2, 14, 14, 4);
      swatch.fillStyle(tint, 0.95);
      swatch.fillRoundedRect(SPACE.md + 3, y + 5, 8, 8, 2);
      this.container.add(swatch);
      line(SPACE.md + 22, y + 2, d.name, UI_TEXT_WARM);
      line(200, y + 2, `${d.price} Bolts`, PALETTE.warmGlow);
      const short = gameState.bolts < d.price;
      this.container.add(
        kitButton(this.scene, W - 90, y, 'pour', {
          width: 74,
          height: 24,
          primary: !short,
          disabled: short,
          onClick: () => {
            if (session.room !== null) {
              send.bar(session.room, { action: 'buy', drinkId: d.id });
              sound.uiClick();
            }
          },
        }),
      );
      y += 30;
    }

    y += 8;
    // Buy a round: the server counts the patrons and settles the tab.
    this.container.add(
      kitButton(this.scene, SPACE.md, y, 'buy a round — every Spark at the bar', {
        width: W - SPACE.md * 2,
        height: 28,
        primary: true,
        onClick: () => {
          if (session.room !== null) {
            send.bar(session.room, { action: 'round', drinkId: 'filamentAle' });
            sound.uiClick();
          }
        },
      }),
    );
    y += 36;

    if (this.onTakeSeat !== null) {
      const seat = this.onTakeSeat;
      this.container.add(
        kitButton(this.scene, SPACE.md, y, 'take a seat', {
          width: W - SPACE.md * 2,
          height: 26,
          onClick: () => {
            seat();
            this.setVisible(false);
          },
        }),
      );
      y += 34;
    }

    this.lastH = y + SPACE.md;
    this.container.addAt(kitPlate(this.scene, W, this.lastH), 0);
    kitHeader(this.scene, this.container, W, 'THE AMPED BAR', () => this.setVisible(false));
    const cam = this.scene.cameras.main;
    this.container.setPosition(
      Math.round((cam.width - W) / 2),
      Math.round(Math.max(30, (cam.height - this.lastH) / 2 - 10)),
    );
  }
}
