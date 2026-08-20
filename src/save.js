// Minimal shim for javax.microedition.rms.RecordStore, backed by localStorage.
// Mirrors the two things the original game used it for at this stage:
// the "elder_firsttime" flag and a simple character record.

const PREFIX = 'dawnstar_';

export function getFlag(name) {
  return localStorage.getItem(PREFIX + name) === '1';
}

export function setFlag(name) {
  localStorage.setItem(PREFIX + name, '1');
}

export function saveCharacter(character) {
  localStorage.setItem(PREFIX + 'character', JSON.stringify(character));
}

export function loadCharacter() {
  const raw = localStorage.getItem(PREFIX + 'character');
  return raw ? JSON.parse(raw) : null;
}

export function addItemToInventory(itemIndex, itemName) {
  const c = loadCharacter();
  if (!c) return;
  c.inventory = c.inventory || []; // array of {index, name}
  c.equipped = c.equipped || [null, null, null, null, null, null, null];
  c.inventory.push({ index: itemIndex, name: itemName });
  saveCharacter(c);
}

export function autoEquip(itemIndex, slot) {
  const c = loadCharacter();
  if (!c) return;
  c.equipped = c.equipped || [null, null, null, null, null, null, null];
  c.equipped[slot] = itemIndex; // replaces whatever was there, matching the original's auto-equip-on-pickup
  saveCharacter(c);
}

export function addGold(amount) {
  const c = loadCharacter();
  if (!c) return;
  c.gold = (c.gold || 0) + amount;
  saveCharacter(c);
}

export function hasSavedGame() {
  return !!localStorage.getItem(PREFIX + 'character');
}

// In-dungeon (or in-camp) progress: scene, which dungeon, player position/
// facing, HP/Magicka/Fatigue/level/skills, which monsters are dead and
// which chests are opened. Dungeons themselves aren't saved — they're
// deterministic from the seed (dungeonIndex), so on resume we just
// regenerate the same layout and re-apply these deltas.
export function saveProgress(state) {
  localStorage.setItem(PREFIX + 'progress', JSON.stringify(state));
}

export function loadProgress() {
  const raw = localStorage.getItem(PREFIX + 'progress');
  return raw ? JSON.parse(raw) : null;
}

export function clearProgress() {
  localStorage.removeItem(PREFIX + 'progress');
}

// Champion/traitor quest state (see quest.js). Separate key since it's
// tied to the character's whole playthrough, not a single dungeon visit.
export function saveQuestState(state) {
  localStorage.setItem(PREFIX + 'quest', JSON.stringify(state));
}

export function loadQuestState() {
  const raw = localStorage.getItem(PREFIX + 'quest');
  return raw ? JSON.parse(raw) : null;
}

// Difficulty setting — not from the original (no such system exists in
// the source), added per request. Scales monster damage dealt to the
// player; 'normal' is a 1.0x no-op matching original behavior exactly.
const DIFFICULTY_MULTIPLIERS = { easy: 0.65, normal: 1.0, hard: 1.5 };

export function saveDifficulty(level) {
  if (!DIFFICULTY_MULTIPLIERS[level]) level = 'normal';
  localStorage.setItem(PREFIX + 'difficulty', level);
}

export function loadDifficulty() {
  const level = localStorage.getItem(PREFIX + 'difficulty');
  return DIFFICULTY_MULTIPLIERS[level] ? level : 'normal';
}

export function difficultyMultiplier(level) {
  return DIFFICULTY_MULTIPLIERS[level] || 1.0;
}
