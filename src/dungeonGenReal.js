// Faithful port of the real dungeon generator, via
// jet082/TES-Mobile-Decomp-Python-Port's dungenc.py (itself a port of
// c.java). Room placement, the 1-tile-border adjacency check, and the
// nearest-neighbor corridor connection algorithm are all ported verbatim.
//
// Adapted, not ported: monster type selection uses our own
// `monstersin.json`-driven pool (the reference's `monsters.
// random_archetype_for_level` isn't ported), and chest items use our own
// `itemsin.json` roll instead of the reference's `items.roll_dropped_item`
// / `random_gift_for_giver`. NPC champion rooms and cross-dungeon edge
// doors (both tied to systems we haven't built — see PORT_NOTES.md) are
// skipped; those tiles are just treated as ordinary rooms here.
//
// Tile bits (matching the original): 1 = wall (initial/uncarved),
// 0 = floor, then flags OR'd in on top of a carved (0) tile:
// 2 = monster, 8 = stairs/exit, 16 = chest, 32 = NPC (unused here).
// This module exposes a simplified grid (see toSimpleGrid) using the same
// legend dungeonView.js/firstPersonView.js already expect
// (0=wall,1=floor,3=entrance,4=exit,5=monster,6=chest), so the rest of the
// app doesn't need to know about the original's bitflag format.

import { JavaRandom, javaAbsMod } from './javaRandom.js';

const SIZE = 35;
const MAX_ROOMS = 15;
const CHEST_TIERS = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 1, 1, 3, 1, 3, 3,
  1, 3, 3, 3, 3, 5, 3, 5, 5, 3, 5, 5, 5, 5, 5, 5, 5, 5];

function packPoint(x, y) { return x * 1000 + y; }
function unpackPoint(p) { return [Math.floor(p / 1000), p % 1000]; }

function randomRoom(rng) {
  const w = 2 + javaAbsMod(rng.nextInt(), 4);
  const h = 2 + javaAbsMod(rng.nextInt(), 4);
  const xSpan = 31 - 3 + 1 - (w - 1);
  const ySpan = 31 - 3 + 1 - (h - 1);
  const x = 3 + javaAbsMod(rng.nextInt(), xSpan);
  const y = 3 + javaAbsMod(rng.nextInt(), ySpan);
  return [x, y, x + w - 1, y + h - 1,
    x + javaAbsMod(rng.nextInt(), w), y + javaAbsMod(rng.nextInt(), h)];
}

function tryPlace(tiles, r) {
  for (let x = r[0] - 1; x <= r[2] + 1; x++) {
    for (let y = r[1] - 1; y <= r[3] + 1; y++) {
      if (x >= 0 && x < SIZE && y >= 0 && y < SIZE && tiles[x][y] === 0) return false;
    }
  }
  for (let x = r[0]; x <= r[2]; x++) {
    for (let y = r[1]; y <= r[3]; y++) {
      if (tiles[x][y] !== 8 && tiles[x][y] !== 32) tiles[x][y] = 0;
    }
  }
  return true;
}

function carve(tiles, x, w, y, h) {
  for (let cx = x; cx < x + w; cx++) {
    for (let cy = y; cy < y + h; cy++) {
      if (cx >= 0 && cx < SIZE && cy >= 0 && cy < SIZE) {
        if (tiles[cx][cy] !== 8 && tiles[cx][cy] !== 32) tiles[cx][cy] = 0;
      }
    }
  }
}

function connect(tiles, a, b, rng) {
  const [ax, ay] = unpackPoint(a);
  const [bx, by] = unpackPoint(b);
  if (javaAbsMod(rng.nextInt(), 2) === 0) {
    carve(tiles, Math.min(ax, bx), Math.abs(bx - ax) + 1, ay, 1);
    carve(tiles, bx, 1, Math.min(ay, by), Math.abs(by - ay) + 1);
  } else {
    carve(tiles, ax, 1, Math.min(ay, by), Math.abs(by - ay) + 1);
    carve(tiles, Math.min(ax, bx), Math.abs(bx - ax) + 1, by, 1);
  }
}

function connectPoints(tiles, connections, rng) {
  const pending = [...connections];
  for (const point of [...connections]) {
    let best = null, bestDist = Infinity, removeIdx = -1;
    pending.forEach((other, idx) => {
      if (other !== point) {
        const [ax, ay] = unpackPoint(point);
        const [bx, by] = unpackPoint(other);
        const dist = (bx - ax) ** 2 + (by - ay) ** 2;
        if (dist < bestDist) { bestDist = dist; best = other; }
      } else {
        removeIdx = idx;
      }
    });
    if (best !== null) connect(tiles, point, best, rng);
    if (removeIdx !== -1) pending.splice(removeIdx, 1);
  }
}

