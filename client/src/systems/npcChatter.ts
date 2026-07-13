/**
 * PP2 — rotating ambient NPC lines + interaction greetings, in the city's
 * in-world voice. Comms-compliant (golden rule 11): no "earn", "yield",
 * "APY", "investment", or price talk — just the market talking to itself.
 * Keyed by the speaker's prop kind. `lift` is how far above the prop's foot
 * anchor the bubble tail points (roughly the speaker's head height).
 */
export interface NpcVoice {
  name: string;
  lift: number;
  /** The line shown when a Spark interacts with the NPC. */
  greet: string;
  /** 2–3 ambient lines cycled on the slow timer when a Spark is near. */
  lines: readonly string[];
}

export const NPC_CHATTER: Record<string, NpcVoice> = {
  merchant: {
    name: 'Sable',
    lift: 92,
    greet: 'Evening. What can I weigh for you?',
    lines: [
      'Fresh Salvage? I weigh it fair, love.',
      'Bolts for brass — honest scales, always.',
      'The Nightstalls never quite close.',
    ],
  },
  dispatcher: {
    name: 'the Dispatcher',
    lift: 84,
    greet: 'Got a run, if you want it.',
    lines: [
      "Parcels waiting — the Stacks won't run themselves.",
      'Steady hands, steady work.',
      "Another run whenever you're ready.",
    ],
  },
  warden: {
    name: 'the Charge Warden',
    lift: 84,
    greet: 'The Dynamo thanks you.',
    lines: [
      'The Charge holds while the city gives.',
      'Amperite keeps the old Dynamo warm.',
      'Every spark feeds the meter.',
    ],
  },
  tramgate: {
    name: 'the conductor',
    lift: 108,
    greet: 'Where to, then?',
    lines: [
      'All stops on the line — mind the gap.',
      "Next tram's always coming.",
      'Tolls by the hop. No surprises.',
    ],
  },
};
