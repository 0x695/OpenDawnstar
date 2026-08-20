import { getFlag, setFlag, saveCharacter, hasSavedGame, loadCharacter, addItemToInventory, addGold, autoEquip, saveProgress, loadProgress, clearProgress, saveQuestState, loadQuestState, saveDifficulty, loadDifficulty, difficultyMultiplier } from './save.js';
import { generateDungeon, campAsDungeonShape } from './dungeonGenReal.js';
import { mountDungeonView } from './dungeonView.js';
import { mountFirstPersonView } from './firstPersonView.js';
import { playerAttack, monsterAttack, skillPairsFromRow, armorClass, dodgeChance } from './combat.js';
import { castDamage, castHeal, castParalyze, castFrenzy, castDaedricWeapon } from './spells.js';
import { tickSpellDurations, DAEDRIC_WEAPON_ITEM_INDEX } from './spellEffects.js';
import { isEquippable, equipSlot, itemName, SLOT_NAMES } from './items.js';
import { CLASS_STATS, CLASS_SKILLS, computeCoreStats } from './wikiData.js';
import { sfx, setMuted, isMuted, loadMutePref } from './audio.js';
import { newQuestState, attemptChampionAction, trainSkill, accuseTraitor, CHAMPION_NAMES, CHAMPION_TEACHABLE } from './quest.js';
import { loadMonsterSprites, drawLayeredMonster } from './monsterSprites.js';

const app = document.getElementById('app');

let charData = null;
let helpSections = null;
let monsterData = null;
let itemData = null;
let spellData = null;
let npcStringsData = null;
let geomData = null;
let questState = null;

function ensureQuestState() {
  if (!questState) questState = loadQuestState() || newQuestState();
  return questState;
}
function persistQuestState() {
  if (questState) saveQuestState(questState);
}
let state = { selectedClassIndex: 0 };
let activeCleanup = null;
let livePlayer = null; // { name, className, hp, maxHp, atk }
let currentDungeon = null;
let currentDungeonTitle = '';

async function loadCharData() {
  if (charData) return charData;
  const res = await fetch('assets/data/charin.json');
  charData = await res.json();
  return charData;
}

async function loadHelpSections() {
  if (helpSections) return helpSections;
  const res = await fetch('assets/data/help_sections.json');
  helpSections = await res.json();
  return helpSections;
}

async function loadMonsterData() {
  if (monsterData) return monsterData;
  const res = await fetch('assets/data/monstersin.json');
  const raw = await res.json();
  monsterData = raw.names.map((name, i) => ({ name, stats: raw.stats[i] }));
  return monsterData;
}

async function loadItemData() {
  if (itemData) return itemData;
  const res = await fetch('assets/data/itemsin.json');
  itemData = await res.json();
  return itemData;
}

async function loadSpellData() {
  if (spellData) return spellData;
  const res = await fetch('assets/data/spellsin.json');
  spellData = await res.json();
  return spellData;
}

async function loadNpcStrings() {
  if (npcStringsData) return npcStringsData;
  const res = await fetch('assets/data/npcstrings.json');
  npcStringsData = await res.json();
  return npcStringsData;
}

async function loadGeomData() {
  if (geomData) return geomData;
  const res = await fetch('assets/data/geomin.json');
  geomData = await res.json();
  return geomData;
}

function render(html) {
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  app.innerHTML = `<div class="screen">${html}</div>`;
}

function boot() {
  loadMutePref();
  if (!getFlag('welcomed')) {
    showWelcome();
  } else {
    showMainMenu();
  }
}

function showWelcome() {
  render(`
    <h1>The Elder Scrolls Travels: Dawnstar</h1>
    <p class="sub">Welcome! Please peruse our manufactured mayhem makers.</p>
    <p class="sub" style="opacity:.6">(The original game showed a "recycle your phone's power" message
    here on first launch and refused to actually start \u2014 that quirk is skipped in this port.)</p>
    <div class="btn-row">
      <button class="btn" id="ok">OK</button>
    </div>
  `);
  document.getElementById('ok').addEventListener('click', () => {
    setFlag('welcomed');
    showMainMenu();
  });
}

