// Tile kinds:
//   b1..b9 Bams, c1..c9 Craks, d1..d9 Dots
//   N E S W winds; R (red dragon), G (green dragon), O (white dragon / "soap", also used as zero)
//   F flower, J joker
export const SUITS = ['b', 'c', 'd'];
export const SUIT_NAMES = { b: 'Bam', c: 'Crak', d: 'Dot' };
export const SUIT_DRAGON = { b: 'G', c: 'R', d: 'O' };
export const WINDS = ['N', 'E', 'W', 'S'];
export const DRAGONS = ['R', 'G', 'O'];

export const KINDS = [];
for (const s of SUITS) for (let n = 1; n <= 9; n++) KINDS.push(s + n);
KINDS.push(...WINDS, ...DRAGONS, 'F', 'J');

// Build the 152-tile American set. Returns array index (tile id) -> kind.
export function buildSet() {
  const set = [];
  for (const s of SUITS) for (let n = 1; n <= 9; n++) for (let i = 0; i < 4; i++) set.push(s + n);
  for (const k of [...WINDS, ...DRAGONS]) for (let i = 0; i < 4; i++) set.push(k);
  for (let i = 0; i < 8; i++) set.push('F');
  for (let i = 0; i < 8; i++) set.push('J');
  return set;
}
export const TILESET = buildSet(); // 152 tiles
export const kindOf = id => TILESET[id];
// which of the 8 flowers (for artwork variety)
export const flowerIndex = id => id - TILESET.indexOf('F');

export function tileName(kind) {
  if (kind === 'J') return 'Joker';
  if (kind === 'F') return 'Flower';
  if (kind === 'R') return 'Red Dragon';
  if (kind === 'G') return 'Green Dragon';
  if (kind === 'O') return 'White Dragon (Soap)';
  if (kind === 'N') return 'North';
  if (kind === 'E') return 'East';
  if (kind === 'S') return 'South';
  if (kind === 'W') return 'West';
  return kind[1] + ' ' + SUIT_NAMES[kind[0]];
}

const ORDER = Object.fromEntries(KINDS.map((k, i) => [k, i]));
export const kindOrder = k => ORDER[k];
export function sortIds(ids, mode = 'suit') {
  const key = id => {
    const k = TILESET[id];
    if (mode === 'number' && /^[bcd]\d$/.test(k)) return Number(k[1]) * 10 + SUITS.indexOf(k[0]);
    if (mode === 'number') return 100 + ORDER[k];
    return ORDER[k];
  };
  return [...ids].sort((a, b) => key(a) - key(b) || a - b);
}

export function countKinds(ids) {
  const c = {};
  for (const id of ids) { const k = TILESET[id]; c[k] = (c[k] || 0) + 1; }
  return c;
}

// Seeded RNG (mulberry32) so games can be reproduced in tests.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, rand = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
