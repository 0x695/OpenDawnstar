// Top-down Canvas renderer + keyboard movement for a generated dungeon.
// Deliberately simple/clean rather than a replica of the original's
// first-person corridor-view renderer (see PORT_NOTES.md for why).

const TILE = 16;
const COLORS = {
  0: '#0a0806',   // wall
  1: '#3a2f22',   // floor
  2: '#6b4a2a',   // door
  3: '#2f5d3a',   // entrance
  4: '#5d2f2f',   // exit
  5: '#8a2f2f',   // monster
  6: '#b8952f',   // chest
  7: '#4a2f8a',   // portal (camp gate)
  8: '#c9a15a',   // NPC
};

export function mountDungeonView(container, dungeon, opts) {
  const { onExit, onEntrance, onMonster, onChest, onPortal, onNpc, onMove, title } = opts;
  container.innerHTML = `
    <div class="screen">
      <h1>${title || 'Dungeon ' + dungeon.index}</h1>
      <p class="sub" style="opacity:.65">Arrow keys / WASD to move. Walk into red tiles to fight, gold tiles for loot.</p>
      <canvas id="dg-canvas" width="${dungeon.size * TILE}" height="${dungeon.size * TILE}"
        style="width:100%;max-width:${dungeon.size * TILE}px;image-rendering:pixelated;border:1px solid #4a3c28;display:block;margin:0 auto;"></canvas>
      <div class="touch-pad">
        <div></div>
        <button class="touch-btn" id="tp-up" aria-label="Up">\u2191</button>
        <div></div>
        <button class="touch-btn" id="tp-left" aria-label="Left">\u2190</button>
        <div></div>
        <button class="touch-btn" id="tp-right" aria-label="Right">\u2192</button>
        <div></div>
        <button class="touch-btn" id="tp-down" aria-label="Down">\u2193</button>
        <div></div>
      </div>
      <div class="btn-row"><button class="btn secondary" id="dg-leave">Leave Dungeon</button><button class="btn secondary" id="view-toggle">First-Person View</button><button class="btn secondary" id="dg-options">Options</button></div>
    </div>
  `;

  const canvas = container.querySelector('#dg-canvas');
  const ctx = canvas.getContext('2d');
  const player = dungeon.playerPos || { x: dungeon.start.x, y: dungeon.start.y };
  dungeon.playerPos = player;

  function cellAt(x, y) {
    if (y < 0 || y >= dungeon.size || x < 0 || x >= dungeon.size) return 0;
    return dungeon.grid[y][x];
  }

  function findMonster(x, y) {
    return dungeon.monsters.find((m) => m.alive && m.x === x && m.y === y);
  }
  function findChest(x, y) {
    return dungeon.chests.find((c) => !c.opened && c.x === x && c.y === y);
  }
  function findNpc(x, y) {
    return (dungeon.npcs || []).find((n) => n.x === x && n.y === y);
  }
  function findGate(x, y) {
    return (dungeon.gates || []).find((g) => g.x === x && g.y === y);
  }

  function draw() {
    for (let y = 0; y < dungeon.size; y++) {
      for (let x = 0; x < dungeon.size; x++) {
        let cell = dungeon.grid[y][x];
        // reflect cleared monsters/chests as plain floor
        if (cell === 5 && !findMonster(x, y)) cell = 1;
        if (cell === 6 && !findChest(x, y)) cell = 1;
        ctx.fillStyle = COLORS[cell] || COLORS[0];
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    ctx.fillStyle = '#cbaa5c';
    ctx.beginPath();
    ctx.arc(player.x * TILE + TILE / 2, player.y * TILE + TILE / 2, TILE / 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function tryMove(dx, dy) {
    const nx = player.x + dx;
    const ny = player.y + dy;
    const cell = cellAt(nx, ny);
    if (cell === 0) return; // wall

    const monster = findMonster(nx, ny);
    if (monster) { onMonster && onMonster(monster); return; }
    const chest = findChest(nx, ny);
    if (chest) { onChest && onChest(chest); return; }
    const npc = findNpc(nx, ny);
    if (npc) { onNpc && onNpc(npc); return; }

    player.x = nx;
    player.y = ny;
    draw();
    onMove && onMove();
    if (cell === 4 && onExit) onExit();
    if (cell === 7 && onPortal) onPortal(findGate(nx, ny));
    if (cell === 3 && onEntrance) onEntrance();
  }

  const keyHandler = (e) => {
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': tryMove(0, -1); e.preventDefault(); break;
      case 'ArrowDown': case 's': case 'S': tryMove(0, 1); e.preventDefault(); break;
      case 'ArrowLeft': case 'a': case 'A': tryMove(-1, 0); e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': tryMove(1, 0); e.preventDefault(); break;
      case 'Escape': case 'o': case 'O':
        window.removeEventListener('keydown', keyHandler);
        if (opts.onOptions) opts.onOptions();
        e.preventDefault();
        break;
    }
  };
  window.addEventListener('keydown', keyHandler);

  const touchBindings = [
    ['tp-up', () => tryMove(0, -1)],
    ['tp-down', () => tryMove(0, 1)],
    ['tp-left', () => tryMove(-1, 0)],
    ['tp-right', () => tryMove(1, 0)],
  ];
  touchBindings.forEach(([id, fn]) => {
    const el = container.querySelector('#' + id);
    if (el) el.addEventListener('click', fn);
  });

  container.querySelector('#dg-leave').addEventListener('click', () => {
    window.removeEventListener('keydown', keyHandler);
    if (opts.onLeave) opts.onLeave();
  });
  const optionsBtn = container.querySelector('#dg-options');
  if (optionsBtn) optionsBtn.addEventListener('click', () => {
    window.removeEventListener('keydown', keyHandler);
    if (opts.onOptions) opts.onOptions();
  });

  draw();

  return () => window.removeEventListener('keydown', keyHandler);
}
