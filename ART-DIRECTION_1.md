# ART DIRECTION — "Cozy Salvage-Punk" *(LOCKED — Part I unchanged; Part II addendum added in v2)*

*The look for the game. Warm, lived-in, neon-lit future night-market. Punk by attitude (DIY junk-tech, patched chrome, graffiti, string lights), cozy by mood. Built to be pleasant to look at and play every day, and to read cleanly in flat isometric. Name-agnostic — this holds whatever the game ends up being called.*

---

# PART I — THE LOCKED CORE (unchanged from v1)

## 1. The one-paragraph pitch

A warm, glowing future **night market that never closes**. People built a life out of salvage — jury-rigged tech, neon signs made from scavenged tubing, rooftop gardens in old barrels, food stalls and arcade dens strung with fairy lights. It's dusk forever, but a *golden* dusk, not a black one. The feeling is **hopeful, busy, and cozy** — Studio Ghibli clutter meets soft cyberpunk, not dystopian horror. You want to hang out here, not survive here.

**Hard rules (what it is NOT):** not grimdark cyberpunk (no oppressive pure-black, no acid-horror palette), not grass/fields/woodland, not ocean. The ground is **decking, metal plating, warm pavement, and rugs** — never lawn.

## 2. Locked palette

Warm-forward base so the world is comfortable for long sessions; saturated neon reserved for signage and things you can interact with, so they pop.

| Role | Hex | Use |
|---|---|---|
| **Dusk sky / deep base** | `#35284F` | Sky, deepest shadows (a warm plum — never pure black) |
| **Ink (outlines only)** | `#1E1930` | Sprite outlines, fine linework — not large fills |
| **Structure mid** | `#4E4560` | Building bodies, walls, mid-shadow |
| **Ground base** | `#6B5E70` | Primary walkable pavement / plating (warm grey-mauve) |
| **Ground accent / decking** | `#9A8574` | Wooden decks, tan tiles, rugs, paths — adds warmth & variety |
| **Warm ambient glow** | `#FFD9A0` | The overall golden light wash, lamp halos |
| **Neon amber** *(primary warm)* | `#FFB84D` | Signage, lanterns, key light sources |
| **Neon rose / coral** | `#FF6F91` | Accent signage, fabric, highlights |
| **Neon teal** *(primary cool)* | `#2FD3B8` | Interactables, UI highlights, screens |
| **Neon cyan** *(secondary cool)* | `#5BC0FF` | Holo-signage, water/coolant glints |
| **Solar green** *(muted)* | `#7BC59A` | Potted plants, hanging gardens — greenery as *decor*, never as terrain |
| **Ember orange** *(accent — render overhaul R3c)* | `#FF8C42` | Sparks, hazard stripes, heat — welding-hot; never a fill |
| **Signal red** *(deep, SPARSE)* | `#C0392B` | Danger and one or two signs per district at most |
| **Violet neon** *(rare, premium)* | `#B266FF` | Premium-feeling signage — rarer than rose |

**Palette rules:**
- Big areas use the **warm mid-values** (`#6B5E70`, `#9A8574`, `#4E4560`). Pure saturated neon is an *accent*, not a fill — that's what keeps it cozy instead of loud.
- **One dominant hue per district** (e.g., the market is amber/rose, the workshop row is teal, the garden tier is green) so zones read at a glance and the world feels varied.
- **Never let pure black own a large region** — deepest tone is the plum `#35284F`. This is the single biggest difference from dark cyberpunk and the main reason it's easy on the eyes daily.

## 3. Lighting

- **Key light = perpetual golden dusk.** Warm, soft, directional — the whole scene sits in `#FFD9A0` ambient.
- **Local neon glow** from signs, stalls, and string lights adds the punk color; each emits a soft bloom halo.
- **Gentle bloom + haze**, not heavy fog. Distant lights glow softly so the backdrop feels deep without going murky.
- **Wet-sheen ground, lightly.** Tiles have a subtle reflective glaze that catches nearby neon (the charming part of Blade Runner) — but *damp and shiny*, not drenched and gloomy.
- **Day–night cycle stays in the warm band:** golden dusk ↔ soft evening. It never goes pitch dark. Optional: signs get brighter/bloomier at "night," dimmer at "dusk" — subtle mood shift, always comfortable.

