/**
 * Profanity SOFT filter (H2): masks matched words with ✶, never blocks
 * the message. Deliberately small and dumb — a starter list plus common
 * leet swaps, tuned to avoid the classic false positives (Scunthorpe
 * stays a place). Extend WORDS as real chat teaches us; anything
 * heavier-duty belongs in a moderation service, not here.
 */

const WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dickhead', 'bastard',
  'slut', 'whore', 'faggot', 'nigger', 'nigga', 'retard', 'kike', 'spic',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function normalize(word: string): string {
  return word
    .toLowerCase()
    .split('')
    .map((ch) => LEET[ch] ?? ch)
    .join('');
}

/** Mask filtered words in place; everything else passes untouched. */
export function softFilter(text: string): string {
  return text.replace(/[\p{L}\p{N}@$!]+/gu, (token) => {
    const plain = normalize(token);
    for (const w of WORDS) {
      if (plain === w || plain === `${w}s` || plain === `${w}es`) {
        return token[0] + '✶'.repeat(Math.max(1, token.length - 1));
      }
    }
    return token;
  });
}
