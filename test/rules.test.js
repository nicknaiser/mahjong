import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILESET, buildSet } from '../src/tiles.js';
import { PRACTICE_CARD, compileCard, parsePattern, expandHand, findWin, validateHand, exposuresPossible } from '../src/card.js';
import { createGame, apply, claimOptions, swapOptions, getCard } from '../src/engine.js';
import { simulate, checkInvariants } from '../src/sim.js';

const card = compileCard(PRACTICE_CARD);
// pick concrete tile ids for a list of kinds, never reusing an id
function ids(kinds, used = new Set()) {
  return kinds.map(k => {
    const id = TILESET.findIndex((x, i) => x === k && !used.has(i));
    if (id < 0) throw new Error('out of ' + k);
    used.add(id);
    return id;
  });
}
const handOf = pattern => card.hands.find(h => h.pattern === pattern);

test('tile set has 152 tiles with the right counts', () => {
  const s = buildSet();
  assert.equal(s.length, 152);
  assert.equal(s.filter(k => k === 'J').length, 8);
  assert.equal(s.filter(k => k === 'F').length, 8);
  assert.equal(s.filter(k => k === 'b5').length, 4);
  assert.equal(s.filter(k => k === 'O').length, 4);
});

test('every practice hand is valid and has 14 tiles', () => {
  assert.equal(card.problems.length, 0);
  for (const h of PRACTICE_CARD.hands) {
    assert.deepEqual(validateHand(h), [], h.pattern);
    assert.equal(parsePattern(h.pattern).groups.reduce((s, g) => s + g.n, 0), 14);
  }
});

test('parser splits singles and groups, and catches mistakes', () => {
  const g = parsePattern('FF 2026a 222b').groups;
  assert.deepEqual(g.map(x => x.n), [2, 1, 1, 1, 1, 3]);
  assert.equal(g[2].kind, 'O');
  assert.ok(parsePattern('FF 2222a').errors.length); // 6 tiles
  assert.ok(parsePattern('FF 22x2a').errors.length);
  assert.ok(validateHand({ pattern: '111a 222b 333c 444d', value: 25 }).length);
});

test('suit tags map to different suits and dragons match their suit', () => {
  const h = handOf('111a DDDa 111b DDDb 11c');
  for (const v of h.variants) {
    const suits = new Set(v.groups.filter(g => /^[bcd]/.test(g.kind)).map(g => g.kind[0]));
    assert.equal(suits.size, 3);
    const dragonFor = { b: 'G', c: 'R', d: 'O' };
    assert.equal(v.groups[1].kind, dragonFor[v.groups[0].kind[0]]);
  }
  // 9 like numbers x 3 choices of the pair's suit (swapping a and b gives the same tiles)
  assert.equal(h.variants.length, 27);
});

test('consecutive hands shift through every legal run', () => {
  const h = handOf('11a 222a 3333a 444a 55a');
  const starts = new Set(h.variants.map(v => v.groups[0].kind[1]));
  assert.deepEqual([...starts].sort(), ['1', '2', '3', '4', '5']);
});

test('a natural winning hand is recognised', () => {
  const hand = ids(['F', 'F', 'F', 'F', 'b2', 'O', 'b2', 'b6', 'c2', 'c2', 'c2', 'd6', 'd6', 'd6']);
  const w = findWin(card, hand, []);
  assert.ok(w);
  assert.equal(w.hand.pattern, 'FFFF 2026a 222b 666c');
});

test('jokers fill pungs and kongs but never pairs or singles', () => {
  const used = new Set();
  const withJ = ids(['F', 'F', 'F', 'J', 'b2', 'O', 'b2', 'b6', 'c2', 'J', 'c2', 'd6', 'd6', 'J'], used);
  assert.ok(findWin(card, withJ, []));
  // joker standing in for the single 6 of the year: not allowed
  const bad = ids(['F', 'F', 'F', 'F', 'b2', 'O', 'b2', 'J', 'c2', 'c2', 'c2', 'd6', 'd6', 'd6']);
  assert.equal(findWin(card, bad, []), null);
  // joker in a pair (pairs hand): not allowed
  const pairs = ids(['F', 'J', 'b1', 'b1', 'b2', 'b2', 'b3', 'b3', 'b4', 'b4', 'b5', 'b5', 'b6', 'b6']);
  assert.equal(findWin(card, pairs, []), null);
});

test('concealed hands cannot be won with exposures', () => {
  const used = new Set();
  const exp = [{ kind: 'c2', ids: ids(['c2', 'c2', 'c2'], used) }];
  // NEWS 2026a 2026b 22c is concealed, so an exposed 222 doesn't count
  const rest = ids(['N', 'E', 'W', 'S', 'b2', 'O', 'b2', 'b6', 'd2', 'O', 'd2', 'd6', 'b9', 'b9'].slice(0, 11), used);
  assert.equal(findWin(card, rest, exp), null);
});

