// The rules engine. A game is a plain JSON object (so it can be saved and sent over the
// network). apply(state, seat, action) checks an action and updates the state.
import { TILESET, kindOf, rng, shuffle, tileName } from './tiles.js';
import { compileCard, findWin, exposuresPossible, PRACTICE_CARD } from './card.js';

const cardCache = new Map();
export function getCard(state) {
  const key = state.cardKey;
  let c = cardCache.get(key);
  if (!c) {
    c = compileCard(state.card);
    if (cardCache.size > 20) cardCache.clear();
    cardCache.set(key, c);
  }
  return c;
}
function cardKeyOf(card) {
  const s = JSON.stringify(card);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return card.name + ':' + h + ':' + s.length;
}

export const DIRS = { R: 'right', A: 'across', L: 'left' };
export function seatOffset(n, dir) {
  if (n === 2) return 1;
  return dir === 'R' ? 1 : dir === 'A' ? 2 : 3;
}
export const WIND_NAMES = ['East', 'South', 'West', 'North'];

export function createGame({ players, card = PRACTICE_CARD, seed = (Math.random() * 2 ** 31) | 0, dealer = 0, scores, round = 1 }) {
  const n = players.length;
  if (n !== 2 && n !== 4) throw new Error('Need 2 or 4 players');
  const rand = rng(seed);
  const wall = shuffle(TILESET.map((_, i) => i), rand);
  const ps = players.map((p, i) => ({
    name: p.name, bot: p.bot || null, hand: [], exp: [], dead: false,
    score: scores ? scores[i] : 0,
  }));
  for (let r = 0; r < 13; r++) for (let i = 0; i < n; i++) ps[(dealer + i) % n].hand.push(wall.pop());
  ps[dealer].hand.push(wall.pop());
  const stages = n === 4 ? ['R', 'A', 'L', 'L', 'A', 'R'] : ['A', 'A', 'A', 'A', 'A', 'A'];
  const state = {
    v: 1, n, seed, round, card, cardKey: cardKeyOf(card),
    players: ps, wall, discards: [], dealer, turn: dealer,
    phase: 'charleston',
    ch: { stages, stage: 0, subs: {}, votes: {}, courtesy: {} },
    claim: null, result: null, log: [], seq: 0,
  };
  log(state, 'deal', dealer, `New hand. ${ps[dealer].name} is East and starts.`);
  return state;
}

export function nextGame(prev) {
  return createGame({
    players: prev.players.map(p => ({ name: p.name, bot: p.bot })),
    card: prev.card,
    dealer: (prev.dealer + 1) % prev.n,
    scores: prev.players.map(p => p.score),
    round: prev.round + 1,
  });
}

function log(state, t, s, msg, extra = {}) {
  state.seq++;
  state.log.push({ i: state.seq, t, s, msg, ...extra });
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}
const removeIds = (hand, ids) => { for (const id of ids) hand.splice(hand.indexOf(id), 1); };
const fail = error => ({ ok: false, error });
const OK = { ok: true };

export function blindAllowed(state) {
  return state.phase === 'charleston' && (state.ch.stage === 2 || state.ch.stage === 5);
}
export function currentDir(state) { return state.ch.stages[state.ch.stage]; }

export function apply(state, seat, a) {
  const p = state.players[seat];
  if (!p) return fail('No such seat');
  switch (a.type) {
    case 'pass': return doPass(state, seat, a);
    case 'vote': return doVote(state, seat, a);
    case 'courtesy': return doCourtesy(state, seat, a);
    case 'discard': return doDiscard(state, seat, a);
    case 'mahjong': return doSelfMahjong(state, seat);
    case 'swap': return doSwap(state, seat, a);
    case 'claim': return doClaim(state, seat, a);
    default: return fail('Unknown action');
  }
}

