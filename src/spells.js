// Spell casting, ported from character.py's cast/_spell_roll/_spend_spell_resources
// for the specific spells the 7 classes actually start with (see
// CLASS_STATS in wikiData.js): Damage, Heal Wound, Paralyze, Frenzy, and
// Daedric Weapon are now all faithful ports — Frenzy/Daedric Weapon's
// real duration-tick mechanics were added once the reference's exact
// spell_effect_active/duration system was traced (see spellEffects.js
// and combat.js). Paralyze's actual effect is still simplified — "skip
// N of the monster's next counterattacks" rather than the reference's
// tick-duration `monster.extra[6]` flag on the monster side.
//
// spellsin.json field names already matched the reference's Java letters
// exactly (h=skill/unused here, e=cost, f=duration, d=target, j=flag5,
// g=flag6) — same validation pattern as items.json in Stage 10.

import { gainSkill } from './skillProgression.js';
import { setDuration } from './spellEffects.js';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function spellSkillIndex(spellId) {
  if (spellId <= 5) return 1;   // Alteration
  if (spellId <= 10) return 3;  // Conjuration
  if (spellId <= 15) return 4;  // Destruction
  if (spellId <= 20) return 6;  // Illusion
  return 10;                    // Restoration
}

function contest(chanceA, chanceB) {
  const rollB = 1 + Math.floor(Math.random() * 100);
  const rollA = 1 + Math.floor(Math.random() * 100);
  const defender = rollB <= chanceB;
  const attacker = rollA <= chanceA;
  if (attacker && !defender) return 3;
  if (attacker && defender) return rollA >= rollB ? 2 : 1;
  if (!attacker && !defender) return rollA >= rollB ? 2 : 1;
  return 0;
}

function spellRoll(spellId, spell, skillPairs, opposeArgs, player) {
  const skillIdx = spellSkillIndex(spellId);
  let skill = skillPairs[skillIdx] ? skillPairs[skillIdx][0] : 0;
  if (player && (player.fatigue ?? 999) < 7) skill -= 1; // same fatigue penalty as combat.js's skillValue
  const cap = skillPairs[skillIdx] ? skillPairs[skillIdx][1] : 20;
  let attacker, defender;
  if (!opposeArgs) {
    const delta = skill - spell.g;
    attacker = cap + delta * 5;
    defender = spell.j - delta * 5;
  } else {
    const { resist, oppose, defense } = opposeArgs;
    const delta = Math.min(skill - resist, oppose);
    attacker = cap + delta * 5;
    defender = defense - delta * 5;
  }
  attacker = clamp(attacker, 10, 95);
  defender = clamp(defender, 10, 95);
  const result = contest(attacker, defender);
  return { result, multiplier: result === 3 ? 2 : 1 };
}

function spendResources(player, cost, result, skillPairs, skillIdx) {
  const spent = result === 0 ? 3 * cost : result === 1 ? Math.floor((3 * cost) / 2) : cost;
  player.magicka = Math.max(0, player.magicka - spent);
  // real mechanic, simplified: the reference drains 5 * encumbrance()
  // (gear-weight-dependent); we don't model carry weight, so a flat 5.
  player.fatigue = Math.max(0, (player.fatigue ?? player.maxFatigue ?? 0) - 5);
  let progress = { skillLeveledUp: false, charLeveledUp: false };
  if (result >= 2 && skillIdx != null && skillIdx >= 0) {
    progress = gainSkill(skillPairs, skillIdx, 1, player);
  }
  return progress;
}

/** Damage (spell id 11): real formula, monster-target. */
export function castDamage(player, monster, monsterAttrs, skillPairs, spell) {
  const { result, multiplier } = spellRoll(11, spell, skillPairs, {
    resist: monsterAttrs[10] & 0xFF, oppose: monsterAttrs[2] & 0xFF, defense: monsterAttrs[9] & 0xFF,
  }, player);
  const progress = spendResources(player, spell.e, result, skillPairs, spellSkillIndex(11));
  if (result === 0) return { hit: false, damage: 0, ...progress };
  const destructionSkill = skillPairs[4] ? skillPairs[4][0] : 0;
  const base = (25 + destructionSkill) * multiplier;
  const dmg = Math.max(base - (monsterAttrs[8] & 0xFF), 4);
  const dealt = Math.floor((dmg * (monsterAttrs[14] & 0xFF)) / 100);
  monster.hp = Math.max(0, monster.hp - dealt);
  return { hit: true, damage: dealt, ...progress };
}