function showMainMenu() {
  const items = [
    ['New Game', showClassSelect],
    ['Continue Game', showContinue],
    ['Settings', showSettings],
    ['Help', showHelpStub],
    ['Credits', showCreditsStub],
  ];
  render(`
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h1 style="margin-bottom:0;border-bottom:none">Main Menu</h1>
      <button class="icon-btn" id="mute-toggle">${isMuted() ? '\ud83d\udd07' : '\ud83d\udd0a'}</button>
    </div>
    <div style="border-bottom:1px solid #4a3c28;margin-bottom:14px"></div>
    <ul class="menu-list" id="menu"></ul>
  `);
  document.getElementById('mute-toggle').addEventListener('click', (e) => {
    setMuted(!isMuted());
    e.target.textContent = isMuted() ? '\ud83d\udd07' : '\ud83d\udd0a';
    if (!isMuted()) sfx.click();
  });
  const list = document.getElementById('menu');
  items.forEach(([label, handler]) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', () => { sfx.click(); handler(); });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function showSettings() {
  const current = loadDifficulty();
  const options = [
    ['easy', 'Easy', 'Monsters hit noticeably softer.'],
    ['normal', 'Normal', 'Matches the original game\u2019s numbers exactly.'],
    ['hard', 'Hard', 'Monsters hit noticeably harder.'],
  ];
  render(`
    <h1>Settings</h1>
    <p class="sub" style="opacity:.65">Difficulty isn't part of the original game \u2014 added for this port. It only scales monster damage dealt to you; everything else stays the same.</p>
    <div id="diff-options"></div>
    <div class="btn-row"><button class="btn secondary" id="back">Back</button></div>
  `);
  const wrap = document.getElementById('diff-options');
  options.forEach(([value, label, desc]) => {
    const card = document.createElement('div');
    card.className = 'class-card' + (value === current ? ' selected' : '');
    card.style.cursor = 'pointer';
    card.innerHTML = `<h3>${label}</h3><div class="stats"><span>${desc}</span></div>`;
    card.addEventListener('click', () => {
      saveDifficulty(value);
      sfx.click();
      showSettings();
    });
    wrap.appendChild(card);
  });
  document.getElementById('back').addEventListener('click', showMainMenu);
}

function showContinue() {
  if (!hasSavedGame()) {
    render(`
      <h1>Unavailable</h1>
      <p class="sub">No game is available for loading.</p>
      <div class="btn-row"><button class="btn" id="back">Back to Main Menu</button></div>
    `);
    document.getElementById('back').addEventListener('click', showMainMenu);
    return;
  }
  const c = loadCharacter();
  const progress = loadProgress();
  const resumeLabel = progress
    ? (progress.scene === 'camp' ? 'Resume in Dawnstar' : `Resume in ${progress.dungeonTitle || 'Dungeon ' + progress.dungeonIndex}`)
    : null;
  render(`
    <h1>Continue Game</h1>
    <p class="sub">${c.name}, the ${c.className} &mdash; ${c.gold || 0} gold</p>
    <div class="btn-row" style="flex-direction:column;align-items:stretch">
      ${resumeLabel ? `<button class="btn" id="resume">${resumeLabel}</button>` : ''}
      <button class="btn ${resumeLabel ? 'secondary' : ''}" id="enter">Enter Dawnstar${resumeLabel ? ' (fresh)' : ''}</button>
      <button class="btn secondary" id="travel">Browse All Dungeons</button>
      <button class="btn secondary" id="inventory">Inventory</button>
      <button class="btn secondary" id="back">Back to Main Menu</button>
    </div>
  `);
  document.getElementById('back').addEventListener('click', showMainMenu);
  document.getElementById('enter').addEventListener('click', () => enterCamp());
  document.getElementById('travel').addEventListener('click', () => showDungeonSelect());
  document.getElementById('inventory').addEventListener('click', () => showInventory(showContinue));
  if (resumeLabel) {
    document.getElementById('resume').addEventListener('click', async () => {
      await ensureLivePlayer();
      if (progress.player) Object.assign(livePlayer, progress.player);
      if (progress.scene === 'camp') {
        enterCamp(progress);
      } else {
        enterDungeon(progress.dungeonIndex, progress.dungeonTitle || `Dungeon ${progress.dungeonIndex}`, progress);
      }
    });
  }
}

// In-game Options menu, styled to match the original's actual UI (a
// screenshot of the real "Options" screen was used as the reference:
// black header, copper body, bold yellow items, gray selected-row
// highlight, black Back/Select footer). Reuses the same unmount/remount
// pattern already proven safe by the view-toggle feature — render()
// already cleans up the dungeon view's keyboard listener, and
// mountDungeon() restores the exact same position when we return.
function showOptionsMenu() {
  const optionItems = [
    ['Stats', () => showStats(showOptionsMenu)],
    ['Inventory', () => showInventory(showOptionsMenu)],
    ['Skills', () => showSkills(showOptionsMenu)],
    ['Spells', () => showSpellsList(showOptionsMenu)],
    ['Save Game', () => saveGameAction()],
    ['Load Game', () => loadGameAction()],
    ['Help', () => showHelpStub(showOptionsMenu)],
    ['Quit Game', () => quitGameAction()],
  ];
  render(`
    <div class="og-menu">
      <div class="og-menu-header">Options</div>
      <div class="og-menu-body" id="og-body"></div>
      <div class="og-menu-footer">
        <button id="og-back">Back</button>
        <span>Select</span>
      </div>
    </div>
  `);
  const body = document.getElementById('og-body');
  optionItems.forEach(([label, handler], i) => {
    const btn = document.createElement('button');
    btn.className = 'og-menu-item' + (i === 1 ? ' selected' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { sfx.click(); handler(); });
    body.appendChild(btn);
  });
  document.getElementById('og-back').addEventListener('click', () => { sfx.click(); mountDungeon(); });
}

async function showStats(backTo) {
  const data = await loadCharData();
  const c = loadCharacter();
  const row = data.classStats[c.classIndex];
  const attrs = [['STR', row[2]], ['INT', row[3]], ['WIL', row[4]], ['AGI', row[5]], ['SPD', row[6]], ['END', row[7]], ['PER', row[8]], ['LUC', row[9]]];
  render(`
    <div class="og-menu">
      <div class="og-menu-header">Stats</div>
      <div class="og-menu-body"><div class="og-content">
        <h2>${livePlayer.name}, the ${livePlayer.className}</h2>
        <div class="og-stat-row"><span>Level</span><span>${livePlayer.level}</span></div>
        <div class="og-stat-row"><span>Health</span><span>${livePlayer.hp} / ${livePlayer.maxHp}</span></div>
        <div class="og-stat-row"><span>Magicka</span><span>${livePlayer.magicka} / ${livePlayer.maxMagicka}</span></div>
        <div class="og-stat-row"><span>Fatigue</span><span>${Math.round(livePlayer.fatigue)} / ${livePlayer.maxFatigue}</span></div>
        <div class="og-stat-row"><span>Gold</span><span>${c.gold || 0}</span></div>
        ${attrs.map(([n, v]) => `<div class="og-stat-row"><span>${n}</span><span>${v}</span></div>`).join('')}
      </div></div>
      <div class="og-menu-footer"><button id="og-back">Back</button><span></span></div>
    </div>
  `);
  document.getElementById('og-back').addEventListener('click', () => { sfx.click(); backTo(); });
}

async function showSkills(backTo) {
  const data = await loadCharData();
  render(`
    <div class="og-menu">
      <div class="og-menu-header">Skills</div>
      <div class="og-menu-body"><div class="og-content">
        ${data.skillNames.map((name, i) => {
          const pair = livePlayer.skillPairs[i] || [0, 0];
          return `<div class="og-stat-row"><span>${name}</span><span>${pair[0]} / ${pair[1]}</span></div>`;
        }).join('')}
      </div></div>
      <div class="og-menu-footer"><button id="og-back">Back</button><span></span></div>
    </div>
  `);
  document.getElementById('og-back').addEventListener('click', () => { sfx.click(); backTo(); });
}

async function showSpellsList(backTo) {
  const spells = await loadSpellData();
  const known = livePlayer.knownSpellIds.map((id) => spells[id - 1]);
  render(`
    <div class="og-menu">
      <div class="og-menu-header">Spells</div>
      <div class="og-menu-body"><div class="og-content">
        ${known.length ? known.map((sp) => `
          <div style="margin-bottom:10px">
            <div class="og-stat-row"><span><strong>${sp.name}</strong></span><span>${sp.e} MP</span></div>
            <div style="font-size:.85em;opacity:.8">${sp.description}</div>
          </div>
        `).join('') : '<p>No spells known.</p>'}
      </div></div>
      <div class="og-menu-footer"><button id="og-back">Back</button><span></span></div>
    </div>
  `);
  document.getElementById('og-back').addEventListener('click', () => { sfx.click(); backTo(); });
}

function saveGameAction() {
  persistProgress();
  sfx.gold();
  render(`
    <div class="og-menu">
      <div class="og-menu-header">Save Game</div>
      <div class="og-menu-body"><div class="og-content"><p>Game saved.</p></div></div>
      <div class="og-menu-footer"><button id="og-back">Back</button><span></span></div>
    </div>
  `);
  document.getElementById('og-back').addEventListener('click', () => { sfx.click(); showOptionsMenu(); });
}

function loadGameAction() {
  const progress = loadProgress();
  render(`
    <div class="og-menu">
      <div class="og-menu-header">Load Game</div>
      <div class="og-menu-body"><div class="og-content">
        <p>${progress ? 'Reload your last save? Anything since then in this session will be lost.' : 'No saved game found.'}</p>
      </div></div>
      <div class="og-menu-footer"><button id="og-back">Back</button>${progress ? '<button id="og-confirm">Load</button>' : '<span></span>'}</div>
    </div>
  `);
  document.getElementById('og-back').addEventListener('click', () => { sfx.click(); showOptionsMenu(); });
  const confirmBtn = document.getElementById('og-confirm');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    sfx.door();
    await ensureLivePlayer();
    if (progress.player) Object.assign(livePlayer, progress.player);
    if (progress.scene === 'camp') enterCamp(progress);
    else enterDungeon(progress.dungeonIndex, progress.dungeonTitle || `Dungeon ${progress.dungeonIndex}`, progress);
  });
}