## 4. Environment & world texture

A **stacked, dense, walkable market-slum** — cozy-crowded like Kowloon or a Tokyo backstreet, but futurized with salvage-tech.

Signature set-dressing (the props that *sell* the style): string/fairy lights everywhere, paper-lantern-style **holo-signs**, noodle/ramen and food stalls with steam, **vending machines**, tangled cable bundles overhead, **graffiti tags** and stickers, potted **neon plants** and barrel gardens, jury-rigged antennae and satellite dishes, **arcade cabinets**, hover-scooters/mopeds parked in alleys, crates, tarps, rugs, patched awnings, hand-painted signage over chrome.

Ground is always built, never natural: **metal decking, warm pavement, tiled plaza, wooden boardwalk, rugs and mats.** Greenery appears only as **planters, vertical gardens, and hanging vines** — decoration on top of the built world, so it reads "cozy" without ever becoming "fields."

## 5. Faking verticality in isometric (so you don't need voxel towers)

You will **not** build tall walkable skyscrapers. Height is implied, and the playable ground stays flat and readable:

- **Warm parallax backdrop** behind the play area: stacked habitat blocks, hanging gardens, distant glowing signage, a floating hologram or two, all in cooler/dimmer tones so they recede.
- **Tall structure sprites at map edges** (sign towers, stacked stalls, water tanks) that imply verticality without being climbed.
- **Overhead layer**: strung cables, banners, hanging lights and vines drawn *above* the player plane for depth.
- **Eye-level detail is where the richness lives** — signage, stalls, props sit right where you walk, so the world feels dense even though the ground is flat.

Flat ground is a *feature* here: it's what makes the game legible enough to enjoy every day.

> **§5 AMENDMENT (districts block, 2026-07-10 — binding, arrived with The
> Stacks brief in §12B):** tall structures **may exist as blocking world
> objects — never interiors**. The camera never enters a building; a tower
> is a very large prop. Walkable levels may ride **+2/+3 via the elevation
> system** (terraces, rooflines, stair runs) — the *ground the player walks*
> remains flat planes connected by ramps, exactly as R4 built them. And the
> price of height: **anything that can occlude the player requires
> occlusion fade** (the structure drops to ~35% opacity while it stands
> between the camera and your Spark or the hovered tile, restoring when
> clear). Verticality is now real where a district's fantasy demands it —
> readability still wins every collision.

## 6. Characters & mobs

- **Chunky, readable voxel/sprite** figures with strong silhouettes and a warm rim-light so they always pop off the ground.
- **DIY-punk fashion**: patched jackets, goggles, neon-dyed hair, mismatched cybernetic bits, scarves, tool-belts, hand-me-down chrome. Personality and warmth, not menace.
- **Friendly-scrappy, not threatening.** Even the "enemies" read as junk-drones, rogue bots, and critters — closer to *Stray*'s Zurks or a grumpy scrap-bot than to horror.
- Mounts/vehicles: hover-scooters, cargo-boards, patched-together bikes — visibly hand-built.

## 7. Readability rules for daily play *(non-negotiable)*

1. **Warm mid-value ground** so characters, items, and nodes always stand out against it.
2. **Saturated neon = "you can touch this."** Reserve the brightest colors for interactables, signage, and UI, not scenery — this trains the eye and reduces visual noise.
3. **One dominant hue per district**; vary hues between zones so the world doesn't blur into sameness.
4. **No large pure-black regions**; deepest value is warm plum.
5. **Keep the HUD warm and minimal** so it sits in the same world as the art.
6. Test every scene at **actual play zoom for 60+ seconds** — if it's tiring or hard to parse, desaturate the scenery and dial the neon back to accents.

## 8. Moodboard references (go look at these)