test('exposures are checked against the card', () => {
  const kong = k => ({ kind: k, ids: ids([k, k, k, k]) });
  assert.ok(exposuresPossible(card, [kong('N')]));
  assert.equal(exposuresPossible(card, [{ kind: 'b1', ids: ids(['b1', 'b1', 'b1', 'b1', 'J']) }]), false); // no quints on the card
});

function rigged(hands, opts = {}) {
  const st = createGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }], seed: 3, ...opts });
  if (hands) {
    // rebuild hands from given kinds; the rest goes in the wall
    const used = new Set();
    st.players.forEach((p, i) => { p.hand = hands[i] ? ids(hands[i], used) : []; });
    const rest = TILESET.map((_, i) => i).filter(i => !used.has(i));
    st.players.forEach((p, i) => { if (!hands[i]) { while (p.hand.length < (i === st.dealer ? 14 : 13)) p.hand.push(rest.pop()); } });
    st.wall = rest;
  }
  return st;
}
function skipCharleston(st) {
  st.phase = 'play'; st.turn = st.dealer; st.drawn = null;
}

test('Charleston passes go right, across, left and jokers cannot be passed', () => {
  const st = rigged(null);
  const before = st.players.map(p => [...p.hand]);
  const picks = st.players.map(p => p.hand.filter(id => TILESET[id] !== 'J').slice(0, 3));
  const jokerHolder = st.players.findIndex(p => p.hand.some(id => TILESET[id] === 'J'));
  if (jokerHolder >= 0) {
    const j = st.players[jokerHolder].hand.find(id => TILESET[id] === 'J');
    assert.equal(apply(st, jokerHolder, { type: 'pass', ids: [j, ...picks[jokerHolder].slice(0, 2)], blind: 0 }).ok, false);
  }
  picks.forEach((ids3, s) => assert.ok(apply(st, s, { type: 'pass', ids: ids3, blind: 0 }).ok));
  // seat 0 passed right to seat 1
  for (const id of picks[0]) assert.ok(st.players[1].hand.includes(id));
  for (const id of picks[0]) assert.ok(!st.players[0].hand.includes(id));
  assert.equal(st.ch.stage, 1);
  assert.equal(st.players[0].hand.length, before[0].length);
  checkInvariants(st);
});

test('blind pass forwards received tiles unseen', () => {
  const st = rigged(null);
  st.ch.stage = 2; // first left: blind allowed
  const picks = st.players.map(p => p.hand.filter(id => TILESET[id] !== 'J').slice(0, 3));
  // seat 3 passes left to seat 2; seat 2 blind-passes 2 of those on to seat 1
  for (const s of [0, 1, 3]) assert.ok(apply(st, s, { type: 'pass', ids: picks[s], blind: 0 }).ok);
  assert.equal(apply(st, 0, { type: 'pass', ids: [], blind: 3 }).ok, false); // already passed
  assert.ok(apply(st, 2, { type: 'pass', ids: picks[2].slice(0, 1), blind: 2 }).ok);
  const forwarded = picks[3].slice(0, 2);
  for (const id of forwarded) assert.ok(st.players[1].hand.includes(id), 'blind tiles reach the next player');
  assert.ok(st.players[2].hand.includes(picks[3][2]));
  assert.equal(st.phase, 'vote');
  checkInvariants(st);
  st.players.forEach(p => assert.equal(p.hand.length, p === st.players[st.dealer] ? 14 : 13));
});

test('any player can stop the second Charleston; courtesy uses the smaller count', () => {
  const st = rigged(null);
  st.ch.stage = 3; st.phase = 'vote';
  apply(st, 0, { type: 'vote', go: true }); apply(st, 1, { type: 'vote', go: false });
  apply(st, 2, { type: 'vote', go: true }); apply(st, 3, { type: 'vote', go: true });
  assert.equal(st.phase, 'courtesy');
  const nj = s => st.players[s].hand.filter(id => TILESET[id] !== 'J');
  const g0 = nj(0).slice(0, 3), g2 = nj(2).slice(0, 1);
  apply(st, 0, { type: 'courtesy', ids: g0 }); apply(st, 2, { type: 'courtesy', ids: g2 });
  apply(st, 1, { type: 'courtesy', ids: [] }); apply(st, 3, { type: 'courtesy', ids: [] });
  assert.equal(st.phase, 'play');
  assert.ok(st.players[2].hand.includes(g0[0]));
  assert.ok(st.players[0].hand.includes(g2[0]));
  assert.ok(st.players[0].hand.includes(g0[1]), 'only 1 tile traded');
  checkInvariants(st);
});

