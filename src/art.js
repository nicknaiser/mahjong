// Tile artwork, drawn as SVG. Two sets: "classic" and "dotd" (Day of the Dead).
// All artwork is original to this app.
import { rng } from './tiles.js';

export const THEMES = {
  classic: { name: 'Classic', desc: 'Traditional ivory tiles' },
  dotd: { name: 'Day of the Dead', desc: 'Black tiles, sugar skulls, candles and marigolds' },
};

const NUM_CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WIND_CN = { N: '北', E: '東', S: '南', W: '西' };
const FLOWER_CN = ['梅', '蘭', '菊', '竹', '春', '夏', '秋', '冬'];
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "'Trebuchet MS',Verdana,sans-serif";
const CJK = "'Noto Serif CJK SC','Songti SC','SimSun','PingFang SC','Hiragino Mincho ProN',serif";

// positions for 1-9 items on a 60x80 face
const LAYOUT = {
  1: [[30, 44]],
  2: [[30, 28], [30, 60]],
  3: [[17, 24], [30, 44], [43, 64]],
  4: [[19, 28], [41, 28], [19, 60], [41, 60]],
  5: [[18, 25], [42, 25], [30, 44], [18, 63], [42, 63]],
  6: [[19, 22], [41, 22], [19, 44], [41, 44], [19, 66], [41, 66]],
  7: [[15, 19], [30, 27], [45, 35], [19, 52], [41, 52], [19, 69], [41, 69]],
  8: [[19, 18], [41, 18], [19, 36], [41, 36], [19, 54], [41, 54], [19, 72], [41, 72]],
  9: [[15, 22], [30, 22], [45, 22], [15, 44], [30, 44], [45, 44], [15, 66], [30, 66], [45, 66]],
};
const DOT_R = { 1: 15, 2: 10, 3: 8.5, 4: 8.5, 5: 8, 6: 7.5, 7: 6.5, 8: 6.5, 9: 6.5 };

