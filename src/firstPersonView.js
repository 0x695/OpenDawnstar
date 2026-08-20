// First-person corridor-view renderer, faithfully using the original
// game's own perspective lookup tables (verbatim from e.java, sourced via
// jet082/TES-Mobile-Decomp-Python-Port's canvas.py) and the real
// wallsr.png/wallsi.png/floor3.png/panel.png sprites extracted from the
// jar. This replaces the flat-color placeholder from dungeonView.js.
//
// Monster layered sprite compositing (AD_TABLE/A_TABLE/G_TABLE) lives in
// monsterSprites.js, shared with the combat screen. Depth-scaled
// mid/far-distance rendering (monsters visible but not directly ahead)
// still isn't ported — only the directly-ahead case, which is all the
// bump-to-fight encounter model needs.

// entry = [wallType, subIdx, dx, depth]; first match (nearest depth) wins.
const WALL_TABLE = [
  [[12, 0, 0, 1], [11, 0, -1, 1], [12, 1, -1, 2], [12, 2, -1, 3], [11, 2, -2, 3], [12, 3, -2, 4]],
  [[12, 0, 0, 1], [12, 1, 0, 2], [11, 1, -1, 2], [12, 2, -1, 3], [12, 3, -1, 4], [12, 3, -1, 4]],
  [[12, 0, 0, 1], [12, 1, 0, 2], [12, 2, 0, 3], [11, 2, -1, 3], [12, 3, -1, 4], [12, 3, -1, 4]],
  [[12, 0, 0, 1], [12, 1, 0, 2], [12, 2, 0, 3], [12, 3, 0, 4], [11, 3, -1, 4], [11, 3, -1, 4]],
  [[12, 0, 0, 1], [12, 1, 0, 2], [12, 2, 0, 3], [12, 3, 0, 4], [12, 3, 0, 4], [12, 3, 0, 4]],
];
const STRIP_X = [0, 0, 36, 72, 90, 108, 126, 144, 158, 176, 194, 212];

// -- layered monster/NPC compositing, verbatim from the reference's
// canvas.py (itself a port of e.java's AD/A/G tables and e.c(Graphics,...))
import { MONSTER_O_FILES, blitFrame, drawLayeredMonster, drawGenericNpc } from './monsterSprites.js';

const VIEW_W = 180;   // 10 columns x 18px
const VIEW_H = 176;   // matches wallsr.png/wallsi.png height
const PANEL_H = 52;   // matches panel.png height
const CANVAS_H = VIEW_H + PANEL_H;

