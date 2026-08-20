// Champion/Eustacia quest system, ported from npc.py + character.py's
// disposition_check where the underlying mechanics are real and
// traceable:
//   - disposition_check (j.a): Speechcraft-based contest, +3 bonus for
//     "threaten" over "befriend", opposed by a per-champion gift counter
//     (more gifts without matching Speechcraft growth makes it *harder*,
//     not easier — a real diminishing-returns mechanic, not a guess).
//   - champion_skill_id / champion_can_teach (k.b/k.c): each of the 4
//     champions teaches exactly 3 specific skills — a real, exact table.
//   - train_skill_response (k.a): training directly increments
//     skills[idx][0] (the level) by 1 — real formula, not approximated.
//
// Simplified, flagged: aid-point costs/rewards for each action, and the
// clue-threshold for revealing a hint, are our own reasonable numbers —
// the reference ties aid points to a UI flow we didn't fully trace. The
// clue text itself is our own writing rather than the original's
// templated rumor-phrase system (QUESTION_OFFSETS/QUESTION_TRUTHS
// indexing into npcstrings section 9's 77 generic strings), which would
// need much more reverse-engineering to reproduce exactly.

import { contest as combatContest } from './combat.js';

export const CHAMPION_NAMES = ['Alhavara', 'Beatrice', 'Chung', 'Delacroix'];

// k.b — which 3 skills each champion (0-indexed here, matches
// CHAMPION_NAMES) can teach. Skill indices match skillNames order:
// ['Axe','Alteration','BluntWeapon','Conjuration','Destruction',
//  'HeavyArmor','Illusion','LightArmor','LongBlade','Perception',
//  'Restoration','Security','ShortBlade','Speechcraft']
export const CHAMPION_TEACHABLE = [
  [7, 8, 10],  // Alhavara: Light Armor, Long Blade, Restoration
  [1, 3, 4],   // Beatrice: Alteration, Conjuration, Destruction
  [0, 2, 5],   // Chung: Axe, Blunt Weapon, Heavy Armor
  [6, 12, 13], // Delacroix: Illusion, Short Blade, Speechcraft
];

const TRAIN_COST = 3;      // our own number — aid points per training session
const CLUE_THRESHOLD = 3;  // our own number — aid points before a clue is shared
const GIFT_AID_POINTS = 2;
const ACTION_AID_POINTS = 1;

export function newQuestState() {
  return {
    traitorIndex: Math.floor(Math.random() * 4),
    metEustacia: false,
    champions: CHAMPION_NAMES.map(() => ({
      met: false, befriended: 0, threatened: 0, gifted: 0, aidPoints: 0, clueGiven: false,
    })),
    cluesCollected: [], // { championIdx, text }
    accused: null,      // championIdx once the player has made a final accusation
  };
}

/**
 * disposition_check, ported exactly: Speechcraft (with the fatigue
 * penalty already built into combat.js's skillValue), a +3 bonus for
 * threaten, opposed by how many times this champion has already been
 * gifted, and Personality contributing to the defender side.
 */
export function dispositionCheck(action, speechcraftSkill, personality, giftedCount) {
  let n3 = speechcraftSkill;
  if (action === 'threaten') n3 += 3;
  const diff = n3 - giftedCount;
  let chanceH = 20 - diff * 5;
  let chanceD = 20 + Math.floor(personality / 2) + diff * 5;
  chanceH = Math.min(Math.max(chanceH, 10), 95);
  chanceD = Math.min(Math.max(chanceD, 10), 95);
  // _disposition(d_chance, h_chance) in the reference: the "d" role
  // (r2/d_chance) plays the same structural role as combat.js's
  // contest()'s first argument ("attacker": outcome 3 when it succeeds
  // and the other fails, same tie-break direction in split decisions).
  // So this must be contest(chanceD, chanceH) — d_chance first — not the
  // other order, even though "chanceH" is textually named first above.
  return combatContest(chanceD, chanceH);
}

/**
 * Resolves a befriend/threaten/gift attempt against one champion.
 * Returns { outcome, aidPointsGained, clue } — clue is set only the
 * first time this champion crosses CLUE_THRESHOLD aid points.
 */
export function attemptChampionAction(quest, championIdx, action, speechcraftSkill, personality) {
  const champ = quest.champions[championIdx];
  champ.met = true;
  const outcome = dispositionCheck(action, speechcraftSkill, personality, champ.gifted);
  const success = outcome >= 2;
  let aidPointsGained = 0;
  if (action === 'gift') {
    champ.gifted += 1;
    aidPointsGained = GIFT_AID_POINTS; // gifting itself is the "success" — the item is spent either way
  } else if (success) {
    if (action === 'befriend') champ.befriended += 1;
    if (action === 'threaten') champ.threatened += 1;
    aidPointsGained = ACTION_AID_POINTS;
  }
  champ.aidPoints += aidPointsGained;

  let clue = null;
  if (!champ.clueGiven && champ.aidPoints >= CLUE_THRESHOLD) {
    champ.clueGiven = true;
    clue = buildClue(quest, championIdx);
    quest.cluesCollected.push({ championIdx, text: clue });
  }
  return { outcome, success, aidPointsGained, clue };
}

// Our own clue phrasing (see file header — not the original's exact
// templated rumor text). Each clue points toward or away from the real
// traitor in a way that's useful without being an instant giveaway.
function buildClue(quest, championIdx) {
  const isTraitor = championIdx === quest.traitorIndex;
  const others = CHAMPION_NAMES.filter((_, i) => i !== championIdx);
  if (isTraitor) {
    const decoy = others[Math.floor(Math.random() * others.length)];
    return `"I've heard whispers, but I'd sooner suspect ${decoy} than admit what I know."`;
  }
  return `"It isn't me you should worry about. Watch ${CHAMPION_NAMES[quest.traitorIndex]}."`;
}

/** train_skill_response, exact formula: level 0 -> 1, otherwise +1. */
export function trainSkill(quest, championIdx, skillPairs, skillIdx) {
  const champ = quest.champions[championIdx];
  if (champ.aidPoints < TRAIN_COST) return { trained: false, reason: 'Not enough aid points.' };
  if (!CHAMPION_TEACHABLE[championIdx].includes(skillIdx)) return { trained: false, reason: "This champion can't teach that skill." };
  champ.aidPoints -= TRAIN_COST;
  const s = skillPairs[skillIdx];
  if (!s) return { trained: false, reason: 'Unknown skill.' };
  const before = s[0];
  s[0] = before === 0 ? 1 : before + 1;
  return { trained: true, before, after: s[0] };
}

export function accuseTraitor(quest, championIdx) {
  quest.accused = championIdx;
  return championIdx === quest.traitorIndex;
}
