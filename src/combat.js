// Turn-based combat, ported from character.py's melee_attack (j.a) and
// monsters.py's attempt_attack (d.a). monster.attr(idx) turned out to be
// a direct index into the same 17-byte row already in monstersin.json —
// no hidden semantics — so once the reference confirmed which index means
// what, this could be ported exactly rather than approximated:
//   attrs[2]  = delta clamp cap          attrs[3]  = monster base hit%
//   attrs[4]  = monster hit skill        attrs[5]  = monster damage base
//   attrs[6]  = monster defense (vs player attack)
//   attrs[7]  = monster "hit_skill" used as the delta baseline
//   attrs[8]  = monster armor            attrs[11] = ailment id (unused, no ailment system)
//   attrs[14] = HP (also the spawn HP, confirmed in dungeonGenReal.js)
//
// spell_effect_active(N) IS now ported (see spellEffects.js) for the two
// buff spells the game's classes actually know: Frenzy (real duration
// countdown, +10+Alteration to damage while active) and Daedric Weapon
// (real duration, real conjured weapon item + a damage-formula override
// while active). Other spell_effect_active branches (ailments, other
// buffs no class starts with) remain unported — no ailment system yet.
// skill_value() still doesn't include the attribute-bonus term (traced
// in Stage 21: it targets a "bonus" attribute slot that's only ever
// nonzero under a buff system we haven't built beyond Frenzy/Daedric, so
// it evaluates to 0 in every case this port currently reaches — omitting
// it isn't losing real behavior right now). The reference's dice rolls
// are seeded (java_abs_mod-based, reusing the world-gen RNG) for
// determinism; combat here uses Math.random() instead since replay
// determinism doesn't matter for a live fight the way it does for dungeon
// layout — a deliberate, documented deviation, not an oversight.

import { isEquippable, equipSlot, itemAttr } from './items.js';
import { gainSkill } from './skillProgression.js';
import { spellEffectActive } from './spellEffects.js';

const WEAPON_SKILL_BY_TYPE = { 1: 0, 2: 2, 3: 8 }; // Axe/Blunt/LongSword -> skill index; anything else (incl. Short Sword) -> 12, per _active_weapon_skill

export function skillPairsFromRow(row) {
  const pairs = [];
  for (let i = 0; i < 14; i++) pairs.push([row[13 + 2 * i], row[13 + 2 * i + 1]]);
  return pairs;
}

function skillValue(skillPairs, idx, player) {
  if (idx < 0 || !skillPairs[idx]) return 0;
  let v = skillPairs[idx][0];
  // real mechanic, from character.py's skill_value: fatigue below 7
  // penalizes the effective skill by 1.
  if (player && (player.fatigue ?? 999) < 7) v -= 1;
  return v;
}
function skillCap(skillPairs, idx) {
  if (idx < 0 || !skillPairs[idx]) return 20;
  return skillPairs[idx][1];
}

export function armorClass(items, equipped, skillPairs, player) {
  const armorIdx = equipped[1];
  if (armorIdx == null) return 0;
  const cat = itemAttr(items, 'type', armorIdx);
  const skillIdx = Math.abs(cat) === 5 ? 5 : 7;
  return skillValue(skillPairs, skillIdx, player);
}

export function dodgeChance(items, equipped, skillPairs, player) {
  const armorIdx = equipped[1];
  if (armorIdx == null) return 20;
  const cat = itemAttr(items, 'type', armorIdx);
  const skillIdx = Math.abs(cat) === 5 ? 5 : 7;
  return skillCap(skillPairs, skillIdx); // cap is unaffected by fatigue in the reference
}

export function blockValue(items, equipped) {
  const weights = [0, 4, 2, 2, 1, 1];
  let total = 0;
  for (let slot = 1; slot <= 5; slot++) {
    const idx = equipped[slot];
    if (idx != null) total += weights[slot] * itemAttr(items, 'val', idx);
  }
  return Math.floor(total / 10);
}

function activeWeaponSkillIndex(items, equipped) {
  if (equipped[0] == null) return -1;
  const type = Math.abs(itemAttr(items, 'type', equipped[0]));
  return WEAPON_SKILL_BY_TYPE[type] ?? 12;
}

function attackDamageBase(items, equipped, skillPairs, player) {
  // Daedric Weapon's real damage-formula override (spell_effect_active(6)):
  // takes priority over normal weapon damage while active.
  if (spellEffectActive(player, 6)) {
    return 20 + skillValue(skillPairs, 3, player); // Conjuration
  }
  if (equipped[0] == null) return 0;
  return itemAttr(items, 'val', equipped[0]);
}