function quitGameAction() {
  render(`
    <div class="og-menu">
      <div class="og-menu-header">Quit Game</div>
      <div class="og-menu-body"><div class="og-content"><p>Return to the main menu? Your progress is already saved.</p></div></div>
      <div class="og-menu-footer"><button id="og-back">Back</button><button id="og-confirm">Quit</button></div>
    </div>
  `);
  document.getElementById('og-back').addEventListener('click', () => { sfx.click(); showOptionsMenu(); });
  document.getElementById('og-confirm').addEventListener('click', () => {
    sfx.click();
    persistProgress();
    currentDungeon = null;
    showMainMenu();
  });
}

async function showInventory(backTo) {
  const items = await loadItemData();
  const c = loadCharacter();
  const equipped = c.equipped || [null, null, null, null, null, null, null];
  const equipRows = SLOT_NAMES.slice(0, 6).map((label, slot) => {
    const idx = equipped[slot];
    return `<div><strong>${label}:</strong> ${idx != null ? itemName(items, idx) : '(empty)'}</div>`;
  }).join('');
  const invRows = (c.inventory || []).length
    ? c.inventory.map((it) => `<div>${it.name}</div>`).join('')
    : '<div style="opacity:.6">Nothing carried yet.</div>';
  render(`
    <h1>Inventory</h1>
    <div class="sub">
      <div style="margin-bottom:12px"><strong>${c.gold || 0} gold</strong></div>
      <strong>Equipped</strong>
      ${equipRows}
      <div style="margin-top:12px"><strong>Carried</strong></div>
      ${invRows}
    </div>
    <div class="btn-row"><button class="btn secondary" id="back">Back</button></div>
  `);
  document.getElementById('back').addEventListener('click', () => backTo());
}

async function showHelpStub(backTo) {
  backTo = backTo || showMainMenu;
  const sections = await loadHelpSections();
  render(`
    <h1>Help</h1>
    <ul class="menu-list" id="menu"></ul>
    <div class="btn-row"><button class="btn secondary" id="back">Back</button></div>
  `);
  const list = document.getElementById('menu');
  sections.forEach((s) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = s.title;
    btn.addEventListener('click', () => showHelpSection(s, backTo));
    li.appendChild(btn);
    list.appendChild(li);
  });
  document.getElementById('back').addEventListener('click', backTo);
}

function showHelpSection(section, backTo) {
  render(`
    <h1>${section.title}</h1>
    <p class="sub">${section.body}</p>
    <div class="btn-row"><button class="btn secondary" id="back">Back</button></div>
  `);
  document.getElementById('back').addEventListener('click', () => showHelpStub(backTo));
}

function showCreditsStub() {
  render(`
    <h1>Credits</h1>
    <p class="sub">The Elder Scrolls Travels: Dawnstar &mdash; original by mob.ua / milaro. Browser port in progress.</p>
    <div class="btn-row"><button class="btn secondary" id="back">Back</button></div>
  `);
  document.getElementById('back').addEventListener('click', showMainMenu);
}

