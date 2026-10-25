// The host: owns the real game state, runs the bots and the call timer, and sends
// each seat only what that seat may see. Used for solo games and by the online host.
import { createGame, nextGame, apply, viewFor, passAllPending, claimOptions } from './engine.js';
import { botAction } from './bot.js';

export class Host {
  // seats: [{ kind: 'local'|'remote'|'bot', name, level }]
  constructor({ seats, card, state, settings, onView, onEvent, save }) {
    this.seats = seats;
    this.settings = settings; // { claimSeconds, botLevel, assist }
    this.onView = onView;     // (seat, view) => void, called for local and remote humans
    this.onEvent = onEvent || (() => {});
    this.save = save || (() => {});
    this.offline = new Set(); // remote seats currently disconnected (a bot plays for them)
    this.state = state || createGame({ players: seats.map(s => ({ name: s.name, bot: s.kind === 'bot' ? s.level : null })), card });
    this.timer = null;
    this.claimTimer = null;
    this.lastClaimKey = null;
  }

  isBotSeat(s) { return this.seats[s].kind === 'bot' || this.offline.has(s); }
  levelOf(s) { return this.seats[s].kind === 'bot' ? this.seats[s].level : 'medium'; }

  act(seat, action) {
    if (this.isBotSeat(seat) && this.seats[seat].kind === 'bot') return { ok: false, error: 'That seat is a computer player' };
    const r = apply(this.state, seat, action);
    if (r.ok) this.changed();
    return r;
  }

  nextHand() {
    if (this.state.phase !== 'over') return;
    this.state = nextGame(this.state);
    this.lastClaimKey = null;
    this.changed();
  }

  setOffline(seat, off) {
    if (off) this.offline.add(seat); else this.offline.delete(seat);
    this.changed();
  }

  changed() {
    const st = this.state;
    if (st.phase === 'claim') this.armClaim();
    for (let s = 0; s < st.n; s++) if (!this.isBotSeat(s) || this.seats[s].kind === 'remote') this.onView(s, viewFor(st, s));
    this.save(st);
    this.onEvent(st);
    this.scheduleBots();
  }

  armClaim() {
    const c = this.state.claim;
    const key = this.state.seq + ':' + c.id;
    if (this.lastClaimKey === key) return;
    this.lastClaimKey = key;
    clearTimeout(this.claimTimer);
    // Humans with nothing they could do pass automatically, so the game doesn't stall.
    for (const s of c.waiting) {
      if (this.isBotSeat(s) || s in c.resp) continue;
      const o = claimOptions(this.state, s);
      const useful = o && (o.win || o.sizes.some(z => z.fits || !this.settings.assist));
      if (!useful) c.resp[s] = { claim: 'pass' };
    }
    if (c.waiting.every(s => s in c.resp)) { passAllPending(this.state); return; }
    const humans = c.waiting.filter(s => !this.isBotSeat(s) && !(s in c.resp));
    const secs = Number(this.settings.claimSeconds) || 0;
    if (humans.length && secs > 0) {
      c.deadline = Date.now() + secs * 1000;
      this.claimTimer = setTimeout(() => {
        if (this.state.phase === 'claim' && this.lastClaimKey === key) { passAllPending(this.state); this.changed(); }
      }, secs * 1000 + 150);
    }
  }

  scheduleBots() {
    clearTimeout(this.timer);
    const st = this.state;
    if (st.phase === 'over') return;
    const ready = [];
    for (let s = 0; s < st.n; s++) if (this.isBotSeat(s)) {
      const a = botAction(st, s, this.levelOf(s));
      if (a) ready.push([s, a]);
    }
    if (!ready.length) return;
    const fast = this.settings.fastBots;
    const delay = st.phase === 'claim' ? (fast ? 60 : 450) : st.phase === 'play' ? (fast ? 80 : 800) : (fast ? 60 : 500);
    this.timer = setTimeout(() => {
      // recompute: state may have changed while waiting
      for (let s = 0; s < this.state.n; s++) if (this.isBotSeat(s)) {
        const a = botAction(this.state, s, this.levelOf(s));
        if (a) {
          const r = apply(this.state, s, a);
          if (!r.ok) console.warn('bot action rejected', a, r.error);
          if (this.state.phase === 'play' || !r.ok) break; // one move at a time on the table
        }
      }
      this.changed();
    }, delay);
  }

  stop() { clearTimeout(this.timer); clearTimeout(this.claimTimer); }
}