// ---------------- Charleston ----------------
function doPass(state, seat, a) {
  if (state.phase !== 'charleston') return fail('Not passing now');
  if (state.ch.subs[seat]) return fail('Already passed');
  const ids = a.ids || [];
  const blind = a.blind || 0;
  const hand = state.players[seat].hand;
  if (new Set(ids).size !== ids.length) return fail('Duplicate tile');
  if (ids.some(id => !hand.includes(id))) return fail('Tile not in hand');
  if (ids.some(id => kindOf(id) === 'J')) return fail('Jokers may never be passed');
  if (blind < 0 || (blind > 0 && !blindAllowed(state))) return fail('Blind pass not allowed on this pass');
  if (ids.length + blind !== 3) return fail('Pass exactly 3 tiles');
  state.ch.subs[seat] = { ids: [...ids], blind };
  if (Object.keys(state.ch.subs).length === state.n) resolvePass(state);
  return OK;
}

function resolvePass(state) {
  const n = state.n, dir = currentDir(state), off = seatOffset(n, dir);
  const subs = state.ch.subs;
  const out = new Array(n).fill(null);
  const src = s => (s - off + n) % n; // who passes to s
  let progress = true;
  while (progress) {
    progress = false;
    for (let s = 0; s < n; s++) {
      if (out[s]) continue;
      const sub = subs[s];
      if (sub.blind === 0) { out[s] = { own: sub.ids, fwd: [] }; progress = true; continue; }
      const inc = out[src(s)];
      if (!inc) continue;
      const incoming = [...inc.own, ...inc.fwd];
      out[s] = { own: sub.ids, fwd: incoming.slice(0, sub.blind) };
      progress = true;
    }
  }
  // A ring where every player passed blind: fill from their own hands.
  for (let s = 0; s < n; s++) if (!out[s]) {
    const sub = subs[s];
    const spare = state.players[s].hand.filter(id => kindOf(id) !== 'J' && !sub.ids.includes(id));
    out[s] = { own: [...sub.ids, ...spare.slice(0, sub.blind)], fwd: [] };
  }
  const received = [];
  for (let s = 0; s < n; s++) {
    const inc = out[src(s)];
    received[s] = [...inc.own, ...inc.fwd].filter(id => !out[s].fwd.includes(id));
  }
  for (let s = 0; s < n; s++) removeIds(state.players[s].hand, out[s].own);
  for (let s = 0; s < n; s++) state.players[s].hand.push(...received[s]);
  for (let s = 0; s < n; s++) state.players[s].lastReceived = received[s];
  log(state, 'pass', -1, `Everyone passed ${DIRS[dir]}${n === 2 ? '' : ''}.`);
  state.ch.subs = {};
  state.ch.stage++;
  if (state.ch.stage === 3) { state.phase = 'vote'; state.ch.votes = {}; }
  else if (state.ch.stage === 6) endCharleston(state);
}

function doVote(state, seat, a) {
  if (state.phase !== 'vote') return fail('No vote now');
  if (seat in state.ch.votes) return fail('Already voted');
  state.ch.votes[seat] = !!a.go;
  if (Object.keys(state.ch.votes).length === state.n) {
    const go = Object.values(state.ch.votes).every(Boolean);
    if (go) { state.phase = 'charleston'; log(state, 'info', -1, 'Second Charleston!'); }
    else {
      const stopper = Object.entries(state.ch.votes).find(([, v]) => !v)[0];
      log(state, 'info', Number(stopper), `${state.players[stopper].name} stopped the Charleston.`);
      endCharleston(state);
    }
  }
  return OK;
}

function endCharleston(state) {
  if (state.n === 4) { state.phase = 'courtesy'; state.ch.courtesy = {}; }
  else startPlay(state);
}