*Cozy-neon / soft cyberpunk:* **Cloudpunk**, **Stray**, **The Last Night**, **VA-11 Hall-A**, **Coffee Talk**, **Sable** (stylized warmth). *Real-world warmth-in-density:* Tokyo's **Omoide Yokocho / Golden Gai** alleys, **Shinjuku** and **Bangkok/Shilin night markets**, **Kowloon Walled City** (cozy-dense). *Palette & light:* **Studio Ghibli** clutter and warm interiors, **Star Wars** Tatooine market warmth, **solarpunk** art (for the plant-and-neon combo). Pull the *warm, lived-in, string-lit* frames from each — skip the cold/rainy/oppressive ones. For character-cosmetic readability at small scale (Part II): **Eastward**, **CrossCode**, and **Habbo**-era iso games (masters of "outfit reads at tiny size").

## 9. How this changes the world bible

The setting mood shifts from "buried dystopian underworld" to a **warm salvage-punk market-district future**. The *structure* (realms, resources, tools, economy) all still holds — just re-lit: realms become **districts/tiers of a stacked neon market-town**, "dangerous zones" are the scrappy outskirts and junk-yards rather than pitch-black horror tunnels, and the hub is a glowing plaza market instead of a grim hollow.

---

# PART II — v2 ADDENDUM *(additive — nothing in Part I is overridden)*

*Two gaps surfaced when the economy was rebuilt around identity and seasons (Game Bible v2): the spec said little about the thing that now pays for the game — cosmetics — and locked the whole game to a single lighting mood forever. This addendum fixes both without unlocking the palette or the core rules.*

## 10. Cosmetics must read (the revenue layer)

The economy sells identity: premium cosmetics, name-glow, tool skins, Loftpod and Crew Hall decoration, Mastercoil sashes. A cosmetic that isn't clearly visible at play zoom from across the plaza generates no status and therefore no demand. Rules:

