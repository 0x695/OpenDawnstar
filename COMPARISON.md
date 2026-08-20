# OpenDawnstar: three ways to play Dawnstar in 2026 — a comparison

Three approaches were tried or are theoretically available for playing
*The Elder Scrolls Travels: Dawnstar* (2003, J2ME/MIDP-1.0) today. This
document compares them plainly, including where this web port is *less*
faithful than it could be, and where it's arguably *more* reliable than
running the original.

1. **Original hardware** — a real J2ME phone running the actual `.jar`.
2. **J2ME emulator (J2ME.js)** — the actual original `.jar`, run through a
   browser-based Java bytecode interpreter. Tried first, in this project's
   earliest stages.
3. **This web port** — a from-scratch rewrite in plain JS/HTML5, built by
   reverse-engineering the original's binary data and cross-referencing
   an independent Python decompilation plus UESP wiki pages.

## Summary

| | Original hardware | J2ME emulator | This web port |
|---|---|---|---|
| Runs today, no setup | No — dead ecosystem | Yes, but fragile | Yes |
| Mechanical fidelity | 100% by definition | 100% in theory | High, itemized below — not 100% |
| Actually reliable in practice | N/A (unobtainable) | **No** — hit real, unresolved bugs | Yes, every system tested before shipping |
| Touch/mobile support | No | No | Yes |
| Audio | None (game is silent) | None | Added (synthesized, not original) |
| Save/continue | RMS on-device | Unclear/untested | Yes, real |
| Performance | N/A | Bytecode-interpretation overhead | Native, negligible |
| Can be inspected/fixed | No | No (black box) | Yes — every mechanic is our own readable code |

## Why the emulator route was abandoned

J2ME.js runs the *actual, unmodified* original bytecode, which sounds
like the obviously more faithful choice. In practice, across this
project's early stages, it was genuinely unreliable:

- The character-naming screen's confirm command silently failed to wire
  up in the "compatible" kernel (`updateCommands Error: command is null`
  in the console) — a real bug in the emulator's Form-command handling
  for this specific jar, not something we could fix from the outside.
- Switching kernels changed behavior inconsistently; no kernel reliably
  got past early setup.
- No touch controls, no save/continue, no way to add anything the
  original didn't have (even something as simple as sound).
- Being a black box, none of these problems were fixable — the only
  lever available was "try a different kernel and hope."

Running the real bytecode is more *authentic* in principle, but
authenticity that doesn't reliably run isn't more useful than a faithful
rewrite that does.

## Fidelity, honestly broken down by system

"Faithful" here means: the formula, table, or algorithm was read from the
decompiled source (or an independent Python decompilation used for
cross-reference) and reproduced, then verified with a real test — not
just written to *look* plausible.

| System | Status | Notes |
|---|---|---|
| Binary data (items, monsters, spells, classes, help text, NPC dialogue) | **Exact** | Byte-exact parse of every `.dat`/`.lmp` file, zero leftover bytes on every file |
| Dungeon generation (room placement, corridor connection) | **Exact** | Real algorithm ported, not the early approximation; verified with flood-fill connectivity across 36 dungeons |
| Camp/hub layout | **Exact** | Hand-crafted 19x19 map, exact tile coordinates |
| First-person wall rendering | **Exact** | Real perspective lookup tables (`WALL_TABLE`/`STRIP_X`) |
| Monster sprite compositing | **Exact** | Real layered body/head/accessory tables, all 42 monster types bounds-checked |
| Combat formula (hit/dodge/damage) | **Exact** | Both directions (player→monster, monster→player) traced to the real per-monster-attribute formula |
| Character stats (Health/Magicka/Fatigue) | **Exact** | Formula verified against real per-class numbers for all 7 classes |
| Equipment slots | **Exact** | Real slot-category mapping, auto-equip-on-pickup behavior matches |
| Skill progression & leveling trigger | **Exact** | Real "only on a solid hit" condition, real exp thresholds |
| Death penalty (lose unequipped loot) | **Exact** | Real mechanic, confirmed against UESP and implemented |
| Shops (peddler positions, wares, dialogue) | **Exact** | Real camp coordinates, real wares lists, real greeting/success/fail dialogue lines |
| Champion disposition/training mechanics | **Exact** | Real formulas, verified with a mocked-RNG test after catching a real parameter-order bug |
| Damage/Heal Wound/Paralyze spells | **Exact** | Real formulas |
| Frenzy/Daedric Weapon buffs | **Simplified** | Real cost/roll, but a flat damage bonus instead of the original's duration-ticked buff system |
| Fatigue drain | **Simplified** | Real mechanic exists now, but flat-rate rather than gear-weight-dependent |
| Champion camp positions | **Substituted** | Original doesn't define fixed positions for them at all (likely dungeon-encountered, untraced) |
| Champion clue text | **Original writing** | Not the original's exact templated rumor-phrase system |
| Intra-zone dungeon chaining | **Not built** | Gates reach each zone's first dungeon; the other 8 per zone aren't linked dungeon-to-dungeon yet |
| Audio | **Added, not ported** | The original has none at all (MIDP-1.0, zero audio files, zero tone-API calls found anywhere in the source) |
| Touch controls, save/continue, level-up feedback | **Added** | Didn't exist in the original in this form |

## The honest tradeoff

The web port is not a byte-for-byte replica — several systems are
openly simplified or substituted, and that's documented stage-by-stage in
`PORT_NOTES.md` rather than glossed over. But unlike the emulator
approach, every one of those gaps is a *known, readable, fixable* line of
JavaScript rather than an opaque failure inside someone else's bytecode
interpreter. And in the systems that matter most to actually playing the
game — combat, dungeons, character progression, shops, the core
quest — the formulas are the real ones, tested against real data before
shipping, not approximations dressed up to look right.

If the goal is "run the exact original," the emulator is closer in
theory and worse in practice. If the goal is "play Dawnstar, reliably, in
a 2026 browser, on a phone or a desktop" — this port is the one that
actually does that.
