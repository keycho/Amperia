import Phaser from 'phaser';
import { canAccept, isComplete, questDefs, type QuestLog } from '@shared/quests';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { HEADER_H, kitButton, kitHeader, kitPlate, kitText, SPACE, kitPanelPop } from './kit';

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
    if (v) {
      this.container.setVisible(true);
      this.refresh();
    }
    // F5: every panel opens/closes through the one 120ms kit pop.
    kitPanelPop(this.scene, this.container, this.pixelSize(), v);
  }

  refresh(): void {
    this.container.removeAll(true);
    const { w, h } = this.pixelSize();
    this.container.add(kitPlate(this.scene, w, h));
    kitHeader(this.scene, this.container, w, "The Dispatcher's board", () => this.setVisible(false));

    const txt = (
      x: number,
      y: number,
      text: string,
      level: 'body' | 'caption',
      color = UI_TEXT_WARM,
    ): void => {
      const t = kitText(this.scene, x, y, text, level, { color });
      t.setWordWrapWidth(w - 120);
      this.container.add(t);
    };

    const now = Date.now();
    questDefs().forEach((def, i) => {
      const y = HEADER_H + SPACE.sm + i * ROW_H;
      const st = this.log[def.id];
      const daily = def.repeatable === 'daily' ? ' (daily)' : '';
      txt(SPACE.md, y, `${def.name}${daily}`, 'body', UI_TEXT_WARM);
      txt(SPACE.md, y + 17, def.copy, 'caption', PALETTE.warmGlow);
      const rewardText = `reward ${def.rewards.bolts} B${def.rewards.cosmetic !== undefined ? ' + scarf' : ''}`;
      if (st?.state === 'active') {
        if (isComplete(def, st)) {
          this.container.add(
            kitButton(this.scene, w - 110, y, 'turn in', {
              width: 90,
              height: 18,
              primary: true,
              onClick: () => {
                if (session.room !== null) send.quest(session.room, { action: 'turnIn', id: def.id });
              },
            }),
          );
        } else {
          txt(w - 110, y, `${st.progress}/${def.step.qty}`, 'body', PALETTE.neonTeal);
        }
        txt(w - 130, y + 17, rewardText, 'caption', UI_TEXT_WARM);
      } else if (canAccept(this.log, def, now)) {
        this.container.add(
          kitButton(this.scene, w - 110, y, 'accept', {
            width: 90,
            height: 18,
            primary: true,
            onClick: () => {
              if (session.room !== null) send.quest(session.room, { action: 'accept', id: def.id });
            },
          }),
        );
        txt(w - 130, y + 17, rewardText, 'caption', UI_TEXT_WARM);
      } else if (st?.state === 'turnedIn') {
        txt(w - 110, y, 'done ✓', 'body', PALETTE.warmGlow);
      } else {
        txt(w - 110, y, 'locked', 'body', PALETTE.warmGlow);
      }
    });
  }
}
