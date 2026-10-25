// Bot-vs-bot simulation, used by tests and by the "watch bots" demo.
import { createGame, apply, nextGame } from './engine.js';
import { botAction } from './bot.js';
import { rng } from './tiles.js';

export function checkInvariants(state) {
  const all = [...state.wall, ...state.discards.map(d => d.id)];
  for (const p of state.players) { all.push(...p.hand); for (const e of p.exp) all.push(...e.ids); }
  if (all.length !== 152) throw new Error(`Tile count ${all.length}`);
  if (new Set(all).size !== 152) throw new Error('Duplicate tile');
}

export function playOut(state, levels, seed = 1, maxSteps = 5000) {
  const rand = rng(seed);
  let steps = 0;
  while (state.phase !== 'over') {
    if (++steps > maxSteps) throw new Error('Game did not finish: stuck in ' + state.phase);
    let acted = false;
    for (let s = 0; s < state.n; s++) {
      const a = botAction(state, s, levels[s], rand);
      if (!a) continue;
      const r = apply(state, s, a);
      if (!r.ok) throw new Error(`Bot ${s} (${levels[s]}) illegal ${JSON.stringify(a)}: ${r.error}`);
      checkInvariants(state);
      acted = true;
      if (state.phase === 'over') break;
    }
    if (!acted) throw new Error('No bot could act in phase ' + state.phase);
  }
  return state;
}

export function simulate({ games = 20, n = 4, levels = ['medium', 'medium', 'medium', 'medium'], seed = 7 }) {
  const stats = { games: 0, wins: new Array(n).fill(0), walls: 0, deadHands: 0, selfDraw: 0, jokerless: 0, hands: {} };
  const names = ['A', 'B', 'C', 'D'].slice(0, n);
  let state = createGame({ players: names.map(nm => ({ name: nm, bot: 'x' })), seed });
  for (let g = 0; g < games; g++) {
    if (g) { state = nextGame(state); }
    playOut(state, levels, seed + g);
    stats.games++;
    stats.deadHands += state.players.filter(p => p.dead).length;
    if (state.result.wall) stats.walls++;
    else {
      stats.wins[state.result.winner]++;
      if (state.result.selfDraw) stats.selfDraw++;
      if (state.result.jokerless) stats.jokerless++;
      stats.hands[state.result.pattern] = (stats.hands[state.result.pattern] || 0) + 1;
    }
    const total = state.players.reduce((s, p) => s + p.score, 0);
    if (total !== 0) throw new Error('Scores do not balance: ' + total);
  }
  return stats;
}