test('calling a discard for a pung, then mahjong beats exposure', () => {
  const st = rigged([
    ['N', 'N', 'N', 'E', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'c1'],
    ['N', 'J', 'E', 'E', 'E', 'W', 'W', 'W', 'S', 'S', 'S', 'S', 'c9'],
    null,
    ['F', 'F', 'F', 'F', 'b2', 'O', 'b2', 'b6', 'c2', 'c2', 'c2', 'd6', 'd6'],
  ]);
  skipCharleston(st);
  const e = st.players[0].hand.find(id => TILESET[id] === 'E');
  assert.ok(apply(st, 0, { type: 'discard', id: e }).ok);
  assert.equal(st.phase, 'claim');
  const o = claimOptions(st, 1);
  assert.ok(o.sizes.some(z => z.n === 3 && z.fits));
  assert.ok(o.sizes.some(z => z.n === 4 && !z.fits), 'no hand has a kong of East');
  apply(st, 1, { type: 'claim', claim: 'expose', n: 3 });
  apply(st, 2, { type: 'claim', claim: 'pass' });
  apply(st, 3, { type: 'claim', claim: 'pass' });
  assert.equal(st.turn, 1);
  assert.equal(st.players[1].exp[0].ids.length, 3);
  assert.equal(st.players[1].exp[0].kind, 'E');
  checkInvariants(st);
  // seat 1 discards a d6; seat 3 needs it for mahjong
  const d6 = TILESET.findIndex((k, i) => k === 'd6' && st.wall.includes(i));
  st.wall.splice(st.wall.indexOf(d6), 1);
  st.players[1].hand.push(d6);
  assert.ok(apply(st, 1, { type: 'discard', id: d6 }).ok);
  assert.ok(claimOptions(st, 3).win);
  apply(st, 2, { type: 'claim', claim: 'pass' });
  apply(st, 3, { type: 'claim', claim: 'mahjong' });
  apply(st, 0, { type: 'claim', claim: 'pass' });
  assert.equal(st.phase, 'over');
  assert.equal(st.result.winner, 3);
  assert.equal(st.result.from, 1);
  assert.equal(st.result.jokerless, true);
  assert.equal(st.result.value, 50);
  assert.deepEqual(st.result.pay, [-50, -100, -50, 200]);
});

test('false mahjong makes a dead hand that cannot call', () => {
  const st = rigged(null);
  skipCharleston(st);
  const r = apply(st, 0, { type: 'mahjong' });
  assert.ok(r.ok && r.dead);
  assert.equal(st.players[0].dead, true);
  apply(st, 0, { type: 'discard', id: st.players[0].hand[0] });
  // after seat 1 discards, seat 0 is not asked
  const next = st.phase === 'claim' ? st.claim : null;
  if (next) assert.ok(!next.waiting.includes(0));
});

test('joker swap trades a matching tile for an exposed joker', () => {
  const st = rigged([
    ['b5', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'd1', 'd2', 'd3', 'd4'],
    ['b5', 'b5', 'J', 'E', 'E', 'W', 'W', 'W', 'S', 'S', 'S', 'S', 'c9'],
    null, null,
  ]);
  skipCharleston(st);
  const used = new Set(st.players.flatMap(p => p.hand));
  // seat 1 already exposed b5 b5 J b5? Make it simply: move a kong with a joker onto seat 1's rack
  const b5 = st.players[1].hand.filter(id => TILESET[id] === 'b5');
  const j = st.players[1].hand.find(id => TILESET[id] === 'J');
  const extra = TILESET.findIndex((k, i) => k === 'b5' && st.wall.includes(i));
  st.wall.splice(st.wall.indexOf(extra), 1);
  st.players[1].hand = st.players[1].hand.filter(id => !b5.includes(id) && id !== j);
  st.players[1].exp.push({ kind: 'b5', ids: [extra, ...b5, j] });
  used.clear();
  const opts = swapOptions(st, 0);
  assert.equal(opts.length, 1);
  assert.ok(apply(st, 0, { type: 'swap', ...opts[0] }).ok);
  assert.ok(st.players[0].hand.includes(j));
  assert.ok(!st.players[1].exp[0].ids.includes(j));
  checkInvariants(st);
});

test('a discarded joker cannot be called', () => {
  const st = rigged([['J', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'c1', 'c2', 'c3', 'c4'], null, null, null]);
  skipCharleston(st);
  apply(st, 0, { type: 'discard', id: st.players[0].hand[0] });
  assert.equal(st.phase, 'play');
  assert.equal(st.turn, 1);
});

test('two-player games pass across and finish', () => {
  const s = simulate({ games: 6, n: 2, levels: ['medium', 'hard'], seed: 11 });
  assert.equal(s.games, 6);
});

test('bot-vs-bot games always finish with balanced scores', () => {
  for (const levels of [['easy', 'easy', 'easy', 'easy'], ['medium', 'hard', 'easy', 'medium'], ['hard', 'hard', 'hard', 'hard']]) {
    const s = simulate({ games: 15, levels, seed: levels.length * 13 + levels[0].length });
    assert.equal(s.games, 15);
  }
});

test('custom card from the editor format works in a game', () => {
  const custom = { name: 'Mine', hands: [{ cat: 'X', pattern: 'NNNN EEEE WWW SSS', value: 40 }] };
  const st = createGame({ players: [{ name: 'A' }, { name: 'B' }], card: custom, seed: 5 });
  assert.equal(getCard(st).hands.length, 1);
  assert.equal(expandHand(custom.hands[0]).variants.length, 1);
});