/**
 * Generates one dungeon's raw tile grid + room list using the real
 * algorithm. `level` feeds the seed (level * 8000, matching the original)
 * and CHEST_TIERS lookup.
 */
function buildRealDungeon(level, rng) {
  const tiles = Array.from({ length: SIZE }, () => new Array(SIZE).fill(1));
  const rooms = [];
  const connections = [];

  let placedStairs = false;
  let guard = 0;
  while (rooms.length < MAX_ROOMS) {
    if (++guard > 5000) break; // safety net — the ported original has no cap here
    const r = randomRoom(rng);
    if (!tryPlace(tiles, r)) continue;
    rooms.push(r);
    connections.push(packPoint(r[4], r[5]));
    if (rooms.length < 2 || placedStairs) continue;
    const w = r[2] - r[0] + 1;
    const h = r[3] - r[1] + 1;
    if (w < 3 || h < 3) continue;
    const cx = r[0] + Math.floor(w / 2);
    const cy = r[1] + Math.floor(h / 2);
    if (cx === r[4] && cy === r[5]) continue;
    tiles[cx][cy] |= 8; // stairs/exit — champion-NPC rooms not modeled here
    placedStairs = true;
  }

  connectPoints(tiles, connections, rng);

  return { tiles, rooms };
}

/** c.c() — the hand-crafted 19x19 camp/hub layout, ported exactly. */
export function generateCamp() {
  const W = 19, H = 19;
  const tiles = Array.from({ length: W }, () => new Array(H).fill(1));
  for (let x = 0; x < H; x++) tiles[x][9] = 0;
  for (let y = 0; y < H; y++) tiles[9][y] = 0;
  for (let n = 4; n < 15; n++) {
    tiles[4][n] = 0;
    tiles[14][n] = 0;
    tiles[n][4] = 0;
    tiles[n][14] = 0;
  }
  const extraCells = [[5, 6], [6, 6], [7, 6], [7, 5], [7, 7],
    [12, 6], [13, 6], [12, 8],
    [8, 8], [10, 8], [8, 10], [10, 10],
    [11, 12], [11, 13], [12, 12],
    [5, 11], [6, 11]];
  for (const [x, y] of extraCells) tiles[x][y] = 0;
  return { tiles, width: W, height: H };
}

/**
 * Adapts generateCamp()'s x-major {tiles,width,height} into the same
 * shape generateDungeon() returns, so the existing views (which only
 * know about that shape) can render it unmodified. The cross-shaped
 * layout's 4 arms meet the outer ring at four natural "gate" points —
 * marked as cell value 7 (portal) here, a new legend value distinct from
 * 4 (exit), since stepping on one should open the dungeon-select menu
 * rather than "leave" the way a dungeon exit does.
 *
 * Not a port of anything — the original links camp to specific dungeons
 * via geomin.json's per-dungeon edge-adjacency data (see PORT_NOTES.md),
 * which isn't wired up. All 4 gates here just open the same full
 * dungeon-select list rather than each leading somewhere fixed.
 */
