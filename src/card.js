// Card format, the built-in practice card, and hand matching.
//
// A hand's pattern is a list of space-separated tokens. Each token is a run of tile symbols
// plus an optional suit tag (a, b or c). Identical symbols in a row form one group:
//   "FFFF" = kong of flowers, "222a" = pung of 2s in suit a, "2026a" = four singles 2, 0, 2, 6.
// Symbols: 1-9 numbers, 0 or O = white dragon (soap), N E W S winds, R red dragon,
//          G green dragon, D = the dragon that matches the token's suit, F flower.
// Different tags always mean different suits; numbers with no tag are suit a.
// shift: '' = numbers exactly as shown; 'any' = all numbers may move up/down together
//        (e.g. "any 3 consecutive numbers" or "any like numbers"); 'even' = move by 2s only.
// Jokers may stand in for any tile in a group of 3 or more, never in a single or pair.
import { SUITS, SUIT_DRAGON, TILESET } from './tiles.js';

export const TAG_COLORS = { a: '#1f8a4c', b: '#d0312d', c: '#2563eb' };

export function parsePattern(text) {
  const groups = [];
  const errors = [];
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const m = /^([0-9NEWSRGDFO]+)([abc])?$/.exec(tok);
    if (!m) { errors.push(`"${tok}" isn't valid. Use 1-9, 0, N E W S, R G D, F, then an optional a/b/c suit tag.`); continue; }
    const body = m[1], tag = m[2] || null;
    let i = 0;
    while (i < body.length) {
      let j = i;
      while (j < body.length && body[j] === body[i]) j++;
      const ch = body[i], n = j - i;
      let g;
      if (/[1-9]/.test(ch)) g = { t: 'num', v: Number(ch), tag: tag || 'a', n };
      else if (ch === '0' || ch === 'O') g = { t: 'k', kind: 'O', n };
      else if (ch === 'D') g = { t: 'dragon', tag: tag || 'a', n };
      else g = { t: 'k', kind: ch, n };
      groups.push(g);
      i = j;
    }
  }
  const total = groups.reduce((s, g) => s + g.n, 0);
  if (!errors.length && total !== 14) errors.push(`Pattern has ${total} tiles; a hand needs exactly 14.`);
  for (const g of groups) if (g.n > 8) errors.push('A group can have at most 8 tiles.');
  for (const g of groups) if (g.t !== 'k' || g.kind !== 'F') if (g.n > 6) errors.push('Only flowers can come in groups larger than 6.');
  return { groups, tokens, errors };
}

function permutations(arr, k) {
  if (k === 0) return [[]];
  const out = [];
  arr.forEach((x, i) => {
    for (const rest of permutations(arr.filter((_, j) => j !== i), k - 1)) out.push([x, ...rest]);
  });
  return out;
}

// Expand a hand into every concrete arrangement ("variant").
export function expandHand(hand) {
  const { groups, errors } = parsePattern(hand.pattern);
  if (errors.length) return { errors, variants: [] };
  const tags = [...new Set(groups.filter(g => g.tag).map(g => g.tag))].sort();
  if (tags.length > 3) return { errors: ['At most 3 suit tags (a, b, c).'], variants: [] };
  const nums = groups.filter(g => g.t === 'num').map(g => g.v);
  let shifts = [0];
  if (hand.shift && nums.length) {
    const lo = Math.min(...nums), hi = Math.max(...nums);
    shifts = [];
    for (let k = 1 - lo; k <= 9 - hi; k++) if (hand.shift !== 'even' || k % 2 === 0) shifts.push(k);
  }
  const seen = new Set();
  const variants = [];
  for (const perm of permutations(SUITS, tags.length)) {
    const sm = Object.fromEntries(tags.map((t, i) => [t, perm[i]]));
    for (const k of shifts) {
      const cg = groups.map(g => {
        if (g.t === 'num') return { kind: sm[g.tag] + (g.v + k), n: g.n, tag: g.tag };
        if (g.t === 'dragon') return { kind: SUIT_DRAGON[sm[g.tag]], n: g.n, tag: g.tag };
        return { kind: g.kind, n: g.n, tag: null };
      });
      const key = cg.map(g => g.kind + g.n).sort().join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      variants.push({ groups: cg, shift: k, suits: sm });
    }
  }
  return { errors: [], variants };
}