1. **Character scale favors costume.** Sparks render **larger relative to tiles than typical iso** (~1.5–2 tile-heights) so outfit detail has pixels to live in. If characters and world scale ever compete, characters win. (M0 note: size the placeholder capsule to this scale from the start — it's free now and expensive later.)
2. **Cosmetic anchor slots, built for silhouette.** Every wearable maps to one of: **Headgear** (biggest silhouette change), **Back** (packs, banners, folded junk-wings), **Jacket/body**, **Tool skin** (see below), **Movement trail/aura** (FX), **Name-glow**. A premium cosmetic must change the **silhouette or emit light** — palette-swap-only items are the free/crafted tier (dye kits), never the premium tier. Silhouette + glow is what reads at iso distance; color alone doesn't.
3. **Tool skins are the most-seen cosmetic in the game.** Players spend most of their session gathering — the Magclaw/Drillhammer/Skimnet/Tuner in their hands is on screen more than any jacket. Premium tool skins (visible during the gather animation and its active-layer flourishes) should be a flagship Foundry category.
4. **Emissive budget = the premium signature.** Part I reserves saturated neon for interactables; cosmetics get a **small-area emissive allowance** (trims, seams, visor glints, aura wisps) that is visibly softer and smaller than interactable glow, so premium items sparkle without breaking readability rule 2. Free/crafted cosmetics are matte palette colors; the glow *is* the status signal.
5. **Rarity reads as light, not loudness.** Tier the emissive allowance (common: none → premium: trim glow → seasonal-exclusive: soft animated aura). Never escalate to full-body bloom — the cap protects both coziness and the value of the top tier.
6. **The across-the-plaza test** *(non-negotiable, joins the Part I readability rules)*: every premium cosmetic must be identifiable — "that's the Kiln-Glow jacket" — at default zoom from ~15 tiles away, against the busiest district background. If it fails, redesign the item, don't brighten it past the budget.
7. **Design the catwalks.** Cosmetics are bought to be seen, so the places players *idle near each other* — Tramgate platforms, the Ledgerhouse queue, the Nightstalls street, the Great Dynamo plaza, Circuit spectator tiers — are dressing rooms and showrooms. Level design keeps these spaces tight (funnel players past each other), well-lit, and camera-friendly. The Nightstalls being single-instance (bible B8) is an art feature too: one shared street where everyone's outfit gets foot traffic.
8. **Loftpods and Crew Halls are cosmetic canvases.** Interiors and facades must read at play zoom: trophy walls, Mastery banners, dye-able awnings, premium furniture with the same emissive-trim language. The Terrarium is effectively the housing showroom district — give it generous sightlines.

## 11. Variety within the warm band (seasons, weather, the living city)

Perpetual golden dusk stays — but one mood forever means every screenshot for two years looks identical, which starves season marketing and dulls long-term play. Variety comes from **re-lighting, never re-paletting**:

1. **Seasonal re-lights.** Each 10–12-week season shifts the *ambient wash and sign-glow mix* within the existing warm band, anchored to one of the locked neons: a lantern-festival season leans rose `#FF6F91`, a coolant-mist season leans teal/cyan evenings, an ember season deepens toward amber `#FFB84D`, a garden-bloom season lets solar green `#7BC59A` carry the planters. Ground, structures, and outlines never change hex — only the light on them. *Implementation: ambient-wash + bloom-mix presets in `/shared/config.ts`, one preset per season.*
2. **Weather-lite.** Occasional gentle atmospherics that stay cozy: drifting stall-steam, floating embers/spark-motes, soft lantern haze, a light rain-sheen pass that briefly intensifies the wet-ground glaze (Part I §3). Never storms, never darkness, never reduced visibility that hurts readability.
3. **The Citywide Charge is visible.** The weekly Charge meter (bible B9) drives the city's light density: low charge = sparser string lights, dimmer signage; full charge = the whole district blazing like festival night. The economy's biggest sink literally lights the scene — players should *see* the city they're keeping lit. This is the cheapest, most thematic variety lever the game has.
4. **The marketing rule:** every season must produce a screenshot that is obviously from *that* season at a glance. If the season-launch screenshot could be from last season, the re-light isn't doing its job.

## 12A. The voxel construction spec *(v2.2 — the binding "how assets are made" rules)*

The style target is **"Kintara construction, Amperia palette"**: a uniform chunky-voxel world where cohesion comes from every asset obeying the same mechanical build rules — not from asset quality. Mixing construction styles (textured packs + smooth procedural + stock-colored sprites) is what makes a scene read as placeholder soup; these rules exist so that can never happen again.

1. **One voxel unit, everywhere.** All world objects are built from the same voxel unit (~1/8 tile width for props). An object may be big or small; its *grain* never changes.
2. **Three-tone flat face shading, one light direction.** Top face = base color **+30%** light; left face = base; right face = **−35%** dark (widened from ±20% in the 2026-07-10 render overhaul — the timid spread read soft). Light always from top-left/up. *Render-overhaul amendments (R1/R2, binding):* every model also bakes a directional CAST shadow (sheared toward screen bottom-right, length by height), a 1px top-edge highlight bevel, whisper-dark same-material voxel seams, and crevice/overhang AO. Per-material value noise, wear and stains (the materials pass) remain.
3. **Crisp edges; MANDATORY 1px ink outline** (`#1E1930`) around the whole silhouette only — never per-voxel. *(Clarity-pass amendment, binding: the outline is a full 8-direction silhouette ring baked into every object sprite — props, buildings, stalls, nodes, characters, structures. The only exemptions are pure-light forms (Sparkwisps, glow quads) and floor-plane trim (ground tiles, deck rims), which sit below the object read. This is the load-bearing clarity trick: every object on a crowded lane must read as a discrete, countable thing.)*
4. **Palette colors only**, plus at most one neon accent per asset, and only where it earns it (signage, glow cores, interactable highlights).
5. **Contrast = value separation between elements, not global darkness:** ground tiles sit dark-mid (plum range), objects sit clearly lighter/more saturated, neon accents run hot with bloom, sky/backdrop is darkest. Big flat color planes that read at a glance.
6. **Assets are generated, not sourced:** objects are defined as voxel models in code and rendered to sprites at boot through a shared pipeline — which enforces rules 1–5 automatically. Third-party packs are limited to UI chrome, item icons, and particles; no third-party *world* sprites.
7. **Sparks** are chunky voxel figures ~1.5–2 tile-heights (rule §10.1), slightly oversized head, strong silhouette, 4-direction facing, subtle warm rim-light. Cosmetics attach to the anchor slots (§10.2) as voxel add-ons that change silhouette or emit light.
8. **The hero-asset budget:** the Dynamo, the five resource nodes, stalls, and the Spark base figure deserve disproportionate voxel-model care — they are on screen constantly and define how good the whole game looks.

## 12B. District art briefs *(binding — added with the Tangle art pass)*

**Every district ships with a brief BEFORE its map is built.** A district
without a brief is a spec violation; so is a screenful of evenly-scattered
same-sized props in ANY district. The brief defines:

- **(a) Dominant hue + accent discipline** (per Part I §2's one-hue rule):
  name the hue that owns the district and list which accents may appear,
  each with its assigned meaning. Anything not listed stays out.
- **(b) One XL landmark**, visible from most of the district — navigation
  aid and identity in a single silhouette.
- **(c) The mass hierarchy:** every screenful must contain all four sizes —
  **XL** (1: the landmark or a wall of it), **L** (2–3: buildings, stacks,
  gates), **M** (clutter: crates, machines, nodes), **S** (detail: lamps,
  posts, cables, debris). Even scatter of same-sized props violates this
  section.
- **(d) A light plan:** source types, density (pool spacing), and the
  district's darkness level relative to the Filament.
- **(e) The shape mix** *(added with the world-variety pass)*: **boxes may
  be at most 60% of the objects in any screenful.** The rest must draw on
  the other silhouette families — fabric (canopies, banners, wash lines),
  organic (bushes, vines), tall/thin (posts, pipes, masts), round-ish
  (barrels, spools, tanks, pots), and the district's unique set pieces.
  Common props ship 3–4 baked looks with position-hashed, adjacency-guarded
  picks — **two identical models never sit next to each other**, and no
  screenful should read as "a field of the same box."

### The Tangle — district brief (first under this rule)

- **FANTASY:** wire-maze canyon — threading dark corridors between towering
  walls of stacked dead containers, under sagging cable trusses, past the
  hulks of dead machines. Danger lives in the dark stretches.
- **(a) Dominant hue:** rust + gunmetal (weathered browns, dark steel).
  Accents: **hazard amber** (junction lamps, warning stripes on the odd
  container — ember orange `#FF8C42` for the stripes); **teal ONLY as
  amperite glow and antenna beacons** ("something valuable glowing in the
  dark"); **rose ONLY for Scrapcache beacons and mob eye-flares**. The old
  teal/pink/tan crate confetti is recolored into the rust/gunmetal family.
- **(b) XL landmark:** one ruined crane-bot hulk — a dead **Craneking**
  silhouette rising above the container walls near map center, visible
  from most of the maze; navigation aid and foreshadowing for Deep
  Tangle's living ones. Its old beacon blinks slow rose at the top.
- **(c) Mass hierarchy:** XL = the crane hulk · L = container-stack
  corridor walls (2–4 high) and the tramgate · M = junk/brass/amperite
  nodes, dead machines, drums · S = hazard lamps, pylon posts, cables,
  scattered plates.
- **(d) Light plan:** DARKER than the Filament. Sparse amber hazard lamps
  at junctions (pools ≤5 tiles apart — never fully blind), amperite
  clusters as cool light sources in the dark, the crane beacon's slow
  rose blink on top. Corners and dead ends genuinely dark. Corridor
  floors: cracked asphalt + plating, with real wall shadows.

### The Stacks — district brief (the vertical quarter)

- **FANTASY:** the dense residential canyon where Sparks LIVE, stacked to
  the sky — laundry between towers, a thousand lit windows, the city's
  tallest antenna blinking over everything. Looking UP is the show.
- **(a) Dominant hue:** warm window-light (amber/cream `#FFD9A0`/`#FFB84D`)
  on gunmetal-and-painted-panel tower bodies. Accents: **violet neon
  `#B266FF` EARNS ITS HOME HERE — exactly one licensed sign per street**,
  the premium color at last living somewhere; **signal red `#C0392B` only
  as the Spire's slow crown beacon**; teal stays interactable-only; rose
  stays sparse (a curtain, a balcony cloth). No hazard-amber stripes —
  this is where people live, not where cargo dies.
- **(b) XL landmark:** **THE SIGNAL SPIRE** — the city's tallest antenna
  tower, a lattice mast rising past every roofline with a slow red beacon
  at the crown, visible from every street. Navigation, identity, and the
  reason the Roofline's Signal is the best in the city.
- **(c) Mass hierarchy:** XL = the Spire + the tower walls themselves
  (5–9 stories, 3–4 designs × material/paint variants — **every roofline
  distinct**: water tanks, antenna clusters, tarp shanties, one rooftop
  garden) · L = street-level shopfronts and stair blocks · M = balconies,
  AC boxes, laundry lines, planters · S = cables, pots, pigeon-bots,
  window boxes. §12B(e) shape mix binds here doubly: towers are boxes by
  nature, so their SKYLINES and street furniture carry the variety.
- **(d) Light plan:** canyon streets run DARKER than the Filament at
  ground level — the towers eat the sky — lit by window-glow spill and
  shop signs, not lamp posts. Hundreds of lit windows on a slow
  light/dim cycle are the district's texture. The overhead layer is the
  densest in the city (laundry, cable webs, banners). The Citywide
  Charge hook scales WINDOW DENSITY here: festival week turns the whole
  quarter blazing.
- **(f) Verticality license (per the §5 amendment):** towers are blocking
  world objects, never interiors; the ROOFLINE terrace walks at +3 via
  elevation; every tower and the Spire participate in occlusion fade.

### The Terrarium — district brief (the hanging-garden tier)

- **FANTASY:** the city grows its greens overhead — terraced gardens on
  built decking, vines OWNING the trellises, glow-fruit for lanterns.
  The gentlest district; still night, never a lawn.
- **(a) Dominant hue:** solar green `#7BC59A` + warm wood `#9A8574` on
  plum structure. Greenery is INFRASTRUCTURE (planters, vine walls,
  hanging gardens) — the ground stays decking and terraces per Part I §1;
  grass never touches the floor. Accents: **warm glow-fruit clusters**
  (amber-through-green) as the district's lamps; teal only on irrigation
  valves and interactables; NO violet, NO signal red, no hazard stripes.
- **(b) XL landmark:** the **MOTHER TRELLIS** — a towering vine-wrapped
  irrigation frame, glow-fruit strung through its lattice, drip-lines
  feeding every terrace below. The district's heart and its light source.
- **(c) Mass hierarchy:** XL = the Mother Trellis · L = terraced garden
  platforms (three stepped elevation levels) and Loftpod berths · M =
  planter rows, tool sheds, compost drums, Loftpods themselves · S =
  pots, watering cans, seed trays, firefly motes.
- **(d) Light plan:** the softest in the city — warm-green firefly motes
  drifting, glow-fruit clusters on the Trellis and terrace edges, warm
  window spill from the pods. No neon signage at all; the Terrarium is
  what the market quarter dreams about. Charge hook: fruit clusters
  brighten with the meter.
- **(e) Housing note (§10.8):** the Terrarium is the housing showroom —
  Loftpod berths get generous sightlines and catwalk-grade light so a
  decorated pod reads across the terrace.

## 12. Build notes for this addendum

- `/shared/palette.ts` is unchanged and remains the only source of color constants. Seasonal presets are *lighting parameters* (ambient tint, bloom intensity, sign-glow mix) in config — not new colors.
- Nothing here changes M0–M3 scope except the character-scale note (§10.1), which applies from the first placeholder sprite. Cosmetic slots, emissive tiers, and seasonal presets land with their systems (M4+).
- The across-the-plaza test (§10.6) joins the Part I §7 checklist for every cosmetic review.

---

*Companion files: the Game Bible v2, the Economy Design v2, and `CLAUDE.md`. Part I is LOCKED as ever; Part II is additive and equally binding — build and asset choices should conform to both.*
