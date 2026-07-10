import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS } from '@shared/items';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM, type PaletteKey } from '@shared/palette';
import { addWarmAmbience } from '../render/ambience';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState, GameEvents } from '../state/GameState';
import { sound } from '../audio/sound';
import { ChatUI } from '../ui/ChatUI';
import { BenchPanel } from '../ui/BenchPanel';
import { MerchantPanel } from '../ui/MerchantPanel';
import { QuestPanel } from '../ui/QuestPanel';
import { SkillsPanel } from '../ui/SkillsPanel';
import { ShopPanel } from '../ui/ShopPanel';
import { SlotStrip } from '../ui/SlotStrip';
import { TradePanel } from '../ui/TradePanel';

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
  private merchantPanel!: MerchantPanel;
  private benchPanel!: BenchPanel;
  private questPanel!: QuestPanel;
  private tradePanel!: TradePanel;
  private shopPanel!: ShopPanel;
  private questChip!: Phaser.GameObjects.Text;
  private boltsChip!: Phaser.GameObjects.Text;
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
    this.merchantPanel = new MerchantPanel(this);
    this.benchPanel = new BenchPanel(this);
    this.questPanel = new QuestPanel(this);
    this.tradePanel = new TradePanel(this);
    this.shopPanel = new ShopPanel(this);

    this.questChip = this.add.text(12, 52, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: PALETTE.neonTeal,
      stroke: PALETTE.ink,
      strokeThickness: 3,
    });
    this.questChip.setDepth(900);
    session.events.on(SessionEvents.questTracker, (line: string) => {
      this.questChip.setText(line === '' ? '' : `◈ ${line}`);
    });

    this.boltsChip = this.add.text(12, 32, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: PALETTE.warmGlow,
      stroke: PALETTE.ink,
      strokeThickness: 3,
    });
    this.boltsChip.setDepth(900);
    const refreshBolts = () => this.boltsChip.setText(`Bolts ⚙ ${gameState.bolts}`);
    refreshBolts();
    gameState.events.on(GameEvents.boltsChanged, () => {
      refreshBolts();
      if (this.merchantPanel.visible) this.merchantPanel.refresh();
    });
    gameState.events.on(GameEvents.inventoryChanged, () => {
      if (this.merchantPanel.visible) this.merchantPanel.refresh();
      if (this.benchPanel.visible) this.benchPanel.refresh();
      if (this.tradePanel.visible) this.tradePanel.refresh();
      if (this.shopPanel.visible) this.shopPanel.refresh();
    });
    gameState.events.on(GameEvents.boltsChanged, () => {
      if (this.benchPanel.visible) this.benchPanel.refresh();
    });
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
    session.events.on(SessionEvents.chat, () => sound.chatPop());
    this.buildSoundPanel();

    // Tram arrivals and shop mail get a warm toast up top (the chat log
    // keeps the line too).
    session.events.on(SessionEvents.notice, (text: string) => {
      if (
        text.includes('stepped off the tram') ||
        text.includes('rode the tram out') ||
        text.includes('while you were away') ||
        text.includes('rent ran out')
      ) {
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
    const mp = this.merchantPanel.pixelSize();
    this.merchantPanel.setPosition((w - mp.w) / 2, Math.max(40, (h - mp.h) / 2 - 10));
    const bp = this.benchPanel.pixelSize();
    this.benchPanel.setPosition((w - bp.w) / 2, Math.max(30, (h - bp.h) / 2 - 10));
    const qp = this.questPanel.pixelSize();
    this.questPanel.setPosition((w - qp.w) / 2, Math.max(30, (h - qp.h) / 2 - 10));
    const tp = this.tradePanel.pixelSize();
    this.tradePanel.setPosition((w - tp.w) / 2, Math.max(30, (h - tp.h) / 2 - 10));
    const sp = this.shopPanel.pixelSize();
    this.shopPanel.setPosition((w - sp.w) / 2, Math.max(30, (h - sp.h) / 2 - 10));
    this.drawHpBar();
    this.refreshAll();
  }

  /** Gear button + a small panel with the master volume slider. */
  private buildSoundPanel(): void {
    const gear = this.add.image(0, 0, 'icon-gear');
    gear.setDisplaySize(20, 20);
    gear.setTint(PALETTE_INT.warmGlow);
    gear.setAlpha(0.85);
    gear.setDepth(902);
    gear.setInteractive({ useHandCursor: true });
    const placeGear = () => gear.setPosition(this.scale.width - 22, 44);
    placeGear();
    this.scale.on('resize', placeGear);

    const panel = this.add.container(0, 0);
    panel.setDepth(950);
    panel.setVisible(false);
    const W = 200;
    const H = 56;
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE_INT.ink, 0.88);
    bg.fillRoundedRect(0, 0, W, H, 9);
    bg.lineStyle(1.5, PALETTE_INT.warmGlow, 0.5);
    bg.strokeRoundedRect(0, 0, W, H, 9);
    const label = this.add.text(12, 8, 'sound', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: UI_TEXT_WARM,
    });
    const track = this.add.graphics();
    const drawTrack = (v: number) => {
      track.clear();
      track.fillStyle(PALETTE_INT.structureMid, 1);
      track.fillRoundedRect(12, 34, W - 24, 6, 3);
      track.fillStyle(PALETTE_INT.neonAmber, 1);
      track.fillRoundedRect(12, 34, Math.max(6, (W - 24) * v), 6, 3);
      track.fillStyle(PALETTE_INT.warmGlow, 1);
      track.fillCircle(12 + (W - 24) * v, 37, 7);
    };
    drawTrack(sound.volume);
    // A generous invisible hit strip over the slider.
    const hit = this.add.rectangle(W / 2, 37, W - 12, 26, 0, 0);
    hit.setInteractive({ useHandCursor: true });
    const setFromPointer = (pointer: Phaser.Input.Pointer) => {
      const local = pointer.x - panel.x - 12;
      const v = Math.max(0, Math.min(1, local / (W - 24)));
      sound.unlock();
      sound.setVolume(v);
      drawTrack(v);
    };
    hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      setFromPointer(pointer);
      const onMove = (p2: Phaser.Input.Pointer) => {
        if (p2.isDown) setFromPointer(p2);
      };
      this.input.on('pointermove', onMove);
      this.input.once('pointerup', () => this.input.off('pointermove', onMove));
    });
    panel.add([bg, label, track, hit]);
    const placePanel = () => panel.setPosition(this.scale.width - W - 12, 58);
    placePanel();
    this.scale.on('resize', placePanel);

    gear.on('pointerdown', () => {
      sound.unlock();
      sound.uiClick();
      panel.setVisible(!panel.visible);
    });
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
    kb.on('keydown-H', () => {
      if (typing()) return;
      sound.uiClick();
      if (session.room !== null) send.placeHeatlamp(session.room);
    });
    kb.on('keydown-I', () => {
      if (typing()) return;
      sound.uiClick();
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
      if (this.tradePanel.visible) {
        // Esc = walk away: the server closes both windows.
        this.tradePanel.requestCancel();
      } else if (this.shopPanel.visible) this.shopPanel.setVisible(false);
      else if (this.merchantPanel.visible) this.merchantPanel.setVisible(false);
      else if (this.questPanel.visible) this.questPanel.setVisible(false);
      else if (this.benchPanel.visible) this.benchPanel.setVisible(false);
      else if (this.inventoryPanel.visible) this.inventoryPanel.setVisible(false);
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
        sound.uiClick();
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