async function showClassSelect() {
  const data = await loadCharData();
  const names = data.classNames;
  render(`
    <h1>New Game</h1>
    <p class="sub">Select a Class:</p>
    <div id="classes"></div>
    <div class="btn-row">
      <button class="btn secondary" id="back">Back</button>
      <button class="btn" id="next">Continue</button>
    </div>
  `);
  const wrap = document.getElementById('classes');
  names.forEach((name, idx) => {
    const stats = CLASS_STATS[name];
    const core = computeCoreStats(data.classStats[idx]);
    const card = document.createElement('div');
    card.className = 'class-card' + (idx === state.selectedClassIndex ? ' selected' : '');
    card.innerHTML = `
      <h3>${name} <span style="opacity:.6;font-weight:normal">(${stats.race})</span></h3>
      <div class="stats">
        <span>Health ${core.health}</span>
        <span>Magicka ${core.magicka}</span>
        <span>Fatigue ${core.fatigue}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      state.selectedClassIndex = idx;
      showClassSelect();
    });
    wrap.appendChild(card);
  });
  document.getElementById('back').addEventListener('click', showMainMenu);
  document.getElementById('next').addEventListener('click', showCharacterMain);
}

async function showCharacterMain() {
  const data = await loadCharData();
  const name = data.classNames[state.selectedClassIndex];
  render(`
    <h1>Character</h1>
    <p class="sub">You selected: <strong>${name}</strong></p>
    <div class="btn-row" style="flex-direction:column;align-items:stretch">
      <button class="btn secondary" id="info">See Class Info</button>
      <button class="btn" id="create">Create Character</button>
    </div>
  `);
  document.getElementById('info').addEventListener('click', showClassInfo);
  document.getElementById('create').addEventListener('click', showNameEntry);
}

async function showClassInfo() {
  const data = await loadCharData();
  const idx = state.selectedClassIndex;
  const name = data.classNames[idx];
  const stats = CLASS_STATS[name];
  const core = computeCoreStats(data.classStats[idx]);
  const skills = CLASS_SKILLS[name];
  const attrRow = ['str', 'int', 'wil', 'agi', 'spd', 'end', 'per', 'luc']
    .map((k) => `<span>${k.toUpperCase()} ${stats[k]}</span>`).join(' ');
  const skillRows = Object.entries(skills).map(([k, v]) => `<div>${k}: ${v}</div>`).join('');
  render(`
    <h1>${name}</h1>
    <div class="sub">
      <div><strong>Race:</strong> ${stats.race}</div>
      <div><strong>Health:</strong> ${core.health} &nbsp; <strong>Magicka:</strong> ${core.magicka} &nbsp; <strong>Fatigue:</strong> ${core.fatigue}</div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;opacity:.85">${attrRow}</div>
      <div style="margin-top:12px"><strong>Starting Skills</strong>${skillRows}</div>
      <div style="margin-top:12px"><strong>Starting Gear:</strong> ${stats.armor}, ${stats.weapon}</div>
      ${stats.spells.length ? `<div><strong>Starting Spells:</strong> ${stats.spells.join(', ')}</div>` : ''}
    </div>
    <div class="btn-row"><button class="btn secondary" id="back">Back</button></div>
  `);
  document.getElementById('back').addEventListener('click', showCharacterMain);
}

function showNameEntry() {
  render(`
    <h1>Enter name</h1>
    <p class="sub">Enter a name for your character</p>
    <div class="field">
      <input type="text" id="name" maxlength="10" autofocus>
    </div>
    <div class="error" id="err"></div>
    <div class="btn-row">
      <button class="btn secondary" id="back">Back</button>
      <button class="btn" id="ok">OK</button>
    </div>
  `);
  const input = document.getElementById('name');
  const err = document.getElementById('err');
  const confirm = async () => {
    const val = input.value.trim();
    if (val.length < 3) {
      err.textContent = "Your character name must be at least 3 letters";
      return;
    }
    const data = await loadCharData();
    const className = data.classNames[state.selectedClassIndex];
    saveCharacter({ name: val, className, classIndex: state.selectedClassIndex, gold: 100, inventory: [] });
    clearProgress(); // fresh character shouldn't inherit a previous one's in-dungeon state
    questState = newQuestState(); // fresh traitor mystery per playthrough
    saveQuestState(questState);
    currentDungeon = null;
    await grantStartingGear(className);
    await initLivePlayer(val, className, state.selectedClassIndex);
    showCharacterCreated(val, className);
  };
  document.getElementById('ok').addEventListener('click', confirm);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirm(); });
  document.getElementById('back').addEventListener('click', showCharacterMain);
}

function showCharacterCreated(name, className) {
  const stats = CLASS_STATS[className];
  render(`
    <h1>Character Created!</h1>
    <p class="sub">${name} the ${className} of ${stats.race} awaits Dawnstar,
    armed with a ${stats.weapon} and ${stats.armor}${stats.spells.length ? `, knowing ${stats.spells.join(', ')}` : ''}.</p>
    <div class="btn-row" style="flex-direction:column;align-items:stretch">
      <button class="btn" id="enter">Enter Dawnstar</button>
      <button class="btn secondary" id="menu">Back to Main Menu</button>
    </div>
  `);
  document.getElementById('menu').addEventListener('click', showMainMenu);
  document.getElementById('enter').addEventListener('click', () => enterCamp());
}

async function grantStartingGear(className) {
  const items = await loadItemData();
  const stats = CLASS_STATS[className];
  for (const gearName of [stats.weapon, stats.armor]) {
    const idx = items.names.indexOf(gearName);
    if (idx === -1) continue; // flavor name didn't match an itemsin.json entry — skip rather than guess
    addItemToInventory(idx, gearName);
    if (isEquippable(items, idx)) autoEquip(idx, equipSlot(items, idx));
  }
}

async function initLivePlayer(name, className, classIndex) {
  const data = await loadCharData();
  const row = data.classStats[classIndex];
  const core = computeCoreStats(row);
  const skillPairs = skillPairsFromRow(row);
  const spells = await loadSpellData();
  const knownSpellNames = CLASS_STATS[className].spells;
  const knownSpellIds = knownSpellNames
    .map((n) => spells.findIndex((s) => s.name === n) + 1)
    .filter((id) => id > 0);
  livePlayer = {
    name, className, hp: core.health, maxHp: core.health,
    magicka: core.magicka, maxMagicka: core.magicka,
    fatigue: core.fatigue, maxFatigue: core.fatigue,
    level: 1, levelXp: 0,
    spellDurations: new Array(25).fill(0),
    skillPairs, knownSpellIds,
  };
}

async function ensureLivePlayer() {
  if (livePlayer) return livePlayer;
  const c = loadCharacter();
  if (!c) return null;
  await initLivePlayer(c.name, c.className, c.classIndex);
  return livePlayer;
}

let viewMode = 'fp'; // 'fp' = first-person (default), 'map' = top-down fallback
let currentScene = 'dungeon'; // 'camp' | 'dungeon'
let campDungeon = null;

function enterCamp(progressToApply) {
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  currentScene = 'camp';
  currentDungeonTitle = 'Dawnstar';
  const mount = async () => {
    await ensureLivePlayer();
    if (!campDungeon) {
      const geom = await loadGeomData();
      campDungeon = campAsDungeonShape(geom[0].slice(0, 4));
    }
    currentDungeon = campDungeon;
    if (progressToApply) applyProgress(currentDungeon, progressToApply);
    mountDungeon();
  };
  mount();
}

function enterDungeon(index, title, progressToApply) {
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  currentScene = 'dungeon';
  currentDungeonTitle = title;
  const mount = async () => {
    await ensureLivePlayer();
    const [monsters, items] = await Promise.all([loadMonsterData(), loadItemData()]);
    if (!currentDungeon || currentDungeon.index !== index) {
      currentDungeon = generateDungeon(index, monsters, items.names.map((n, i) => ({ name: n, index: i })));
    }
    if (progressToApply) applyProgress(currentDungeon, progressToApply);
    mountDungeon();
  };
  mount();
}

function applyProgress(dungeon, progress) {
  if (!progress) return;
  for (const m of dungeon.monsters || []) {
    if (progress.deadMonsterIds && progress.deadMonsterIds.includes(m.id)) { m.alive = false; m.hp = 0; }
  }
  for (const c of dungeon.chests || []) {
    if (progress.openedChestIds && progress.openedChestIds.includes(c.id)) c.opened = true;
  }
  if (progress.playerPos) {
    dungeon.playerPos = { x: progress.playerPos.x, y: progress.playerPos.y };
    dungeon.playerPos3d = { x: progress.playerPos.x, y: progress.playerPos.y, facing: progress.playerPos.facing || 1 };
  }
}

function tickPlayerSpellEffects() {
  if (!livePlayer) return;
  const expired = tickSpellDurations(livePlayer);
  if (expired.includes(6)) {
    // Daedric Weapon expired — real behavior: unequip the conjured
    // weapon if it's still equipped (canvas.py: "if i == 5: remove
    // equipped item 101").
    const c = loadCharacter();
    if (c && c.equipped && c.equipped[0] === DAEDRIC_WEAPON_ITEM_INDEX) {
      c.equipped[0] = null;
      saveCharacter(c);
    }
  }
}

function persistProgress() {
  if (!livePlayer || !currentDungeon) return;
  const pos = currentDungeon.playerPos3d || currentDungeon.playerPos || currentDungeon.start;
  saveProgress({
    scene: currentScene,
    dungeonIndex: currentDungeon.index,
    dungeonTitle: currentDungeonTitle,
    playerPos: { x: pos.x, y: pos.y, facing: pos.facing || 1 },
    deadMonsterIds: (currentDungeon.monsters || []).filter((m) => !m.alive).map((m) => m.id),
    openedChestIds: (currentDungeon.chests || []).filter((c) => c.opened).map((c) => c.id),
    player: {
      hp: livePlayer.hp, maxHp: livePlayer.maxHp,
      magicka: livePlayer.magicka, maxMagicka: livePlayer.maxMagicka,
      fatigue: livePlayer.fatigue, maxFatigue: livePlayer.maxFatigue,
      level: livePlayer.level, levelXp: livePlayer.levelXp,
      skillPairs: livePlayer.skillPairs,
      spellDurations: livePlayer.spellDurations,
    },
  });
}

function mountDungeon() {
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  const opts = {
    title: currentDungeonTitle,
    player: livePlayer,
    onExit: () => {
      sfx.door();
      if (currentScene === 'dungeon') { enterCamp(); return; }
      render(`
        <h1>Exit reached</h1>
        <p class="sub">You found the way out of ${currentDungeonTitle}.</p>
        <div class="btn-row"><button class="btn secondary" id="menu">Back to Main Menu</button></div>
      `);
      document.getElementById('menu').addEventListener('click', showMainMenu);
    },
    onPortal: (gate) => {
      sfx.door();
      if (gate && gate.targetId) {
        enterDungeon(gate.targetId, `Dungeon ${gate.targetId}`);
      } else {
        showDungeonSelect();
      }
    },
    onMonster: (monster) => showCombat(monster),
    onChest: (chest) => showChest(chest),
    onNpc: (npc) => {
      if (npc.type === 'eustacia') showEustacia(npc);
      else if (npc.type === 'champion') showChampion(npc);
      else showShop(npc);
    },
    onMove: () => { tickPlayerSpellEffects(); persistProgress(); },
    onOptions: () => showOptionsMenu(),
    onLeave: () => currentScene === 'camp' ? showMainMenu() : enterCamp(),
  };
  const mountFn = viewMode === 'fp' ? mountFirstPersonView : mountDungeonView;
  const result = mountFn(app, currentDungeon, opts);
  Promise.resolve(result).then((cleanup) => {
    activeCleanup = cleanup;
    const btn = document.getElementById('view-toggle');
    if (btn) btn.addEventListener('click', toggleViewMode);
    persistProgress();
  });
}

function showDungeonSelect() {
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  // Real zones span dungeon IDs 2-37 (36 dungeons); our own index 1 is an
  // extra bonus dungeon not part of the real gate-linked structure (see
  // PORT_NOTES.md) — kept selectable here too, just not zone-chained.
  const TOTAL_DUNGEONS = 37;
  const buttons = Array.from({ length: TOTAL_DUNGEONS }, (_, i) => i + 1)
    .map((n) => `<button class="btn secondary" data-dungeon="${n}" style="padding:8px">${n}</button>`)
    .join('');
  render(`
    <h1>Choose a Dungeon</h1>
    <p class="sub" style="opacity:.65">Camp's 4 gates now lead to their real linked dungeons \u2014 this is a free-roam shortcut to any of the 36 if you want to skip the walk.</p>
    <div class="btn-row"><button class="btn" id="random">Random Dungeon</button></div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:14px 0">${buttons}</div>
    <div class="btn-row"><button class="btn secondary" id="back">Back to Camp</button></div>
  `);
  document.getElementById('back').addEventListener('click', () => enterCamp());
  document.getElementById('random').addEventListener('click', () => {
    const n = 1 + Math.floor(Math.random() * TOTAL_DUNGEONS);
    enterDungeon(n, `Dungeon ${n}`);
  });
  document.querySelectorAll('[data-dungeon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = Number(btn.dataset.dungeon);
      enterDungeon(n, `Dungeon ${n}`);
    });
  });
}

function toggleViewMode() {
  // sync position between the two views' separate trackers
  if (currentDungeon) {
    if (viewMode === 'fp' && currentDungeon.playerPos3d) {
      currentDungeon.playerPos = { x: currentDungeon.playerPos3d.x, y: currentDungeon.playerPos3d.y };
    } else if (viewMode === 'map' && currentDungeon.playerPos) {
      currentDungeon.playerPos3d = { ...currentDungeon.playerPos, facing: (currentDungeon.playerPos3d && currentDungeon.playerPos3d.facing) || 1 };
    }
  }
  viewMode = viewMode === 'fp' ? 'map' : 'fp';
  mountDungeon();
}

async function drawCombatMonster(monster) {
  const canvas = document.getElementById('combat-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#151210';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!monster.typeIdx) return;
  const monsterO = await loadMonsterSprites();
  // Canvas matches the dungeon view's native 180x176 proportions so the
  // AD_TABLE anchor coordinates (tuned for that size) render at their
  // real extent with no cropping guesswork.
  drawLayeredMonster(ctx, monsterO, monster.typeIdx);
}

async function showCombat(monster) {
  await ensureLivePlayer();
  const items = await loadItemData();
  const monsterData = await loadMonsterData();
  const spells = await loadSpellData();
  const character = loadCharacter();
  const equipped = (character && character.equipped) || [null, null, null, null, null, null, null];
  const monsterAttrs = (monsterData[monster.typeIdx - 1] && monsterData[monster.typeIdx - 1].stats) || new Array(17).fill(5);

  const spellButtons = livePlayer.knownSpellIds.map((id) => {
    const sp = spells[id - 1];
    const affordable = livePlayer.magicka >= sp.e;
    return `<button class="btn secondary" data-spell-id="${id}" ${affordable ? '' : 'disabled'}>${sp.name} (${sp.e} MP)</button>`;
  }).join('');

  render(`
    <h1>${monster.name}</h1>
    <canvas id="combat-canvas" width="180" height="176" style="display:block;margin:0 auto;max-width:280px;width:100%;height:auto;background:#151210;border:1px solid #4a3c28;image-rendering:pixelated;"></canvas>
    <div class="sub">
      <div>${livePlayer.name} (Lv.${livePlayer.level}): ${livePlayer.hp} / ${livePlayer.maxHp} HP &nbsp; ${livePlayer.maxMagicka ? `${livePlayer.magicka} / ${livePlayer.maxMagicka} MP` : ''}</div>
      <div>${monster.name}: ${monster.hp} / ${monster.maxHp} HP</div>
    </div>
    <div class="error" id="log"></div>
    <div class="btn-row">
      <button class="btn secondary" id="flee">Flee</button>
      <button class="btn" id="attack">Attack</button>
    </div>
    ${spellButtons ? `<div class="btn-row" id="spell-row" style="flex-wrap:wrap">${spellButtons}</div>` : ''}
  `);
  drawCombatMonster(monster);
  const log = document.getElementById('log');
  const refresh = () => {
    document.querySelector('.sub').innerHTML = `
      <div>${livePlayer.name} (Lv.${livePlayer.level}): ${livePlayer.hp} / ${livePlayer.maxHp} HP &nbsp; ${livePlayer.maxMagicka ? `${livePlayer.magicka} / ${livePlayer.maxMagicka} MP` : ''}</div>
      <div>${monster.name}: ${monster.hp} / ${monster.maxHp} HP</div>
    `;
  };

  function afterPlayerAction(msg, progress) {
    if (progress && progress.charLeveledUp) { msg += ` ${livePlayer.name} reached Level ${livePlayer.level}!`; sfx.levelUp(); }
    else if (progress && progress.skillLeveledUp) msg += ' (Skill improved!)';
    if (monster.hp <= 0) {
      monster.alive = false;
      log.textContent = msg + ` ${monster.name} is defeated!`;
      refresh();
      sfx.victory();
      persistProgress();
      setTimeout(() => mountDungeon(), 900);
      return;
    }
    if (monster.paralyzedTurns > 0) {
      monster.paralyzedTurns--;
      msg += ` ${monster.name} is paralyzed and can't act!`;
    } else {
      const counter = monsterAttack(monster, livePlayer, items, equipped, livePlayer.skillPairs, monsterAttrs, difficultyMultiplier(loadDifficulty()));
      msg += counter.hit ? ` ${monster.name} hits back for ${counter.damage}.` : ` ${monster.name} missed.`;
      if (counter.hit) sfx.hit();
    }
    log.textContent = msg;
    refresh();
    persistProgress();
    if (livePlayer.hp <= 0) { sfx.defeat(); showGameOver(); }
  }

  document.getElementById('flee').addEventListener('click', () => mountDungeon());
  document.getElementById('attack').addEventListener('click', () => {
    const result = playerAttack(livePlayer, monster, items, equipped, livePlayer.skillPairs, monsterAttrs);
    const msg = result.hit ? `You hit ${monster.name} for ${result.damage}.` : `You missed ${monster.name}.`;
    result.hit ? sfx.hit() : sfx.miss();
    afterPlayerAction(msg, result);
  });
  document.querySelectorAll('[data-spell-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.spellId);
      const sp = spells[id - 1];
      let msg;
      let r;
      if (id === 11) { // Damage
        r = castDamage(livePlayer, monster, monsterAttrs, livePlayer.skillPairs, sp);
        msg = r.hit ? `${sp.name} strikes ${monster.name} for ${r.damage}.` : `${sp.name} fizzles.`;
        sfx.cast();
      } else if (id === 21) { // Heal Wound
        r = castHeal(livePlayer, livePlayer.skillPairs, sp);
        msg = r.healed > 0 ? `${sp.name} restores ${r.healed} HP.` : `${sp.name} fizzles.`;
        sfx.heal();
      } else if (id === 16) { // Paralyze
        r = castParalyze(livePlayer, monster, monsterAttrs, livePlayer.skillPairs, sp);
        msg = r.turns > 0 ? `${monster.name} is paralyzed!` : `${sp.name} fizzles.`;
        if (r.turns > 0) sfx.paralyze(); else sfx.cast();
      } else if (id === 1) { // Frenzy — real duration-ticked buff now
        r = castFrenzy(livePlayer, livePlayer.skillPairs, sp);
        msg = r.buffed ? `${sp.name} takes hold.` : `${sp.name} fizzles.`;
        sfx.cast();
      } else if (id === 6) { // Daedric Weapon — real conjure + duration
        r = castDaedricWeapon(livePlayer, livePlayer.skillPairs, sp);
        if (r.grantItem) {
          const c = loadCharacter();
          addItemToInventory(DAEDRIC_WEAPON_ITEM_INDEX, items.names[DAEDRIC_WEAPON_ITEM_INDEX]);
          autoEquip(DAEDRIC_WEAPON_ITEM_INDEX, equipSlot(items, DAEDRIC_WEAPON_ITEM_INDEX));
          msg = `${sp.name} conjures a blade into your hand.`;
        } else {
          msg = `${sp.name} fizzles.`;
        }
        sfx.cast();
      }
      afterPlayerAction(msg, r);
    });
  });
}

