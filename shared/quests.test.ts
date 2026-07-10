import { describe, expect, it } from 'vitest';
import {
  applyProgress,
  canAccept,
  dailyTurnInsToday,
  isComplete,
  questById,
  type QuestLog,
} from './quests';

const NOON = Date.UTC(2026, 6, 10, 12, 0, 0);

describe('quest chain', () => {
  it('locks the chain behind prereqs and opens as they turn in', () => {
    const log: QuestLog = {};
    expect(canAccept(log, questById('tut1')!, NOON)).toBe(true);
    expect(canAccept(log, questById('tut2')!, NOON)).toBe(false);
    log.tut1 = { state: 'turnedIn', progress: 10 };
    expect(canAccept(log, questById('tut2')!, NOON)).toBe(true);
  });

  it('one-shots never re-accept; dailies re-open on a new day', () => {
    const log: QuestLog = {
      tut1: { state: 'turnedIn', progress: 10 },
      daily1: { state: 'turnedIn', progress: 30, day: '2026-07-09' },
    };
    expect(canAccept(log, questById('tut1')!, NOON)).toBe(false);
    expect(canAccept(log, questById('daily1')!, NOON)).toBe(true);
    log.daily1 = { state: 'turnedIn', progress: 30, day: '2026-07-10' };
    expect(canAccept(log, questById('daily1')!, NOON)).toBe(false);
  });
});

describe('progress events', () => {
  it('gather events fill matching gather quests', () => {
    const log: QuestLog = { tut1: { state: 'active', progress: 0 } };
    applyProgress(log, { type: 'gather', itemId: 'salvage', qty: 4, skill: 'scavving' });
    applyProgress(log, { type: 'gather', itemId: 'brass', qty: 4, skill: 'delving' });
    expect(log.tut1?.progress).toBe(4);
    applyProgress(log, { type: 'gather', itemId: 'salvage', qty: 99, skill: 'scavving' });
    expect(log.tut1?.progress).toBe(10); // clamped at the step qty
    expect(isComplete(questById('tut1')!, log.tut1)).toBe(true);
  });

  it('gatherSkills counts DISTINCT non-Scavving skills', () => {
    const log: QuestLog = { tut4: { state: 'active', progress: 0 } };
    applyProgress(log, { type: 'gather', itemId: 'salvage', qty: 5, skill: 'scavving' });
    expect(log.tut4?.progress).toBe(0);
    applyProgress(log, { type: 'gather', itemId: 'brass', qty: 1, skill: 'delving' });
    applyProgress(log, { type: 'gather', itemId: 'brass', qty: 1, skill: 'delving' });
    expect(log.tut4?.progress).toBe(1);
    applyProgress(log, { type: 'gather', itemId: 'glowkoi', qty: 1, skill: 'skimming' });
    expect(isComplete(questById('tut4')!, log.tut4)).toBe(true);
  });

  it('craft and donate events advance their quests', () => {
    const log: QuestLog = {
      tut3: { state: 'active', progress: 0 },
      tut5: { state: 'active', progress: 0 },
    };
    applyProgress(log, { type: 'craft' });
    expect(isComplete(questById('tut3')!, log.tut3)).toBe(true);
    applyProgress(log, { type: 'donate', itemId: 'amperite', qty: 5 });
    expect(isComplete(questById('tut5')!, log.tut5)).toBe(true);
  });
});

describe('daily cap', () => {
  it("counts only today's daily turn-ins", () => {
    const log: QuestLog = {
      daily1: { state: 'turnedIn', progress: 30, day: '2026-07-10' },
      daily2: { state: 'turnedIn', progress: 5, day: '2026-07-09' },
      tut1: { state: 'turnedIn', progress: 10 },
    };
    expect(dailyTurnInsToday(log, NOON)).toBe(1);
  });
});