function doCourtesy(state, seat, a) {
  if (state.phase !== 'courtesy') return fail('No courtesy pass now');
  if (state.ch.courtesy[seat]) return fail('Already chose');
  const ids = a.ids || [];
  const hand = state.players[seat].hand;
  if (ids.length > 3 || new Set(ids).size !== ids.length) return fail('Choose 0 to 3 tiles');
  if (ids.some(id => !hand.includes(id))) return fail('Tile not in hand');
  if (ids.some(id => kindOf(id) === 'J')) return fail('Jokers may never be passed');
  state.ch.courtesy[seat] = { ids: [...ids] };
  if (Object.keys(state.ch.courtesy).length === 4) {
    for (const [x, y] of [[0, 2], [1, 3]]) {
      const cnt = Math.min(state.ch.courtesy[x].ids.length, state.ch.courtesy[y].ids.length);
      const gx = state.ch.courtesy[x].ids.slice(0, cnt), gy = state.ch.courtesy[y].ids.slice(0, cnt);
      removeIds(state.players[x].hand, gx); removeIds(state.players[y].hand, gy);
      state.players[x].hand.push(...gy); state.players[y].hand.push(...gx);
      state.players[x].lastReceived = gy; state.players[y].lastReceived = gx;
      log(state, 'info', -1, `${state.players[x].name} and ${state.players[y].name} traded ${cnt} tile${cnt === 1 ? '' : 's'} (courtesy).`);
    }
    startPlay(state);
  }
  return OK;
}

function startPlay(state) {
  state.phase = 'play';
  state.turn = state.dealer;
  state.drawn = null;
  log(state, 'turn', state.dealer, `${state.players[state.dealer].name} (East) discards first.`);
}

// ---------------- Play ----------------
function startTurn(state, seat) {
  if (state.players.every(p => p.dead)) return endWall(state, 'Every hand is dead.');
  if (!state.wall.length) return endWall(state, 'The wall is empty.');
  const id = state.wall.pop();
  state.players[seat].hand.push(id);
  state.turn = seat;
  state.phase = 'play';
  state.drawn = id;
  state.claim = null;
  log(state, 'draw', seat, `${state.players[seat].name} draws.`);
}

function endWall(state, why) {
  state.phase = 'over';
  state.claim = null;
  state.result = { wall: true, why };
  log(state, 'wall', -1, `Wall game — no winner. ${why}`);
}

function doDiscard(state, seat, a) {
  if (state.phase !== 'play' || state.turn !== seat) return fail('Not your turn');
  const p = state.players[seat];
  if (!p.hand.includes(a.id)) return fail('Tile not in hand');
  removeIds(p.hand, [a.id]);
  state.discards.push({ id: a.id, by: seat });
  state.drawn = null;
  const kind = kindOf(a.id);
  log(state, 'discard', seat, `${p.name} discards ${tileName(kind)}.`, { id: a.id });
  const waiting = [];
  if (kind !== 'J') {
    for (let k = 1; k < state.n; k++) {
      const s = (seat + k) % state.n;
      if (!state.players[s].dead) waiting.push(s);
    }
  }
  if (!waiting.length) return nextAfter(state, seat), OK;
  state.phase = 'claim';
  state.claim = { id: a.id, by: seat, resp: {}, waiting };
  return OK;
}

function nextAfter(state, seat) { startTurn(state, (seat + 1) % state.n); }

// What a seat could do with the tile being offered.
export function claimOptions(state, seat) {
  if (state.phase !== 'claim' || !state.claim || !state.claim.waiting.includes(seat)) return null;
  const p = state.players[seat];
  const kind = kindOf(state.claim.id);
  const card = getCard(state);
  const sizes = [];
  if (!p.dead) for (let n = 3; n <= 6; n++) {
    const preview = buildExposure(p, state.claim.id, n);
    if (!preview) continue;
    sizes.push({ n, fits: exposuresPossible(card, [...p.exp, preview]) });
  }
  const win = !!findWin(card, [...p.hand, state.claim.id], p.exp);
  return { kind, sizes, win };
}

