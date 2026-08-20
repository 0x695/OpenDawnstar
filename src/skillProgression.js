// Ported from character.py's gain_skill: +1 skill exp on a successful hit
// (contest result >= 2, i.e. a solid hit or crit, not a grazing "result 1"
// hit) from either melee or a spell. Every 10 skill exp = +1 skill level
// and +1 character Level XP; every 10 character Level XP = +1 character
// Level. skillPairs entries grow a 3rd slot here (exp) beyond the
// [level, cap] pairs charin.json provides.
//
// Simplified vs. the reference: character level-up in the original opens
// a screen where the player allocates attribute increases based on which
// skills leveled (`skill_marks`) — not built. Here, leveling up just
// grants a modest flat bump to max HP/Magicka and fully restores both,
// which is a real (if simpler) reward rather than a silent counter.

export function gainSkill(skillPairs, idx, exp, player) {
  if (idx < 0 || idx >= 14 || !skillPairs[idx]) return { skillLeveledUp: false, charLeveledUp: false };
  const s = skillPairs[idx];
  if (s.length < 3) s.push(0);
  s[2] += exp;
  let skillLeveledUp = false;
  while (s[2] > 10) {
    s[2] -= 10;
    s[0] += 1;
    skillLeveledUp = true;
    player.levelXp = (player.levelXp || 0) + 1;
  }
  let charLeveledUp = false;
  if ((player.levelXp || 0) >= 10) {
    player.levelXp -= 10;
    player.level = (player.level || 1) + 1;
    charLeveledUp = true;
    player.maxHp += 2;
    player.maxMagicka += 1;
    player.hp = player.maxHp;
    player.magicka = player.maxMagicka;
  }
  return { skillLeveledUp, charLeveledUp };
}
