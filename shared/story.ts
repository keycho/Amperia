import type { SkillId } from './mastery';

/**
 * S2 — "THE LONG DARK" questline. Chapters 1–3 (of 8) per the approved
 * script and the LOCKED canon note (Game Bible B7a): Old Works → cascade →
 * fourteen dark months → the Dynamo found already warm → the re-founding.
 * "Founding" always means the re-founding.
 *
 * PRIVACY RULE (locked): the server sends story STATE to the owning client
 * only; dialogue text renders client-side from these shared defs. Nothing
 * story-shaped is ever broadcast — two Sparks at different chapters at the
 * same NPC can never see each other's lines. Ambient chatter stays public.
 *
 * Comms rules apply to every line here. Keepsakes are curios: untradeable
 * in spirit and excluded from every drop path by construction (the
 * Scrapcache whitelist knows only raw resources).
 */

export type StoryNpc = 'merchant' | 'dispatcher' | 'warden' | 'barkeep';

export interface StoryLine {
  /** Display speaker (in-world name). */
  speaker: string;
  text: string;
}

/** A flavor choice: pick a prompt, hear its reply. Never branches state. */
export interface StoryChoice {
  prompt: string;
  reply: StoryLine[];
}

export interface StoryTask {
  type: 'gather' | 'donate' | 'conductorRun';
  itemId?: string;
  /** gather/donate: units. conductorRun: stages (ride out, drop, ride home). */
  qty: number;
}

export interface ChapterDef {
  id: string;
  n: number;
  title: string;
  npc: StoryNpc;
  unlock: {
    /** Chapter id that must be done first. */
    after?: string;
    /** Mastery gate, e.g. Scavving 3. */
    skill?: { id: SkillId; level: number };
    /** Requires having ridden the tram at least once. */
    tramRide?: boolean;
  };
  /** The offer conversation (before the task is taken). */
  intro: StoryLine[];
  /** Optional flavor choices shown mid-intro. */
  choices?: StoryChoice[];
  /** The line that closes the offer (after any choice). */
  send: StoryLine[];
  /** One-line task tracker copy. */
  taskCopy: string;
  task: StoryTask;
  /** The payoff conversation (task complete, back at the NPC). */
  outro: StoryLine[];
  keepsake: { itemId: string; caption: string };
  journal: string;
}

/** Per-chapter server state. Absent = not started ('offered' when unlocked). */
export interface ChapterState {
  state: 'task' | 'done';
  progress: number;
}

export interface StoryLog {
  chapters: Record<string, ChapterState>;
  /** Set the first time the Spark rides any tram (ch2's unlock). */
  rodeTram?: boolean;
  /** Set the first time the Spark descends to the Underworks (U4:
   *  the first descent rides free — the established free-leg spirit). */
  descended?: boolean;
}

export const emptyStoryLog = (): StoryLog => ({ chapters: {} });

// ── the chapters (script LOCKED after voice review) ─────────────────────────

