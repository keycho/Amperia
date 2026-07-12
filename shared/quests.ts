import { CONFIG } from './config';
import { dayKey } from './economy';

/**
 * Pure quest-state math (server-tracked; tested off the room). Each quest
 * has ONE tracked step; progress events add toward its qty. Cosmetic and
 * Bolts rewards land at turn-in only.
 */

export interface QuestDef {
  id: string;
  name: string;
  copy: string;
  step: { type: 'gather' | 'sellNpc' | 'craft' | 'gatherSkills' | 'donate'; itemId: string | null; qty: number };
  rewards: { bolts: number; cosmetic?: string };
  prereq: string | null;
  repeatable: 'daily' | null;
}

export interface QuestState {
  state: 'active' | 'turnedIn';
  progress: number;
  /** For gatherSkills: distinct non-Scavving skills seen. */
  skills?: string[];
  /** For dailies: the UTC day this state belongs to. */
  day?: string;
}

export type QuestLog = Record<string, QuestState>;

export function questDefs(): readonly QuestDef[] {
  return CONFIG.quests.defs as readonly QuestDef[];
}

export function questById(id: string): QuestDef | undefined {
  return questDefs().find((q) => q.id === id);
}

/** Can this quest be accepted right now? */
export function canAccept(log: QuestLog, def: QuestDef, now: number): boolean {
  const st = log[def.id];
  if (def.prereq !== null && log[def.prereq]?.state !== 'turnedIn') return false;
  if (st === undefined) return true;
  if (st.state === 'active') return false;
  if (def.repeatable === 'daily') return st.day !== dayKey(now);
  return false; // one-shots stay done
}

/** Count today's daily turn-ins (for the daily cap). */
export function dailyTurnInsToday(log: QuestLog, now: number): number {
  const today = dayKey(now);
  return questDefs().filter(
    (d) =>
      d.repeatable === 'daily' &&
      log[d.id]?.state === 'turnedIn' &&
      log[d.id]?.day === today,
  ).length;
}

/** Apply a progress event; returns true if anything advanced. */
export function applyProgress(
  log: QuestLog,
  event:
    | { type: 'gather'; itemId: string; qty: number; skill: string }
    | { type: 'sellNpc'; qty: number }
    | { type: 'craft' }
    | { type: 'donate'; itemId: string; qty: number },
): boolean {
  let advanced = false;
  for (const def of questDefs()) {
    const st = log[def.id];
    if (st === undefined || st.state !== 'active') continue;
    const step = def.step;
    if (step.type === 'gather' && event.type === 'gather') {
      if (step.itemId === null || step.itemId === event.itemId) {
        st.progress = Math.min(step.qty, st.progress + event.qty);
        advanced = true;
      }
    } else if (step.type === 'sellNpc' && event.type === 'sellNpc') {
      st.progress = Math.min(step.qty, st.progress + event.qty);
      advanced = true;
    } else if (step.type === 'craft' && event.type === 'craft') {
      st.progress = Math.min(step.qty, st.progress + 1);
      advanced = true;
    } else if (step.type === 'donate' && event.type === 'donate') {
      if (step.itemId === null || step.itemId === event.itemId) {
        st.progress = Math.min(step.qty, st.progress + event.qty);
        advanced = true;
      }
    } else if (step.type === 'gatherSkills' && event.type === 'gather') {
      if (event.skill !== 'scavving') {
        const seen = st.skills ?? [];
        if (!seen.includes(event.skill)) {
          seen.push(event.skill);
          st.skills = seen;
          st.progress = Math.min(step.qty, seen.length);
          advanced = true;
        }
      }
    }
  }
  return advanced;
}

export function isComplete(def: QuestDef, st: QuestState | undefined): boolean {
  return st !== undefined && st.state === 'active' && st.progress >= def.step.qty;
}
