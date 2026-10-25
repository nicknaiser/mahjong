// Computer players. Bots see only what a human in their seat could see.
import { kindOf, TILESET } from './tiles.js';
import { handNeed, splitTiles, exposureSig, findWin, variantNeed } from './card.js';
import { getCard, claimOptions, swapOptions, blindAllowed } from './engine.js';

// Tiles this seat cannot see (in the wall or in other hands).
export function unseenFor(state, seat) {
  const u = {};
  for (const k of TILESET) u[k] = (u[k] || 0) + 1;
  const take = id => { u[kindOf(id)]--; };
  state.players[seat].hand.forEach(take);
  state.players.forEach(p => p.exp.forEach(e => e.ids.forEach(take)));
  state.discards.forEach(d => take(d.id));
  return u;
}

// How promising a set of tiles is: higher is better.
export function evaluate(card, handIds, exp, unseen) {
  const { counts, jokers } = splitTiles(handIds);
  const ex = exposureSig(exp);
  let score = 0, best = Infinity;
  for (const h of card.hands) {
    if (h.c && ex.length) continue;
    const { need } = handNeed(h, counts, jokers, ex, unseen);
    if (need === Infinity) continue;
    if (need < best) best = need;
    score += Math.exp(-1.1 * need) * (1 + h.value / 100);
  }
  return { score, best };
}

const LEVELS = { easy: { noise: 0.35, aware: false }, medium: { noise: 0.05, aware: false }, hard: { noise: 0, aware: true } };