/** Heal Wound (spell id 21): real formula, self-target. */
export function castHeal(player, skillPairs, spell) {
  const { result, multiplier } = spellRoll(21, spell, skillPairs, null, player);
  const progress = spendResources(player, spell.e, result, skillPairs, spellSkillIndex(21));
  if (result === 0) return { healed: 0, ...progress };
  const restorationSkill = skillPairs[10] ? skillPairs[10][0] : 0;
  const amount = multiplier * (6 + restorationSkill);
  const healed = Math.min(player.maxHp - player.hp, amount);
  player.hp = Math.min(player.maxHp, player.hp + amount);
  return { healed, ...progress };
}

/** Paralyze (spell id 16): real roll/resource cost; effect simplified to
 * "skip N of the monster's next counterattacks" rather than the
 * reference's tick-duration `monster.extra[6]` flag. */
export function castParalyze(player, monster, monsterAttrs, skillPairs, spell) {
  const { result, multiplier } = spellRoll(16, spell, skillPairs, {
    resist: monsterAttrs[10] & 0xFF, oppose: monsterAttrs[2] & 0xFF, defense: monsterAttrs[9] & 0xFF,
  }, player);
  const progress = spendResources(player, spell.e, result, skillPairs, spellSkillIndex(16));
  if (result === 0) return { turns: 0, ...progress };
  const amount = 10 - (monsterAttrs[10] & 0xFF);
  if (amount <= 0) return { turns: 0, ...progress };
  const turns = Math.min(multiplier * amount, 3); // clamped — see note above
  monster.paralyzedTurns = (monster.paralyzedTurns || 0) + turns;
  return { turns, ...progress };
}

/**
 * Frenzy / Daedric Weapon: the reference applies these as duration-ticked
 * buffs threaded through attack_damage_base via spell_effect_active(N)
 * checks (see combat.js header). That plumbing isn't built. This is a
 * deliberately simplified stand-in: spend the real cost via a real roll,
 * and on success grant a flat damage bonus for the rest of this fight —
 * same shape (buff a fight, cost magicka, can fail), not the same
 * duration-tick mechanics.
 */
/**
 * Frenzy (spell id 1): real duration countdown via setDuration, decremented
 * once per player move (see spellEffects.js / main.js's onMove hook). The
 * damage bonus itself is applied in combat.js via spellEffectActive(1).
 */
export function castFrenzy(player, skillPairs, spell) {
  const { result, multiplier } = spellRoll(1, spell, skillPairs, null, player);
  const progress = spendResources(player, spell.e, result, skillPairs, spellSkillIndex(1));
  if (result === 0) return { buffed: false, ...progress };
  setDuration(player, 1, spell.f * multiplier);
  return { buffed: true, ...progress };
}

/**
 * Daedric Weapon (spell id 6): real duration countdown, same shape as
 * Frenzy. The conjured-item grant/equip and damage-formula override live
 * outside this function (main.js does the inventory work; combat.js does
 * the damage override) since spells.js doesn't touch equipment directly.
 * Returns `grantItem: true` on success so the caller knows to conjure it.
 */
export function castDaedricWeapon(player, skillPairs, spell) {
  const { result, multiplier } = spellRoll(6, spell, skillPairs, null, player);
  const progress = spendResources(player, spell.e, result, skillPairs, spellSkillIndex(6));
  if (result === 0) return { buffed: false, grantItem: false, ...progress };
  setDuration(player, 6, spell.f * multiplier);
  return { buffed: true, grantItem: true, ...progress };
}
