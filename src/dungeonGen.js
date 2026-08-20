// Original-inspired (not byte-exact) dungeon generator.
// The original's room/corridor algorithm is tightly coupled to monster and
// item placement classes that aren't ported yet (see PORT_NOTES.md) — this
// produces a comparable walkable layout: a grid of rooms connected by
// corridors, seeded deterministically per dungeon index.
//
// Grid cell values: 0 = wall, 1 = floor, 2 = door, 3 = entrance, 4 = exit,
// 5 = monster, 6 = chest.

import { JavaRandom } from './javaRandom.js';

const SIZE = 35;

export function generateDungeon(dungeonIndex, monsterTemplates, itemTemplates) {
  const seed = dungeonIndex * 8000; // matches the original's seed derivation
  const rng = new JavaRandom(seed);
  const grid = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));

  const roomCount = 6 + rng.nextInt(6); // 6..11 rooms
  const rooms = [];

  for (let i = 0; i < roomCount; i++) {
    const w = 3 + rng.nextInt(5);
    const h = 3 + rng.nextInt(5);
    const x = 1 + rng.nextInt(SIZE - w - 2);
    const y = 1 + rng.nextInt(SIZE - h - 2);
    const room = { x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) };
    rooms.push(room);
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        grid[ry][rx] = 1;
      }
    }
  }

  // Connect each room to the previous one with an L-shaped corridor.
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    carveCorridor(grid, a.cx, a.cy, b.cx, b.cy, rng);
  }

  const entrance = rooms[0];
  const exit = rooms[rooms.length - 1];
  grid[entrance.cy][entrance.cx] = 3;
  grid[exit.cy][exit.cx] = 4;

  // Populate the middle rooms with monsters and chests. Approximate
  // difficulty scaling: pick from roughly the first
  // (dungeonIndex / totalDungeons) slice of the monster list, so early
  // dungeons see weaker monsters. See PORT_NOTES.md re: this being
  // original-inspired, not a port of the actual placement algorithm.
  const monsters = [];
  const chests = [];
  const middleRooms = rooms.slice(1, -1);
  const monsterPoolEnd = monsterTemplates
    ? Math.max(4, Math.min(monsterTemplates.length, Math.ceil((dungeonIndex / 12) * monsterTemplates.length) + 4))
    : 0;

  middleRooms.forEach((room, i) => {
    const roll = rng.nextInt(100);
    if (monsterTemplates && monsterTemplates.length && roll < 55) {
      const mIdx = rng.nextInt(monsterPoolEnd);
      const template = monsterTemplates[mIdx];
      const hp = Math.max(6, (template.stats[1] || 10) + dungeonIndex * 2);
      const atk = Math.max(1, Math.floor((template.stats[0] || 5) / 2) + Math.floor(dungeonIndex / 2));
      monsters.push({
        id: `m${i}`,
        name: template.name,
        typeIdx: mIdx + 1, // 1-based, matches the original's monster-type numbering
        x: room.cx,
        y: room.cy,
        hp, maxHp: hp, atk,
        alive: true,
      });
      grid[room.cy][room.cx] = 5;
    } else if (itemTemplates && itemTemplates.length && roll < 85) {
      const iIdx = rng.nextInt(itemTemplates.length);
      chests.push({ id: `c${i}`, x: room.cx, y: room.cy, itemIndex: iIdx, opened: false });
      grid[room.cy][room.cx] = 6;
    }
  });

  return {
    index: dungeonIndex,
    size: SIZE,
    grid,
    rooms,
    monsters,
    chests,
    start: { x: entrance.cx, y: entrance.cy },
  };
}

function carveCorridor(grid, x1, y1, x2, y2, rng) {
  let x = x1, y = y1;
  const horizontalFirst = rng.nextBoolean();
  if (horizontalFirst) {
    while (x !== x2) { grid[y][x] = grid[y][x] || 1; x += Math.sign(x2 - x); }
    while (y !== y2) { grid[y][x] = grid[y][x] || 1; y += Math.sign(y2 - y); }
  } else {
    while (y !== y2) { grid[y][x] = grid[y][x] || 1; y += Math.sign(y2 - y); }
    while (x !== x2) { grid[y][x] = grid[y][x] || 1; x += Math.sign(x2 - x); }
  }
  grid[y][x] = 1;
}