async function showGameOver() {
  // Real mechanic, confirmed on https://en.uesp.net/wiki/Dawnstar:Getting_Started:
  // "monsters and thieves have looted your dead body for every unequipped
  // item in your inventory, Gift Items excluded... unless they were
  // equipped when you died." Equipped gear is untouched (separate array);
  // among carried-but-unequipped items, only Gift Items (typeGroup 11)
  // survive.
  const items = await loadItemData();
  const c = loadCharacter();
  let lostCount = 0;
  if (c) {
    const kept = (c.inventory || []).filter((it) => {
      const isGift = items.typeGroup[it.index] === 11;
      if (!isGift) lostCount++;
      return isGift;
    });
    c.inventory = kept;
    saveCharacter(c);
  }
  render(`
    <h1>You have fallen</h1>
    <p class="sub">A scout found you, but not before someone picked over your corpse. At least you are healthy now.</p>
    ${lostCount > 0 ? `<p class="sub" style="opacity:.75">You lost ${lostCount} unequipped item${lostCount === 1 ? '' : 's'} to looters. Equipped gear and Gift Items were safe.</p>` : ''}
    <div class="btn-row"><button class="btn" id="menu">Continue</button></div>
  `);
  document.getElementById('menu').addEventListener('click', () => {
    livePlayer.hp = livePlayer.maxHp;
    if (livePlayer.maxMagicka) livePlayer.magicka = livePlayer.maxMagicka;
    if (livePlayer.maxFatigue) livePlayer.fatigue = livePlayer.maxFatigue;
    currentDungeon = null; // regenerate fresh on next entry
    clearProgress(); // resuming into "just defeated" wouldn't make sense
    enterCamp(); // you wake up in front of Eustacia in Dawnstar, not the main menu
  });
}

