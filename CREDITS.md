# AMPERIA — CREDITS

Everything in the city is either made here or CC0. Nothing else gets in
(S1 rule: CC0 only, credited here the day it lands).

## Audio

**All audio is original, synthesized in-engine.** There are no third-party
sound files: every loop and one-shot in `client/src/audio/sound.ts` is built
at runtime from WebAudio primitives (oscillators + filtered noise) —

- ambient: the Great Dynamo's hum, the Nightstalls murmur, and a per-district
  ambient bed (Stacks wind, Terrarium leaf-hiss and chirps, Tangle rumble,
  the Filament's warm crackle), crossfaded on tram hops;
- one-shots: gather chirp, glint ding, surface-aware footsteps, the Fortune
  Coil tick, rare-find chime, level-up fanfare, quest stamp, counter kaching,
  donation whoosh, UI clicks, chat pop, combat thud + whiff, the bar's pour
  and clink, the tram's two-tone departure chime;
- the flagship: the Tuner's static→lock sweep, pitch-tracking lock accuracy.

Volume rails (master · ambience · effects) live in the settings panel and
persist locally.

## Art

World models, the Spark mascot, palette and all voxel bakes are original
(spec: `ART-DIRECTION.md`; palette: `shared/palette.ts`). Third-party art is
**CC0 (public domain) from [Kenney](https://kenney.nl)** — thank you, Kenney:

- `assets/kenney_emotes` — emote glyphs
- `assets/kenney_game-icons` — UI icons
- `assets/kenney_particle-pack` — particle sprites
- `assets/kenney_ui-pack` — UI furniture

License: CC0 1.0 Universal (see `assets/License.txt`). CC0 requires no
attribution; we credit because it's the neighborly thing to do.

## Fonts

UI text renders in the browser's stock `monospace` — no bundled fonts.
