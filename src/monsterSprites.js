// Monster sprite compositing, extracted from firstPersonView.js so both
// the dungeon view and the combat screen can render the same real
// layered sprites (see firstPersonView.js's header comment for full
// provenance — ported from canvas.py's AD_TABLE/A_TABLE/G_TABLE).

export const MONSTER_O_FILES = [
  'ban_male_body.png', 'ban_male_heads.png', 'ban_male_gloves.png',
  'ban_male_neck.png', 'ban_male_mask.png', 'ban_male_mid.png', 'ban_male_far.png',
  'ban_fem_body.png', 'ban_fem_heads.png', 'ban_fem_gloves.png',
  'ban_fem_knife.png', 'ban_fem_mask.png', 'ban_fem_mid.png', 'ban_fem_far.png',
  'icebody.png', 'icebreastplate.png', 'icepole.png', 'iceshield.png', 'ice_mid.png', 'ice_far.png',
  'trollbody.png', 'trollmid.png', 'trollfar.png',
  'wardenbody.png', 'wardenmid.png', 'wardenfar.png',
];
const AD_TABLE = [
  [1, 5, 43, 48, 0, 2, 23, 7, 1, 3, 0, 64, 2, 18, 27, 3, 24, 19, 4, 0, 0, 0],
  [6, 10, 43, 49, 7, 2, 18, 8, 8, 3, 3, 84, 11, 17, 24, 10, 0, 80, 9, 0, 0, 0],
  [11, 25, 40, 50, 14, 3, 0, 0, -1, -1, 9, 29, 16, 11, 0, 15, 41, 41, 17],
  [26, 40, 37, 50, 20, 3, 0, 0, -1, -1],
];
const A_TABLE = [
  [0, 0], [1, 0], [0, 1], [1, 2], [0, 2], [0, 1], [1, 1], [0, 2], [1, 2], [0, 2],
  [0, 0], [1, 0], [0, 0], [1, 0], [0, 0], [2, 0], [0, 0], [2, 0], [0, 0], [2, 0],
  [1, 0], [2, 0], [1, 0], [2, 0], [2, 0], [0, 0], [1, 0], [0, 0], [1, 0], [0, 0],
  [2, 0], [0, 0], [2, 0], [0, 0], [2, 0], [1, 0], [2, 0], [1, 0], [2, 0], [1, 0],
  [0, 0],
];
const G_TABLE = [
  [false, false, false, false], [true, true, false, false], [false, false, true, false],
  [true, false, false, false], [true, true, true, false], [false, false, false, false],
  [true, false, false, false], [false, false, true, false], [false, true, false, false],
  [true, true, false, false], [false, false, false, false], [false, false, false, false],
  [false, false, false, false], [false, false, false, false], [false, false, false, false],
  [false, false, false, false], [false, false, false, false], [false, false, false, false],
  [false, false, false, false], [false, false, false, false], [false, false, false, false],
  [false, false, false, false], [false, false, false, false], [false, false, false, false],
  [false, false, false, false], [true, false, true, false], [true, false, true, false],
  [true, false, true, false], [true, false, true, false], [true, false, true, false],
  [true, false, true, false], [true, false, true, false], [true, false, true, false],
  [true, true, false, false], [true, true, false, false], [true, true, false, false],
  [true, true, false, false], [true, true, false, false], [true, true, false, false],
  [true, true, false, false], [false, false, false, false],
];

export function bLookup(monsterType) {
  if (monsterType >= 1 && monsterType <= 5) return 0;
  if (monsterType >= 6 && monsterType <= 10) return 1;
  if (monsterType >= 11 && monsterType <= 25) return 3;
  if (monsterType >= 26 && monsterType <= 40) return 2;
  if (monsterType === 41 || monsterType === 42) return 4;
  return -1;
}

export function blitFrame(ctx, img, frameIdx, frameDiv, dstX, dstY) {
  if (!img || frameDiv <= 0) return;
  const frameW = Math.floor(img.width / frameDiv);
  const frameH = img.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(dstX, dstY, frameW, frameH);
  ctx.clip();
  ctx.drawImage(img, dstX - frameIdx * frameW, dstY);
  ctx.restore();
}

/**
 * Composites a monster's real layered sprite (body/head/accessories) onto
 * ctx at its native anchor coordinates from AD_TABLE. monsterO is the
 * array of loaded Image objects, indexed per MONSTER_O_FILES.
 */
export function drawLayeredMonster(ctx, monsterO, typeIdx) {
  const n3 = bLookup(typeIdx);
  if (n3 === 4) {
    const bossImg = monsterO[23]; // wardenbody.png
    const frame = typeIdx === 41 ? 0 : 1;
    blitFrame(ctx, bossImg, frame, 2, 33, 48);
    return;
  }
  if (n3 < 0 || n3 >= AD_TABLE.length) return;
  const row = AD_TABLE[n3];
  if (row.length < 6) return;
  const anchorX = row[2], anchorY = row[3];
  const bodyIdx = row[4], bodyDiv = row[5];
  const headDx = row[6] || 0, headDy = row[7] || 0;
  const headIdx = row.length > 8 ? row[8] : -1;
  const headDiv = row.length > 9 ? row[9] : -1;
  const aRow = A_TABLE[typeIdx - 1] || [0, 0];
  const bodyFrame = aRow[0];
  const headFrame = aRow[1];

  blitFrame(ctx, monsterO[bodyIdx], bodyFrame, bodyDiv, anchorX, anchorY);
  if (headIdx >= 0) {
    blitFrame(ctx, monsterO[headIdx], headFrame, headDiv, anchorX + headDx, anchorY + headDy);
  }
  const flags = G_TABLE[typeIdx - 1];
  if (flags) {
    const slotOffsets = [[10, 11, 12], [13, 14, 15], [16, 17, 18], [19, 20, 21]];
    flags.forEach((present, slot) => {
      if (!present) return;
      const [ox, oy, oi] = slotOffsets[slot];
      if (oi >= row.length) return;
      blitFrame(ctx, monsterO[row[oi]], 0, 1, anchorX + row[ox], anchorY + row[oy]);
    });
  }
}

/**
 * Not from the original — camp NPCs (peddlers/champions/Eustacia) don't
 * have dedicated portrait sprites in the extracted assets, only monsters
 * do. Reuses the humanoid body sprite (ban_male_body.png, index 0) as a
 * generic "a person is here" visual instead of a flat color tint, at the
 * same anchor AD_TABLE row 0 uses for consistency.
 */
export function drawGenericNpc(ctx, monsterO) {
  blitFrame(ctx, monsterO[0], 0, 2, 43, 48);
}

let cachedMonsterO = null;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Loads (and caches) the 26 monster sprite sheets, for any screen that
 * needs to render a monster outside the main dungeon view (e.g. combat). */
export async function loadMonsterSprites() {
  if (cachedMonsterO) return cachedMonsterO;
  cachedMonsterO = await Promise.all(MONSTER_O_FILES.map((f) => loadImage('assets/img/' + f)));
  return cachedMonsterO;
}
