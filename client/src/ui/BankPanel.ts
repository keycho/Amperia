import Phaser from 'phaser';
import { ITEMS, type ItemId } from '@shared/items';
import { mixPalette, PALETTE, UI_TEXT_WARM } from '@shared/palette';
import type { BankSync } from '@shared/protocol';
import { gameState } from '../state/GameState';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { itemThumbKey } from '../render/itemThumbs';
import { kitButton, kitHeader, kitPlate, kitText, type TypeLevel } from './kit';

const W = 620;
const H = 470;
const CELL = 44;
const GAP = 6;
const COLS = 12;

/**
 * The Ledgerhouse vault (S5): banked slots up top, your Pack below —
 * click a Pack stack to shelve it, click a vault stack to take it back.
 * Only opens inside the hall (the server re-checks every action). Death
 * never touches anything in here.
 */
export class BankPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly dynamic: Phaser.GameObjects.GameObject[] = [];
  private sync: BankSync | null = null;
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);

    this.container.add(kitPlate(scene, W, H));
    kitHeader(scene, this.container, W, 'THE LEDGERHOUSE', () => this.setVisible(false));

    session.events.on(SessionEvents.bank, (sync: BankSync) => {
      this.sync = sync;
      if (!this.visible) this.setVisible(true);
      else this.refresh();
    });
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.setVisible(v);
    if (v) {
      const cam = this.scene.cameras.main;
      this.container.setPosition(
        Math.round((cam.width - W) / 2),
        Math.round((cam.height - H) / 2),
      );
      this.refresh();
    }
  }

  private text(x: number, y: number, body: string, color: string, size = 12, bold = false) {
    const level: TypeLevel = size <= 11 ? 'caption' : size <= 16 ? 'body' : 'heading';
    const t = kitText(this.scene, x, y, body, level, { color, bold });
    this.container.add(t);
    this.dynamic.push(t);
    return t;
  }

  private slotCell(
    x: number,
    y: number,
    stack: { itemId: string; qty: number } | null,
    onClick: (() => void) | null,
  ): void {
    const inset = this.scene.add.nineslice(x, y, 'ui-slot-inset', undefined, CELL, CELL, 10, 10, 10, 10);
    inset.setOrigin(0, 0);
    inset.setTint(mixPalette('ink', 'structureMid', 0.55));
    inset.setAlpha(stack !== null ? 1 : 0.45);
    this.container.add(inset);
    this.dynamic.push(inset);
    if (stack === null) return;
    const def = ITEMS[stack.itemId as ItemId];
    const img = this.scene.add.image(x + CELL / 2, y + CELL / 2, itemThumbKey(def));
    img.setDisplaySize(CELL - 6, CELL - 6);
    this.container.add(img);
    this.dynamic.push(img);
    if (stack.qty > 1) {
      const count = this.text(x + CELL - 4, y + CELL - 14, String(stack.qty), UI_TEXT_WARM, 10);
      count.setOrigin(1, 0);
    }
    if (onClick !== null) {
      img.setInteractive({ useHandCursor: true });
      img.on(
        'pointerdown',
        (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation();
          onClick();
        },
      );
    }
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic.length = 0;
    const sync = this.sync;
    if (sync === null) return;

    this.text(216, 16, 'what the vault holds, death never touches', PALETTE.groundAccent, 11);

    // Vault grid.
    this.text(16, 40, `VAULT · ${sync.slotCount} slots`, UI_TEXT_WARM, 12, true);
    for (let i = 0; i < sync.slotCount; i++) {
      const x = 16 + (i % COLS) * (CELL + GAP);
      const y = 60 + Math.floor(i / COLS) * (CELL + GAP);
      const stack = sync.slots[i] ?? null;
      this.slotCell(x, y, stack, stack === null ? null : () => {
        if (session.room !== null) {
          send.bank(session.room, { action: 'withdraw', slot: i, qty: stack.qty });
        }
      });
    }
    const vaultRows = Math.ceil(sync.slotCount / COLS);
    let y0 = 60 + vaultRows * (CELL + GAP) + 8;

    // Expansion (the hoarder sink).
    if (sync.nextCost !== null) {
      const b = kitButton(this.scene, 16, y0, `add 8 slots — ${sync.nextCost} Bolts`, {
        height: 24,
        primary: true,
        onClick: () => {
          if (session.room !== null) send.bank(session.room, { action: 'expand' });
        },
      });
      this.container.add(b);
      this.dynamic.push(b);
    } else {
      this.text(16, y0, 'The vault is at full stretch.', PALETTE.groundAccent, 11);
    }
    y0 += 26;

    // Pack strip: click to shelve a stack.
    this.text(16, y0, 'YOUR PACK — click a stack to shelve it', UI_TEXT_WARM, 12, true);
    y0 += 20;
    gameState.inventory.slots.forEach((stack, i) => {
      const x = 16 + (i % COLS) * (CELL + GAP);
      const y = y0 + Math.floor(i / COLS) * (CELL + GAP);
      this.slotCell(x, y, stack, stack === null ? null : () => {
        if (session.room !== null) {
          send.bank(session.room, { action: 'deposit', slot: i, qty: stack.qty });
        }
      });
    });
  }
}
