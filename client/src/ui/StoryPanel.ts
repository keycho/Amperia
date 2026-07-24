import Phaser from 'phaser';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { StorySync } from '@shared/protocol';
import {
  STORY_CHAPTERS,
  storyChapter,
  type ChapterDef,
  type StoryLine,
  type StoryNpc,
} from '@shared/story';
import { ITEMS, type ItemId } from '@shared/items';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { sound } from '../audio/sound';
import { HEADER_H, kitButton, kitHeader, kitPanelPop, kitPlate, kitText, SPACE } from './kit';

const W = 430;

/** One step of a conversation: a line, a choice fork, or an action beat. */
type Step =
  | { kind: 'line'; line: StoryLine }
  | { kind: 'choice' }
  | { kind: 'begin' }
  | { kind: 'keepsake' };

/**
 * S2 — THE LONG DARK dialogue panel. PRIVATE by construction: everything
 * rendered here comes from the shared chapter defs plus THIS client's own
 * server-sent story state — nothing is ever broadcast, so two Sparks at
 * the same NPC never see each other's story. Ambient chatter stays public
 * and unchanged. The JOURNAL view lists finished chapters' entries.
 */
export class StoryPanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private lastH = 300;
  visible = false;
  private state: StorySync | null = null;
  private chapter: ChapterDef | null = null;
  private steps: Step[] = [];
  private stepIdx = 0;
  private mode: 'talk' | 'task' | 'done' | 'journal' = 'journal';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);
    session.events.on(SessionEvents.storySync, (e: StorySync) => {
      this.state = e;
      if (this.visible && this.mode === 'task') this.refresh();
    });
    session.events.on(SessionEvents.openStory, (npc?: StoryNpc) => this.open(npc ?? null));
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

  /** Resolve what this NPC holds for me right now and open on it. */
  private open(npc: StoryNpc | null): void {
    this.chapter = null;
    this.mode = 'journal';
    if (npc !== null && this.state !== null) {
      const st = this.state;
      const def = STORY_CHAPTERS.find(
        (c) =>
          c.npc === npc &&
          (st.offered.includes(c.id) || st.chapters[c.id]?.state === 'task'),
      );
      if (def !== undefined) {
        this.chapter = def;
        const cs = st.chapters[def.id];
        if (cs === undefined) {
          // Offered: the whole conversation, choice and all.
          this.mode = 'talk';
          this.steps = [
            ...def.intro.map((line): Step => ({ kind: 'line', line })),
            ...(def.choices !== undefined ? [{ kind: 'choice' } as Step] : []),
            ...def.send.map((line): Step => ({ kind: 'line', line })),
            { kind: 'begin' },
          ];
          this.stepIdx = 0;
        } else if (cs.progress >= def.task.qty) {
          // Ready: the payoff, then the keepsake.
          this.mode = 'talk';
          this.steps = [
            ...def.outro.map((line): Step => ({ kind: 'line', line })),
            { kind: 'keepsake' },
          ];
          this.stepIdx = 0;
        } else {
          this.mode = 'task';
        }
      }
    }
    this.setVisible(true);
  }

  refresh(): void {
    this.container.removeAll(true);
    let y = HEADER_H + SPACE.sm;
    const text = (str: string, color = UI_TEXT_WARM, bold = false) => {
      const t = kitText(this.scene, SPACE.md, y, str, 'body', { color, bold });
      t.setWordWrapWidth(W - SPACE.md * 2);
      this.container.add(t);
      y += Math.ceil(t.height) + 8;
      return t;
    };
    const caption = (str: string) => {
      const t = kitText(this.scene, SPACE.md, y, str, 'caption', {
        color: PALETTE.neonAmber,
        bold: true,
      });
      this.container.add(t);
      y += 18;
      return t;
    };
    const button = (label: string, onClick: () => void, primary = true) => {
      this.container.add(
        kitButton(this.scene, SPACE.md, y, label, {
          width: W - SPACE.md * 2,
          height: 28,
          primary,
          onClick,
        }),
      );
      y += 36;
    };

    let title = 'THE LONG DARK';
    const def = this.chapter;

    if (this.mode === 'talk' && def !== null) {
      title = `CHAPTER ${def.n} — ${def.title}`;
      const step = this.steps[this.stepIdx];
      if (step === undefined) {
        this.setVisible(false);
        return;
      }
      if (step.kind === 'line') {
        caption(step.line.speaker);
        text(step.line.text);
        button('— continue', () => {
          sound.uiClick();
          this.stepIdx += 1;
          this.refresh();
        });
      } else if (step.kind === 'choice' && def.choices !== undefined) {
        caption('you');
        for (const c of def.choices) {
          button(c.prompt, () => {
            sound.uiClick();
            // Splice the reply in after this beat; flavor only, no state.
            const replySteps = c.reply.map((line): Step => ({ kind: 'line', line }));
            this.steps.splice(this.stepIdx + 1, 0, ...replySteps);
            this.stepIdx += 1;
            this.refresh();
          }, false);
        }
      } else if (step.kind === 'begin') {
        caption('the task');
        text(def.taskCopy, PALETTE.warmGlow, true);
        button('take it on', () => {
          if (session.room !== null) {
            send.story(session.room, { action: 'begin', id: def.id });
            sound.questStamp();
          }
          this.setVisible(false);
        });
      } else if (step.kind === 'keepsake') {
        caption('a keepsake');
        // Founder note 3: keepsakes take the RESULT-CARD frame — these
        // flavor lines are the best writing in the game; give them the
        // crafted-item moment, never a toast.
        const item = ITEMS[def.keepsake.itemId as ItemId];
        const cx = W / 2;
        const halo = this.scene.add
          .image(cx, y + 46, 'fx-glow')
          .setTint(PALETTE_INT.neonAmber)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.42)
          .setAlpha(0.4);
        this.container.add(halo);
        const big = this.scene.add.image(cx, y + 46, item.icon);
        big.setDisplaySize(72, 72);
        this.container.add(big);
        y += 92;
        const nm = kitText(this.scene, cx, y, item.name, 'body', {
          color: PALETTE.neonAmber,
          bold: true,
        });
        nm.setOrigin(0.5, 0);
        this.container.add(nm);
        y += Math.ceil(nm.height) + 6;
        text(def.keepsake.caption, PALETTE.warmGlow, true);
        text('It goes in your Pack, and its page goes in the journal.', PALETTE.groundAccent);
        button('keep it', () => {
          if (session.room !== null) {
            send.story(session.room, { action: 'complete', id: def.id });
            sound.rareChime();
          }
          this.mode = 'done';
          this.refresh();
        });
      }
    } else if (this.mode === 'task' && def !== null) {
      title = `CHAPTER ${def.n} — ${def.title}`;
      const cs = this.state?.chapters[def.id];
      caption('the task so far');
      text(def.taskCopy, PALETTE.warmGlow, true);
      text(`${Math.min(cs?.progress ?? 0, def.task.qty)} of ${def.task.qty}`, PALETTE.neonAmber, true);
      button('back to it', () => this.setVisible(false), false);
    } else if (this.mode === 'done' && def !== null) {
      title = `CHAPTER ${def.n} — ${def.title}`;
      caption('the journal');
      text(def.journal, UI_TEXT_WARM);
      button('close', () => this.setVisible(false), false);
    } else {
      // The journal: finished chapters, in order.
      const doneIds = STORY_CHAPTERS.filter(
        (c) => this.state?.chapters[c.id]?.state === 'done',
      );
      if (doneIds.length === 0) {
        text('No pages yet — the city holds its stories close.', PALETTE.groundAccent);
      } else {
        for (const c of doneIds) {
          caption(`CHAPTER ${c.n} — ${c.title}`);
          text(c.journal);
          y += 2;
        }
      }
      button('close', () => this.setVisible(false), false);
    }

    this.lastH = y + SPACE.md;
    this.container.addAt(kitPlate(this.scene, W, this.lastH), 0);
    kitHeader(this.scene, this.container, W, title, () => this.setVisible(false));
    const cam = this.scene.cameras.main;
    this.container.setPosition(
      Math.round((cam.width - W) / 2),
      Math.round(Math.max(30, (cam.height - this.lastH) / 2 - 10)),
    );
  }
}

/** The chapter def for a done page, if you have its id. */
export const chapterFor = (id: string): ChapterDef | undefined => storyChapter(id);