export function validateHand(hand) {
  const errs = [];
  if (!hand.pattern) errs.push('Pattern is empty.');
  const { errors } = expandHand(hand);
  errs.push(...errors);
  const v = Number(hand.value);
  if (!Number.isFinite(v) || v <= 0 || v > 1000) errs.push('Value must be a positive number.');
  return errs;
}

// Prepare a card for fast matching. Bad hands are skipped (and reported).
export function compileCard(card) {
  const hands = [];
  const problems = [];
  (card.hands || []).forEach((h, i) => {
    const errs = validateHand(h);
    if (errs.length) { problems.push({ index: i, hand: h, errors: errs }); return; }
    const { variants } = expandHand(h);
    const allowsJokers = variants[0].groups.some(g => g.n >= 3);
    hands.push({ ...h, idx: i, variants, allowsJokers });
  });
  return { name: card.name, hands, problems, source: card };
}

// How many more tiles a player needs for one variant (Infinity if impossible).
//   counts: natural (non-joker) concealed tiles by kind; jokers: concealed jokers
//   exposures: [{kind, n}] already on the rack; unseen (optional): tiles still hidden, by kind
export function variantNeed(variant, counts, jokers, exposures, unseen) {
  if (!exposures.length) {
    // fast path: per-kind totals precomputed once per variant
    const agg = variant.agg || (variant.agg = aggregate(variant.groups));
    let need = 0, bigDef = 0;
    for (let i = 0; i < agg.length; i++) {
      const a = agg[i], c = counts[a.k] || 0;
      let avail;
      if (c < a.s) {
        need += a.s - c;
        if (unseen && (unseen[a.k] || 0) < a.s - c) return Infinity;
        avail = 0;
      } else avail = c - a.s;
      if (a.b > avail) bigDef += a.b - avail;
    }
    return need + bigDef - Math.min(jokers, bigDef);
  }
  const used = new Array(variant.groups.length).fill(false);
  for (const e of exposures) {
    let hit = -1;
    for (let i = 0; i < variant.groups.length; i++) {
      const g = variant.groups[i];
      if (!used[i] && g.kind === e.kind && g.n === e.n) { hit = i; break; }
    }
    if (hit < 0) return Infinity;
    used[hit] = true;
  }
  const small = {}, big = {};
  variant.groups.forEach((g, i) => {
    if (used[i]) return;
    if (g.n >= 3) big[g.kind] = (big[g.kind] || 0) + g.n;
    else small[g.kind] = (small[g.kind] || 0) + g.n;
  });
  let need = 0, bigDef = 0;
  const kinds = new Set([...Object.keys(small), ...Object.keys(big)]);
  for (const k of kinds) {
    const s = small[k] || 0, b = big[k] || 0, c = counts[k] || 0;
    let avail = c;
    if (c < s) {
      need += s - c;
      if (unseen && (unseen[k] || 0) < s - c) return Infinity;
      avail = 0;
    } else avail = c - s;
    bigDef += Math.max(0, b - avail);
  }
  const jUsed = Math.min(jokers, bigDef);
  need += bigDef - jUsed;
  return need;
}

function aggregate(groups) {
  const m = new Map();
  for (const g of groups) {
    const a = m.get(g.kind) || { k: g.kind, s: 0, b: 0 };
    if (g.n >= 3) a.b += g.n; else a.s += g.n;
    m.set(g.kind, a);
  }
  return [...m.values()];
}

export function handNeed(hand, counts, jokers, exposures, unseen, concealedOnly = true) {
  if (hand.c && exposures.length && concealedOnly) return { need: Infinity, variant: null };
  let best = Infinity, bv = null;
  for (const v of hand.variants) {
    const n = variantNeed(v, counts, jokers, exposures, unseen);
    if (n < best) { best = n; bv = v; if (n === 0) break; }
  }
  return { need: best, variant: bv };
}

export function splitTiles(ids) {
  const counts = {};
  let jokers = 0;
  for (const id of ids) {
    const k = TILESET[id];
    if (k === 'J') jokers++;
    else counts[k] = (counts[k] || 0) + 1;
  }
  return { counts, jokers };
}

export function exposureSig(exposures) {
  return exposures.map(e => ({ kind: e.kind, n: e.ids.length }));
}