export function campAsDungeonShape(gateDungeonIds) {
  const { tiles, width, height } = generateCamp();
  const grid = Array.from({ length: height }, () => new Array(width).fill(0));
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      grid[y][x] = tiles[x][y] === 1 ? 0 : 1;
    }
  }
  // Real data: geomin.json's camp row (index 0) is [2, 11, 20, 29, -1, -1]
  // — confirmed to be the 4 real dungeon IDs connected to camp's 4 gates
  // (evenly spaced by 9 across the 36-dungeon world, all in valid range).
  // The specific gate<->position assignment below (N/S/W/E, in that
  // array order) is our own reasonable-but-unverifiable choice — there's
  // no running original to confirm exact screen orientation against —
  // but the underlying linkage data itself is real, not random.
  //
  // Note: the reference's dungeon IDs run 2-37 (1 is camp); our own
  // generateDungeon(index) has always used 1-36 with the same seed
  // formula (index*8000), so a gate value of e.g. 2 here should be
  // passed straight to generateDungeon(2) — they line up directly, our
  // index 1 just doesn't correspond to anything gate-linked.
  const gateCoords = [[9, 4], [9, 14], [4, 9], [14, 9]];
  const ids = gateDungeonIds && gateDungeonIds.length === 4 ? gateDungeonIds : [2, 11, 20, 29];
  const gates = gateCoords.map(([x, y], i) => ({ x, y, targetId: ids[i] }));
  for (const g of gates) grid[g.y][g.x] = 7;

  // The 4 real shop peddlers, ported from npc.py's NPC_NAMES/NPC_X/NPC_Y/
  // NPC_WARES (k.java's equivalent tables).
  const PEDDLERS = [
    { name: 'Weapon Peddler', x: 12, y: 12, wares: [1, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13, 14, 15, 17, 18, 19, 20] },
    { name: 'Heavy Armor Peddler', x: 6, y: 11, wares: [22, 23, 24, 25, 32, 33, 34, 35, 47, 48, 49, 50] },
    { name: 'Light Armor Peddler', x: 7, y: 7, wares: [27, 28, 29, 30, 37, 38, 39, 40, 42, 43, 44, 45] },
    { name: "Jakar's", x: 12, y: 8, wares: [87, 88, 89, 90, 91, 93, 94, 95, 96] },
  ];
  const npcs = PEDDLERS.map((p, i) => ({ id: `npc${i}`, name: p.name, x: p.x, y: p.y, wares: p.wares, dialogueGroup: i, type: 'peddler' }));

  // Eustacia: real camp position from npc.py's NPC_X/NPC_Y (12,6), a real
  // floor cell in our layout. She's healer + quest-giver.
  npcs.push({ id: 'eustacia', name: 'Eustacia', x: 12, y: 6, dialogueGroup: 4, type: 'eustacia' });

  // The 4 champions (Alhavara/Beatrice/Chung/Delacroix): the reference
  // doesn't give them a fixed camp position at all (NPC_X/NPC_Y show a
  // placeholder (1,1) for all 4 — they're evidently encountered some
  // other way, likely found/freed in dungeons, which isn't traced here).
  // Placed in camp instead, on already-carved-but-otherwise-unused
  // interior cells, as our own pragmatic choice so the quest is reachable
  // at all — flagged clearly rather than left silently non-faithful.
  const championSpots = [[8, 8], [10, 8], [8, 10], [10, 10]];
  const championNames = ['Alhavara', 'Beatrice', 'Chung', 'Delacroix'];
  championNames.forEach((name, i) => {
    const [x, y] = championSpots[i];
    npcs.push({ id: `champion${i}`, name, x, y, dialogueGroup: 5 + i, type: 'champion', championIdx: i });
  });

  for (const npc of npcs) grid[npc.y][npc.x] = 8;

  return {
    index: 0,
    size: Math.max(width, height),
    width, height,
    grid,
    rooms: [],
    monsters: [],
    chests: [],
    npcs,
    gates,
    start: { x: 9, y: 9 },
  };
}

// Real structure, confirmed via UESP (Dawnstar:Places / Quest Walkthrough):
// camp's 4 gates each start a zone of 9 dungeons (2-10, 11-19, 20-28,
// 29-37 — matching the real dungeon-ID range 2-37, 36 total). The exact
// which-edge-connects-to-which-neighbor rule inside a zone wasn't
// traceable (the reference's `adjacency[4]/[5]` only marks "a door
// exists on this edge," not an explicit target dungeon), so within a
// zone we use a simple, deterministic linear chain: dungeon N's forward
// gate leads to N+1, its backward gate leads to N-1, honoring the real
// "9 per zone" structure without claiming byte-exact edge topology.
const ZONE_STARTS = [2, 11, 20, 29];
const ZONE_SIZE = 9;

export function zoneNeighbors(dungeonIndex) {
  if (dungeonIndex < 2 || dungeonIndex > 37) return { forward: null, backward: null };
  const zoneStart = ZONE_STARTS.find((s) => dungeonIndex >= s && dungeonIndex < s + ZONE_SIZE);
  if (zoneStart == null) return { forward: null, backward: null };
  const positionInZone = dungeonIndex - zoneStart;
  return {
    forward: positionInZone < ZONE_SIZE - 1 ? dungeonIndex + 1 : null,
    backward: positionInZone > 0 ? dungeonIndex - 1 : null,
  };
}