async function showChest(chest) {
  const items = await loadItemData();
  const idx = chest.itemIndex;
  const name = items.names[idx];
  const value = items.value[idx] || 0;
  chest.opened = true;
  addItemToInventory(idx, name);
  addGold(value);
  sfx.chest();
  if (value) setTimeout(() => sfx.gold(), 120);
  persistProgress();
  let equipMsg = '';
  if (isEquippable(items, idx)) {
    const slot = equipSlot(items, idx);
    autoEquip(idx, slot);
    equipMsg = ` Equipped to ${SLOT_NAMES[slot]}.`;
  }
  render(`
    <h1>Chest</h1>
    <p class="sub">You found <strong>${name}</strong>${value ? ` (worth ${value} gold)` : ''}.${equipMsg}</p>
    <div class="btn-row"><button class="btn" id="continue">Continue</button></div>
  `);
  document.getElementById('continue').addEventListener('click', () => mountDungeon());
}

async function showShop(npc) {
  const items = await loadItemData();
  const npcStrings = await loadNpcStrings();
  const character = loadCharacter();
  const lines = npcStrings[npc.dialogueGroup] || [];
  const [greeting, insufficientMsg, successMsg] = lines;

  function render_(message) {
    const c = loadCharacter();
    const wareRows = npc.wares.map((itemId) => {
      const idx = itemId - 1; // wares use 1-based item ids, matching the reference
      const name = items.names[idx];
      const price = items.value[idx] || 0;
      const afford = (c.gold || 0) >= price;
      return `<div class="class-card" style="display:flex;justify-content:space-between;align-items:center">
        <span>${name} <span style="opacity:.6">(${price}g)</span></span>
        <button class="btn secondary" data-buy="${idx}" data-price="${price}" ${afford ? '' : 'disabled'}>Buy</button>
      </div>`;
    }).join('');
    render(`
      <h1>${npc.name}</h1>
      <p class="sub" style="font-style:italic">"${greeting || ''}"</p>
      <p class="sub">${c.gold || 0} gold</p>
      <div id="wares">${wareRows}</div>
      <div class="error" id="shop-log">${message || ''}</div>
      <div class="btn-row"><button class="btn secondary" id="leave">Leave</button></div>
    `);
    document.getElementById('leave').addEventListener('click', () => mountDungeon());
    document.querySelectorAll('[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.buy);
        const price = Number(btn.dataset.price);
        const cc = loadCharacter();
        if ((cc.gold || 0) < price) {
          render_(insufficientMsg || "You can't afford that.");
          return;
        }
        addGold(-price);
        addItemToInventory(idx, items.names[idx]);
        if (isEquippable(items, idx)) autoEquip(idx, equipSlot(items, idx));
        sfx.gold();
        render_(successMsg || 'Purchased.');
      });
    });
  }
  render_();
}