export const STORY_CHAPTERS: readonly ChapterDef[] = [
  {
    id: 'ch1',
    n: 1,
    title: 'WICKS',
    npc: 'merchant',
    unlock: { skill: { id: 'scavving', level: 3 } },
    intro: [
      {
        speaker: 'Sable',
        text: "Evening, love. You've got the look of somebody who's been asked to fetch things all day. One more won't hurt, then.",
      },
      {
        speaker: 'Sable',
        text: 'I need Salvage. Ten good handfuls. Not for the scales — for the wicks. I dip a crate of lamp-wicks every month and the good wire comes from junk nobody else wants.',
      },
    ],
    choices: [
      {
        prompt: "Lamp-wicks? The city's got the Dynamo.",
        reply: [
          {
            speaker: 'Sable',
            text: "It does now. Keep your lamps anyway. That's not a warning, love, it's a habit. There's a difference, and the difference has a story to it.",
          },
        ],
      },
      {
        prompt: 'Ten handfuls. On it.',
        reply: [],
      },
    ],
    send: [
      {
        speaker: 'Sable',
        text: 'Off you go. The heaps by the tram line are honest today, I heard them clinking.',
      },
    ],
    taskCopy: "Gather 10 Salvage for Sable's wicks",
    task: { type: 'gather', itemId: 'salvage', qty: 10 },
    outro: [
      {
        speaker: 'Sable',
        text: 'Good weight. Good wire. You know why an old woman dips wicks in a city that never goes dark?',
      },
      {
        speaker: 'Sable',
        text: "Because it went dark once. The whole of it. No hum, no glow, no neon — just the canals slapping the deck and everybody breathing too loud. We called it the Long Dark, after. During, we didn't call it anything. You don't name a thing you're still inside of.",
      },
      {
        speaker: 'Sable',
        text: "The Nightstalls stayed open. Lamplight and stubbornness. My mother ran this pitch then — she said if the stalls closed, the city would believe it was over, and belief is the one cargo you can't re-order.",
      },
      {
        speaker: 'Sable',
        text: "Here. A bulb from her stall. Gave everything it had, that one. Keep it where you'll see it.",
      },
    ],
    keepsake: { itemId: 'deadFilament', caption: 'A DEAD FILAMENT — it gave everything.' },
    journal:
      'Sable dips lamp-wicks every month, because once the lights went out — all of them. She called it the Long Dark. Nobody who was there says it casually.',
  },
  {
    id: 'ch2',
    n: 2,
    title: "THE LOOP THAT DIDN'T STOP",
    npc: 'dispatcher',
    unlock: { after: 'ch1', tramRide: true },
    intro: [
      { speaker: 'the Dispatcher', text: 'You. Spark. You ride the Filament–Stacks leg?' },
      {
        speaker: 'the Dispatcher',
        text: 'Everyone does. It\'s free. Ever ask why it\'s free? No — nobody asks. It\'s on the ledger as "the Conductor\'s Leg." Ride it out and back, and drop a satchel at a Stacks landing while you\'re at it. Dispatch doesn\'t waste a seat.',
      },
    ],
    choices: [
      {
        prompt: "Who's the Conductor?",
        reply: [
          {
            speaker: 'the Dispatcher',
            text: "Was a person. Now it's a leg on a ledger. Ride first. Some answers sit better with the floor moving under you.",
          },
        ],
      },
      { prompt: 'Just the satchel run, then.', reply: [] },
    ],
    send: [
      {
        speaker: 'the Dispatcher',
        text: "Gate's that way. Take the free leg out, make one parcel drop off the Stacks dispatch post, ride the free leg home.",
      },
    ],
    taskCopy: 'Ride to the Stacks, drop a parcel, ride back',
    task: { type: 'conductorRun', qty: 3 },
    outro: [
      {
        speaker: 'the Dispatcher',
        text: "Satchel logged. Sit a moment. That's not a request, my board's quiet and I don't like it.",
      },
      {
        speaker: 'the Dispatcher',
        text: "During the Dark, the trams had no signal, no gate-lights, nothing. Should have stopped. One conductor wouldn't. Ran the Filament–Stacks loop by hand-lamp and bell-count — you count the trestle joints, you know where you are. Fourteen months. Never missed a night.",
      },
      {
        speaker: 'the Dispatcher',
        text: 'People rode in the dark because a moving tram meant the city still had a pulse. That\'s the whole of it. When the lights came back, the first thing the company did was make that leg free. Forever. It\'s the only sentimental line in the entire fare table, and if you tell anyone I said "sentimental" I\'ll route your parcels through the Tangle.',
      },
      {
        speaker: 'the Dispatcher',
        text: "Here. Fell out of the old fare box when we refit the gate. Take it — dispatch doesn't keep what it can't file.",
      },
    ],
    keepsake: {
      itemId: 'punchedTicket',
      caption: 'A PUNCHED TICKET — fourteen bell-counts to the Stacks.',
    },
    journal:
      "The free tram leg is called the Conductor's Leg. Someone ran it by bell-count through fourteen months of the Long Dark. The fare table remembers what the ledgers won't say.",
  },
  {
    id: 'ch3',
    n: 3,
    title: "THE WARDEN'S LEDGER",
    npc: 'warden',
    unlock: { after: 'ch2', skill: { id: 'delving', level: 5 } },
    intro: [
      {
        speaker: 'the Charge Warden',
        text: "Closer, Spark. The Dynamo doesn't bite. It warms. There's a lesson in that, but I won't flog it.",
      },
      {
        speaker: 'the Charge Warden',
        text: "You've heard two stories now — Sable's lamps, dispatch's loop. You're carrying them. Good. Carry a third: bring the meter five Amperite. Not for me. The meter is the city thanking itself out loud, and it should say your name once.",
      },
    ],
    send: [
      {
        speaker: 'the Charge Warden',
        text: 'The Underworks holds Amperite for anyone patient enough to delve it. The meter and I will be here.',
      },
    ],
    taskCopy: 'Donate 5 Amperite to the Citywide Charge',
    task: { type: 'donate', itemId: 'amperite', qty: 5 },
    choices: [
      {
        prompt: 'Who built the Dynamo?',
        reply: [
          {
            speaker: 'the Charge Warden',
            text: "Those are the same question, and the honest answer to both is: it's not in my ledger.",
          },
        ],
      },
      {
        prompt: 'How did the Dark end?',
        reply: [
          {
            speaker: 'the Charge Warden',
            text: "Those are the same question, and the honest answer to both is: it's not in my ledger.",
          },
        ],
      },
    ],
    outro: [
      {
        speaker: 'the Charge Warden',
        text: "There it went. Feel that? The tick under the plating. That's the sound the Dark ended on.",
      },
      {
        speaker: 'the Charge Warden',
        text: "The re-founding records — and founding always means the re-founding, Spark; the count restarts there — say the crews came to strip the south platform for boiler plate and found the Dynamo already here. Already warm. Fourteen months of dead city, and under the junk — one machine, idling, patient, like a stove somebody'd banked for the night.",
      },
      {
        speaker: 'the Charge Warden',
        text: "They didn't build the city and then power it. They found the power and built the city around it, close as they could huddle. This plaza was the dump they cleared to do it.",
      },
      {
        speaker: 'the Charge Warden',
        text: "My ledger goes back to the re-founding. Every warden copies it forward, page by page. And every copy — mine, my teacher's, hers before — has the same page missing. Torn, not lost. Page one.",
      },
      {
        speaker: 'the Charge Warden',
        text: "The maker's mark is on the casing, low on the north face where the shadow sits. Take a rubbing home. Nobody living reads that script. Somebody did once.",
      },
    ],
    keepsake: {
      itemId: 'makersRubbing',
      caption: "A MAKER'S-MARK RUBBING — a script nobody living reads.",
    },
    journal:
      "The Dynamo was found, not built — already warm under fourteen months of scrap. Every copy of the Warden's ledger is missing the same torn page. Page one.",
  },
  {
    id: 'ch4',
    n: 4,
    title: 'THE DARK ROUNDS',
    npc: 'barkeep',
    unlock: { after: 'ch3', skill: { id: 'skimming', level: 4 } },
    intro: [
      {
        speaker: 'Vessa',
        text: "New face, old thirst. Sit anywhere that isn't the end stool. That one's taken, and no, you don't see anybody on it. Sharp eyes. Wrong conclusion.",
      },
      {
        speaker: 'Vessa',
        text: "Since you're here — my stew pot's short. Four glowkoi, skimmed fresh, and don't let the canal hear you bragging. Bring them and I'll tell you about the stool.",
      },
    ],
    choices: [
      {
        prompt: "Who's the stool for?",
        reply: [
          {
            speaker: 'Vessa',
            text: "Somebody who never once sat in it. That's the point of it, which makes no sense to you yet. Koi first. Stories pour better over a burner.",
          },
        ],
      },
      { prompt: 'Four koi. Easy.', reply: [] },
    ],
    send: [
      {
        speaker: 'Vessa',
        text: "Mind the wisps out by the slow water. They don't want your koi. They want your attention. Don't give it.",
      },
    ],
    taskCopy: "Skim 4 Glowkoi for Vessa's stew",
    task: { type: 'gather', itemId: 'glowkoi', qty: 4 },
    outro: [
      {
        speaker: 'Vessa',
        text: "Fat ones. Good. The pot forgives a lot but it doesn't forgive stingy. Right — the stool.",
      },
      {
        speaker: 'Vessa',
        text: "This bar was my aunt's pitch during the Dark. No power for the taps, so she poured what poured cold, and on the worst nights she poured what she called the dark rounds — free, no questions, chalk mark on the wall behind. Fourteen months of chalk. Nobody ever came back to square a mark, because she never once looked at the wall while she made it.",
      },
      {
        speaker: 'Vessa',
        text: "The end stool was for the Conductor. Every night that tram ran past our lamps, out into all that black, and every night my aunt set a cup at the end stool for when the loop came home. Never once got sat on. The loop always ran late and the Conductor always waved through the window and rang on. Fourteen months, one full cup a night.",
      },
      {
        speaker: 'Vessa',
        text: "When it ended, my aunt kept setting the cup. Habit, she said. Same as Sable's wicks. This city runs on habits it refuses to explain. Here — you came for a story and you got a true one, and I've given you a stool. Take the chalk too. It's down to a stub, same as everything that mattered back then.",
      },
    ],
    keepsake: {
      itemId: 'barChalk',
      caption: 'A STUB OF BAR CHALK — fourteen months of marks nobody collected.',
    },
    journal:
      "Vessa's aunt poured dark rounds free through the Long Dark and chalked marks she never counted. The end stool still gets a full cup, for a Conductor who never once had time to sit.",
  },
  {
    id: 'ch5',
    n: 5,
    title: 'THE SOUTH PLATFORM',
    npc: 'merchant',
    unlock: { after: 'ch4', skill: { id: 'scavving', level: 10 } },
    intro: [
      {
        speaker: 'Sable',
        text: "Back again, love. Good. I've been sorting the deep crates and my wrists have opinions. Bring me eight good brass fittings — the heaps south of the plaza run rich with them, and there's a reason for that you should hear standing exactly where you're standing.",
      },
      {
        speaker: 'Sable',
        text: 'Look down. Go on. This plaza — the stones under your boots — this was the dump. The whole south platform was. Fourteen months of a dark city throws a lot away.',
      },
    ],
    choices: [
      {
        prompt: 'They built the plaza on a dump?',
        reply: [
          {
            speaker: 'Sable',
            text: "They built the plaza *out* of one, which is a different and better thing. Cleared it barrow by barrow with their own hands. Everything worth saving got saved. Some of it's still turning up. That's your errand, if you're quick enough to have already guessed.",
          },
        ],
      },
      { prompt: 'Eight fittings. Going.', reply: [] },
    ],
    send: [
      {
        speaker: 'Sable',
        text: "South heaps, love. And if you turn up anything with a wick in it, I'll want to see it before the scales do.",
      },
    ],
    taskCopy: 'Gather 8 Brass from the south heaps',
    task: { type: 'gather', itemId: 'brass', qty: 8 },
    outro: [
      {
        speaker: 'Sable',
        text: "Good fittings. Boiler brass, most of this — off the Old Works, from when the crews came stripping plate to rebuild it. You know that part. Here's the part the records keep flat.",
      },
      {
        speaker: 'Sable',
        text: "Clearing a dump is reading a diary backwards. Every layer, the crews turned up how people had lived: lamp after lamp after lamp, burned to the collar. Wick-crates with my mother's knots on them, empty. And near the bottom — my mother swore this on her scales — tools. Good tools, laid out neat under a tarp, *with fresh oil on them.* Fourteen months of dark, and somebody had been keeping their tools oiled. Under the dump. Right about where that machine was idling.",
      },
      {
        speaker: 'Sable',
        text: "Nobody claimed them. Nobody ever claimed them. My mother kept one lamp off the top layer instead — unclaimed, like its owner. We light it once a year and we don't say for whom, because we don't know. That's not a sad thing, love. It's a *kept* thing. There's a difference, and by now you know the difference has a story to it.",
      },
      {
        speaker: 'Sable',
        text: 'Take the lamp this year. My wrists, remember.',
      },
    ],
    keepsake: {
      itemId: 'unclaimedLamp',
      caption: 'AN UNCLAIMED LAMP — lit once a year, for nobody they could name.',
    },
    journal:
      'The Filament plaza is the old dump, cleared by hand. Near the bottom of it the crews found good tools under a tarp — oiled, tended, fourteen months into the Dark. Nobody ever claimed them.',
  },
];

