import { describe, expect, it } from 'vitest';
import type { SkillId } from './mastery';
import {
  advanceStory,
  chapterAvailable,
  chapterReady,
  emptyStoryLog,
  STORY_CHAPTERS,
  storyChapter,
} from './story';

const levels =
  (map: Partial<Record<SkillId, number>>) =>
  (id: SkillId): number =>
    map[id] ?? 1;

describe('chapterAvailable — the unlock gates', () => {
  it('ch1 waits for Scavving 3, then offers', () => {
    const log = emptyStoryLog();
    expect(chapterAvailable(log, 'ch1', levels({ scavving: 2 }))).toBe(false);
    expect(chapterAvailable(log, 'ch1', levels({ scavving: 3 }))).toBe(true);
  });

  it('ch2 needs ch1 done AND a tram ride', () => {
    const log = emptyStoryLog();
    log.chapters['ch1'] = { state: 'done', progress: 10 };
    expect(chapterAvailable(log, 'ch2', levels({}))).toBe(false); // never rode
    log.rodeTram = true;
    expect(chapterAvailable(log, 'ch2', levels({}))).toBe(true);
  });

  it('ch3 needs ch2 done AND Delving 5', () => {
    const log = emptyStoryLog();
    log.chapters['ch1'] = { state: 'done', progress: 10 };
    log.chapters['ch2'] = { state: 'done', progress: 3 };
    expect(chapterAvailable(log, 'ch3', levels({ delving: 4 }))).toBe(false);
    expect(chapterAvailable(log, 'ch3', levels({ delving: 5 }))).toBe(true);
  });

  it('a taken or finished chapter is never re-offered', () => {
    const log = emptyStoryLog();
    log.chapters['ch1'] = { state: 'task', progress: 0 };
    expect(chapterAvailable(log, 'ch1', levels({ scavving: 50 }))).toBe(false);
  });
});

describe('advanceStory — task counting', () => {
  it('ch1 counts salvage gathers, capped at the quota', () => {
    const log = emptyStoryLog();
    log.chapters['ch1'] = { state: 'task', progress: 0 };
    advanceStory(log, { type: 'gather', itemId: 'salvage', qty: 4 });
    advanceStory(log, { type: 'gather', itemId: 'brass', qty: 4 }); // wrong item
    expect(log.chapters['ch1']?.progress).toBe(4);
    advanceStory(log, { type: 'gather', itemId: 'salvage', qty: 40 });
    expect(log.chapters['ch1']?.progress).toBe(10);
    expect(chapterReady(log, 'ch1')).toBe(true);
  });

  it("ch2's conductor run counts stages in strict order", () => {
    const log = emptyStoryLog();
    log.chapters['ch2'] = { state: 'task', progress: 0 };
    advanceStory(log, { type: 'deliver' }); // drop before the ride: no
    expect(log.chapters['ch2']?.progress).toBe(0);
    advanceStory(log, { type: 'travel', to: 'stacks' });
    expect(log.chapters['ch2']?.progress).toBe(1);
    advanceStory(log, { type: 'travel', to: 'stacks' }); // repeat ride: no
    expect(log.chapters['ch2']?.progress).toBe(1);
    advanceStory(log, { type: 'deliver' });
    expect(log.chapters['ch2']?.progress).toBe(2);
    advanceStory(log, { type: 'travel', to: 'terrarium' }); // wrong way home
    expect(log.chapters['ch2']?.progress).toBe(2);
    advanceStory(log, { type: 'travel', to: 'filament' });
    expect(chapterReady(log, 'ch2')).toBe(true);
  });

  it('any tram ride flips rodeTram, even with no chapter active', () => {
    const log = emptyStoryLog();
    advanceStory(log, { type: 'travel', to: 'stacks' });
    expect(log.rodeTram).toBe(true);
  });

  it('ch3 counts amperite donations only', () => {
    const log = emptyStoryLog();
    log.chapters['ch3'] = { state: 'task', progress: 0 };
    advanceStory(log, { type: 'donate', itemId: 'salvage', qty: 5 });
    expect(log.chapters['ch3']?.progress).toBe(0);
    advanceStory(log, { type: 'donate', itemId: 'amperite', qty: 5 });
    expect(chapterReady(log, 'ch3')).toBe(true);
  });

  it('a done chapter never advances again', () => {
    const log = emptyStoryLog();
    log.chapters['ch1'] = { state: 'done', progress: 10 };
    expect(advanceStory(log, { type: 'gather', itemId: 'salvage', qty: 1 })).toBe(false);
  });
});

describe('the script itself', () => {
  it('every chapter has a keepsake, a journal line and a task', () => {
    for (const c of STORY_CHAPTERS) {
      expect(c.keepsake.itemId.length).toBeGreaterThan(0);
      expect(c.journal.length).toBeGreaterThan(20);
      expect(c.task.qty).toBeGreaterThan(0);
      expect(c.intro.length).toBeGreaterThan(0);
      expect(c.outro.length).toBeGreaterThan(0);
    }
  });

  it('the chain is intact: ch2 follows ch1, ch3 follows ch2', () => {
    expect(storyChapter('ch2')?.unlock.after).toBe('ch1');
    expect(storyChapter('ch3')?.unlock.after).toBe('ch2');
  });

  it('every line is comms-clean — reporting a world, never selling one', () => {
    for (const c of STORY_CHAPTERS) {
      const all = [
        ...c.intro,
        ...c.send,
        ...c.outro,
        ...(c.choices ?? []).flatMap((ch) => ch.reply),
      ]
        .map((l) => l.text)
        .concat(c.journal, c.taskCopy)
        .join(' ')
        .toLowerCase();
      for (const banned of ['apy', 'yield', 'invest', 'token', '$amp']) {
        expect(all).not.toContain(banned);
      }
    }
  });

  it('canon: "founding" only ever appears as the re-founding', () => {
    for (const c of STORY_CHAPTERS) {
      for (const l of [...c.intro, ...c.send, ...c.outro]) {
        if (l.text.toLowerCase().includes('founding')) {
          expect(l.text.toLowerCase()).toContain('re-founding');
        }
      }
    }
  });
});