const wrap = (inner, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 80" ${extra}>${inner}</svg>`;
const txt = (x, y, s, size, fill, font = SANS, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-family="${font}" text-anchor="middle" font-weight="700" ${extra}>${s}</text>`;

// ------------------------------------------------------------------ classic
const C = { red: '#c0262d', green: '#17784a', blue: '#1d4f9c', ink: '#1b2a4a' };

function classicFace(inner) {
  return wrap(`<rect x="1" y="1" width="58" height="78" rx="7" fill="#fbf7ec" stroke="#d9cfb4" stroke-width="1.5"/>${inner}`);
}
function idx(s, color) { return txt(9, 13, s, 11, color, SANS); }

function classicDot(x, y, r, i, n) {
  const col = n === 1 ? C.red : [C.blue, C.green, C.red][i % 3];
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/><circle cx="${x}" cy="${y}" r="${r * 0.68}" fill="#fbf7ec"/>` +
    `<circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="${col}"/><circle cx="${x}" cy="${y}" r="${r * 0.15}" fill="#fbf7ec"/>`;
}
function classicStick(x, y, h, col) {
  const w = 5.5, t = y - h / 2;
  return `<rect x="${x - w / 2}" y="${t}" width="${w}" height="${h}" rx="2.6" fill="${col}"/>` +
    `<line x1="${x - w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y}" stroke="#fbf7ec" stroke-width="1"/>` +
    `<line x1="${x}" y1="${t + 2}" x2="${x}" y2="${t + h - 2}" stroke="#fbf7ec" stroke-width=".7" opacity=".7"/>`;
}
function classicBird() {
  return `<g transform="translate(30 46)">
    <path d="M-4 18 C-14 14 -20 2 -16 -8 C-12 -2 -8 2 -4 4 Z" fill="${C.green}"/>
    <path d="M4 18 C14 14 20 2 16 -8 C12 -2 8 2 4 4 Z" fill="${C.blue}"/>
    <ellipse cx="0" cy="4" rx="7" ry="11" fill="${C.red}"/>
    <circle cx="0" cy="-11" r="6" fill="${C.green}"/><circle cx="1.8" cy="-12" r="1.3" fill="#fff"/>
    <path d="M5 -11 l6 2 l-6 1 z" fill="#d89b1c"/>
    <path d="M-2 -17 q-3 -8 3 -10 q-1 5 1 9z" fill="${C.red}"/>
    <path d="M-3 15 l-2 9 M3 15 l2 9" stroke="${C.ink}" stroke-width="1.5"/></g>`;
}
function classicFlower(v) {
  let petals = '';
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * Math.PI / 180;
    petals += `<ellipse cx="${30 + Math.cos(a) * 8}" cy="${38 + Math.sin(a) * 8}" rx="7" ry="5" transform="rotate(${i * 72} ${30 + Math.cos(a) * 8} ${38 + Math.sin(a) * 8})" fill="${v % 2 ? '#e2557a' : '#d2468e'}"/>`;
  }
  return `<path d="M30 46 C29 58 33 66 30 74" stroke="${C.green}" stroke-width="2.5" fill="none"/>` +
    `<path d="M30 60 C22 56 18 58 16 62 C22 64 26 63 30 60Z M31 66 C38 61 43 62 45 65 C40 68 35 68 31 66Z" fill="${C.green}"/>` +
    petals + `<circle cx="30" cy="38" r="4.5" fill="#f4c430"/>` + txt(51, 14, FLOWER_CN[v % 8], 10, C.blue, CJK);
}
function classicJoker() {
  return `<path d="M30 14 l4.5 9.5 10.5 1.2 -7.8 7.1 2.2 10.3 -9.4 -5.3 -9.4 5.3 2.2 -10.3 -7.8 -7.1 10.5 -1.2z" fill="#f2b632" stroke="${C.red}" stroke-width="1.2"/>` +
    txt(30, 59, 'JOK', 15, C.red, SERIF) + txt(30, 73, 'ER', 15, C.blue, SERIF);
}
function classicSoap() {
  return `<rect x="12" y="14" width="36" height="54" rx="4" fill="none" stroke="${C.blue}" stroke-width="3"/>` +
    `<rect x="18" y="20" width="24" height="42" rx="2" fill="none" stroke="${C.blue}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
}

function classicTile(kind, v) {
  const s = kind[0], n = Number(kind[1]);
  if (s === 'd' && n) return classicFace(LAYOUT[n].map(([x, y], i) => classicDot(x, y, DOT_R[n], i, n)).join('') + idx(n, C.blue));
  if (s === 'b' && n) {
    if (n === 1) return classicFace(classicBird() + idx(1, C.green));
    const h = n <= 4 ? 22 : n <= 6 ? 17 : n === 8 ? 11 : 13;
    return classicFace(LAYOUT[n].map(([x, y], i) => classicStick(x, n === 8 ? 8 + y * 0.86 : y, h, (n === 5 || n === 9) && i === Math.floor(n / 2) ? C.red : i % 3 === 2 && n > 5 ? C.blue : C.green)).join('') + idx(n, C.green));
  }
  if (s === 'c' && n) return classicFace(txt(32, 37, NUM_CN[n], 23, C.ink, CJK) + txt(32, 70, '萬', 25, C.red, CJK) + idx(n, C.red));
  if ('NESW'.includes(kind)) return classicFace(txt(30, 50, kind, 36, C.ink, SERIF) + txt(30, 72, WIND_CN[kind], 14, C.red, CJK) + idx(kind, C.ink));
  if (kind === 'R') return classicFace(txt(30, 56, '中', 36, C.red, CJK) + idx('R', C.red));
  if (kind === 'G') return classicFace(txt(30, 56, '發', 34, C.green, CJK) + idx('G', C.green));
  if (kind === 'O') return classicFace(classicSoap() + idx('0', C.blue));
  if (kind === 'F') return classicFace(classicFlower(v) + idx('F', C.green));
  if (kind === 'J') return classicFace(classicJoker() + idx('J', C.red));
  return classicFace('');
}

// ------------------------------------------------------------------ Day of the Dead
const N = { pink: '#ff4fa3', orange: '#ff9a1f', lime: '#a6f13a', cyan: '#2fd6e8', yellow: '#ffd23f', purple: '#b06bff', red: '#ff3d3d', white: '#f7f3ea' };
const NEON = [N.pink, N.orange, N.lime, N.cyan, N.yellow, N.purple];

function dotdFace(inner, border, kind) {
  // black lacquer face, dotted border and little corner rosettes
  const r = rng(kind.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  let corners = '';
  for (const [x, y] of [[8, 9], [52, 9], [8, 71], [52, 71]]) corners += `<circle cx="${x}" cy="${y}" r="1.6" fill="${NEON[Math.floor(r() * 6)]}"/>`;
  return wrap(`<rect x="1" y="1" width="58" height="78" rx="7" fill="#141016"/>` +
    `<rect x="4" y="4" width="52" height="72" rx="5" fill="none" stroke="${border}" stroke-width="1.4" stroke-dasharray="0.1 3.2" stroke-linecap="round"/>` +
    corners + inner);
}
const dIdx = s => `<text x="9.5" y="15" font-size="11" fill="${N.white}" font-family="${SANS}" text-anchor="middle" font-weight="800" stroke="#141016" stroke-width="2.5" paint-order="stroke">${s}</text>`;

function sugarSkull(cx, cy, sc, col, eye) {
  return `<g transform="translate(${cx} ${cy}) scale(${sc})">
    <path d="M-13 -2 C-13 -16 13 -16 13 -2 C13 6 9 8 8 11 L8 15 L-8 15 L-8 11 C-9 8 -13 6 -13 -2Z" fill="${col}"/>
    <circle cx="-5.5" cy="-1" r="4.6" fill="#141016"/><circle cx="5.5" cy="-1" r="4.6" fill="#141016"/>
    <circle cx="-5.5" cy="-1" r="3" fill="none" stroke="${eye}" stroke-width="1.4"/><circle cx="5.5" cy="-1" r="3" fill="none" stroke="${eye}" stroke-width="1.4"/>
    <circle cx="-5.5" cy="-1" r="1" fill="${eye}"/><circle cx="5.5" cy="-1" r="1" fill="${eye}"/>
    <path d="M0 4 l-2 3 h4z" fill="#141016"/>
    <path d="M-6 10.5 H6 M-4 9 v4 M-1.3 9 v4 M1.3 9 v4 M4 9 v4" stroke="#141016" stroke-width="1"/>
    <path d="M-3 -10 q3 -3 6 0 q-3 3 -6 0z" fill="${eye}"/>
    <circle cx="-10" cy="-6" r="1" fill="${eye}"/><circle cx="10" cy="-6" r="1" fill="${eye}"/></g>`;
}
function candle(x, y, h, col, w = 5) {
  const t = y - h / 2;
  return `<path d="M${x} ${t - 7} c-2.6 3 -2.6 5.4 0 6.4 c2.6 -1 2.6 -3.4 0 -6.4z" fill="${N.orange}"/>` +
    `<path d="M${x} ${t - 4.2} c-1 1.4 -1 2.6 0 3.2 c1 -.6 1 -1.8 0 -3.2z" fill="${N.yellow}"/>` +
    `<rect x="${x - w / 2}" y="${t}" width="${w}" height="${h}" rx="1.2" fill="${col}"/>` +
    `<path d="M${x - w / 2} ${t + 1} q${w / 4} 3 ${w / 2} 0 q${w / 4} 4 ${w / 2} 0" fill="#fff" opacity=".55"/>`;
}
function marigold(x, y, r, col, center) {
  let p = '';
  const k = 8;
  for (let i = 0; i < k; i++) {
    const a = i * Math.PI * 2 / k;
    p += `<circle cx="${(x + Math.cos(a) * r * 0.62).toFixed(2)}" cy="${(y + Math.sin(a) * r * 0.62).toFixed(2)}" r="${(r * 0.36).toFixed(2)}" fill="${col}"/>`;
  }
  return p + `<circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="#141016"/><circle cx="${x}" cy="${y}" r="${r * 0.3}" fill="${center}"/>` +
    `<circle cx="${x}" cy="${y}" r="${r * 0.12}" fill="#141016"/>`;
}
function confetti(seed, count) {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < count; i++) {
    const x = 7 + r() * 46, y = 8 + r() * 64, c = NEON[Math.floor(r() * 6)];
    s += r() < 0.5 ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.1" fill="${c}"/>` :
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="2.4" height="1.2" fill="${c}" transform="rotate(${Math.floor(r() * 180)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  return s;
}
function dog() { // xoloitzcuintle in neon green outline, with skeleton marks
  const g = N.lime;
  return `<g fill="none" stroke="${g}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
    <path d="M22 14 L25 26 L30 25 L33 13 L34 27 C40 29 41 35 36 37 L31 38 C30 44 31 48 34 52 C40 54 44 60 44 68 L46 70 H38 L37 64 L33 66 L32 70 H25 C21 64 20 56 24 48 C25 42 23 36 22 30 C19 28 19 22 22 14Z"/>
    <path d="M44 68 C50 66 52 58 48 52"/>
    <path d="M27 50 h7 M26 54 h9 M26 58 h9 M27 62 h7" stroke-width="1.2"/>
    <circle cx="30" cy="31" r="1.6" fill="${g}"/></g>`;
}
function cat() {
  const c = N.red, o = N.orange;
  return `<g fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
    <path d="M20 16 L23 26 C21 30 21 36 26 38 C24 44 21 52 22 60 C23 66 27 70 33 70 H42 C44 66 42 62 40 60 C42 52 40 44 35 38 C40 36 40 30 37 26 L40 16 L34 23 H26Z"/>
    <path d="M42 70 C50 70 52 62 48 56 C46 52 48 48 52 48"/>
    <path d="M26 46 h9 M25 51 h11 M25 56 h11 M26 61 h9" stroke="${o}" stroke-width="1.2"/></g>
    <circle cx="27" cy="30" r="2.2" fill="${N.yellow}"/><circle cx="33" cy="30" r="2.2" fill="${N.yellow}"/>
    <circle cx="27" cy="30" r=".9" fill="#141016"/><circle cx="33" cy="30" r=".9" fill="#141016"/>`;
}
function coffin() {
  return `<path d="M24 12 H36 L44 26 L39 70 H21 L16 26Z" fill="none" stroke="${N.white}" stroke-width="2.6" stroke-linejoin="round"/>` +
    `<path d="M25.5 17 H34.5 L40.5 27 L36.5 65 H23.5 L19.5 27Z" fill="none" stroke="${N.white}" stroke-width="1"/>` +
    `<g fill="${N.white}"><circle cx="30" cy="34" r="3.2"/><circle cx="30" cy="46" r="3.2"/><circle cx="24" cy="40" r="3.2"/><circle cx="36" cy="40" r="3.2"/></g>` +
    `<circle cx="30" cy="40" r="2.2" fill="#141016"/>`;
}
function rose(v) {
  const p1 = v % 2 ? N.purple : N.pink, p2 = v % 2 ? N.pink : N.purple;
  return `<path d="M30 46 C28 56 34 64 30 74" stroke="${N.cyan}" stroke-width="2.4" fill="none"/>` +
    `<path d="M30 58 C22 52 16 55 14 60 C21 63 26 62 30 58Z M31 66 C39 60 44 62 46 66 C40 69 35 69 31 66Z" fill="${N.cyan}"/>` +
    `<circle cx="30" cy="36" r="13" fill="${p1}"/><circle cx="30" cy="36" r="9" fill="${p2}"/>` +
    `<path d="M24 36 q6 -9 12 0 q-6 6 -12 0z" fill="${N.yellow}"/><circle cx="30" cy="35" r="2.4" fill="${N.orange}"/>` +
    `<circle cx="42" cy="24" r="5" fill="${N.yellow}"/><circle cx="42" cy="24" r="2" fill="${N.orange}"/>` +
    txt(12, 17, FLOWER_CN[v % 8], 9.5, N.white, CJK) + txt(50, 74, String((v % 4) + 1), 9, N.pink, SANS);
}
function catrina() {
  return `<path d="M8 30 C12 18 48 18 52 30 C46 26 14 26 8 30Z" fill="${N.purple}"/>` +
    `<path d="M18 24 C18 10 42 10 42 24Z" fill="${N.purple}"/>` +
    `<circle cx="23" cy="20" r="3.2" fill="${N.pink}"/><circle cx="30" cy="17" r="3.2" fill="${N.orange}"/><circle cx="37" cy="20" r="3.2" fill="${N.yellow}"/>` +
    sugarSkull(30, 40, 0.95, N.white, N.pink) + txt(30, 71, 'JOKER', 11.5, N.white, SERIF, `letter-spacing="0.5"`);
}