export const storyChapter = (id: string): ChapterDef | undefined =>
  STORY_CHAPTERS.find((c) => c.id === id);

// ── pure state machine (server truth; unit-tested off a live server) ────────

/** Is this chapter offered to a Spark with this log / these facts? */
export function chapterAvailable(
  log: StoryLog,
  id: string,
  skillLevel: (skill: SkillId) => number,
): boolean {
  const def = storyChapter(id);
  if (def === undefined) return false;
  if (log.chapters[id] !== undefined) return false; // already taken or done
  const u = def.unlock;
  if (u.after !== undefined && log.chapters[u.after]?.state !== 'done') return false;
  if (u.tramRide === true && log.rodeTram !== true) return false;
  if (u.skill !== undefined && skillLevel(u.skill.id) < u.skill.level) return false;
  return true;
}

/** Events the room feeds the story (same seams the quest log rides). */
export type StoryEvent =
  | { type: 'gather'; itemId: string; qty: number }
  | { type: 'donate'; itemId: string; qty: number }
  | { type: 'travel'; to: string }
  | { type: 'deliver' };

/**
 * Advance the ACTIVE chapter's progress. The conductorRun counts stages in
 * strict order: (1) ride to the Stacks, (2) drop a parcel there, (3) ride
 * home to the Filament — a drop before the ride never counts.
 */
