// Real duration-ticked spell effects, for the two buff spells the game's
// classes actually know (see wikiData.js's CLASS_STATS spell lists):
// Frenzy (spell/effect id 1) and Daedric Weapon (id 6). Replaces the
// earlier `tempDamageBonus` stand-in from Stage 12.
//
// Ported from:
//   - character.py's spell_effect_active (j.r): effect is active while
//     spell_durations[id-1] > 0 (the -1/-2 sentinel branches are for
//     other spells no class here starts with, and aren't ported).
//   - canvas.py's per-move decrement loop: every positive duration ticks
//     down by 1 each player move, clamped at 0. When Daedric Weapon's
//     duration (index 5) hits 0, the conjured weapon is unequipped —
//     ported exactly ("if i == 5: remove equipped item 101").

const DAEDRIC_WEAPON_ITEM_INDEX = 100; // item id 101, 1-based -> 0-based 100

export function newSpellDurations() {
  return new Array(25).fill(0);
}

export function spellEffectActive(player, effectId) {
  if (!player || !player.spellDurations) return false;
  const value = player.spellDurations[effectId - 1];
  return (value || 0) > 0;
}

/**
 * Ticks all spell durations down by 1 (floor 0). Returns a list of
 * effect ids (1-based) that just expired this tick, so the caller can
 * react (e.g. unequip the conjured Daedric Weapon).
 */
export function tickSpellDurations(player) {
  if (!player || !player.spellDurations) return [];
  const expired = [];
  for (let i = 0; i < player.spellDurations.length; i++) {
    if (player.spellDurations[i] > 0) {
      player.spellDurations[i] -= 1;
      if (player.spellDurations[i] <= 0) {
        player.spellDurations[i] = 0;
        expired.push(i + 1);
      }
    }
  }
  return expired;
}

export function setDuration(player, effectId, duration) {
  if (!player.spellDurations) player.spellDurations = newSpellDurations();
  player.spellDurations[effectId - 1] = duration;
}

export { DAEDRIC_WEAPON_ITEM_INDEX };