function dotdTile(kind, v) {
  const s = kind[0], n = Number(kind[1]);
  if (s === 'c' && n) {
    const col = [N.lime, N.pink, N.orange, N.cyan, N.yellow][n % 5];
    return dotdFace(sugarSkull(30, 34, 1.15, col, NEON[(n + 2) % 6]) + txt(30, 71, NUM_CN[n], 15, N.red, CJK) +
      `<path d="M8 30 q3 4 0 8 q-3 4 0 8 M52 30 q-3 4 0 8 q3 4 0 8" stroke="${N.purple}" stroke-width="1.2" fill="none"/>` + dIdx(n), N.orange, kind);
  }
  if (s === 'b' && n) {
    if (n === 1) return dotdFace(candle(30, 50, 28, N.pink, 10) + marigold(16, 66, 7, N.orange, N.yellow) + marigold(44, 66, 7, N.yellow, N.orange) + dIdx(1), N.lime, kind);
    const h = n <= 3 ? 22 : n <= 6 ? 15 : 9;
    const items = LAYOUT[n].map(([x, y], i) => candle(x, n >= 7 ? 10 + y * 0.82 : y + 3, h, NEON[(i + n) % 6])).join('');
    return dotdFace(items + dIdx(n), N.lime, kind);
  }
  if (s === 'd' && n) {
    const r = DOT_R[n] * 1.05;
    return dotdFace(LAYOUT[n].map(([x, y], i) => marigold(x, y, r, NEON[(i * 2 + n) % 6], NEON[(i * 2 + n + 3) % 6])).join('') + dIdx(n), N.pink, kind);
  }
  if ('NESW'.includes(kind)) {
    const seed = kind.charCodeAt(0) * 97;
    return dotdFace(confetti(seed, 26) + sugarSkull(47, 66, 0.38, N.cyan, N.pink) +
      `<text x="30" y="55" font-size="40" fill="${N.white}" font-family="${SERIF}" text-anchor="middle" font-weight="900" stroke="#141016" stroke-width="2" paint-order="stroke">${kind}</text>` +
      txt(12, 72, WIND_CN[kind], 9, N.orange, CJK), N.purple, kind);
  }
  if (kind === 'G') return dotdFace(dog() + dIdx('G'), N.lime, kind);
  if (kind === 'R') return dotdFace(cat() + dIdx('R'), N.red, kind);
  if (kind === 'O') return dotdFace(coffin() + dIdx('0'), N.white, kind);
  if (kind === 'F') return dotdFace(rose(v), N.cyan, kind);
  if (kind === 'J') return dotdFace(catrina(), N.yellow, kind);
  return dotdFace('', N.white, kind);
}

