// Sourced from https://en.uesp.net/wiki/Dawnstar:Character_Creation for
// race/starting-gear/spells (not derivable from charin.dat alone), cross-
// verified against jet082/TES-Mobile-Decomp-Python-Port's character.py,
// which gave us the *exact* formula (confirmed byte-for-byte against the
// wiki numbers for all 7 classes):
//   healthMax  = (STR + END) / 2
//   magickaMax = LUC * INT / 4
//   fatigueMax = STR + WIL + AGI + END
// So Health/Magicka/Fatigue below are now computed straight from the real
// charin.json attribute row (see computeCoreStats in main.js), not
// hand-copied from the wiki table like the first pass of this file did.

export const CLASS_STATS = {
  Barbarian:  { race: 'Nord',     str: 50, int: 30, wil: 50, agi: 30, spd: 40, end: 40, per: 30, luc: 40,
    armor: 'Padded Cloth', weapon: 'Hatchet', spells: [] },
  Battlemage: { race: 'Breton',   str: 40, int: 50, wil: 50, agi: 30, spd: 30, end: 30, per: 40, luc: 40,
    armor: 'Padded Cloth', weapon: 'Club', spells: ['Damage', 'Heal Wound'] },
  Knight:     { race: 'Redguard', str: 50, int: 30, wil: 30, agi: 40, spd: 40, end: 50, per: 30, luc: 40,
    armor: 'Worn Cuirass', weapon: 'Club', spells: [] },
  Nightblade: { race: 'Wood Elf', str: 30, int: 40, wil: 30, agi: 50, spd: 50, end: 30, per: 40, luc: 40,
    armor: 'Padded Cloth', weapon: 'Dagger', spells: ['Paralyze'] },
  Rogue:      { race: 'Nord',     str: 50, int: 30, wil: 40, agi: 30, spd: 40, end: 50, per: 30, luc: 40,
    armor: 'Worn Cuirass', weapon: 'Broadsword', spells: [] },
  Sorcerer:   { race: 'High Elf', str: 30, int: 50, wil: 40, agi: 40, spd: 40, end: 30, per: 40, luc: 40,
    armor: 'Padded Cloth', weapon: 'Dagger', spells: ['Frenzy', 'Daedric Weapon', 'Damage'] },
  Spellsword: { race: 'High Elf', str: 30, int: 50, wil: 40, agi: 40, spd: 30, end: 40, per: 40, luc: 40,
    armor: 'Worn Cuirass', weapon: 'Broadsword', spells: ['Frenzy', 'Damage'] },
};

// Computes Health/Magicka/Fatigue max directly from the raw charin.json
// class row, using the confirmed exact formula (j.f() / recompute_caps in
// the Python reference). Row layout (indices into the 13-field base
// array): 0=Level, 1=RaceIndex, 2=STR, 3=INT, 4=WIL, 5=AGI, 6=SPD, 7=END,
// 8=PER, 9=LUC, 10=innerLuck (distinct from the LUC attribute — used only
// in the Magicka formula), 11=height, 12=weight.
//   healthMax  = (STR + END) / 2
//   magickaMax = innerLuck * INT / 4    <- NOT the same "luck" as attribute 9!
//   fatigueMax = STR + WIL + AGI + END
export function computeCoreStats(row) {
  const [, , str, int, wil, agi, , end, , , innerLuck] = row;
  const health = Math.floor((str + end) / 2);
  const magicka = Math.floor((innerLuck * int) / 4);
  const fatigue = str + wil + agi + end;
  return { health, magicka, fatigue };
}

// Starting skills per class (also sourced from the same page).
export const CLASS_SKILLS = {
  Barbarian:  { Axe: 4, 'Blunt Weapon': 2, 'Light Armor': 4 },
  Battlemage: { 'Blunt Weapon': 2, Destruction: 4, Restoration: 3, Speechcraft: 1 },
  Knight:     { 'Blunt Weapon': 4, 'Heavy Armor': 3, 'Long Blade': 1, Speechcraft: 2 },
  Nightblade: { Illusion: 4, 'Light Armor': 2, 'Long Blade': 1, 'Short Blade': 3 },
  Rogue:      { 'Blunt Weapon': 2, 'Heavy Armor': 3, 'Light Armor': 1, 'Long Blade': 4 },
  Sorcerer:   { Alteration: 2, Conjuration: 4, Destruction: 3, Speechcraft: 1 },
  Spellsword: { Alteration: 4, Destruction: 2, 'Light Armor': 1, 'Long Blade': 3 },
};
