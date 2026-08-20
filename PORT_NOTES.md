# OpenDawnstar — status & roadmap

## Done (Stage 1) — boot to character creation
- Reverse-engineered the jar's custom archive format (`name` + 4-byte offset +
  2-byte length, repeated). Used for both `imgfiles.lmp` and `datfiles.lmp`.
- Extracted all 43 sprites as real PNGs -> `assets/img/`.
- Working browser UI (plain HTML/CSS/JS, no build step): boot -> first-time
  welcome -> main menu -> class select -> class info -> name entry (3-letter
  validation) -> character created. Persisted via `src/save.js`
  (`localStorage`, stand-in for the original's `RecordStore`).

## Done (Stage 2) — full data layer
Every one of the game's 9 data files is now traced against the decompiled
Java `DataInputStream` reads and parsed byte-exact (verified zero leftover
bytes on every file) into clean JSON in `assets/data/`:

| Source file | -> JSON | Contents |
|---|---|---|
| `charin.dat` | `charin.json` | 7 classes, 6 races, 14 skills, per-class stats |
| `itemsin.dat` | `itemsin.json` | 101 items, 15 categories |
| `droppeditemsin.dat` | `droppeditemsin.json` | 43x5 loot-tier table |
| `spellsin.dat` | `spellsin.json` | 25 spells |
| `monstersin.dat` | `monstersin.json` | 42 monsters, 17 stat bytes each |
| `monsterfilenamesin.dat` | `monsterfilenamesin.json` | 5x7 monster sprite refs |
| `geomin.dat` | `geomin.json` | 37x6 dungeon-generation seed table |
| `helptext.dat` | `help_sections.json` | 12 assembled help sections (titles + bodies, matches the original's exact string-concatenation logic) |
| `npcstrings.dat` | `npcstrings.json` | 10 groups of NPC/shop dialogue |

Also ported `java.util.Random`'s exact LCG algorithm to
`src/javaRandom.js` (`JavaRandom`), verified against known reference output
(`new Random(42).nextInt() === -1170105035`). Dungeon generation seeds with
`dungeonIndex * 8000`, so this is required for the procedural dungeons to
come out the same as the original.

Help screen is now fully wired and real (`showHelpStub`/`showHelpSection`
in `main.js`) — 12 real sections pulled straight from the game's own text.

## Done (Stage 3) — walkable dungeon, with an honest caveat
- `src/dungeonGen.js`: procedural room + corridor generator, seeded
  deterministically per dungeon (`dungeonIndex * 8000`, same seed formula
  the original uses) via `JavaRandom`. Verified deterministic (same seed
  -> identical grid) and produces a connected, walkable layout.
- `src/dungeonView.js`: top-down Canvas renderer + keyboard movement
  (arrows/WASD) with wall collision, entrance/exit tiles.
- Wired into the flow: "Character Created" -> **Enter Dawnstar** now drops
  you into a real, walkable, generated dungeon. "Continue Game" does too.

**Caveat, deliberately not glossed over:** the original's actual generation
algorithm (in decompiled class `c`) is a first-person corridor-view
renderer with monster/chest placement tightly coupled to classes `d`
(monsters), `a` (items), and `k` (some shared coordinate state) — porting
it byte-exact means porting all of those together, and there's no running
original here to verify the port against. Rather than ship an unverifiable
"looks right" port of tangled legacy logic, this stage is an
original-inspired generator (rooms + corridors, same seeding approach) with
a clean top-down view instead of the original's first-person corridor
rendering. Monster/item/chest placement isn't in the dungeon at all yet.
If pixel-faithful first-person rendering matters, that's a distinct,
larger fidelity pass — flag it and we can scope that separately.

## Done (Stage 4) — monsters, chests, combat, loot
- `dungeonGen.js` now populates non-entrance/exit rooms with monsters and
  chests, sourced from the real `monstersin.json`/`itemsin.json` data
  (weaker monster pool in early dungeons, widening with `dungeonIndex`).
- `src/combat.js`: turn-based attack/defend resolution. Player stats derive
  from the selected class's row in `charin.json` (`row[3]` as max HP,
  attack scaled off that) — again original-inspired, not the real formula
  (see caveat below).
- `dungeonView.js`: monster tiles (red) and chest tiles (gold) block
  movement and trigger encounters instead of letting you walk through.
- `main.js`: full combat screen (Attack/Flee, HP bars, defeat/victory,
  game-over-and-respawn), chest screen (grants a real item name + gold from
  `itemsin.json`, persisted via `save.js`'s new `addItemToInventory`/
  `addGold`).
- Verified end-to-end in Node before shipping: dungeon generation +
  monster/chest placement consistency, and a full simulated combat loop
  using real parsed data (see commands in this stage's chat log if useful
  as a regression check later).

**Caveat, same spirit as Stage 3:** monster HP/attack and player HP/attack
are reasonable derivations from the real data, not the original's actual
combat formula — that formula lives in tangled `ESGame`/class-`d` code
using the 17 opaque per-monster stat bytes and the 41-column per-class stat
row, neither of which has confirmed field semantics (see "Not done yet"
below). Treat current numbers as placeholder balance, not canon.

## Done (Stage 5) — real stats, sourced from UESP
Checked https://en.uesp.net/wiki/Dawnstar:Dawnstar and its sub-pages against
what we'd reverse-engineered. Big result: **Character Creation** has the
actual starting-stat table for all 7 classes, which resolved the "unverified
combat numbers" caveat from Stage 4 for the player side.

- Cross-referenced all 7 classes' 13-field `charin.json` rows against the
  wiki table programmatically. Confirmed: position 9 (of 13) is a constant
  40 across every class, matching LUC being 40 for all classes on the wiki
  — that's Luck. The last 3 fields (10,11,12) don't match any attribute in
  the wiki table at all (values are single/double-digit, table values are
  30–170) — they're something else not yet identified, not attributes.
  The remaining 7 stored fields don't cleanly cover the other 9 wiki
  attributes 1:1, meaning some (as displayed on the wiki) are likely
  computed/derived rather than stored raw. Not fully solved — see below.
- Rather than keep guessing, `src/wikiData.js` now hardcodes the actual
  documented Health/Magicka/Fatigue/STR/INT/WIL/AGI/SPD/END/PER/LUC, race,
  starting armor/weapon, and starting spells for all 7 classes, sourced
  directly from the wiki table. `initLivePlayer` and the class-select/
  class-info screens now use this instead of the earlier `row[3]`-based
  guess. Player attack now derives from STR specifically, per
  Dawnstar:Dictionary confirming STR "affects the amount of damage your
  character can inflict."
- Confirmed each class has one fixed race in actual gameplay (Barbarian
  is always Nord, Knight always Redguard, etc.) — despite `charin.dat`
  containing 6 race name strings, there's no independent race-picker in
  the real game. Dropped "race selection screen" from the roadmap below;
  it was based on a wrong assumption about how the original works.
- From Dawnstar:Getting Started / the archived official "How to Play" page:
  confirmed real controls (1=attack, 3=cast spell, movement keys also
  work as flee), a hard 24-item inventory cap with 6 equip slots, and
  that dying sends you back to camp having lost non-equipped/non-gift
  loot (not a hard game over) — useful ground truth for later stages.
- Monster-side stats are still the Stage 4 approximation — the Bestiary
  page (https://en.uesp.net/wiki/Dawnstar:Bestiary) documents creature
  names/locations/status-ailments but not raw HP/attack numbers in what's
  accessible here, so `monstersin.json`'s 17-byte rows remain unmapped.

## Done (Stage 6) — found and mined an existing reference port
The person pointed me at
https://github.com/jet082/TES-Mobile-Decomp-Python-Port — an existing,
independent (AI-assisted, by their own admission, imperfect but
substantial) Python decompilation of this exact game. This resolved
essentially everything Stage 5 left open:

- **Full field mapping for `charin.json`'s 13-value base row, confirmed
  exact for all 7 classes:**
  `[Level, RaceIndex, STR, INT, WIL, AGI, SPD, END, PER, LUC, innerLuck,
  height, weight]`. Row index 1 is a race index into the 6-entry race-name
  array (`charin.json.descB`) — confirmed exact for all 7 classes (e.g.
  Barbarian -> index 1 -> "Nord", matching UESP). Indices 10–12 (the
  "mystery trio" flagged in Stage 4) are an internal luck-like value used
  only in the Magicka formula (distinct from the LUC attribute at index
  9!), height, and weight — not attributes at all.
- **Exact, confirmed formula** for the three HUD stats (`j.f()` /
  `recompute_caps()` in the reference): `healthMax = (STR+END)/2`,
  `magickaMax = innerLuck * INT / 4`, `fatigueMax = STR+WIL+AGI+END`.
  Verified programmatically against all 7 classes' real `charin.json` rows
  — **exact match** for every class, every stat. `wikiData.js`'s
  `computeCoreStats(row)` now computes these straight from
  `charin.json`, no hardcoded numbers needed for Health/Magicka/Fatigue
  anymore (the earlier Stage 5 wiki-hardcoded version had a bug — it used
  the wrong "luck", the visible LUC attribute instead of the internal one;
  caught and fixed by cross-checking against this reference).
- **Confirmed our dungeon-seeding approach was right in spirit**: the
  reference's `dungenc.py` seeds with `dungeon_id * 8000` via a
  `JavaRandom`-equivalent — same formula we'd already independently
  derived and used in `dungeonGen.js`.
- **Found the real monster combat formula** (`attempt_attack` in
  `monsters.py`): hit chance vs. dodge chance, both dependent on the
  player's equipped armor slot, block value from all equipped gear, and
  status-ailment infliction on a strong hit. This is not yet ported — it
  depends on the full equipment/armor-slot system, which isn't built yet
  (see below). Left `combat.js` as the Stage 4 approximation for now
  rather than half-port an equipment-dependent formula with no equipment
  system to back it.
- **Found the real dungeon generator** (`dungenc.py`'s `_generate`,
  ~200 more lines) including a hand-crafted camp/hub layout (dungeon 1,
  19x19, not procedurally generated at all), a `CHEST_TIERS` table
  controlling loot quality by dungeon depth, and monster-level-range
  tables. Not yet ported — noted as the highest-value next target since
  our current generator is still the Stage 3 original-inspired one.

## Done (Stage 7) — real first-person rendering
Ported the actual wall-perspective system from `canvas.py` (which itself
is a faithful port of `e.java`'s rendering) into `src/firstPersonView.js`:

- `WALL_TABLE` and `STRIP_X` copied verbatim from the reference — these
  are precomputed perspective lookup tables (which screen column shows
  which depth-sliced wall texture) that would have taken a long,
  unverifiable guessing pass to reconstruct blind from the raw bytecode,
  exactly the risk flagged back in Stage 3. Having them confirmed against
  a working reference made this tractable.
- Implemented the heading-relative tile lookup (`seeTile`) ourselves
  (simplified from the reference's cached 9x5 vision-grid approach to a
  direct per-query transform — same math, less machinery) using our own
  dungeon grid format.
- Verified the geometry with a synthetic straight-corridor test before
  touching the visual code: side walls correctly detected at increasing
  depth further from center, matching the expected receding-corridor
  perspective.
- Renders with the real extracted sprites: `wallsr.png`/`wallsi.png`
  (ice dungeons use the `i` set, matching the reference's dungeon-1-is-camp
  special case), `floor3.png`/`floorIce.png`, `panel.png` for the HUD strip,
  `gate.png` support wired (unused — our generator doesn't place doors
  yet), `chestnearclosed.png` for chests directly ahead.
- Movement changed to proper first-person controls: turn left/right,
  step forward/back, matching the original's facing-based movement
  instead of the top-down version's free 4-directional walk.
- Kept the Stage 3 top-down map as a fallback — both views are mounted
  through the same `mountDungeon()` dispatcher in `main.js`, with a
  "Map View" / "First-Person View" toggle button that syncs player
  position between the two coordinate trackers.

**Not ported:** the layered monster/NPC sprite compositing (`AD_TABLE`/
`A_TABLE`/`G_TABLE` in the reference — depth-scaled body/head/accessory
sprites per monster type). A monster directly ahead currently shows as a
flat red tint rather than an actual depth-scaled sprite. This is the next
natural step for anyone continuing the graphics work.

## Done (Stage 8) — real layered monster sprites
Ported `canvas.py`'s `_draw_layered` (itself a port of `e.c(Graphics, int,
int)`) — the actual monster-compositing system, not the flat tint from
Stage 7:

- `AD_TABLE`, `A_TABLE`, `G_TABLE`, `MONSTER_O_FILES`, and the `bLookup`
  type-group ranges copied verbatim from the reference into
  `firstPersonView.js`. These map a monster type (1–42) to: which of the
  26 body/head/accessory sprite sheets to use, the frame to select within
  each (multi-frame sheets are laid out horizontally, sliced by
  `blitFrame`), and anchor offsets to composite them at.
- Boss types (41/42) get their own special case (`wardenbody.png`,
  frame 0 or 1) matching the reference's separate boss branch.
- Verified programmatically before shipping: every body/head/accessory
  sprite-sheet index the tables can produce, for all 42 monster types,
  stays within the real 26-file `MONSTER_O_FILES` array — no out-of-bounds
  lookups possible.
- `dungeonGen.js` now stores a 1-based `typeIdx` on every placed monster
  (matching the original's monster-type numbering, confirmed consistent
  with our own `monsterfilenamesin.json`'s 5 sprite groups lining up with
  `MONSTER_O_FILES`' 5 groups) so the renderer can look up the right
  tables. A monster directly ahead now renders as an actual composited
  sprite (body + head + gear, per its type) instead of a red tint.

**Still not ported from `_draw_entities_ahead`:** the mid/far depth
slots (monsters visible 2–3 tiles out, not just directly ahead) and NPC
rendering — only the depth-1 "directly ahead" case is wired up, which is
the only case our bump-to-fight encounter model actually needs.

## Done (Stage 9) — the real dungeon generator
Ported `dungenc.py`'s `DungeonBuilder` (itself `c.java`) into
`src/dungeonGenReal.js`, replacing the Stage 3 original-inspired room
placer entirely:

- **Room placement**: exact `_random_room`/`_try_place` port, including
  the real 1-tile-border adjacency check (a new room is rejected if its
  padded bounding box touches any already-carved tile) and Java's
  particular remainder semantics (`javaAbsMod`, added to `javaRandom.js`).
- **Corridor connection**: exact nearest-neighbor MST-style port
  (`_connect_points`/`_connect`) — each room's random interior point
  connects to its nearest not-yet-connected neighbor with an L-shaped
  corridor, direction chosen by a coin flip, same as the original.
- **The hand-crafted camp/hub layout** (`generateCamp()`) — the original's
  dungeon 1 isn't procedural at all, it's a fixed 19x19 map. Ported with
  the exact tile coordinates from the reference. Not wired into the game
  flow yet (no hub/dungeon-select screen exists), but ready.
- Tested before shipping, not just eyeballed: flood-fill connectivity
  check across dungeons 1/2/5/10/20/36 confirms every room and the exit
  tile are actually reachable from the entrance (not just "no wall at
  spawn"); a 36-dungeon sweep confirms monster/chest/entrance placement
  never collides or leaves an inconsistent grid cell.
- Monster count is notably higher now — the real algorithm spawns one
  monster per room (up to 15 per dungeon) rather than the ~50% chance
  Stage 4's approximation used.

**Still adapted, not ported:** monster *type* selection (our own
`monstersin.json` pool + difficulty scaling, not the reference's
`monsters.random_archetype_for_level`) and chest *item* selection (our own
`itemsin.json` roll, not `items.roll_dropped_item`/`random_gift_for_giver`).
NPC champion rooms and the cross-dungeon edge-door connections (which use
`geomin.json`'s adjacency data to link dungeon N to dungeon N+1 into a
real overworld) are skipped — there's no multi-dungeon map/NPC system for
them to plug into yet. `dungeonGen.js` (the Stage 3 version) is left in
the repo unused, in case it's useful as a fallback reference.

## Done (Stage 10) — real equipment, real combat inputs
Ported the equip-slot system from `items.py`/`character.py`, and rebuilt
combat on top of real numbers instead of the Stage 4 placeholder:

- `src/items.js`: mirrors `items.py`'s slot logic. Cross-checking against
  the reference confirmed our own `itemsin.json` field names already
  exactly matched its Java field letters (`effect` = `ITEM_TYPECAT`, etc.)
  — nice validation of the original binary-parsing work back in Stage 2.
  Empirically confirmed the slot mapping by cross-tabulating every item
  category against its `effect` value: 0=weapon, 1=armor, 2=boots,
  3=gloves, 4=helmet, 5=shield, -1=not equippable (consumables/gifts).
- `save.js`'s inventory is now structured (`{index, name}` per item) with
  a real 7-slot `equipped` array, not just a flat list of name strings.
- Chests now auto-equip equippable finds (replacing whatever was in that
  slot), matching the original's actual pickup behavior — confirmed in
  `character.py`: every equippable pickup auto-equips and replaces, it
  doesn't just add to a passive inventory.
- New Inventory screen (from Continue Game) shows real equipped gear per
  slot and everything carried.
- Fixed a consistency gap: character creation's flavor text always said
  "armed with a Hatchet" etc., but no actual item existed until now — the
  starting weapon/armor names are looked up in real `itemsin.json` and
  actually granted + auto-equipped at creation. Verified all 6 classes'
  flavor gear names resolve to real item rows.
- `combat.js` rebuilt: `armorClass`/`dodgeChance`/`blockValue`/
  `weaponSkillIndex`/`weaponDamage` are now faithful-shaped ports of the
  reference's real formulas, using real equipped items and each class's
  real starting-skill pairs from `charin.json`. Weapon type correctly
  selects the governing skill (Axe/Blunt/LongSword/ShortSword), armor
  category correctly selects Heavy vs. Light Armor skill.
- Tested before shipping: verified Barbarian's real Axe skill pair
  ((4,45)) and Hatchet's real damage value (16, matching the raw
  `itemsin.json` byte we'd printed all the way back in Stage 2) both flow
  through correctly; 200 simulated fights with no negative-HP bugs or
  stalemates.

**Still simplified, not byte-exact:** `skillValue()` here is just the
static starting skill level — no progression/leveling, no attribute
bonus (the reference's `skill_value(idx, with_attrib)` adds an
attribute-derived bonus we haven't traced). Monster-side hit chance and
armor remain the Stage 4 approximation, since the monster `attr()`
indirection (mapping the 17 opaque per-monster stat bytes to meaningful
fields) still isn't mapped — that's the one piece of this system that
resisted the reference too, since it's monster-specific and wasn't
included as a clean lookup table the way items/skills were.

## Done (Stage 11) — combat formula is now exact, not approximated
`monster.attr(idx)` turned out to be direct index access into the same
17-byte row already sitting in `monstersin.json` — no hidden semantic
layer to reverse-engineer. Once the reference confirmed which index means
what, both attack directions became a straight, verifiable port:

- `combat.js` rewritten to mirror `character.py`'s `melee_attack` and
  `monsters.py`'s `attempt_attack` exactly: the delta/contest/outcome
  resolution, damage-vs-armor formula, and the `outcome===1` (double
  block/armor) / `outcome===3` (double damage) branches are all real now,
  not shaped approximations.
- Monster HP is now `attrs[14]` directly (confirmed exact match to the
  reference's spawn code) instead of a difficulty-scaled guess —
  `dungeonGenReal.js` updated accordingly, and the placeholder `atk`
  field is gone entirely (replaced by the real multi-attribute formula).
- Tested before shipping: ~1260 simulated fights across all 42 real
  monster types (30 trials each) plus a 300-trial run against a named
  real monster ("Sickly Bandit") with its actual attrs printed — zero
  negative-HP bugs, zero stalemates.
- One deliberate, documented deviation: the reference's dice rolls reuse
  the seeded world-gen RNG for determinism; combat here uses
  `Math.random()` instead, since replaying an identical fight isn't
  something this app needs the way reproducible dungeon layout is.

**Still simplified:** `skill_value()` remains the Stage 10 simplification
(static starting level, no attribute bonus, no progression) — all the
`spell_effect_active(N)` branches in the reference are correctly omitted
since there's no spell system yet, not silently dropped.

## Done (Stage 12) — spells
Ported `spells.py`'s casting logic for the specific spells the 7 classes
actually start with — confirmed via `wikiData.js`'s `spells` lists cross-
referenced against `spellsin.json`, only 5 unique spells needed covering
(all 5 confirmed present, correct IDs): Damage (id 11), Heal Wound (21),
Paralyze (16), Frenzy (1), Daedric Weapon (6).

- **Damage, Heal Wound, Paralyze: faithful ports.** Real `_spell_roll`
  contest (skill vs. the spell's own resistance/opposition fields from
  `spellsin.json`), real resource-spend-on-partial-success formula, real
  damage/heal magnitude formulas (Destruction/Restoration skill-scaled).
  Paralyze's actual effect is simplified — the reference threads a
  tick-duration flag through the monster's turn loop
  (`monster.extra[6]`); here it's "skip N of the monster's next
  counterattacks," same shape, not the same underlying mechanism.
- **Frenzy, Daedric Weapon: simplified stand-ins.** The reference applies
  these as duration-ticked buffs threaded through `attack_damage_base` via
  `spell_effect_active(N)` checks scattered across the codebase — real
  plumbing we haven't built. Here, a successful cast (real roll, real
  resource cost) just grants a flat damage bonus for the rest of the
  current fight. Clearly not the same mechanism, flagged as such in
  `spells.js`'s header rather than silently passed off as exact.
- Player now tracks real Magicka (`computeCoreStats`'s already-verified
  formula), shown in the combat HUD alongside HP. Spell buttons in combat
  grey out when unaffordable.
- Tested before shipping: verified all 5 spell names resolve to correct
  IDs in `spellsin.json`; 100 trials of damage/heal/paralyze against real
  monster data with a real Sorcerer's real Destruction skill pair — no
  negative HP/magicka, no over-heal past max.

## Done (Stage 13) — HUD: radar minimap + real stat bars
The person shared a screenshot of the original's in-dungeon UI, which
showed two things missing entirely from our first-person view: a 7x7
FOV radar in the top-left corner, and three colored HP/Magicka/Fatigue
bars. Both ported with exact pixel specs from `canvas.py`:

- **Radar** (`_draw_radar`/`vision_grid`): 7x7 grid, facing-relative
  sampling (rotates with the player, not just north-up), 3px cells with
  1px padding, positioned at (10,20). Color legend matches exactly: black
  wall, white open floor, green center (player), red monster, blue chest,
  purple stairs/exit. A letter above (N/E/S/W) shows current facing.
  Sanity-tested the facing-relative transform against a synthetic
  corridor before shipping (center = player's own floor tile, ahead
  matches corridor continuation, off to the side correctly shows wall).
- **Stat bars** (`_draw_stats_bars`): exact pixel spec — three 40x7 yellow
  background rects at y=130/138/146, colored fills inset 1px, width
  scaled `current/max * 38`. Health=red (top), Magicka=green (middle),
  Fatigue=blue (bottom) — confirmed this ordering directly from the
  reference rather than guessing from the screenshot alone.
  `mountDungeon()` now always calls `ensureLivePlayer()` before mounting
  so these have real data to draw from the moment a dungeon loads.
- Fatigue is display-only (always shows full) — there's no fatigue-drain
  mechanic implemented, so `livePlayer.fatigue` is just a static max.

**Bug caught during this stage, worth noting for future work on this
project:** `node --check` did not catch a duplicate `const player`
declaration in `firstPersonView.js` (two different variables — the
opts-passed HP/Magicka stats object and the existing position/facing
tracker — colliding on the same name in the same scope). Only an actual
`import()` surfaced it. Went back and import-tested every module in the
project after fixing it; everything else was clean. **Takeaway for
whoever continues this: `node --check` alone isn't sufficient for these
files — actually import them (`node --input-type=module -e "import(...)"`)
before considering a change verified.**

**Not done from the same screenshot:** the bottom panel's 4 icon+number
slots (explosion/book/?/zzz with 3/5/7/0 below them) weren't ported —
those are keypad-shortcut legends for the original's physical numeric
keypad (3/5/7/0 = which key does what), not inventory or spell slots.
Given this port already has on-screen buttons for those actions, a
keypad legend has little value here — flagging the decision rather than
silently skipping it.

## Done (Stage 14) — camp hub + dungeon selection
Wired `generateCamp()` (ported back in Stage 9, but never actually
reachable) into the real game flow, replacing the hardcoded "always enter
dungeon 1" behavior:

- `campAsDungeonShape()` in `dungeonGenReal.js` adapts the camp's raw
  x-major `{tiles,width,height}` into the same shape `generateDungeon()`
  returns, so the existing views render it with no special-casing. The
  cross-shaped layout's 4 arms naturally meet the outer ring at four
  points — marked as a new grid legend value (7 = portal, distinct from
  4 = dungeon exit) so stepping on one opens dungeon selection instead of
  "leaving."
- Both views (`dungeonView.js`, `firstPersonView.js`) and the radar got
  the new portal cell type wired through — walkable, non-blocking, its
  own color in both the top-down map and the minimap.
- New flow: Main Menu / Continue Game -> **Dawnstar (camp)** -> walk to
  any gate -> pick from all 36 real dungeons (or Random) -> real
  generated dungeon -> reaching the exit or leaving returns to camp,
  not a dead end.
- Tested before shipping: verified all 4 gate cells exist and are
  reachable from the camp's spawn point via flood-fill (not just "no
  crash") before wiring it into the UI.

**Caught and fixed a duplicate-function-declaration bug while wiring this
up** — same class of issue as Stage 13's variable collision, this time
two `function enterDungeon` declarations in the same module scope after
an edit. `node --check` did not catch it either time. Fixed, then
re-verified by actually importing every module (`main.js` included, via
stubbed `document`/`window`/`localStorage`/`fetch` globals since it
touches the DOM at module scope) rather than trusting `--check` alone.

**Not faithful, flagged in the UI copy itself:** all 4 camp gates
currently open the same full 36-dungeon picker, rather than each gate
leading to its own specific dungeon the way the original's
`geomin.json`-driven edge-adjacency system does. That data is parsed
(`geomin.json`, Stage 2) but the adjacency graph itself isn't built.

## Done (Stage 15) — NPC shops
Ported the 4 real shop peddlers from `npc.py` (itself `k.java`) — names,
camp positions, and wares all straight from `NPC_NAMES`/`NPC_X`/`NPC_Y`/
`NPC_WARES`:

- Weapon Peddler, Heavy Armor Peddler, Light Armor Peddler, and Jakar's,
  placed at their exact real camp coordinates — all 4 confirmed to land
  on real floor tiles already carved by the Stage 9 camp layout (no
  adjustment needed), and confirmed reachable from spawn via flood-fill.
  New grid legend value 8 = NPC, blocking like a monster (bump to talk).
- Wares use the reference's real 1-based item-id lists, resolved against
  our own `itemsin.json` — verified all 50 total ware entries across the
  4 shops resolve to real items, zero missing.
- Real dialogue: confirmed `npcstrings.json`'s groups 0-3 are exactly
  each peddler's [greeting, insufficient-gold, purchase-success] lines
  (this was actually the very first thing decoded all the way back in
  Stage 2 — "Welcome! Please peruse our manufactured mayhem makers." was
  sitting in the data the whole time without a UI to show it in).
  Real greeting shown on entering the shop; real success/failure line
  shown after each purchase attempt.
- Buying deducts real gold, adds the real item, and auto-equips it if
  equippable — same mechanic as chests (Stage 10).
- Champions and Eustacia (`NPC_NAMES` indices 4-8) aren't placed — those
  are quest-giver/companion NPCs tied to the clue-log/traitor subplot,
  not shops, and are a separate, larger feature (see below).

## Done (Stage 16) — skill progression, leveling, real fatigue
Ported `character.py`'s `gain_skill` — the actual trigger condition and
formula, not a guess:

- **Real trigger, confirmed from two call sites**: skill exp only
  increases on a solid hit or better (`contest` result >= 2, excluding
  the weaker "result 1" grazing hit) — true for both melee
  (`melee_attack`) and spells (`_spend_spell_resources`, i.e. our
  `spendResources`). +1 exp per qualifying action, 10 exp = +1 skill
  level, 10 character Level XP (accumulated from skill-ups) = +1
  character Level.
- `src/skillProgression.js`: `gainSkill()` grows `skillPairs[idx]` from
  the `[level, cap]` pairs `charin.json` provides into `[level, cap, exp]`
  triplets at runtime. Combat and spell buttons now show real feedback
  ("Skill improved!", "Reached Level N!") and the HUD shows current level.
- **Real fatigue drain on spell casts** — fatigue was display-only
  (always full) since Stage 13; now it actually depletes. Simplified vs.
  the reference's `5 * encumbrance()` (gear-weight-dependent, we don't
  model carry weight) to a flat 5 per cast — a real mechanic, not the
  exact original formula.
- Leveling up is itself a simplification: the reference opens an
  attribute-allocation screen tied to which skills leveled
  (`skill_marks`); here it's a flat +2 max HP / +1 max Magicka and a full
  heal, a real reward but not the original mechanism.
- Tested before shipping: 500 simulated attacks against an immortal
  target with real Barbarian/Hatchet data (Axe skill grew 4->51 with no
  cap-clamping — confirmed the reference doesn't clamp skill level
  against the cap value either, so this isn't a missing bound, it's
  faithful); 100 simulated Sorcerer Destruction-spell casts, confirmed
  fatigue floors at 0 and never goes negative, zero bugs in either run.

**Not done:** the reference also reduces `skill_value` by 1 when fatigue
drops below 7 — real fatigue now exists to make that meaningful, but the
penalty itself isn't wired into `skillValue`/`armorClass`/`dodgeChance`/
`spellRoll` yet, so draining fatigue currently has no downstream combat
effect. Small, cheap to add later, listed below rather than rushed in.

## Done (Stage 17) — audio + mobile touch controls
The person asked for audio and UI/UX work. First checked whether there
was anything to port: grepped the full decompiled source for
`playTone`/`Manager`/`javax.microedition.media` — zero hits, and the jar
contains no audio files at all (confirmed via the same archive-listing
approach used since Stage 2). MIDP-1.0, no media APIs, genuinely silent
game. So this stage adds two things rather than porting them:

- **`src/audio.js`**: ~12 short synthesized sound effects (Web Audio API
  oscillators + one noise burst for hit impact) — click, move, bump, hit,
  miss, cast, heal, chest, gold, victory, level-up (an ascending
  arpeggio), defeat, door, paralyze. Wired into combat, spellcasting,
  chests, shop purchases, and portal/exit navigation in `main.js`. A mute
  toggle (persisted to `localStorage`) sits on the main menu. Verified
  every single `sfx.*` call is a safe no-op when `AudioContext` doesn't
  exist at all (not just muted) — tested by stubbing it as `undefined`
  and calling all 12 functions directly, zero throws.
- **Touch controls for both dungeon views** — this was a real, unflagged
  gap: movement was keyboard-only, meaning the port was literally
  unplayable on a phone despite "playable in a 2026 browser" being the
  original ask. Added an on-screen d-pad (forward/back/turn or
  up/down/left/right depending on view, plus an act button for the
  first-person view) using real `<button>` elements sized for touch
  (56x56px, meets typical mobile tap-target guidelines), wired to the
  exact same `tryMove`/`tryTurn`/act functions the keyboard already used
  — no duplicated logic. Desktop users still get the full keyboard
  scheme; the pad just fades to partial opacity on devices with a mouse
  so it doesn't visually compete with the primary input method.
- Tested before shipping with a proper mount-and-cleanup cycle for both
  views (fake canvas context + DOM stub), not just a syntax check —
  confirmed the touch buttons actually appear in the rendered HTML and
  cleanup runs without error.

**Not done — broader UI/UX polish beyond this pass:** no loading spinners
during async data fetches, no animated transitions between screens,
inventory/equipment screens are plain lists rather than a visual
paper-doll layout. Scoped this stage to the two changes with the most
concrete impact (silence -> real feedback, phone-unplayable ->
phone-playable) rather than a broad, harder-to-verify polish pass.

## Done (Stage 18) — fatigue penalty + real gate-dungeon linkage
Two items from the roadmap, both concrete and tested:

**Fatigue-based skill penalty (`character.py`'s exact condition):** when
fatigue drops below 7, `skill_value` is reduced by 1. Wired through
`combat.js` (`armorClass`, `playerAttack`'s weapon-skill lookup) and
`spells.js` (`spellRoll`) — every place that reads a skill value now
takes the player's current fatigue into account, not just the two
call sites that happened to be easy. `dodgeChance` correctly uses the
skill *cap*, which the reference doesn't fatigue-penalize, so it was left
alone rather than over-applying the rule. Verified statistically (2000
trials each) that hit rate is measurably lower at fatigue &lt; 7 than at
full fatigue, and reran the full 42-monster-type stress test with
randomized fatigue — zero regressions across 840 fights.

**Real camp-gate -> dungeon adjacency:** `geomin.json`'s camp row
(index 0) is `[2, 11, 20, 29, -1, -1]` — confirmed these are the 4 real
dungeon IDs linked to camp's 4 gates (evenly spaced by 9 across the
36-dungeon world, all in valid range — too clean to be coincidence, and
matches the reference's `Dungeon.adjacency`/edge-door system reading this
exact row). Walking into a camp gate now takes you straight to its real
linked dungeon instead of opening the generic picker.

- One honest, flagged assumption: which of the 4 array values maps to
  which physical gate (N/S/W/E) isn't verifiable without a running
  original to compare against, so the assignment order is our own
  reasonable choice — documented as such in `dungeonGenReal.js`. The
  *linkage data itself* (which 4 dungeons connect to camp at all) is
  real, not guessed.
- Also noticed and documented a numbering offset while reading this:
  the reference's real dungeons are IDs 2-37 (1 is camp), while our own
  `generateDungeon()` has always used 1-36 with the same seed formula.
  They line up directly for IDs 2+ (a gate value of 2 maps straight to
  our `generateDungeon(2)`) — our index 1 just doesn't correspond to
  anything gate-linked in the original. Not worth a renumbering refactor
  across every already-tested stage for a discrepancy with no observable
  gameplay effect.
- Kept the full 36-dungeon picker available as "Browse All Dungeons" from
  Continue Game, since gates now do the faithful thing but free
  exploration is still a nice option to keep.
- Tested before shipping: verified all 4 gates carry the correct real
  target IDs and land on the correct grid cell, and that all 4
  gate-linked dungeons (2, 11, 20, 29) generate cleanly with valid
  entrances.

## Done (Stage 19) — save/continue of real in-dungeon state
Closed the last roadmap item that was purely about our own port's
persistence (not something to reverse-engineer from the reference, since
dungeons are deterministic from their seed anyway):

- `save.js` gained `saveProgress`/`loadProgress`/`clearProgress`. Dungeons
  themselves aren't saved (no need — same seed regenerates the identical
  layout, per `JavaRandom`), only the *deltas*: which monster IDs are
  dead, which chest IDs are opened, player position/facing, and the live
  player stats that change during play (HP/Magicka/Fatigue/level/
  levelXp/skillPairs/tempDamageBonus) that aren't part of the character's
  base save data.
- Both dungeon views gained an `onMove` hook, fired after every successful
  step/turn, wired to `persistProgress()` — so position is saved
  continuously during play, not just at checkpoints. Also persisted
  after every combat action, chest open, and immediately on entering any
  scene (so a resume point exists even before the first move).
- "Continue Game" now shows a **Resume in &lt;place&gt;** button when
  progress exists, alongside the existing fresh "Enter Dawnstar" and
  "Browse All Dungeons" options — resuming regenerates the same dungeon
  from its seed and replays the saved deltas (dead monsters, opened
  chests, position) on top of it via `applyProgress()`.
- Progress is correctly cleared on death (resuming into "just defeated"
  wouldn't make sense) and when starting a brand-new character (so a
  fresh character doesn't inherit a previous one's dungeon state).
- Tested before shipping: a full save/load/clear round-trip of realistic
  progress data byte-for-byte matched; `applyProgress()` verified against
  a real generated dungeon — correctly marks a real monster dead, a real
  chest opened, and restores position, confirmed by reading the actual
  post-apply state back rather than assuming the code path ran.

## Fact-check pass (Stage 20) — cross-referenced against more UESP pages
The person asked me to recheck our work against Dawnstar:Getting Started,
Dawnstar:Places, Dawnstar:Hints/Tips, and the archived official How to
Play page. Found one real, fixable mistake and several confirmations:

**Fixed: the death penalty was completely missing.** Getting Started is
explicit: on death you wake up in front of healer Eustacia having been
looted of "every unequipped item in your inventory, Gift Items excluded
— these items will be lost forever... unless they were equipped when you
died." Our `showGameOver` previously just healed the player and sent them
to the main menu with the inventory untouched — not a simplification,
an outright gap. Fixed: on death, `c.inventory` is filtered down to only
Gift Items (confirmed `typeGroup === 11` from real `itemsin.json` data —
verified with a real Hatchet/Gift-Item pair before shipping, correct item
kept, correct item dropped), equipped gear is untouched since it's a
separate array already, and the respawn destination changed from the
main menu to camp (matching "wake up in front of Eustacia in Dawnstar").

**Confirmed our gate-zone theory from Stage 18 was right:**
Dawnstar:Places / Dawnstar:Dawnstar (place) states outright: "It connects
to a dungeon in each cardinal direction, which each, in turn, connect to
all 36 dungeons in the game," and Quest Walkthrough adds "each direction
contains three dungeons, each with three zones: nine in all" (4x9=36).
This matches the `geomin.json` camp row `[2,11,20,29,...]` we found —
four evenly-spaced zone-starting dungeon IDs. We only built the
camp->first-dungeon-of-each-zone link, not the chain connecting the other
8 dungeons within each zone — now confirmed as a real, named gap rather
than a guess about scope, listed below.

**Confirmed, not yet built (already tracked, now with better detail):**
- The 4 real Merchants/Peddlers match "Start by visiting the four
  residing Merchants" — good validation of Stage 15.
- Eustacia (healer, quest-giver, rumor dispenser) and the 4 Champions
  (Alhavara, Beatrice, Chung, Delacroix) are named and central to the
  one real quest in the game — the champion/clue-log/traitor-reveal
  system flagged since Stage 15 is confirmed to be the actual core quest
  content, not a minor side system.
- Gift Items are a real, specific mechanic: one hidden per dungeon (34 in
  our `itemsin.json`, real game has "21" per the wiki — likely a curated
  subset vs. our full category count), given to Champions for Aid Points
  used for clues/training. Not wired up — champions don't exist yet.
- A minimap/full-map toggle (the '*' key) with a specific color legend
  (blue=chest/item, red=monster, purple=warp square) is real — close to
  what our Stage 13 radar already does, though ours is always-visible
  rather than a toggleable overlay, and doesn't have a separate
  "full dungeon map" mode.
- Starting gold might be 50, not 0 — the quest intro says "the governor
  promises much, but has only a paltry 50 gold to give you now," and
  Getting Started says "never hesitate spending all 50 gold on equipment
  AT THIS POINT." This reads as an early quest-triggered grant tied to
  the Eustacia introduction we haven't built, not necessarily raw
  character-creation stats — left our 0-gold start as-is rather than
  guess at a mechanic we can't yet trigger correctly, but flagging the
  discrepancy honestly rather than silently.

## Done (Stage 21) — champion NPCs, disposition, training, traitor mystery
The biggest remaining item. Confirmed via `npc.py`/`character.py` that the
core mechanics here are real and traceable, not guesswork:

- **`disposition_check` ported exactly**: Speechcraft skill (with the
  fatigue penalty from Stage 18 already applying), a real `+3` bonus for
  "threaten" over "befriend", and a genuine diminishing-returns mechanic
  — a champion's own gift-counter works *against* you in the formula, so
  gifting without matching Speechcraft growth gets harder, not easier.
  Personality (`row[8]`, direct from `charin.json`) feeds the defender
  side of the roll.
- **Caught a real bug before shipping**: `combat.js`'s `contest()` and the
  reference's `_disposition()` have their two parameters in a specific,
  non-obvious correspondence (traced through which internal role plays
  which structural part — "attacker" in ours maps to "d" in theirs, not
  "h"). First attempt had the call backwards. Rather than trust the
  by-hand reasoning, verified with a mocked-RNG test comparing exact
  outputs against hand-computed reference outcomes across 4 cases
  (double-success, one-sided success both directions, double-failure) —
  caught one mismatch immediately, fixed the call order, reran, all 4
  matched. Also newly exported `contest()` from `combat.js` for reuse
  rather than duplicating the dual-roll logic in `quest.js`.
- **`champion_skill_id`/`champion_can_teach` ported exactly**: each of
  the 4 champions (Alhavara, Beatrice, Chung, Delacroix) teaches exactly
  3 specific real skills — a real table, not a guess.
- **`train_skill_response` ported exactly**: training sets skill level to
  1 if it was 0, otherwise `+1` — the literal formula, tested against
  edge cases (insufficient aid points, wrong skill for that champion).
- **Eustacia**: placed at her real camp position (12,6) from
  `NPC_X`/`NPC_Y`. Free heal (HP/Magicka/Fatigue), shows collected clues,
  and lets the player make a final accusation.
- **The traitor mystery**: a real hidden `traitorIndex` (0-3) chosen once
  per playthrough and persisted, revealed progressively through clues
  earned from champion interactions crossing an aid-point threshold.
  Verified with a full simulated playthrough: repeated befriend attempts
  until a clue actually appeared (8 attempts with real Spellsword
  Speechcraft data), confirmed the clue text correctly points toward the
  hidden traitor when the champion isn't the traitor, and confirmed the
  self-implicating deflection phrasing when they are. Confirmed accusing
  the real traitor returns correct=true and the wrong one returns false.

**Simplified/flagged, not guessed at silently:**
- **Champion camp positions are our own choice.** The reference gives all
  4 champions a placeholder `(1,1)` position — they're evidently
  encountered some other way (likely found/freed in dungeons), which
  wasn't traced. Placed them on 4 already-carved, otherwise-unused camp
  interior cells instead, verified collision-free and reachable via
  flood-fill before shipping.
- **Clue text is our own writing**, not the original's exact templated
  rumor-phrase system (`QUESTION_OFFSETS`/`QUESTION_TRUTHS` indexing into
  npcstrings section 9's 77 generic strings) — that would need
  substantially more reverse-engineering to reproduce exactly.
- **Aid-point costs/rewards and the clue threshold are our own numbers**
  (gift = 2, befriend/threaten success = 1, training costs 3, clue at 3)
  — the reference ties these to a UI flow that wasn't fully traced.

## Done (Stage 22) — real spell durations + intra-zone dungeon chains
The last two structural roadmap items.

**Real duration-ticked spell effects (Frenzy & Daedric Weapon):**
tracing `character.py`'s `spell_effect_active`/duration-decrement loop
revealed both spells work differently than the Stage 12 stand-in assumed:

- **Frenzy** (id 1): a real countdown (`spell.f * multiplier` ticks,
  decremented once per player move — found the exact decrement site in
  `canvas.py`, not just the flag-check side) granting a real additive
  damage bonus (`+10 + Alteration skill`) while active.
- **Daedric Weapon** (id 6) turned out not to be a duration buff at all in
  the way we'd assumed — it **conjures a real weapon item** (item id 101,
  literally named "Daedric Weapon" in our own `itemsin.json`, already
  sitting in our data) and auto-equips it, *and* activates a
  damage-formula override (`20 + Conjuration skill`, replacing normal
  weapon damage) for its own real duration. When the duration expires,
  the conjured weapon is unequipped — ported exactly, including which
  duration slot triggers it (`canvas.py`: "if i == 5: remove equipped
  item 101").
- This replaces the old `tempDamageBonus` hack entirely — deleted, no
  longer needed now that both spells have their real mechanism.
- Tested thoroughly before shipping: verified Frenzy's damage bonus
  against a hand-computed expected value (matched exactly, including
  understanding *why* an initial test expectation was wrong — the
  attrs[14] percentage scaling applies after the floor-at-4 clamp, a
  detail confirmed back in Stage 11); verified Daedric Weapon's override
  damage and its critical-hit doubling case both matched hand-computed
  values; verified the full expire-and-unequip flow against a real
  character store; reran the 42-monster-type regression stress test
  (840 fights) with spell effects randomly active — zero bugs.

**Intra-zone dungeon chains:** the exact original topology (which edge
connects to which specific neighboring dungeon) wasn't traceable — the
reference's `adjacency[4]/[5]` bytes only mark "a door exists on this
edge," not an explicit target ID. Rather than guess at unread code,
built a clean, honestly-labeled alternative: real zone boundaries (IDs
2-10, 11-19, 20-28, 29-37 — confirmed via Stage 20's UESP fact-check,
9 dungeons per each of camp's 4 directions), connected as a simple
deterministic chain within each zone (dungeon N's forward gate → N+1,
backward gate → N-1), reusing the exact gate/portal system already built
for camp in Stage 18 — no new UI plumbing needed. Rooms are reserved for
gate tiles before monster placement so nothing collides. Tested across
all 37 dungeons: zone-boundary math verified exact (first-in-zone has no
backward gate, last has no forward gate), and a full sweep confirmed
every gate is reachable and never overlaps a monster or chest.
"Browse All Dungeons" extended to the real 1-37 range (was 1-36).

## Done (Stage 23) — bug fixes + requested features
The person spotted 6 real issues after playing. All fixed and tested:

1. **Minimap direction letter wasn't centered** — was drawn at a fixed
   pixel position rather than centered over the actual radar box.
   Fixed with `textAlign = 'center'` computed from the box's real width.
2. **NPCs (camp peddlers/champions/Eustacia) had no real sprite** — they
   only ever showed a flat color tint with a name label. Extracted the
   monster sprite-compositing system (`AD_TABLE`/`A_TABLE`/`G_TABLE`,
   previously living only inside `firstPersonView.js`) into a new shared
   `monsterSprites.js`, and added `drawGenericNpc()` — reuses the real
   `ban_male_body.png` humanoid sprite as a generic "someone is here"
   visual instead of a tint. Not from the original (camp NPCs don't have
   dedicated portrait sprites in the extracted assets), but a real
   sprite beats a colored rectangle.
3. **Minimap resize wasn't possible at all** — added a `*`/`M` keybind
   and an on-screen "Minimap Size" button cycling 5x5/7x7/9x9, persisted
   to `localStorage`. Not from the original either (there's a real
   map-toggle key in the source, `*`, but not a resize control) — chose
   to reuse that same key for a related-but-new function rather than
   introduce an unrelated one.
4. **Starting gold raised to 100** — was 0. Direct request; the earlier
   caution about not guessing at the "50 gold" quest-intro line still
   applies (this is a different, explicit ask, not us inferring a number
   from unclear context).
5. **Combat now shows the real monster sprite** — added a canvas to the
   combat screen using the same shared `monsterSprites.js` compositing,
   sized to match the dungeon view's native proportions so the AD_TABLE
   anchor coordinates render without cropping guesswork. Sprite images
   are cached after first load so repeated fights don't re-fetch them.
6. **Difficulty setting added** — Easy/Normal/Hard, accessible from a new
   Settings screen off the main menu, persisted. Not part of the
   original at all (no such system in the source) — scales monster
   damage dealt to the player only (0.65x/1.0x/1.5x); Normal is an exact
   1.0x no-op so default behavior is unchanged from every prior stage's
   verified formula.

Tested before shipping: a full mount-and-cleanup cycle for the dungeon
view with an NPC placed directly ahead (no crash, real sprite call
verified present); difficulty save/load round-trip including an
invalid-value fallback to Normal; statistical verification that combat
damage actually scales by the expected ratio at each difficulty level;
reran the 42-monster-type regression sweep (630 fights across all 3
difficulty levels this time) — zero bugs.


Nothing left on the structural roadmap. What remains are individually
flagged simplifications, not missing systems:
1. **Champion camp positions, exact clue text, and aid-point tuning** —
   Stage 21 built the real quest mechanics (disposition/training formulas
   are exact), but champion placement, the clue wording, and the
   aid-point economy are our own reasonable choices rather than traced
   from the original — see Stage 21's notes for exactly which parts.
2. **Starting gold** — currently 0; the quest intro's "50 gold" line might
   be an early Eustacia-triggered grant rather than a character-creation
   stat. Not changed without the quest system that would trigger it
   correctly — flagged rather than guessed at.
3. **Paralyze's effect mechanism** — the roll/cost formula is real
   (Stage 12), but the effect itself is still "skip N of the monster's
   next counterattacks" rather than the reference's tick-duration
   `monster.extra[6]` flag on the monster side.
4. **Exact zone edge-topology and clue-string templating** — both use
   clean, honestly-labeled substitutes for original systems that weren't
   fully traceable (see Stage 21 and Stage 22 above for specifics).

## Useful references left behind
- `/tmp/decompiled/*.java` in the sandbox this was built in — full CFR
  decompile of all 12 classes (~10,300 lines, obfuscated single-letter
  names but logically intact). Re-decompile from the jar with CFR
  (https://github.com/leibnitz27/cfr) if a fresh copy is needed; it isn't
  bundled here (would just be dead weight without the jar to test against).
- Archive format for `.lmp` files: read `-` + name + `-` (name up to next
  `-`), then 4-byte big-endian offset, then 2-byte big-endian length,
  repeat until EOF.
- All binary formats are documented implicitly by the parser scripts used
  to generate each JSON (same technique throughout: mirror the
  `DataInputStream` read-call sequence exactly, big-endian, `readUTF` is
  2-byte-length-prefixed UTF-8). Re-derive by re-reading the relevant class
  in `/tmp/decompiled/` if a field's meaning needs double-checking —
  several fields (e.g. item `j`/`c`/`m`/`e` byte arrays) are carried over
  with their original obfuscated single-letter names since their exact
  semantics weren't traced yet.