// facing: 1 = north (-y), 2 = east (+x), 3 = south (+y), 4 = west (-x)
const FACING_DELTA = { 1: [0, -1], 2: [1, 0], 3: [0, 1], 4: [-1, 0] };

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function mountFirstPersonView(container, dungeon, opts) {
  const { title, onExit, onMonster, onChest, onLeave, onPortal, onNpc, onMove, onOptions, player: playerStats } = opts;
  container.innerHTML = `
    <div class="screen">
      <h1>${title || 'Dungeon ' + dungeon.index}</h1>
      <p class="sub" style="opacity:.65">Arrows/WASD to move and turn, or use the pad below. Space/Enter/the middle button acts on what's ahead. Press * or M (or the button below) to resize the minimap.</p>
      <canvas id="fp-canvas" width="${VIEW_W}" height="${CANVAS_H}"
        style="width:100%;max-width:360px;image-rendering:pixelated;border:1px solid #4a3c28;display:block;margin:0 auto;background:#000;"></canvas>
      <div class="touch-pad">
        <div></div>
        <button class="touch-btn" id="tp-fwd" aria-label="Forward">\u2191</button>
        <div></div>
        <button class="touch-btn" id="tp-left" aria-label="Turn left">\u21b6</button>
        <button class="touch-btn" id="tp-act" aria-label="Act">\u2022</button>
        <button class="touch-btn" id="tp-right" aria-label="Turn right">\u21b7</button>
        <div></div>
        <button class="touch-btn" id="tp-back" aria-label="Back">\u2193</button>
        <div></div>
      </div>
      <div class="btn-row"><button class="btn secondary" id="fp-leave">Leave Dungeon</button><button class="btn secondary" id="view-toggle">Map View</button><button class="btn secondary" id="radar-size">Minimap Size</button><button class="btn secondary" id="fp-options">Options</button></div>
    </div>
  `;

  const canvas = container.querySelector('#fp-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const [wallsR, wallsI, floor, floorIce, panel, gate, chestImg, ...monsterO] = await Promise.all([
    loadImage('assets/img/wallsr.png'),
    loadImage('assets/img/wallsi.png'),
    loadImage('assets/img/floor3.png'),
    loadImage('assets/img/floorIce.png'),
    loadImage('assets/img/panel.png'),
    loadImage('assets/img/gate.png'),
    loadImage('assets/img/chestnearclosed.png'),
    ...MONSTER_O_FILES.map((f) => loadImage('assets/img/' + f)),
  ]);

  const player = dungeon.playerPos3d || { x: dungeon.start.x, y: dungeon.start.y, facing: 1 };
  dungeon.playerPos3d = player;
  const isIce = dungeon.index !== 1; // camp (index 1 in the reference) uses the non-ice set

  function cellAt(x, y) {
    if (y < 0 || y >= dungeon.size || x < 0 || x >= dungeon.size) return 0;
    return dungeon.grid[y][x];
  }

  function seeTile(dx, depth) {
    const [x, y] = aheadCoords(dx, depth);
    return cellAt(x, y);
  }

  function aheadCoords(dx, depth) {
    let x, y;
    if (player.facing === 1 || player.facing === 3) {
      const mul = player.facing === 1 ? 1 : -1;
      y = player.y - depth * mul;
      x = player.x + dx * mul;
    } else {
      const mul = player.facing === 2 ? 1 : -1;
      x = player.x + depth * mul;
      y = player.y + dx * mul;
    }
    return [x, y];
  }

  function stripIndex(wallType, subIdx, side) {
    if (wallType === 12) return subIdx;
    return side === -1 ? 8 + subIdx : 7 - subIdx;
  }

  // alternating-strip state, reset each frame (mirrors e.java's aq/u fields)
  let wallAq = false;
  let wallU = false;

  function blitWallSlice(stripIdx, dstX) {
    if (stripIdx < 0 || stripIdx >= STRIP_X.length) return;
    const srcOff = STRIP_X[stripIdx];
    let extra = 0;
    if (stripIdx === 0 || stripIdx === 1) {
      wallU = false;
      if (wallAq) { wallAq = false; extra = -18; } else { wallAq = true; }
    } else {
      wallAq = false;
      if (stripIdx === 2) {
        if (wallU) { wallU = false; extra = -18; } else { wallU = true; }
      }
    }
    const img = isIce ? wallsI : wallsR;
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(dstX, 0, 18, VIEW_H);
    ctx.clip();
    ctx.drawImage(img, dstX - srcOff + extra, 0);
    ctx.restore();
  }

  function drawWallColumn(tableCol, dstX, side) {
    for (const [wallType, subIdx, dxRaw, depth] of WALL_TABLE[tableCol]) {
      const dx = side === -1 ? dxRaw : -dxRaw;
      const cell = seeTile(dx, depth);
      if (cell === 0) { // wall
        blitWallSlice(stripIndex(wallType, subIdx, side), dstX);
        return;
      }
    }
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, CANVAS_H);

    const floorImg = isIce ? floorIce : floor;
    if (floorImg) {
      for (let i = 0; i < 5; i++) ctx.drawImage(floorImg, i * 36, 0);
    }

    wallAq = false;
    wallU = false;
    for (let col = 0; col < 5; col++) drawWallColumn(col, col * 18, -1);
    for (let col = 5; col < 10; col++) drawWallColumn(9 - col, col * 18, 1);

    // monster/chest/NPC directly ahead
    const ahead = seeTile(0, 1);
    if (ahead === 5) {
      const monster = findMonster(...aheadCoords(0, 1));
      if (monster && monster.typeIdx) {
        drawLayeredMonster(ctx, monsterO, monster.typeIdx);
      } else {
        ctx.fillStyle = 'rgba(138,47,47,0.35)';
        ctx.fillRect(54, 40, 72, 90);
      }
    } else if (ahead === 6 && chestImg) {
      ctx.drawImage(chestImg, (VIEW_W - chestImg.width) / 2, VIEW_H - chestImg.height - 10);
    } else if (ahead === 8) {
      const npc = findNpc(...aheadCoords(0, 1));
      drawGenericNpc(ctx, monsterO);
      if (npc) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(npc.name, 20, 30);
      }
    }

    if (panel) {
      ctx.drawImage(panel, 0, VIEW_H);
    } else {
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(0, VIEW_H, VIEW_W, PANEL_H);
    }

    drawStatsBars();
    drawRadar();
  }

  const DIR_LETTERS = { 1: 'N', 2: 'E', 3: 'S', 4: 'W' };
  const RADAR_SIZES = [5, 7, 9];
  let radarSizeIdx = (() => {
    const saved = Number(localStorage.getItem('dawnstar_radar_size_idx'));
    return RADAR_SIZES.includes(RADAR_SIZES[saved]) ? saved : 1; // default 7x7
  })();
  function cycleRadarSize() {
    radarSizeIdx = (radarSizeIdx + 1) % RADAR_SIZES.length;
    localStorage.setItem('dawnstar_radar_size_idx', String(radarSizeIdx));
    draw();
  }

  // Always-visible FOV radar, top-left. Port of e.p()/e.a() via
  // dungeon.vision_grid — facing-relative sampling, exact pixel spec
  // (10,20 origin, 3px cells, 1px pad) and color legend from canvas.py.
  // Grid size itself (originally fixed at 7x7) is adjustable here via
  // cycleRadarSize() — not part of the original, added per request.
  function visionCell(col, row, size) {
    const half = Math.floor(size / 2);
    const c = col - half, r = row - half;
    let sx, sy;
    if (player.facing === 1) { sx = player.x + c; sy = player.y + r; }
    else if (player.facing === 3) { sx = player.x - c; sy = player.y - r; }
    else if (player.facing === 2) { sx = player.x - r; sy = player.y + c; }
    else { sx = player.x + r; sy = player.y - c; }
    return cellAt(sx, sy);
  }

  function drawRadar() {
    if (!player) return;
    const SIZE = RADAR_SIZES[radarSizeIdx], CELL = 3, PAD = 1;
    const ox = 10, oy = 20;
    const total = PAD + SIZE * CELL;

    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(DIR_LETTERS[player.facing] || 'N', ox + total / 2, oy - 4);
    ctx.textAlign = 'left'; // reset for any other text drawn elsewhere this frame

    ctx.fillStyle = '#000';
    ctx.fillRect(ox, oy, total + 1, total + 1);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(ox + 0.5, oy + 0.5, total, total);

    const half = Math.floor(SIZE / 2);
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const px = ox + PAD + col * CELL;
        const py = oy + PAD + row * CELL;
        if (row === half && col === half) {
          ctx.fillStyle = '#0f0'; // player
        } else {
          const cell = visionCell(col, row, SIZE);
          if (cell === 0) ctx.fillStyle = '#000';        // wall
          else if (cell === 5) ctx.fillStyle = '#f00';   // monster
          else if (cell === 6) ctx.fillStyle = '#00f';   // chest
          else if (cell === 4) ctx.fillStyle = '#c0f';   // stairs/exit
          else if (cell === 7) ctx.fillStyle = '#fa0';   // portal
          else if (cell === 8) ctx.fillStyle = '#0ff';   // NPC
          else ctx.fillStyle = '#fff';                    // open floor
        }
        ctx.fillRect(px, py, CELL, CELL);
      }
    }
  }

  // Exact pixel spec from canvas.py's _draw_stats_bars: yellow 40x7
  // background rects at y=130/138/146, colored fills inset by 1px, width
  // scaled to current/max out of a 38px bar. Fatigue is display-only —
  // there's no drain mechanic yet, so it always shows full.
  function drawStatsBars() {
    if (!playerStats) return;
    ctx.fillStyle = '#ff0';
    ctx.fillRect(5, 130, 40, 7);
    ctx.fillRect(5, 138, 40, 7);
    ctx.fillRect(5, 146, 40, 7);

    if (playerStats.maxHp > 0) {
      const w = Math.max(0, Math.floor((playerStats.hp * 38) / playerStats.maxHp));
      ctx.fillStyle = '#f00';
      ctx.fillRect(6, 131, w, 5);
    }
    if (playerStats.maxMagicka > 0) {
      const w = Math.max(0, Math.floor((playerStats.magicka * 38) / playerStats.maxMagicka));
      ctx.fillStyle = '#0f0';
      ctx.fillRect(6, 139, w, 5);
    }
    if (playerStats.maxFatigue > 0) {
      const w = Math.max(0, Math.min(40, Math.floor(((playerStats.fatigue ?? playerStats.maxFatigue) * 38) / playerStats.maxFatigue)));
      ctx.fillStyle = '#00f';
      ctx.fillRect(6, 147, w, 5);
    }
  }

  function tryTurn(delta) {
    player.facing = ((player.facing - 1 + delta + 4) % 4) + 1;
    draw();
    onMove && onMove();
  }

  function tryMove(forward) {
    const [dx, dy] = FACING_DELTA[player.facing];
    const step = forward ? 1 : -1;
    const nx = player.x + dx * step;
    const ny = player.y + dy * step;
    const cell = cellAt(nx, ny);
    if (cell === 0) return; // wall

    if (forward) {
      const monster = findMonster(nx, ny);
      if (monster) { onMonster && onMonster(monster); return; }
      const chest = findChest(nx, ny);
      if (chest) { onChest && onChest(chest); return; }
      const npc = findNpc(nx, ny);
      if (npc) { onNpc && onNpc(npc); return; }
    }
    player.x = nx;
    player.y = ny;
    draw();
    onMove && onMove();
    if (cell === 4 && onExit) onExit();
    if (cell === 7 && onPortal) onPortal(findGate(nx, ny));
  }

  function findMonster(x, y) { return dungeon.monsters.find((m) => m.alive && m.x === x && m.y === y); }
  function findChest(x, y) { return dungeon.chests.find((c) => !c.opened && c.x === x && c.y === y); }
  function findNpc(x, y) { return (dungeon.npcs || []).find((n) => n.x === x && n.y === y); }
  function findGate(x, y) { return (dungeon.gates || []).find((g) => g.x === x && g.y === y); }

  function actAhead() {
    const [dx, dy] = FACING_DELTA[player.facing];
    const m = findMonster(player.x + dx, player.y + dy);
    if (m) { onMonster && onMonster(m); return; }
    const c = findChest(player.x + dx, player.y + dy);
    if (c) { onChest && onChest(c); return; }
    const n = findNpc(player.x + dx, player.y + dy);
    if (n) onNpc && onNpc(n);
  }

  const keyHandler = (e) => {
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': tryMove(true); e.preventDefault(); break;
      case 'ArrowDown': case 's': case 'S': tryMove(false); e.preventDefault(); break;
      case 'ArrowLeft': case 'a': case 'A': tryTurn(-1); e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': tryTurn(1); e.preventDefault(); break;
      case ' ': case 'Enter': actAhead(); e.preventDefault(); break;
      case '*': case 'm': case 'M': cycleRadarSize(); e.preventDefault(); break;
      case 'Escape': case 'o': case 'O':
        window.removeEventListener('keydown', keyHandler);
        if (onOptions) onOptions();
        e.preventDefault();
        break;
    }
  };
  window.addEventListener('keydown', keyHandler);

  const touchBindings = [
    ['tp-fwd', () => tryMove(true)],
    ['tp-back', () => tryMove(false)],
    ['tp-left', () => tryTurn(-1)],
    ['tp-right', () => tryTurn(1)],
    ['tp-act', () => actAhead()],
  ];
  touchBindings.forEach(([id, fn]) => {
    const el = container.querySelector('#' + id);
    if (el) el.addEventListener('click', fn);
  });

  container.querySelector('#fp-leave').addEventListener('click', () => {
    window.removeEventListener('keydown', keyHandler);
    onLeave && onLeave();
  });
  const radarSizeBtn = container.querySelector('#radar-size');
  if (radarSizeBtn) radarSizeBtn.addEventListener('click', cycleRadarSize);
  const optionsBtn = container.querySelector('#fp-options');
  if (optionsBtn) optionsBtn.addEventListener('click', () => {
    window.removeEventListener('keydown', keyHandler);
    onOptions && onOptions();
  });

  draw();
  return () => window.removeEventListener('keydown', keyHandler);
}
