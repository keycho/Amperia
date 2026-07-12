import Phaser from 'phaser';
import type { InspectInfoEvent, ManifestFoundEvent, RestedSync } from '@shared/protocol';
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
import { ChargePanel } from '../ui/ChargePanel';
import { ShopPanel } from '../ui/ShopPanel';
import { itemThumbKey } from '../render/itemThumbs';
import { SlotStrip } from '../ui/SlotStrip';
import { InspectCard } from '../ui/InspectCard';
import { BankPanel } from '../ui/BankPanel';
import { GoalPanel } from '../ui/GoalPanel';
import { HowToPlayPanel } from '../ui/HowToPlayPanel';
import { WorldMapPanel } from '../ui/WorldMapPanel';
import { Minimap } from '../ui/Minimap';
import { EmoteWheel } from '../ui/EmoteWheel';
import { setSetting, settings } from '../settings';
import { ManifestPanel, showManifestToast } from '../ui/ManifestPanel';
import { TradePanel } from '../ui/TradePanel';
import { firstLoop, type TutorialModel } from '../systems/firstLoop';

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
  private inspectCard!: InspectCard;
  private manifestPanel!: ManifestPanel;
  private goalPanel!: GoalPanel;
  private bankPanel!: BankPanel;
  private worldMapPanel!: WorldMapPanel;
  private howToPlayPanel!: HowToPlayPanel;
  private minimap!: Minimap;
  private emoteWheel!: EmoteWheel;
  private restedText!: Phaser.GameObjects.Text;
  private shopPanel!: ShopPanel;
  private chargePanel!: ChargePanel;
  private buffChip!: Phaser.GameObjects.Text;
  private questChip!: Phaser.GameObjects.Text;
  private boltsChip!: Phaser.GameObjects.Text;
  private toast: Phaser.GameObjects.Container | null = null;
  /** R3: the "First Bolts" checklist panel + the two revealable HUD icons. */
  private tutorialPanel: Phaser.GameObjects.Container | null = null;
  private tutorialLines: Phaser.GameObjects.Text[] = [];
  private discloseIcons: Phaser.GameObjects.GameObject[] = [];
  private toastQueue: string[] = [];
  private toastRunning = false;
  private lastRested: RestedSync | null = null;
  private banner: Phaser.GameObjects.Container | null = null;
  private lastBannerAt = -Infinity;
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private hp = { hp: 0, maxHp: 0 };

  /** U3d: a brief center overlay in the city's voice + respawn countdown.
   *  The server already respawned us — the countdown is the BREATH the
   *  moment deserves, not a gameplay wait. */
  private showDeathRecap(e: { district: string; cacheBolts: number; cacheStacks: number }): void {
    const w = 460;
    const h = 150;
    const wrap = this.add.container(
      Math.round((this.scale.width - w) / 2),
      Math.round(this.scale.height * 0.32),
    );
    wrap.setDepth(1300);
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE_INT.ink, 0.94);
    bg.fillRoundedRect(0, 0, w, h, 12);
    bg.lineStyle(2, PALETTE_INT.neonRose, 0.7);
    bg.strokeRoundedRect(0, 0, w, h, 12);
    wrap.add(bg);
    const tangle = e.district === 'tangle';
    const title = this.add.text(w / 2, 26, tangle ? 'THE TANGLE GOT YOU' : 'KNOCKED FLAT', {
      fontFamily: 'monospace',
      fontSize: '19px',
      fontStyle: 'bold',
      color: PALETTE.neonRose,
    });
    title.setOrigin(0.5);
    wrap.add(title);
    const body = this.add.text(
      w / 2,
      62,
      tangle
        ? e.cacheBolts > 0 || e.cacheStacks > 0
          ? `Your Scrapcache waits at the marker —\n${e.cacheBolts} Bolts and ${e.cacheStacks} stack${e.cacheStacks === 1 ? '' : 's'} of haul. Run back fast.`
          : 'Pockets were empty — nothing dropped.\nSmall mercies.'
        : 'The city caught you as you fell.\nNothing lost — catch your breath.',
      {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: UI_TEXT_WARM,
        align: 'center',
        lineSpacing: 6,
      },
    );
    body.setOrigin(0.5, 0);
    wrap.add(body);
    const count = this.add.text(w / 2, h - 24, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: PALETTE.groundAccent,
    });
    count.setOrigin(0.5);
    wrap.add(count);
    let left = 3;
    count.setText(`back on your feet in ${left}…`);
    const tickTimer = this.time.addEvent({
      delay: 1000,
      repeat: 2,
      callback: () => {
        left -= 1;
        if (left > 0) count.setText(`back on your feet in ${left}…`);
        else {
          tickTimer.remove();
          this.tweens.add({
            targets: wrap,
            alpha: 0,
            duration: 420,
            onComplete: () => wrap.destroy(),
          });
        }
      },
    });
    wrap.setAlpha(0);
    this.tweens.add({ targets: wrap, alpha: 1, duration: 250 });
  }

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

  /** Render the Rested banner from a payload — gated until first Bolts (R3). */
  private applyRested(e: RestedSync): void {
    if (firstLoop.active && !firstLoop.boltsEarned) {
      this.restedText.setAlpha(0);
      return;
    }
    if (e.msLeft > 0) {
      const mins = Math.ceil(e.msLeft / 60_000);
      const pct = Math.round((e.multiplier - 1) * 100);
      this.restedText.setText(`✦ Rested — +${pct}% gather XP · ${mins}m left today`);
      this.restedText.setAlpha(1);
    } else if (this.restedText.text !== '') {
      this.restedText.setText('✦ Rested spent for today — back tomorrow');
      this.tweens.add({ targets: this.restedText, alpha: 0, delay: 4000, duration: 600 });
    }
  }

  /** R3/R6b: queue toast pills so they play one at a time, in order. A short
   *  backlog cap keeps a burst of notices from stacking up forever. */
  private queueToast(text: string): void {
    if (this.toastQueue.length >= 4) this.toastQueue.shift();
    this.toastQueue.push(text);
    if (!this.toastRunning) this.runToasts();
  }

  /**
   * R6b: a rare CENTER-STAGE banner for the big beats (level-ups, first
   * Bolts) — big warm text that fades in dead-centre, holds, and fades out.
   * Rate-limited to at most one a minute so it stays special; extras fall
   * back to nothing (the toast pill / floatText already carried the news).
   */
  private showBanner(text: string, sub?: string): void {
    if (this.time.now - this.lastBannerAt < 60_000) return;
    this.lastBannerAt = this.time.now;
    this.banner?.destroy();
    const cx = this.scale.width / 2;
    const cy = this.scale.height * 0.34;
    const main = this.add.text(0, 0, text, {
      fontFamily: 'monospace',
      fontSize: '30px',
      fontStyle: 'bold',
      color: PALETTE.neonAmber,
      stroke: PALETTE.ink,
      strokeThickness: 6,
    }).setOrigin(0.5, 0.5);
    const parts: Phaser.GameObjects.GameObject[] = [main];
    if (sub !== undefined) {
      const s = this.add.text(0, 24, sub, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: UI_TEXT_WARM,
        stroke: PALETTE.ink,
        strokeThickness: 4,
      }).setOrigin(0.5, 0.5);
      parts.push(s);
    }
    const banner = this.add.container(cx, cy, parts);
    banner.setDepth(1400);
    banner.setAlpha(0);
    banner.setScale(0.9);
    this.banner = banner;
    this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 380, ease: 'back.out' });
    this.time.delayedCall(2600, () => {
      if (this.banner !== banner) return;
      this.tweens.add({
        targets: banner,
        alpha: 0,
        y: cy - 24,
        duration: 520,
        ease: 'quad.in',
        onComplete: () => {
          if (this.banner === banner) this.banner = null;
          banner.destroy();
        },
      });
    });
  }

  private runToasts(): void {
    const next = this.toastQueue.shift();
    if (next === undefined) {
      this.toastRunning = false;
      return;
    }
    this.toastRunning = true;
    this.showToast(next);
    this.time.delayedCall(2600, () => this.runToasts());
  }

  /**
   * R3: the "First Bolts" checklist — a small top-left panel with three
   * steps, the active one lit amber with a ›, done ones checked. Fades out
   * when the loop completes.
   */
  private renderTutorial(m: TutorialModel): void {
    if (this.tutorialPanel === null) {
      const g = this.add.graphics();
      g.fillStyle(PALETTE_INT.ink, 0.72);
      g.fillRoundedRect(0, 0, 268, 96, 8);
      g.lineStyle(1.5, PALETTE_INT.neonAmber, 0.55);
      g.strokeRoundedRect(0, 0, 268, 96, 8);
      const title = this.add.text(12, 8, 'FIRST BOLTS', {
        fontFamily: 'monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: PALETTE.neonAmber,
      });
      this.tutorialLines = m.steps.map((_, i) =>
        this.add.text(12, 28 + i * 20, '', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: UI_TEXT_WARM,
        }),
      );
      const panel = this.add.container(12, 90, [g, title, ...this.tutorialLines]);
      panel.setDepth(930);
      panel.setAlpha(0);
      this.tutorialPanel = panel;
      this.tweens.add({ targets: panel, alpha: 1, duration: 400 });
    }
    m.steps.forEach((step, i) => {
      const line = this.tutorialLines[i];
      if (line === undefined) return;
      const isActive = i === m.active;
      const mark = step.done ? '☑' : isActive ? '›' : '☐';
      line.setText(`${mark} ${step.label}`);
      line.setColor(step.done ? PALETTE.solarGreen : isActive ? PALETTE.neonAmber : PALETTE.warmGlow);
      line.setAlpha(step.done ? 0.75 : 1);
    });
    // Reveal the previously-hidden HUD icons once the first Bolts land.
    if (firstLoop.boltsEarned && this.discloseIcons.length === 0) this.revealDiscloseIcons();
    // Loop complete: let it read, then fade the checklist away.
    if (m.active === -1 && this.tutorialPanel !== null) {
      const panel = this.tutorialPanel;
      this.tutorialPanel = null;
      this.time.delayedCall(3200, () =>
        this.tweens.add({
          targets: panel,
          alpha: 0,
          duration: 500,
          onComplete: () => panel.destroy(),
        }),
      );
    }
  }

  /**
   * R3: Manifest (J) and weekly Goals (G) had no HUD button — they surface
   * only after first Bolts, each announced with a one-line toast, as small
   * clickable glyph chips under the Bolts counter.
   */
  private revealDiscloseIcons(): void {
    const x = this.scale.width - 12;
    const make = (glyph: string, y: number, onClick: () => void) => {
      const t = this.add.text(x, y, glyph, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: PALETTE.neonTeal,
        stroke: PALETTE.ink,
        strokeThickness: 3,
      });
      t.setOrigin(1, 0);
      t.setDepth(902);
      t.setAlpha(0);
      t.setInteractive({ useHandCursor: true });
      t.on('pointerdown', onClick);
      this.tweens.add({ targets: t, alpha: 1, duration: 500 });
      this.discloseIcons.push(t);
    };
    make('❏ Manifest · J', 100, () => this.manifestPanel.toggle());
    make('★ Goals · G', 122, () => this.goalPanel.toggle());
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
    this.inspectCard = new InspectCard(this);
    this.manifestPanel = new ManifestPanel(this);
    this.goalPanel = new GoalPanel(this);
    this.bankPanel = new BankPanel(this);
    this.worldMapPanel = new WorldMapPanel(this);
    this.howToPlayPanel = new HowToPlayPanel(this);
    this.minimap = new Minimap(this);
    // U4b: hold E for the wheel; picks route through the chat commands so
    // the server stays the single emote authority.
    this.emoteWheel = new EmoteWheel(this, (emote) => {
      sound.uiClick();
      if (session.room !== null) send.chat(session.room, { text: `/${emote}` });
    });
    // H1: brand-new Sparks get the intro right after the creator (once).
    session.events.on(SessionEvents.howToPlay, () => this.howToPlayPanel.maybeShowFirstTime());
    // U3d: the death recap — what happened, what dropped, when you're back.
    session.events.on(
      SessionEvents.deathRecap,
      (e: { district: string; cacheBolts: number; cacheStacks: number }) =>
        this.showDeathRecap(e),
    );
    // Rested Charge HUD (S3): a warm line while the daily boost has time
    // left; fades out once it's spent. XP pacing only — never resources.
    this.restedText = this.add.text(12, 58, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: PALETTE.warmGlow,
    });
    this.restedText.setDepth(900);
    this.restedText.setShadow(0, 0, PALETTE.neonAmber, 4, true, true);
    session.events.on(SessionEvents.rested, (e: RestedSync) => {
      this.lastRested = e;
      this.applyRested(e);
    });
    // R3: the Rested event fires only on join (suppressed then). When first
    // Bolts land, re-apply the cached state so the banner appears on cue.
    gameState.events.on(GameEvents.boltsChanged, () => {
      if (firstLoop.boltsEarned && this.lastRested !== null) this.applyRested(this.lastRested);
    });
    session.events.on(SessionEvents.manifestFound, (ev: ManifestFoundEvent) => {
      // R3: no Manifest chatter until the first loop has opened it up.
      if (firstLoop.active && !firstLoop.boltsEarned) return;
      showManifestToast(this, ev);
    });
    // R3: the guided first-loop checklist + one-line unlock toasts.
    session.events.on(SessionEvents.tutorial, (m: TutorialModel) => this.renderTutorial(m));
    session.events.on(SessionEvents.tutorialToast, (text: string) => this.queueToast(text));
    session.events.on(SessionEvents.inspect, (ev: InspectInfoEvent) =>
      this.inspectCard.show(ev),
    );
    this.shopPanel = new ShopPanel(this);
    this.chargePanel = new ChargePanel(this);

    // The weekend city buff, worn like a banner (comms rules: a reward
    // line, never "earn"). Driven by the synced Charge meter.
    this.buffChip = this.add.text(12, 72, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: PALETTE.neonAmber,
      stroke: PALETTE.ink,
      strokeThickness: 3,
    });
    this.buffChip.setDepth(900);
    session.events.on(
      SessionEvents.charge,
      (c: { buffActive: boolean; buffPct: number; tier: number }) => {
        this.buffChip.setText(
          c.buffActive
            ? `☀ Weekend city buff — +${c.buffPct}% gather XP, with the city's thanks`
            : '',
        );
        if (this.chargePanel.visible) this.chargePanel.refresh();
      },
    );

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
    // U5c: a quest turned in gets its stamp — a punchy chip + thunk.
    const questStates = new Map<string, string>();
    session.events.on(
      SessionEvents.quests,
      (sync: { log: Record<string, { state: string }> }) => {
        for (const [id, row] of Object.entries(sync.log)) {
          const prev = questStates.get(id);
          questStates.set(id, row.state);
          if (prev === 'active' && row.state === 'turnedIn') {
            sound.questStamp();
            const stamp = this.add.text(this.questChip.x + 4, this.questChip.y + 22, '✔ DONE', {
              fontFamily: 'monospace',
              fontSize: '15px',
              fontStyle: 'bold',
              color: PALETTE.solarGreen,
              stroke: PALETTE.ink,
              strokeThickness: 4,
            });
            stamp.setDepth(901);
            stamp.setScale(1.8);
            stamp.setAlpha(0);
            this.tweens.add({
              targets: stamp,
              scale: 1,
              alpha: 1,
              duration: 140,
              ease: 'back.out',
            });
            this.tweens.add({
              targets: stamp,
              alpha: 0,
              y: stamp.y - 10,
              delay: 950,
              duration: 300,
              onComplete: () => stamp.destroy(),
            });
          }
        }
      },
    );

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
      if (this.chargePanel.visible) this.chargePanel.refresh();
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

    // R6b: EVERY system message is a top-center toast PILL now (never bare
    // text in the world), shown one at a time via the queue. The bottom-left
    // chat is players-only.
    session.events.on(SessionEvents.notice, (text: string) => this.queueToast(text));
    // R6b: rare center-stage banners for the big beats (level-ups, first
    // Bolts), rate-limited to at most one a minute.
    session.events.on(SessionEvents.banner, (e: { text: string; sub?: string }) =>
      this.showBanner(e.text, e.sub),
    );

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
    const cp = this.chargePanel.pixelSize();
    this.chargePanel.setPosition((w - cp.w) / 2, Math.max(30, (h - cp.h) / 2 - 10));
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

    // H1: the [?] button under the gear — how the city works, on demand.
    const help = this.add.text(0, 0, '?', {
      fontFamily: 'monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: PALETTE.warmGlow,
      stroke: PALETTE.ink,
      strokeThickness: 3,
    });
    help.setOrigin(0.5);
    help.setAlpha(0.85);
    help.setDepth(902);
    help.setInteractive({ useHandCursor: true });
    help.on('pointerover', () => help.setAlpha(1));
    help.on('pointerout', () => help.setAlpha(0.85));
    help.on('pointerdown', () => {
      sound.uiClick();
      this.howToPlayPanel.toggle();
    });
    const placeHelp = () => help.setPosition(this.scale.width - 22, 74);
    placeHelp();
    this.scale.on('resize', placeHelp);

    // U3b: the gear grew into the SETTINGS panel — volume, toggles, the
    // grit pick (applies on reload), and the keybind reference. Persisted.
    const panel = this.add.container(0, 0);
    panel.setDepth(950);
    panel.setVisible(false);
    const W = 250;
    const H = 322;
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE_INT.ink, 0.92);
    bg.fillRoundedRect(0, 0, W, H, 9);
    bg.lineStyle(1.5, PALETTE_INT.warmGlow, 0.5);
    bg.strokeRoundedRect(0, 0, W, H, 9);
    const label = this.add.text(12, 8, 'settings · sound', {
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
    // Toggle rows + the grit pick + keybind reference (U3b).
    const extras: Phaser.GameObjects.GameObject[] = [];
    const toggleRow = (
      y: number,
      text: string,
      get: () => boolean,
      set: (v: boolean) => void,
    ) => {
      const t = this.add.text(12, y, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: UI_TEXT_WARM,
      });
      const refresh = () => t.setText(`${get() ? '[on ]' : '[off]'} ${text}`);
      refresh();
      t.setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => {
        sound.uiClick();
        set(!get());
        refresh();
      });
      extras.push(t);
    };
    toggleRow(
      58,
      'nameplates',
      () => settings().nameplates,
      (v) => setSetting('nameplates', v),
    );
    toggleRow(
      80,
      'screen shake',
      () => settings().shake,
      (v) => setSetting('shake', v),
    );
    const gritLabel = this.add.text(12, 106, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: UI_TEXT_WARM,
    });
    const GRIT_OPTS: Array<'6' | '8' | 'none'> = ['6', '8', 'none'];
    const gritName = (g: string) => (g === 'none' ? 'smooth' : `${g}px grit`);
    const refreshGrit = () =>
      gritLabel.setText(`[${gritName(settings().grit)}] texture (reload)`);
    refreshGrit();
    gritLabel.setInteractive({ useHandCursor: true });
    gritLabel.on('pointerdown', () => {
      sound.uiClick();
      const cur = GRIT_OPTS.indexOf(settings().grit);
      setSetting('grit', GRIT_OPTS[(cur + 1) % GRIT_OPTS.length] as '6' | '8' | 'none');
      refreshGrit();
    });
    extras.push(gritLabel);
    const keysHead = this.add.text(12, 136, 'keys', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: PALETTE.groundAccent,
    });
    const keys = this.add.text(
      12,
      152,
      [
        'click · walk / work / talk',
        '1-6 · tool belt',
        'I pack · K skills · G goals',
        'J Manifest · M minimap · TAB map',
        'H rivet a Heatlamp',
        'hold E · emotes',
        'Enter · chat   ? · the intro',
        '/help · everything else',
      ].join('\n'),
      {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: UI_TEXT_WARM,
        lineSpacing: 6,
      },
    );
    keys.setAlpha(0.85);
    extras.push(keysHead, keys);
    panel.add([bg, label, track, hit, ...extras]);
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
    // U4a: M = the corner minimap; the Manifest moved to J.
    kb.on('keydown-M', () => {
      if (typing()) return;
      sound.uiClick();
      this.minimap.toggle();
    });
    kb.on('keydown-J', () => {
      this.manifestPanel.toggle();
    });
    // U4b: hold E = the emote wheel; release plays the highlighted glyph.
    kb.on('keydown-E', (ev: KeyboardEvent) => {
      if (typing() || ev.repeat) return;
      this.emoteWheel.open();
    });
    kb.on('keyup-E', () => {
      this.emoteWheel.release();
    });
    // TAB = the world map (D4a). Captured so the browser keeps focus.
    kb.addCapture('TAB');
    kb.on('keydown-TAB', () => {
      if (typing()) return;
      sound.uiClick();
      this.worldMapPanel.toggle();
    });
    kb.on('keydown-G', () => {
      this.goalPanel.toggle();
    });
    kb.on('keydown-B', () => {
      if (this.bankPanel.visible) this.bankPanel.setVisible(false);
    });
    kb.on('keydown-K', () => {
      if (typing()) return;
      this.inventoryPanel.setVisible(false);
      this.skillsPanel.setVisible(!this.skillsPanel.visible);
    });
    kb.on('keydown-ESC', () => {
      if (typing()) return;
      if (this.emoteWheel.visible) this.emoteWheel.close();
      else if (this.tradePanel.visible) {
        // Esc = walk away: the server closes both windows.
        this.tradePanel.requestCancel();
      } else if (this.shopPanel.visible) this.shopPanel.setVisible(false);
      else if (this.chargePanel.visible) this.chargePanel.setVisible(false);
      else if (this.merchantPanel.visible) this.merchantPanel.setVisible(false);
      else if (this.questPanel.visible) this.questPanel.setVisible(false);
      else if (this.benchPanel.visible) this.benchPanel.setVisible(false);
      else if (this.inventoryPanel.visible) this.inventoryPanel.setVisible(false);
      else if (this.skillsPanel.visible) this.skillsPanel.setVisible(false);
      else if (this.worldMapPanel.visible) this.worldMapPanel.setVisible(false);
      else if (this.howToPlayPanel.visible) this.howToPlayPanel.setVisible(false);
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
    const ghost = this.add.image(pointer.x, pointer.y, itemThumbKey(def));
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