function buildExposure(p, tileId, n) {
  const kind = kindOf(tileId);
  const nat = p.hand.filter(id => kindOf(id) === kind);
  const jk = p.hand.filter(id => kindOf(id) === 'J');
  const useNat = nat.slice(0, n - 1);
  const needJ = n - 1 - useNat.length;
  if (needJ > jk.length) return null;
  return { kind, ids: [tileId, ...useNat, ...jk.slice(0, needJ)] };
}

function doClaim(state, seat, a) {
  if (state.phase !== 'claim') return fail('Nothing to claim');
  const c = state.claim;
  if (!c.waiting.includes(seat)) return fail('You cannot claim this tile');
  if (seat in c.resp) return fail('Already answered');
  const what = a.claim;
  if (what === 'expose') {
    const n = a.n || 3;
    if (n < 3 || n > 6) return fail('Bad group size');
    if (!buildExposure(state.players[seat], c.id, n)) return fail('Not enough matching tiles or jokers');
    c.resp[seat] = { claim: 'expose', n };
  } else if (what === 'mahjong') c.resp[seat] = { claim: 'mahjong' };
  else c.resp[seat] = { claim: 'pass' };
  if (c.waiting.every(s => s in c.resp)) resolveClaims(state);
  return OK;
}

// Force everyone who hasn't answered to pass (used by timers).
export function passAllPending(state) {
  if (state.phase !== 'claim') return;
  for (const s of state.claim.waiting) if (!(s in state.claim.resp)) state.claim.resp[s] = { claim: 'pass' };
  resolveClaims(state);
}

function resolveClaims(state) {
  const c = state.claim;
  const order = [];
  for (let k = 1; k < state.n; k++) order.push((c.by + k) % state.n);
  const card = getCard(state);
  // Mahjong beats an exposure; ties go to the player next in turn.
  for (const s of order) {
    if (c.resp[s]?.claim !== 'mahjong') continue;
    const p = state.players[s];
    const win = findWin(card, [...p.hand, c.id], p.exp);
    if (win) {
      state.discards.pop();
      p.hand.push(c.id);
      return finishWin(state, s, c.by, win);
    }
    p.dead = true;
    log(state, 'dead', s, `${p.name} called Mahjong, but the hand doesn't match the card. Dead hand!`);
  }
  for (const s of order) {
    if (c.resp[s]?.claim !== 'expose') continue;
    const p = state.players[s];
    if (p.dead) continue;
    const ex = buildExposure(p, c.id, c.resp[s].n);
    if (!ex) continue;
    state.discards.pop();
    removeIds(p.hand, ex.ids.slice(1));
    ex.from = c.by;
    p.exp.push(ex);
    const label = ['', '', '', 'pung', 'kong', 'quint', 'sextet'][ex.ids.length];
    log(state, 'call', s, `${p.name} calls ${tileName(ex.kind)} for a ${label}.`);
    if (!exposuresPossible(card, p.exp)) {
      p.dead = true;
      log(state, 'dead', s, `No hand on the card fits ${p.name}'s exposures. Dead hand!`);
    }
    state.claim = null;
    state.phase = 'play';
    state.turn = s;
    state.drawn = null;
    return;
  }
  state.claim = null;
  nextAfter(state, c.by);
}

function doSelfMahjong(state, seat) {
  if (state.phase !== 'play' || state.turn !== seat) return fail('You can only declare Mahjong on your turn');
  const p = state.players[seat];
  if (p.dead) return fail('Your hand is dead');
  const win = findWin(getCard(state), p.hand, p.exp);
  if (!win) {
    p.dead = true;
    log(state, 'dead', seat, `${p.name} declared Mahjong, but the hand doesn't match the card. Dead hand!`);
    return { ok: true, dead: true };
  }
  finishWin(state, seat, null, win);
  return OK;
}