// Rank every hand on the card for a player (used by hints and bots).
export function rankHands(card, handIds, exposures, unseen) {
  const { counts, jokers } = splitTiles(handIds);
  const ex = exposureSig(exposures);
  const out = [];
  for (const h of card.hands) {
    const r = handNeed(h, counts, jokers, ex, unseen);
    if (r.need < Infinity) out.push({ hand: h, need: r.need, variant: r.variant });
  }
  out.sort((a, b) => a.need - b.need || b.hand.value - a.hand.value);
  return out;
}

// Does this exact set of tiles (concealed + exposures) make Mahjong? Returns the best hand or null.
export function findWin(card, handIds, exposures) {
  const total = handIds.length + exposures.reduce((s, e) => s + e.ids.length, 0);
  if (total !== 14) return null;
  const { counts, jokers } = splitTiles(handIds);
  const ex = exposureSig(exposures);
  let best = null;
  for (const h of card.hands) {
    const r = handNeed(h, counts, jokers, ex);
    if (r.need === 0 && (!best || h.value > best.hand.value)) best = { hand: h, variant: r.variant };
  }
  return best;
}

// Is a set of exposures still possible for at least one hand on the card?
export function exposuresPossible(card, exposures) {
  const ex = exposureSig(exposures);
  return card.hands.some(h => !h.c && h.variants.some(v => variantNeed(v, {}, 99, ex) < Infinity));
}

// Human-friendly list of tiles a variant still wants (for hints).
export function wantedKinds(variant, handIds, exposures) {
  const { counts } = splitTiles(handIds);
  const ex = exposureSig(exposures);
  const used = new Array(variant.groups.length).fill(false);
  for (const e of ex) {
    const i = variant.groups.findIndex((g, j) => !used[j] && g.kind === e.kind && g.n === e.n);
    if (i >= 0) used[i] = true;
  }
  const req = {};
  variant.groups.forEach((g, i) => { if (!used[i]) req[g.kind] = (req[g.kind] || 0) + g.n; });
  const want = [];
  for (const k of Object.keys(req)) if ((counts[k] || 0) < req[k]) want.push(k);
  return want;
}