function lingoRandom(bound) {
  return 1 + Math.floor(Math.random() * bound); // see file header re: RNG choice
}

/** j.d(int,int) — opposed percentile roll, returns 0..3. */
export function contest(chanceA, chanceB) {
  const rollB = lingoRandom(100);
  const rollA = lingoRandom(100);
  const defender = rollB <= chanceB;
  const attacker = rollA <= chanceA;
  if (attacker && !defender) return 3;
  if (attacker && defender) return rollA >= rollB ? 2 : 1;
  if (!attacker && !defender) return rollA >= rollB ? 2 : 1;
  return 0;
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** j.a(d) — player attacks monster. monsterAttrs = the raw 17-byte row. */
export function playerAttack(player, monster, items, equipped, skillPairs, monsterAttrs) {
  const skillIdx = activeWeaponSkillIndex(items, equipped);
  const attackSkill = skillIdx >= 0 ? skillValue(skillPairs, skillIdx, player) : 0;
  const attackCap = skillIdx >= 0 ? skillCap(skillPairs, skillIdx) : 20;

  let delta = attackSkill - (monsterAttrs[7] & 0xFF);
  delta = Math.min(delta, monsterAttrs[2] & 0xFF);

  const defenderChance = clamp((monsterAttrs[6] & 0xFF) - delta * 5, 10, 95);
  const attackerChance = clamp(attackCap + delta * 5, 10, 95);
  const result = contest(attackerChance, defenderChance);
  if (result === 0) return { hit: false, damage: 0 };

  let damage = attackDamageBase(items, equipped, skillPairs, player);
  // Frenzy's real additive bonus (spell_effect_active(1)):
  if (spellEffectActive(player, 1)) {
    damage += 10 + skillValue(skillPairs, 1, player); // Alteration
  }
  let armor = monsterAttrs[8] & 0xFF;
  if (result === 1) armor *= 2;
  else if (result === 3) damage *= 2;
  const rawDamage = Math.max(damage - armor, 4);
  const dealt = Math.floor((rawDamage * (monsterAttrs[14] & 0xFF)) / 100);
  monster.hp = Math.max(0, monster.hp - dealt);

  let progress = { skillLeveledUp: false, charLeveledUp: false };
  if (result >= 2 && skillIdx >= 0) {
    progress = gainSkill(skillPairs, skillIdx, 1, player);
  }
  return { hit: true, damage: dealt, ...progress };
}

/** d.a(j,long) — monster attacks player. monsterAttrs = the raw 17-byte row. */
/** d.a(j,long) — monster attacks player. monsterAttrs = the raw 17-byte row.
 * difficultyMultiplier: not from the original — added per request, scales
 * final damage dealt to the player. 1.0 (normal) is a no-op matching
 * original behavior exactly. */
export function monsterAttack(monster, player, items, equipped, skillPairs, monsterAttrs, difficultyMultiplier = 1.0) {
  const hitSkill = monsterAttrs[4] & 0xFF;
  const ac = armorClass(items, equipped, skillPairs, player);
  let diff = ac - hitSkill;
  diff = Math.min(diff, monsterAttrs[2] & 0xFF);

  const chanceH = clamp((monsterAttrs[3] & 0xFF) - diff * 5, 10, 95);
  const chanceD = clamp(dodgeChance(items, equipped, skillPairs, player) + diff * 5, 10, 95);
  const r1 = lingoRandom(100);
  const r2 = lingoRandom(100);
  const hit = r1 <= chanceH;
  const dodged = r2 <= chanceD;
  let outcome;
  if (hit && !dodged) outcome = 3;
  else if (hit && dodged) outcome = r1 >= r2 ? 2 : 1;
  else if (!hit && !dodged) outcome = r1 >= r2 ? 2 : 1;
  else outcome = 0;

  if (outcome === 0) return { hit: false, damage: 0 };

  const damageBase = monsterAttrs[5] & 0xFF;
  let block = blockValue(items, equipped);
  if (outcome === 1) block *= 2;
  let dmg = Math.max(4, damageBase - block);
  dmg = Math.floor((dmg * player.maxHp) / 100); // player.maxHp stands in for stats[3] (healthMax)
  dmg = Math.max(1, Math.round(dmg * difficultyMultiplier));
  player.hp = Math.max(0, player.hp - dmg);
  return { hit: true, damage: dmg };
}