async function showEustacia(npc) {
  const npcStrings = await loadNpcStrings();
  const greeting = (npcStrings[npc.dialogueGroup] || [])[0] || 'Welcome, traveler.';
  const quest = ensureQuestState();
  quest.metEustacia = true;
  persistQuestState();

  function render_(message) {
    const cluesHtml = quest.cluesCollected.length
      ? quest.cluesCollected.map((c) => `<div class="class-card"><strong>${CHAMPION_NAMES[c.championIdx]}:</strong> ${c.text}</div>`).join('')
      : '<div style="opacity:.6">No clues gathered yet. Speak with the champions.</div>';
    const accuseButtons = CHAMPION_NAMES.map((name, i) =>
      `<button class="btn secondary" data-accuse="${i}" style="margin:2px">${name}</button>`).join('');
    render(`
      <h1>Eustacia</h1>
      <p class="sub" style="font-style:italic">"${greeting}"</p>
      ${message ? `<p class="error">${message}</p>` : ''}
      <div class="btn-row"><button class="btn" id="heal">Rest &amp; Heal (free)</button></div>
      <div style="margin-top:12px"><strong>Clues gathered</strong></div>
      ${cluesHtml}
      <div style="margin-top:12px"><strong>Accuse the traitor</strong></div>
      <div class="btn-row" style="flex-wrap:wrap">${accuseButtons}</div>
      <div class="btn-row"><button class="btn secondary" id="leave">Leave</button></div>
    `);
    document.getElementById('leave').addEventListener('click', () => mountDungeon());
    document.getElementById('heal').addEventListener('click', () => {
      livePlayer.hp = livePlayer.maxHp;
      if (livePlayer.maxMagicka) livePlayer.magicka = livePlayer.maxMagicka;
      if (livePlayer.maxFatigue) livePlayer.fatigue = livePlayer.maxFatigue;
      sfx.heal();
      render_('You feel fully restored.');
    });
    document.querySelectorAll('[data-accuse]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.accuse);
        const correct = accuseTraitor(quest, idx);
        persistQuestState();
        showAccusationResult(idx, correct);
      });
    });
  }
  render_();
}

