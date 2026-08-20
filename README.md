# OpenDawnstar

A from-scratch, reverse-engineered browser reimplementation of **The Elder
Scrolls Travels: Dawnstar** (Vir2L Studios / Bethesda Softworks, 2003,
J2ME). No original code or bytecode is included or executed — every
mechanic here was traced from the original's binary data files and
rebuilt in plain JavaScript, cross-checked against an independent Python
decompilation and UESP's wiki.

**[Play it in your browser →] https://0x695.github.io/OpenDawnstar/ ** 

## Status: playable, not finished

This is a real, working game — character creation, a full first-person
dungeon crawler, real combat/spell/skill formulas, shops, a complete
champion/traitor mystery questline, save/continue, the works. But it's
**not a final, polished release**. Known rough edges:

- **UI needs another pass.** Some screens are functional-but-plain, the
  in-dungeon Options menu was only just added, and a few visual details
  (sprite positioning, mobile layout edge cases) haven't been checked
  against a real device by anyone but the person who built this.
- Several mechanics are documented, honest simplifications rather than
  byte-exact ports — see `PORT_NOTES.md` for the full list (duration-
  ticked ailments, exact dungeon-to-dungeon edge topology, champion clue
  text, and a few others).
- This project may or may not get further updates — treat what's here as
  a solid, playable snapshot rather than an actively maintained release.

If you run into bugs, `PORT_NOTES.md` documents what's real vs.
simplified stage-by-stage, which is usually the fastest way to tell
whether something's a bug or a known, intentional gap.

## Running it

No build step, no dependencies. It's static files.

```
python3 -m http.server 8000
```
then open `http://localhost:8000`. (Must be served over http(s) — opening
`index.html`/`game.html` directly via `file://` won't work, the game
fetches its data files.)

Or just push this repo to GitHub Pages — see below.

## Deploying

Settings → Pages → Deploy from branch → `main` / root. That's it, it's a
static site.

## What's real vs. simplified

Two documents cover this in detail:

- **`PORT_NOTES.md`** — the full stage-by-stage development log: what was
  traced exactly from the original's data, what was cross-verified
  against an independent decompilation, and what's an honest,
  clearly-flagged substitution where the original couldn't be traced.
- **`COMPARISON.md`** — how this compares to playing on original hardware
  or through a J2ME emulator (and why the emulator route was abandoned).

## Credits

- Original game: **Vir2L Studios**, published by **Bethesda Softworks /
  ZeniMax Media**, 2003.
- [jet082/TES-Mobile-Decomp-Python-Port](https://github.com/jet082/TES-Mobile-Decomp-Python-Port)
  — an independent Python decompilation used throughout as a
  cross-reference to verify formulas and data layouts.
- [UESP](https://en.uesp.net/wiki/Dawnstar:Dawnstar) — wiki documentation
  used to fact-check game structure, quest content, and mechanics.

## License & disclaimer

The code in this repository is original work, released under the MIT
License (see `LICENSE`). Sprite assets extracted from the original game
are included for visual fidelity and belong to their original rights
holders.

OpenDawnstar is an unofficial, non-commercial fan project and is not
affiliated with, endorsed by, or sponsored by ZeniMax Media Inc.