export function generateDungeon(dungeonIndex, monsterTemplates, itemTemplates) {
  const seed = dungeonIndex * 8000;
  const rng = new JavaRandom(seed);
  const { tiles, rooms } = buildRealDungeon(dungeonIndex, rng);

  const grid = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      grid[y][x] = tiles[x][y] === 1 ? 0 : 1; // wall vs floor, axes swapped to [row][col]
    }
  }

  const startRoom = rooms[0];
  const start = { x: startRoom[4], y: startRoom[5] };
  grid[start.y][start.x] = 3;

  // exit tile: wherever the real algorithm's stairs bit landed
  outer:
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      if ((tiles[x][y] & 8) !== 0) { grid[y][x] = 4; break outer; }
    }
  }

  // Zone-chain gates: reserve up to 2 more rooms (beyond entrance/exit)
  // for gate tiles, one per direction the zone actually has a neighbor
  // in. Reserved before monster placement so they don't collide.
  const { forward, backward } = zoneNeighbors(dungeonIndex);
  const gates = [];
  const reservedRoomIndices = new Set();
  let nextGateRoom = rooms.length - 1;
  for (const targetId of [forward, backward]) {
    if (targetId == null || nextGateRoom <= 0) continue;
    const r = rooms[nextGateRoom];
    const x = r[4], y = r[5];
    if (grid[y][x] === 1) { // still plain floor, not entrance/exit
      gates.push({ x, y, targetId });
      grid[y][x] = 7;
      reservedRoomIndices.add(nextGateRoom);
    }
    nextGateRoom--;
  }

  const monsters = [];
  const chests = [];
  const monsterPoolEnd = monsterTemplates
    ? Math.max(4, Math.min(monsterTemplates.length, Math.ceil((dungeonIndex / 12) * monsterTemplates.length) + 4))
    : 0;

  // one monster per room (matches the original: every room gets a spawn
  // at its packed connection point), skipping the start room and any
  // room reserved for a zone-chain gate above.
  rooms.slice(1).forEach((r, i) => {
    if (!monsterTemplates || !monsterTemplates.length) return;
    if (reservedRoomIndices.has(i + 1)) return;
    const mIdx = rng.nextInt(monsterPoolEnd);
    const template = monsterTemplates[mIdx];
    // hp is attrs[14] directly — confirmed exact match to the reference's
    // `m.hp = TYPE_ATTRS[type_idx-1][14]`. No more approximation here;
    // the rest of the combat formula (attrs[2..8], attrs[11]) is now a
    // faithful port too, see combat.js.
    const hp = Math.max(1, template.stats[14] & 0xFF);
    const x = r[4], y = r[5];
    if (grid[y][x] === 3 || grid[y][x] === 4 || grid[y][x] === 7) return; // don't overwrite entrance/exit/gate
    monsters.push({
      id: `m${i}`, name: template.name, typeIdx: mIdx + 1,
      x, y, hp, maxHp: hp, alive: true,
    });
    grid[y][x] = 5;
  });

  // 5 chests in random rooms, tier picked the same way the original picks
  // CHEST_TIERS[level-1] for the first (gift) chest — the item itself is
  // still our own itemsin.json-driven roll, not the reference's tables.
  if (itemTemplates && itemTemplates.length) {
    const chestCount = Math.min(5, rooms.length);
    const usedRooms = new Set();
    for (let i = 0; i < chestCount; i++) {
      let idx;
      let attempts = 0;
      do { idx = javaAbsMod(rng.nextInt(), rooms.length); attempts++; }
      while (usedRooms.has(idx) && attempts < 20);
      usedRooms.add(idx);
      const r = rooms[idx];
      const w = r[2] - r[0] + 1, h = r[3] - r[1] + 1;
      const x = r[0] + javaAbsMod(rng.nextInt(), w);
      const y = r[1] + javaAbsMod(rng.nextInt(), h);
      if (grid[y][x] !== 1) continue; // occupied by entrance/exit/monster
      const iIdx = javaAbsMod(rng.nextInt(), itemTemplates.length);
      chests.push({ id: `c${i}`, x, y, itemIndex: iIdx, opened: false, tier: CHEST_TIERS[(dungeonIndex - 1) % CHEST_TIERS.length] });
      grid[y][x] = 6;
    }
  }

  return {
    index: dungeonIndex,
    size: SIZE,
    grid,
    rooms: rooms.map(([x0, y0, x1, y1]) => ({
      x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: x0 + Math.floor((x1 - x0) / 2), cy: y0 + Math.floor((y1 - y0) / 2),
    })),
    monsters,
    chests,
    gates,
    start,
  };
}
