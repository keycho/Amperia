import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS } from '@shared/items';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM, type PaletteKey } from '@shared/palette';
import { addWarmAmbience } from '../render/ambience';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState, GameEvents } from '../state/GameState';
import { ChatUI } from '../ui/ChatUI';
import { SkillsPanel } from '../ui/SkillsPanel';
import { SlotStrip } from '../ui/SlotStrip';

interface DragState {
  strip: SlotStrip;
  slotIdx: number;
  ghost: Phaser.GameObjects.Image;
  ghostCount: Phaser.GameObjects.Text;
}

/**
 * Screen-space UI: the Pack (inventory) panel, the hotbar, and the loot chip.
 * `I` toggles the Pack, Esc closes the top panel, 1-6 select hotbar slots,
 * dragging moves/merges/swaps stacks between any two slots.
 */
export class UIScene extends Phaser.Scene {
  private inventoryPanel!: SlotStrip;
  private hotbar!: SlotStrip;
  private drag: DragState | null = null;
  private lootChip!: Phaser.GameObjects.Text;
  private presenceChip!: Phaser.GameObjects.Text;
  private chat!: ChatUI;
  private skillsPanel!: SkillsPanel;
  private toast: Phaser.GameObjects.Container | null = null;
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private hp = { hp: 0, maxHp: 0 };