function showAccusationResult(accusedIdx, correct) {
  render(`
    <h1>${correct ? 'The Traitor Revealed!' : 'A Grave Mistake'}</h1>
    <p class="sub">${correct
      ? `You were right \u2014 ${CHAMPION_NAMES[accusedIdx]} was the traitor all along. Dawnstar is safe.`
      : `${CHAMPION_NAMES[accusedIdx]} was innocent. You've made a terrible error, and the real traitor remains free.`}</p>
    <div class="btn-row"><button class="btn" id="menu">Continue</button></div>
  `);
  correct ? sfx.victory() : sfx.defeat();
  document.getElementById('menu').addEventListener('click', () => enterCamp());
}

async function showChampion(npc) {
  const data = await loadCharData();
  const npcStrings = await loadNpcStrings();
  const items = await loadItemData();
  const greeting = (npcStrings[npc.dialogueGroup] || [])[0] || '...';
  const quest = ensureQuestState();
  const champ = quest.champions[npc.championIdx];
  const c = loadCharacter();
  const row = data.classStats[c.classIndex];
  const personality = row[8]; // PER, real attribute directly from charin.json

  function render_(message) {
    const giftIdx = (c.inventory || []).findIndex((it) => items.typeGroup[it.index] === 11);
    const teachable = CHAMPION_TEACHABLE[npc.championIdx].map((skillIdx) => {
      const pairs = livePlayer.skillPairs;
      const level = pairs[skillIdx] ? pairs[skillIdx][0] : 0;
      const skillName = data.skillNames[skillIdx];
      const canAfford = champ.aidPoints >= 3;
      return `<button class="btn secondary" data-train="${skillIdx}" style="margin:2px" ${canAfford ? '' : 'disabled'}>${skillName} (Lv.${level})</button>`;
    }).join('');
    render(`
      <h1>${npc.name}</h1>
      <p class="sub" style="font-style:italic">"${greeting}"</p>
      <p class="sub" style="opacity:.7">Aid Points: ${champ.aidPoints}</p>
      ${message ? `<p class="error">${message}</p>` : ''}
      <div class="btn-row">
        <button class="btn secondary" id="befriend">Befriend</button>
        <button class="btn secondary" id="threaten">Threaten</button>
        <button class="btn secondary" id="gift" ${giftIdx >= 0 ? '' : 'disabled'}>Gift</button>
      </div>
      <div style="margin-top:12px"><strong>Ask to be trained (3 aid points)</strong></div>
      <div class="btn-row" style="flex-wrap:wrap">${teachable}</div>
      <div class="btn-row"><button class="btn secondary" id="leave">Leave</button></div>
    `);
    document.getElementById('leave').addEventListener('click', () => mountDungeon());
    document.getElementById('befriend').addEventListener('click', () => doAction('befriend'));
    document.getElementById('threaten').addEventListener('click', () => doAction('threaten'));
    if (giftIdx >= 0) {
      document.getElementById('gift').addEventListener('click', () => {
        const item = c.inventory[giftIdx];
        c.inventory.splice(giftIdx, 1);
        saveCharacter(c);
        const r = attemptChampionAction(quest, npc.championIdx, 'gift', 0, personality);
        persistQuestState();
        sfx.gold();
        render_(`You gave ${item.name}. ${r.clue ? 'They share a clue with you!' : `${npc.name} accepts the gift.`}`);
      });
    }
    document.querySelectorAll('[data-train]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const skillIdx = Number(btn.dataset.train);
        const r = trainSkill(quest, npc.championIdx, livePlayer.skillPairs, skillIdx);
        persistQuestState();
        sfx.click();
        render_(r.trained ? `${data.skillNames[skillIdx]} trained: ${r.before} \u2192 ${r.after}.` : r.reason);
      });
    });
  }

  function doAction(action) {
    const speechcraftSkill = livePlayer.skillPairs[13] ? livePlayer.skillPairs[13][0] : 0;
    const r = attemptChampionAction(quest, npc.championIdx, action, speechcraftSkill, personality);
    persistQuestState();
    sfx.click();
    let msg = r.success ? `${npc.name} responds well.` : `${npc.name} is unmoved.`;
    if (r.clue) msg += ' They share a clue with you!';
    render_(msg);
  }
  render_();
}

boot();
