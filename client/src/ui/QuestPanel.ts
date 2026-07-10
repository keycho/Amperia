import Phaser from 'phaser';
import { canAccept, isComplete, questDefs, type QuestLog } from '@shared/quests';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';

const PANEL_W = 470;
const ROW_H = 42;

/**
 * The Dispatcher's board: the tutorial chain + daily work. Copy follows
 * the comms rules — quests REWARD Bolts; nothing here "earns".
 */
export class QuestPanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private log: QuestLog = {};
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);
    session.events.on(SessionEvents.quests, (sync: { log: QuestLog }) => {
      this.log = sync.log;
      if (this.visible) this.refresh();
      session.events.emit(SessionEvents.questTracker, this.trackerLine());
    });
    session.events.on(SessionEvents.openQuests, () => this.setVisible(true));
  }

  /** One-line HUD tracker: the first active quest with progress. */
  trackerLine(): string {
    for (const def of questDefs()) {
      const st = this.log[def.id];
      if (st?.state === 'active') {
        const done = isComplete(def, st) ? ' — done, see the Dispatcher' : '';
        return `${def.name}: ${st.progress}/${def.step.qty}${done}`;
      }
    }
    return '';
  }

  pixelSize(): { w: number; h: number } {
    return { w: PANEL_W, h: 70 + questDefs().length * ROW_H };
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.setVisible(v);
    if (v) this.refresh();
  }

  refresh(): void {
    this.container.removeAll(true);
    const { w, h } = this.pixelSize();
    const g = this.scene.add.graphics();
    g.fillStyle(PALETTE_INT.ink, 0.94);
    g.fillRoundedRect(0, 0, w, h, 10);
    g.lineStyle(2, PALETTE_INT.neonAmber, 0.6);
    g.strokeRoundedRect(0, 0, w, h, 10);
    this.container.add(g);

    const add = (
      x: number,
      y: number,
      text: string,
      color = UI_TEXT_WARM,
      onClick?: () => void,
      size = 12,
    ): void => {
      const t = this.scene.add.text(x, y, text, {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        color,
        wordWrap: { width: w - 120 },
      });
      if (onClick !== undefined) {
        t.setInteractive({ useHandCursor: true });
        t.on(
          'pointerdown',
          (_p: unknown, _lx: unknown, _ly: unknown, ev: { stopPropagation(): void }) => {
            ev.stopPropagation();
            onClick();
          },
        );
        t.on('pointerover', () => t.setColor(PALETTE.neonAmber));
        t.on('pointerout', () => t.setColor(color));
      }
      this.container.add(t);
    };

    add(16, 12, "The Dispatcher's board", PALETTE.neonAmber, undefined, 14);
    add(w - 90, 12, '[close]', UI_TEXT_WARM, () => this.setVisible(false));

    const now = Date.now();
    questDefs().forEach((def, i) => {
      const y = 44 + i * ROW_H;
      const st = this.log[def.id];
      const daily = def.repeatable === 'daily' ? ' (daily)' : '';
      add(16, y, `${def.name}${daily}`, UI_TEXT_WARM, undefined, 13);
      add(16, y + 17, def.copy, PALETTE.warmGlow, undefined, 11);
      const rewardText = `reward ${def.rewards.bolts} B${def.rewards.cosmetic !== undefined ? ' + scarf' : ''}`;
      if (st?.state === 'active') {
        if (isComplete(def, st)) {
          add(w - 110, y, '[turn in]', PALETTE.neonTeal, () => {
            if (session.room !== null)
              send.quest(session.room, { action: 'turnIn', id: def.id });
          });
        } else {
          add(w - 110, y, `${st.progress}/${def.step.qty}`, PALETTE.neonTeal);
        }
        add(w - 130, y + 17, rewardText, UI_TEXT_WARM, undefined, 10);
      } else if (canAccept(this.log, def, now)) {
        add(w - 110, y, '[accept]', PALETTE.neonAmber, () => {
          if (session.room !== null) send.quest(session.room, { action: 'accept', id: def.id });
        });
        add(w - 130, y + 17, rewardText, UI_TEXT_WARM, undefined, 10);
      } else if (st?.state === 'turnedIn') {
        add(w - 110, y, 'done ✓', PALETTE.warmGlow);
      } else {
        add(w - 110, y, 'locked', PALETTE.warmGlow);
      }
    });
  }
}