export function advanceStory(log: StoryLog, event: StoryEvent): boolean {
  if (event.type === 'travel') log.rodeTram = true;
  if (event.type === 'travel' && event.to === 'underworks') log.descended = true;
  let advanced = false;
  for (const def of STORY_CHAPTERS) {
    const st = log.chapters[def.id];
    if (st === undefined || st.state !== 'task' || st.progress >= def.task.qty) continue;
    const t = def.task;
    if (t.type === 'gather' && event.type === 'gather' && event.itemId === t.itemId) {
      st.progress = Math.min(t.qty, st.progress + event.qty);
      advanced = true;
    } else if (t.type === 'donate' && event.type === 'donate' && event.itemId === t.itemId) {
      st.progress = Math.min(t.qty, st.progress + event.qty);
      advanced = true;
    } else if (t.type === 'conductorRun') {
      if (st.progress === 0 && event.type === 'travel' && event.to === 'stacks') {
        st.progress = 1;
        advanced = true;
      } else if (st.progress === 1 && event.type === 'deliver') {
        st.progress = 2;
        advanced = true;
      } else if (st.progress === 2 && event.type === 'travel' && event.to === 'filament') {
        st.progress = 3;
        advanced = true;
      }
    }
  }
  return advanced;
}

/** Task complete, payoff conversation + keepsake waiting at the NPC. */
export function chapterReady(log: StoryLog, id: string): boolean {
  const def = storyChapter(id);
  const st = log.chapters[id];
  return def !== undefined && st?.state === 'task' && st.progress >= def.task.qty;
}