function finishWin(state, seat, from, win) {
  const p = state.players[seat];
  const all = [...p.hand, ...p.exp.flatMap(e => e.ids)];
  const jokerless = win.hand.allowsJokers && !all.some(id => kindOf(id) === 'J');
  const value = win.hand.value * (jokerless ? 2 : 1);
  const pay = new Array(state.n).fill(0);
  for (let s = 0; s < state.n; s++) {
    if (s === seat) continue;
    const amt = from === null ? value * 2 : s === from ? value * 2 : value;
    pay[s] = -amt;
    pay[seat] += amt;
  }
  state.players.forEach((q, i) => { q.score += pay[i]; });
  state.phase = 'over';
  state.claim = null;
  state.result = {
    winner: seat, from, selfDraw: from === null, handIdx: win.hand.idx,
    pattern: win.hand.pattern, cat: win.hand.cat, value, base: win.hand.value, jokerless, pay,
  };
  const how = from === null ? 'self-drawn' : `on ${state.players[from].name}'s discard`;
  log(state, 'win', seat, `${p.name} wins with Mahjong (${how})! ${win.hand.cat}: ${win.hand.pattern}${jokerless ? ' — jokerless, doubled' : ''}.`);
}

// Trade a natural tile for a joker in any player's exposure.
export function swapOptions(state, seat) {
  if (state.phase !== 'play' || state.turn !== seat) return [];
  const p = state.players[seat];
  const out = [];
  state.players.forEach((q, t) => q.exp.forEach((e, ei) => {
    if (!e.ids.some(id => kindOf(id) === 'J')) return;
    const mine = p.hand.find(id => kindOf(id) === e.kind);
    if (mine !== undefined) out.push({ id: mine, target: t, exp: ei, kind: e.kind });
  }));
  return out;
}

function doSwap(state, seat, a) {
  if (state.phase !== 'play' || state.turn !== seat) return fail('Swap jokers on your turn');
  const p = state.players[seat];
  const q = state.players[a.target];
  const e = q?.exp[a.exp];
  if (!e) return fail('No such exposure');
  if (!p.hand.includes(a.id) || kindOf(a.id) !== e.kind) return fail('You need the matching tile');
  const j = e.ids.findIndex(id => kindOf(id) === 'J');
  if (j < 0) return fail('No joker there');
  const jid = e.ids[j];
  e.ids[j] = a.id;
  removeIds(p.hand, [a.id]);
  p.hand.push(jid);
  log(state, 'swap', seat, `${p.name} swaps a ${tileName(e.kind)} for a joker from ${a.target === seat ? 'their own rack' : q.name + "'s rack"}.`);
  return OK;
}

// What every player is allowed to see. Other hands stay hidden until the game ends.
export function viewFor(state, seat) {
  const over = state.phase === 'over';
  return {
    n: state.n, seat, round: state.round, phase: state.phase, turn: state.turn, dealer: state.dealer,
    card: state.card, cardKey: state.cardKey,
    wallCount: state.wall.length,
    discards: state.discards,
    drawn: state.turn === seat ? state.drawn : null,
    players: state.players.map((p, i) => ({
      name: p.name, bot: p.bot, dead: p.dead, score: p.score, exp: p.exp,
      count: p.hand.length,
      hand: i === seat || over ? p.hand : null,
      lastReceived: i === seat ? p.lastReceived || null : null,
    })),
    ch: {
      stages: state.ch.stages, stage: state.ch.stage,
      done: Object.keys(state.phase === 'courtesy' ? state.ch.courtesy : state.phase === 'vote' ? state.ch.votes : state.ch.subs).map(Number),
    },
    claim: state.claim ? { id: state.claim.id, by: state.claim.by, waiting: state.claim.waiting, answered: Object.keys(state.claim.resp).map(Number), deadline: state.claim.deadline || null } : null,
    claimOpts: claimOptions(state, seat),
    swaps: swapOptions(state, seat),
    result: state.result,
    log: state.log.slice(-40),
    seq: state.seq,
  };
}