// ------------------------------------------------------------------ backs
function back(theme) {
  if (theme === 'dotd') {
    return wrap(`<rect x="1" y="1" width="58" height="78" rx="7" fill="#e83e98"/>` +
      `<rect x="6" y="6" width="48" height="68" rx="5" fill="none" stroke="#ffb0d6" stroke-width="1" stroke-dasharray="0.1 3" stroke-linecap="round"/>` +
      sugarSkull(30, 40, 0.75, '#ffc1de', '#e83e98'));
  }
  return wrap(`<rect x="1" y="1" width="58" height="78" rx="7" fill="#1f6b4a"/>` +
    `<rect x="6" y="6" width="48" height="68" rx="5" fill="none" stroke="#e8d9a8" stroke-width="1.2"/>` +
    `<path d="M30 22 L40 40 L30 58 L20 40Z" fill="none" stroke="#e8d9a8" stroke-width="1.2"/>`);
}

const cache = new Map();
export function tileSVG(kind, theme = 'classic', variant = 0) {
  const key = theme + kind + (kind === 'F' ? variant : '');
  let s = cache.get(key);
  if (!s) {
    s = kind === 'back' ? back(theme) : theme === 'dotd' ? dotdTile(kind, variant) : classicTile(kind, variant);
    cache.set(key, s);
  }
  return s;
}