// Tiles in hand that a variant has no use for.
export function unusedTiles(variant, handIds, exposures) {
  const ex = exposureSig(exposures);
  const used = new Array(variant.groups.length).fill(false);
  for (const e of ex) {
    const i = variant.groups.findIndex((g, j) => !used[j] && g.kind === e.kind && g.n === e.n);
    if (i >= 0) used[i] = true;
  }
  const req = {};
  variant.groups.forEach((g, i) => { if (!used[i]) req[g.kind] = (req[g.kind] || 0) + g.n; });
  const out = [];
  for (const id of handIds) {
    const k = TILESET[id];
    if (k === 'J') continue;
    if ((req[k] || 0) > 0) req[k]--;
    else out.push(id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The built-in practice card. Every hand here is original to this app; it is
// NOT the National Mah Jongg League card. Players with an official card can
// type its hands into the card editor for their own use.
export const PRACTICE_CARD = {
  name: 'Practice Card 2026',
  builtIn: true,
  hands: [
    // Twenty-Six (0 = white dragon / soap)
    { cat: 'Twenty-Six', pattern: 'FFFF 2026a 222b 666c', value: 25, note: 'Any 3 suits: 2026 in one suit, pungs in the other two' },
    { cat: 'Twenty-Six', pattern: '222a 000 2222b 6666b', value: 25, note: 'Any 2 suits: kongs of 2s and 6s match' },
    { cat: 'Twenty-Six', pattern: 'FFF 2026a 2026b DDDb', value: 30, note: 'Any 2 suits: dragons match the second 2026' },
    { cat: 'Twenty-Six', pattern: '2222a 0000 2222b 66c', value: 30, note: 'Any 3 suits' },
    { cat: 'Twenty-Six', pattern: 'NEWS 2026a 2026b 22c', value: 50, c: true, note: 'Any 3 suits, concealed' },
    // Runs
    { cat: 'Runs', pattern: '11a 222a 3333a 444a 55a', value: 25, shift: 'any', note: 'Any 5 consecutive numbers, one suit' },
    { cat: 'Runs', pattern: '111a 2222b 333c 4444a', value: 25, shift: 'any', note: 'Any 4 consecutive numbers, 3 suits; kongs match' },
    { cat: 'Runs', pattern: 'FF 111a 222b 333c DDDa', value: 25, shift: 'any', note: 'Any 3 consecutive numbers, 3 suits; dragons match the first' },
    { cat: 'Runs', pattern: 'FF 1234a 5555b 6789a', value: 30, note: '1-9 run in one suit; kong of 5s in another' },
    { cat: 'Runs', pattern: '11a 22a 333b 444b 5555c', value: 30, shift: 'any', note: 'Any 5 consecutive numbers, 3 suits' },
    { cat: 'Runs', pattern: '1111a 2222a 3333a NN', value: 25, shift: 'any', note: 'Any 3 consecutive numbers, one suit, pair of North' },
    // Like Numbers
    { cat: 'Like Numbers', pattern: 'FF 1111a 1111b 1111c', value: 25, shift: 'any', note: 'Any like number in all 3 suits' },
    { cat: 'Like Numbers', pattern: '111a DDDa 111b DDDb 11c', value: 30, shift: 'any', note: 'Any like number; dragons match' },
    { cat: 'Like Numbers', pattern: 'FFFF 111a 111b 1111c', value: 25, shift: 'any', note: 'Any like number in all 3 suits' },
    { cat: 'Like Numbers', pattern: 'EEE WWW 1111a 1111b', value: 25, shift: 'any', note: 'Any like number in 2 suits' },
    // Evens
    { cat: 'Evens', pattern: '222a 444a 6666b 8888c', value: 25, note: 'Any 3 suits' },
    { cat: 'Evens', pattern: '22a 44a 666b 888b DDDDc', value: 25, note: 'Any 3 suits; dragons match the third suit' },
    { cat: 'Evens', pattern: 'FF 2222a 44b 66b 8888a', value: 30, note: 'Any 2 suits' },
    { cat: 'Evens', pattern: '2468a 2468b 2222c 88c', value: 35, c: true, note: 'Any 3 suits, concealed' },
    // Odds
    { cat: 'Odds', pattern: '111a 333a 5555b 7777b', value: 25, note: 'Any 2 suits' },
    { cat: 'Odds', pattern: '11a 33a 555a 777a 9999a', value: 30, note: 'One suit' },
    { cat: 'Odds', pattern: '135a 135b 7777c 9999c', value: 25, note: 'Any 3 suits' },
    { cat: 'Odds', pattern: 'FF 1111a 5555b 9999c', value: 25, note: 'Any 3 suits' },
    // Winds & Dragons
    { cat: 'Winds & Dragons', pattern: 'NNNN EEE WWW SSSS', value: 25, note: 'Kongs of North and South' },
    { cat: 'Winds & Dragons', pattern: 'FF NNN SSS DDDDa DDb', value: 30, note: 'Any 2 different dragons' },
    { cat: 'Winds & Dragons', pattern: 'NN EE WWW SSS DDDD', value: 25, note: 'Kong of any dragon' },
    { cat: 'Winds & Dragons', pattern: 'FFFF DDDa DDDb DDDDc', value: 30, note: 'All 3 dragons' },
    { cat: 'Winds & Dragons', pattern: 'NEWS NEWS RRR GGG', value: 35, c: true, note: 'Concealed' },
    // Patterns
    { cat: 'Patterns', pattern: 'FF 369a 369b 3333c 99c', value: 30, note: 'Any 3 suits' },
    { cat: 'Patterns', pattern: '13579a 2468b FFF DDb', value: 35, c: true, note: 'Any 2 suits; dragons match the evens; concealed' },
    { cat: 'Patterns', pattern: '112233a 112233b DDc', value: 40, shift: 'any', c: true, note: 'Any 3 consecutive numbers in 2 suits; concealed' },
    // Pairs (singles and pairs — no jokers possible)
    { cat: 'Pairs', pattern: 'FF 11a 22a 33a 44a 55a 66a', value: 50, shift: 'any', c: true, note: 'Any 6 consecutive numbers, one suit' },
    { cat: 'Pairs', pattern: 'NN EE WW SS 11a 11b 11c', value: 50, shift: 'any', c: true, note: 'Any like number in 3 suits' },
    { cat: 'Pairs', pattern: 'FF 2026a 22b 66b 2026c', value: 50, c: true, note: 'Any 3 suits' },
    { cat: 'Pairs', pattern: '13579a 13579b FF 55c', value: 50, c: true, note: 'Any 3 suits' },
  ],
};