  /** A soft chip that slides in top-center and fades — tram arrivals etc. */
  private showToast(text: string): void {
    this.toast?.destroy();
    const txt = this.add.text(0, 0, `⚡ ${text}`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: UI_TEXT_WARM,
    });
    txt.setOrigin(0.5, 0.5);
    const w = txt.width + 26;
    const h = txt.height + 14;
    const g = this.add.graphics();
    g.fillStyle(PALETTE_INT.ink, 0.78);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(1.5, PALETTE_INT.warmGlow, 0.5);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    const toast = this.add.container(this.scale.width / 2, 26, [g, txt]);
    toast.setDepth(940);
    toast.setAlpha(0);
    this.toast = toast;
    this.tweens.add({ targets: toast, alpha: 1, y: 48, duration: 320, ease: 'quad.out' });
    this.time.delayedCall(3200, () => {
      if (this.toast !== toast) return;
      this.tweens.add({
        targets: toast,
        alpha: 0,
        y: 30,
        duration: 380,
        ease: 'quad.in',
        onComplete: () => {
          if (this.toast === toast) this.toast = null;
          toast.destroy();
        },
      });
    });
  }

  constructor() {
    super('ui');
  }

  create(): void {
    // Below every UI widget (chips at 890+), above the world render.
    addWarmAmbience(this);

    const onStripPointerDown = (strip: SlotStrip, pointer: Phaser.Input.Pointer) =>
      this.beginDrag(strip, pointer);

    this.hotbar = new SlotStrip(
      this,
      'hotbar',
      { cols: CONFIG.inventory.hotbarSlots, rows: 1 },
      onStripPointerDown,
    );
    this.inventoryPanel = new SlotStrip(
      this,
      'inventory',
      { cols: 6, rows: CONFIG.inventory.slots / 6, title: 'Pack', panel: true },
      onStripPointerDown,
    );
    this.inventoryPanel.setVisible(false);
    this.hotbar.setActiveSlot(gameState.activeHotbarSlot);

    this.lootChip = this.add.text(12, 10, '', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: UI_TEXT_WARM,
      stroke: PALETTE.ink,
      strokeThickness: 3,
    });
    this.lootChip.setDepth(900);

    this.presenceChip = this.add.text(0, 10, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: PALETTE.warmGlow,
      stroke: PALETTE.ink,
      strokeThickness: 3,
    });
    this.presenceChip.setDepth(900);
    session.events.on(SessionEvents.presence, (n: number) => {
      this.presenceChip.setText(`Sparks in the city: ${n}`);
      this.presenceChip.setX(this.scale.width - this.presenceChip.width - 12);
    });

    this.chat = new ChatUI(this);
    this.skillsPanel = new SkillsPanel(this);
    gameState.events.on(GameEvents.skillsChanged, () => {
      if (this.skillsPanel.visible) this.skillsPanel.refresh();
    });

    this.hpBar = this.add.graphics();
    this.hpBar.setDepth(900);
    this.hpText = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: UI_TEXT_WARM,
      stroke: PALETTE.ink,
      strokeThickness: 3,
    });
    this.hpText.setDepth(901);
    session.events.on(SessionEvents.hp, (v: { hp: number; maxHp: number }) => {
      this.hp = v;
      this.drawHpBar();
    });

    // Tram arrivals get a warm toast up top (the chat log keeps the line too).
    session.events.on(SessionEvents.notice, (text: string) => {
      if (text.includes('stepped off the tram') || text.includes('rode the tram out')) {
        this.showToast(text);
      }
    });

    this.layout();
    this.refreshAll();
    this.scale.on('resize', () => {
      this.layout();
      this.chat.layout();
      this.presenceChip.setX(this.scale.width - this.presenceChip.width - 12);
    });
    gameState.events.on(GameEvents.inventoryChanged, () => this.refreshAll());
    gameState.events.on(GameEvents.hotbarChanged, () => this.refreshAll());

    this.setupKeys();
    this.setupDragHandlers();
  }

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const hb = this.hotbar.pixelSize();
    this.hotbar.setPosition((w - hb.w) / 2, h - hb.h - 12);
    const inv = this.inventoryPanel.pixelSize();
    this.inventoryPanel.setPosition((w - inv.w) / 2, (h - inv.h) / 2 - 20);
    const sk = this.skillsPanel.pixelSize();
    this.skillsPanel.setPosition((w - sk.w) / 2, (h - sk.h) / 2 - 10);
    this.drawHpBar();
    this.refreshAll();
  }

  /** The Spark's charge (HP) — a warm bar over the hotbar's left corner. */
  private drawHpBar(): void {
    if (this.hp.maxHp <= 0) return;
    const hb = this.hotbar.pixelSize();
    const x = (this.scale.width - hb.w) / 2;
    const y = this.scale.height - hb.h - 34;
    const W = 148;
    const frac = Math.max(0, Math.min(1, this.hp.hp / this.hp.maxHp));
    this.hpBar.clear();
    this.hpBar.fillStyle(PALETTE_INT.ink, 0.72);
    this.hpBar.fillRoundedRect(x, y, W, 12, 6);
    this.hpBar.fillStyle(frac > 0.35 ? PALETTE_INT.warmGlow : PALETTE_INT.neonRose, 0.95);
    this.hpBar.fillRoundedRect(x + 2, y + 2, Math.max(4, (W - 4) * frac), 8, 4);
    this.hpText.setText(`⚡ ${this.hp.hp}/${this.hp.maxHp}`);
    this.hpText.setPosition(x + W + 8, y - 1);
  }

  private refreshAll(): void {
    this.hotbar.setActiveSlot(gameState.activeHotbarSlot);
    this.hotbar.refresh(
      gameState.hotbar,
      this.drag !== null && this.drag.strip.source === 'hotbar' ? this.drag.slotIdx : null,
    );
    this.inventoryPanel.refresh(
      gameState.inventory,
      this.drag !== null && this.drag.strip.source === 'inventory' ? this.drag.slotIdx : null,
    );
    const salvage = gameState.count('salvage');
    const gilded = gameState.count('gildedScrap');
    this.lootChip.setText(
      `${ITEMS.salvage.name} × ${salvage}` +
        (gilded > 0 ? `   ${ITEMS.gildedScrap.name} × ${gilded}` : ''),
    );
  }

  private setupKeys(): void {
    const kb = this.input.keyboard;
    if (kb === null) return;
    // Never react to game keys while the player is typing in a DOM field.
    const typing = () =>
      this.chat.typing || document.activeElement instanceof HTMLInputElement;
    kb.on('keydown-I', () => {
      if (typing()) return;
      this.skillsPanel.setVisible(false);
      this.inventoryPanel.setVisible(!this.inventoryPanel.visible);
    });
    kb.on('keydown-K', () => {
      if (typing()) return;
      this.inventoryPanel.setVisible(false);
      this.skillsPanel.setVisible(!this.skillsPanel.visible);
    });
    kb.on('keydown-ESC', () => {
      if (typing()) return;
      if (this.inventoryPanel.visible) this.inventoryPanel.setVisible(false);
      else if (this.skillsPanel.visible) this.skillsPanel.setVisible(false);
    });
    kb.on('keydown-ENTER', () => {
      if (typing()) return;
      this.chat.openInput();
    });
    const keyNames = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];
    keyNames.slice(0, CONFIG.inventory.hotbarSlots).forEach((name, i) => {
      kb.on(`keydown-${name}`, () => {
        if (typing()) return;
        gameState.setActiveHotbarSlot(i);
        if (session.room !== null) send.selectSlot(session.room, { slot: i });
      });
    });
  }

  private beginDrag(strip: SlotStrip, pointer: Phaser.Input.Pointer): void {
    const idx = strip.slotIndexAt(pointer.x, pointer.y);
    if (idx === null) return;
    const inv = strip.source === 'inventory' ? gameState.inventory : gameState.hotbar;
    const stack = inv.slots[idx];
    if (stack === null || stack === undefined) return;

    const def = ITEMS[stack.itemId];
    const ghost = this.add.image(pointer.x, pointer.y, def.icon);
    if (def.iconTint !== undefined) ghost.setTint(PALETTE_INT[def.iconTint as PaletteKey]);
    ghost.setDisplaySize(44, 44);
    ghost.setAlpha(0.85);
    ghost.setDepth(2000);
    const ghostCount = this.add.text(pointer.x + 18, pointer.y + 20, String(stack.qty), {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: UI_TEXT_WARM,
    });
    ghostCount.setOrigin(1, 1);
    ghostCount.setDepth(2001);
    this.drag = { strip, slotIdx: idx, ghost, ghostCount };
    this.refreshAll();
  }

  private setupDragHandlers(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.drag === null) return;
      this.drag.ghost.setPosition(pointer.x, pointer.y);
      this.drag.ghostCount.setPosition(pointer.x + 18, pointer.y + 20);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.drag === null) return;
      const d = this.drag;
      this.drag = null;
      d.ghost.destroy();
      d.ghostCount.destroy();

      const targets: SlotStrip[] = [this.inventoryPanel, this.hotbar];
      for (const strip of targets) {
        if (!strip.visible) continue;
        const idx = strip.slotIndexAt(pointer.x, pointer.y);
        if (idx !== null && session.room !== null) {
          // Server-authoritative: send the intent; the echo re-renders.
          send.moveStack(session.room, {
            from: d.strip.source === 'inventory' ? 'pack' : 'hotbar',
            fromIdx: d.slotIdx,
            to: strip.source === 'inventory' ? 'pack' : 'hotbar',
            toIdx: idx,
          });
          this.refreshAll();
          return;
        }
      }
      // Dropped nowhere: no change.
      this.refreshAll();
    });
  }
}