function pickDiscard(state, seat, level, rand) {
  const card = getCard(state);
  const p = state.players[seat];
  const L = LEVELS[level] || LEVELS.medium;
  const unseen = L.aware ? unseenFor(state, seat) : undefined;
  const danger = L.aware ? dangerKinds(state, seat) : new Set();
  const kinds = [...new Set(p.hand.map(kindOf))].filter(k => k !== 'J');
  if (!kinds.length) return p.hand[0];
  const scored = kinds.map(k => {
    const id = p.hand.find(x => kindOf(x) === k);
    const rest = p.hand.filter(x => x !== id);
    let { score } = evaluate(card, rest, p.exp, unseen);
    if (danger.has(k)) score *= 0.85;
    return { id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  if (rand() < L.noise) return scored[Math.floor(rand() * Math.min(4, scored.length))].id;
  return scored[0].id;
}

// Kinds an opponent with 3+ exposures might be waiting on.
function dangerKinds(state, seat) {
  const card = getCard(state);
  const out = new Set();
  state.players.forEach((q, i) => {
    if (i === seat || q.dead || q.exp.length < 3) return;
    const ex = exposureSig(q.exp);
    for (const h of card.hands) {
      if (h.c) continue;
      for (const v of h.variants) {
        if (variantNeed(v, {}, 99, ex) === Infinity) continue;
        const used = new Array(v.groups.length).fill(false);
        for (const e of ex) { const j = v.groups.findIndex((g, x) => !used[x] && g.kind === e.kind && g.n === e.n); if (j >= 0) used[j] = true; }
        v.groups.forEach((g, x) => { if (!used[x]) out.add(g.kind); });
      }
    }
  });
  return out;
}

function pickPass(state, seat, count, level, rand) {
  const card = getCard(state);
  let hand = [...state.players[seat].hand];
  const chosen = [];
  const L = LEVELS[level] || LEVELS.medium;
  for (let i = 0; i < count; i++) {
    const kinds = [...new Set(hand.map(kindOf))].filter(k => k !== 'J');
    if (!kinds.length) break;
    let opts = kinds.map(k => {
      const id = hand.find(x => kindOf(x) === k);
      return { id, score: evaluate(card, hand.filter(x => x !== id), [], undefined).score };
    }).sort((a, b) => b.score - a.score);
    const pick = rand() < L.noise ? opts[Math.floor(rand() * Math.min(5, opts.length))] : opts[0];
    chosen.push(pick.id);
    hand = hand.filter(x => x !== pick.id);
  }
  return chosen;
}

// Decide what a bot does right now. Returns an action or null if it has nothing to do.
export function botAction(state, seat, level = 'medium', rand = Math.random) {
  const p = state.players[seat];
  const card = getCard(state);
  switch (state.phase) {
    case 'charleston': {
      if (state.ch.subs[seat]) return null;
      return { type: 'pass', ids: pickPass(state, seat, 3, level, rand), blind: 0 };
    }
    case 'vote': {
      if (seat in state.ch.votes) return null;
      if (level === 'easy') return { type: 'vote', go: rand() < 0.6 };
      const { best } = evaluate(card, p.hand, [], undefined);
      return { type: 'vote', go: best >= 5 };
    }
    case 'courtesy': {
      if (state.ch.courtesy[seat]) return null;
      const { score } = evaluate(card, p.hand, [], undefined);
      const junk = pickPass(state, seat, 3, level, rand).filter(id => {
        const s = evaluate(card, p.hand.filter(x => x !== id), [], undefined).score;
        return s >= score * 0.97;
      });
      return { type: 'courtesy', ids: level === 'easy' ? junk.slice(0, 1) : junk };
    }
    case 'play': {
      if (state.turn !== seat) return null;
      if (!p.dead && findWin(card, p.hand, p.exp)) return { type: 'mahjong' };
      if (!p.dead && level !== 'easy') {
        const base = evaluate(card, p.hand, p.exp).score;
        for (const o of swapOptions(state, seat)) {
          const after = p.hand.filter(x => x !== o.id).concat(state.players[o.target].exp[o.exp].ids.find(id => kindOf(id) === 'J'));
          if (evaluate(card, after, p.exp).score >= base) return { type: 'swap', id: o.id, target: o.target, exp: o.exp };
        }
      }
      return { type: 'discard', id: pickDiscard(state, seat, level, rand) };
    }
    case 'claim': {
      const opts = claimOptions(state, seat);
      if (!opts || seat in state.claim.resp) return null;
      if (opts.win) return { type: 'claim', claim: level === 'easy' && rand() < 0.1 ? 'pass' : 'mahjong' };
      if (p.dead || !opts.sizes.some(s => s.fits)) return { type: 'claim', claim: 'pass' };
      const unseen = level === 'hard' ? unseenFor(state, seat) : undefined;
      const before = evaluate(card, p.hand, p.exp, unseen);
      // quick test: is the tile useful at all?
      if (evaluate(card, [...p.hand, state.claim.id], p.exp, unseen).best >= before.best) return { type: 'claim', claim: 'pass' };
      let best = null;
      for (const { n, fits } of opts.sizes) {
        if (!fits) continue;
        const kind = opts.kind;
        const nat = p.hand.filter(id => kindOf(id) === kind).slice(0, n - 1);
        const jk = p.hand.filter(id => kindOf(id) === 'J').slice(0, n - 1 - nat.length);
        const used = [...nat, ...jk];
        const rest = p.hand.filter(id => !used.includes(id));
        const exp = [...p.exp, { kind, ids: [state.claim.id, ...used] }];
        // best position after the forced discard
        let top = { score: -1, best: Infinity };
        for (const k of new Set(rest.map(kindOf))) {
          if (k === 'J') continue;
          const r = evaluate(card, rest.filter((x, i) => i !== rest.findIndex(y => kindOf(y) === k)), exp, unseen);
          if (r.score > top.score) top = r;
        }
        if (top.best < before.best && top.score > before.score * 1.1 && (!best || top.score > best.score)) best = { n, ...top };
      }
      if (best && (level !== 'easy' || rand() < 0.5)) return { type: 'claim', claim: 'expose', n: best.n };
      return { type: 'claim', claim: 'pass' };
    }
  }
  return null;
}

// Hint for a human: best hands and suggested discard/pass.
export function hintFor(state, seat) {
  const p = state.players[seat];
  if (state.phase === 'play' && state.turn === seat) return { discard: pickDiscard(state, seat, 'hard', () => 1) };
  if (state.phase === 'charleston' && !state.ch.subs[seat]) return { pass: pickPass(state, seat, 3, 'medium', () => 1) };
  if (state.phase === 'courtesy') return { pass: pickPass(state, seat, 3, 'medium', () => 1) };
  return {};
}
export { blindAllowed };
