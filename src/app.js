// The user interface: screens, the game table, and the three kinds of session
// (solo, online host, online guest).
import { tileSVG, THEMES } from './art.js';
import { kindOf, tileName, sortIds, flowerIndex } from './tiles.js';
import { PRACTICE_CARD, TAG_COLORS, expandHand, validateHand, rankHands, findWin } from './card.js';
import { getCard, blindAllowed, DIRS, WIND_NAMES } from './engine.js';
import { Host } from './controller.js';
import { HostNet, GuestNet, makeCode, cleanCode } from './net.js';
import { botAction, hintFor } from './bot.js';
import { play, setMuted } from './sound.js';
import { RULES_HTML, TUTORIAL } from './content.js';

// ------------------------------------------------------------------ storage
const store = {
  get(k, d) { try { const v = localStorage.getItem('amj.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('amj.' + k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem('amj.' + k); } catch { /* ignore */ } },
};
const DEFAULTS = { name: '', theme: 'classic', botLevel: 'medium', claimSeconds: 10, assist: true, muted: false, autoSort: true, sortMode: 'suit', fastBots: false, cardId: 'practice', soloPlayers: 4, seenTutorial: false };
// The claude.ai preview build can't use WebRTC, so it hides online play.
const ONLINE_OK = typeof __ARTIFACT__ === 'undefined';
const settings = { ...DEFAULTS, ...store.get('settings', {}) };
const saveSettings = () => store.set('settings', settings);
setMuted(settings.muted);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);
const BOT_NAMES = ['Rosa', 'Mateo', 'Lupe', 'Diego', 'Ana', 'Frida', 'Pablo', 'Coco'];
const EMOJIS = ['😀', '😂', '😮', '😢', '😡', '👏', '🎉', '🤞', '🙈', '🀄', '💀', '🌼'];

// ------------------------------------------------------------------ cards
function customCards() { return store.get('cards', []); }
function saveCustomCards(c) { store.set('cards', c); }
function activeCard() {
  if (settings.cardId !== 'practice') {
    const c = customCards().find(x => x.id === settings.cardId);
    if (c && c.hands.some(h => !validateHand(h).length)) return { name: c.name, hands: c.hands.filter(h => !validateHand(h).length) };
  }
  return PRACTICE_CARD;
}

// ------------------------------------------------------------------ tiles html
function tileHTML(id, cls = '', kindOverride) {
  const kind = kindOverride || kindOf(id);
  const v = kind === 'F' && id != null ? flowerIndex(id) : 0;
  return `<div class="tile ${cls}" ${id != null ? `data-id="${id}"` : ''} title="${esc(tileName(kind))}">${tileSVG(kind, settings.theme, v)}</div>`;
}
const backHTML = cls => `<div class="tile ${cls}">${tileSVG('back', settings.theme)}</div>`;
function patternHTML(pattern) {
  return String(pattern).trim().split(/\s+/).map(tok => {
    const m = /^([0-9NEWSRGDFO]+)([abc])?$/.exec(tok);
    if (!m) return esc(tok);
    return [...m[1]].map(ch => {
      const col = /[1-9D]/.test(ch) ? TAG_COLORS[m[2] || 'a'] : ch === 'R' ? TAG_COLORS.b : ch === 'G' ? TAG_COLORS.a : ch === '0' || ch === 'O' ? TAG_COLORS.c : '#333';
      return `<span style="color:${col}">${ch === 'O' ? '0' : ch}</span>`;
    }).join('');
  }).join(' ');
}
function exampleKinds(hand) {
  const { variants } = expandHand(hand);
  if (!variants.length) return [];
  return variants[0].groups.flatMap(g => Array(g.n).fill(g.kind));
}

// ------------------------------------------------------------------ app state
const ui = {
  screen: 'home', session: null, view: null, me: 0, sel: new Set(), order: [], newId: null,
  sheet: null, toastTimer: null, chat: [], unread: 0, bubbles: {}, hint: null, banner: null,
  lastSeq: 0, slide: 0, editing: null, lobby: null,
};

function toast(msg, ms = 2600) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.innerHTML = msg;
  t.style.display = 'block';
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => { t.style.display = 'none'; }, ms);
}

function applyTheme() {
  document.body.classList.toggle('theme-dotd', settings.theme === 'dotd');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', settings.theme === 'dotd' ? '#1a0d1f' : '#0f3d2e');
}

// ================================================================== sessions
// Each session exposes: act(action), nextHand(), chat(text), emoji(e), leave(), canNext
class SoloSession {
  constructor(resume) {
    this.kind = 'solo';
    const saved = resume ? store.get('solo', null) : null;
    let seats;
    if (saved) seats = saved.seats;
    else {
      const n = settings.soloPlayers === 2 ? 2 : 4;
      const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
      seats = [{ kind: 'local', name: settings.name || 'You' }];
      for (let i = 1; i < n; i++) seats.push({ kind: 'bot', name: names[i], level: settings.botLevel });
    }
    this.host = new Host({
      seats, card: activeCard(), state: saved?.state, settings,
      onView: (s, v) => { if (s === 0) setView(v); },
      onEvent: st => this.botChatter(st),
      save: st => store.set('solo', { seats, state: st, at: Date.now() }),
    });
    this.canNext = true;
    ui.me = 0;
    this.host.changed();
  }
  act(a) { const r = this.host.act(0, a); if (!r.ok) toast(esc(r.error)); return r; }
  nextHand() { this.host.nextHand(); }
  chat(text) { addChat({ name: settings.name || 'You', text }); }
  emoji(e) { bubble(0, e); }
  botChatter(st) {
    const last = st.log[st.log.length - 1];
    if (!last || last.i === this.lastChat) return;
    this.lastChat = last.i;
    if (last.t === 'win' && last.s !== 0) setTimeout(() => bubble(last.s, ['🎉', '😎', '🀄'][Math.floor(Math.random() * 3)]), 400);
    if (last.t === 'win' && last.s === 0) st.players.forEach((p, i) => { if (i && Math.random() < 0.6) setTimeout(() => bubble(i, ['👏', '😮', '😢'][Math.floor(Math.random() * 3)]), 300 + i * 300); });
    if (last.t === 'call' && last.s !== 0 && Math.random() < 0.3) bubble(last.s, ['😏', '🙌', '😎'][Math.floor(Math.random() * 3)]);
  }
  leave() { this.host.stop(); }
}

class OnlineHost {
  constructor(resume) {
    this.kind = 'host';
    this.canNext = true;
    const saved = resume ? store.get('host', null) : null;
    this.code = saved?.code || makeCode();
    this.mode = saved?.mode || '4';
    this.seats = saved?.seats || [{ kind: 'local', name: settings.name || 'Host' }];
    this.conns = new Map(); // token -> conn
    this.host = null;
    ui.me = 0;
    this.net = new HostNet(this.code, {
      onOpen: () => { this.ready = true; render(); },
      onError: (err, transient) => { ui.banner = transient ? 'Network trouble — retrying…' : 'Online error: ' + (err.type || err.message); render(); },
      onHello: (conn, msg) => this.hello(conn, msg),
      onMessage: (conn, msg) => this.message(conn, msg),
      onClose: conn => this.closed(conn),
    });
    if (saved?.state) this.startHost(saved.state);
    else { ui.lobby = this; showScreen('lobby'); }
  }
  seatOfConn(conn) { for (const [tok, c] of this.conns) if (c === conn) return this.seats.findIndex(s => s.token === tok); return -1; }
  hello(conn, msg) {
    const token = String(msg.token || '').slice(0, 40);
    const name = String(msg.name || 'Guest').slice(0, 20);
    let seat = this.seats.findIndex(s => s.token === token);
    if (seat < 0) {
      if (this.host) { this.net.send(conn, { t: 'full', msg: 'That game has already started.' }); return; }
      const maxGuests = this.mode === '2' ? 1 : 3;
      if (this.seats.filter(s => s.kind === 'remote').length >= maxGuests) { this.net.send(conn, { t: 'full', msg: 'That room is full.' }); return; }
      this.seats.push({ kind: 'remote', name, token });
      seat = this.seats.length - 1;
      this.sys(`${name} joined.`);
    } else if (this.host) this.sys(`${this.seats[seat].name} is back.`);
    this.conns.set(token, conn);
    this.net.send(conn, { t: 'welcome', code: this.code, seat });
    if (this.host) { this.host.setOffline(seat, false); } else this.lobbyUpdate();
  }
  message(conn, msg) {
    const seat = this.seatOfConn(conn);
    if (seat < 0) return;
    if (msg.t === 'act' && this.host) {
      const r = this.host.act(seat, msg.a);
      if (!r.ok) this.net.send(conn, { t: 'err', msg: r.error });
    } else if (msg.t === 'chat') this.relayChat(seat, String(msg.text || '').slice(0, 300));
    else if (msg.t === 'emo') this.relayEmoji(seat, String(msg.e || '').slice(0, 8));
  }
  closed(conn) {
    const seat = this.seatOfConn(conn);
    if (seat < 0) return;
    const tok = this.seats[seat].token;
    if (this.conns.get(tok) === conn) this.conns.delete(tok);
    if (this.host) { this.sys(`${this.seats[seat].name} disconnected — a bot plays for them until they're back.`); this.host.setOffline(seat, true); }
    else { this.sys(`${this.seats[seat].name} left.`); this.seats.splice(seat, 1); this.lobbyUpdate(); }
  }
  lobbyUpdate() {
    const data = { t: 'lobby', code: this.code, mode: this.mode, seats: this.seats.map(s => ({ name: s.name, kind: s.kind })) };
    this.net.broadcast(data);
    render();
  }
  setMode(m) {
    this.mode = m;
    if (m === '2') while (this.seats.filter(s => s.kind === 'remote').length > 1) {
      const i = this.seats.findLastIndex(s => s.kind === 'remote');
      const conn = this.conns.get(this.seats[i].token);
      this.net.send(conn, { t: 'full', msg: 'The host switched to a 2-player game.' });
      this.seats.splice(i, 1);
    }
    this.lobbyUpdate();
  }
  start() {
    const humans = this.seats.filter(s => s.kind !== 'bot');
    if (humans.length < 2) { toast('Wait for at least one friend to join (or play solo).'); return; }
    if (this.mode === '2' && humans.length !== 2) { toast('A 2-player game needs exactly one friend.'); return; }
    const seats = [...humans];
    const names = BOT_NAMES.filter(n => !seats.some(s => s.name === n)).sort(() => Math.random() - 0.5);
    if (this.mode === '4') while (seats.length < 4) seats.push({ kind: 'bot', name: names.pop(), level: settings.botLevel });
    this.seats = seats;
    this.startHost(null);
  }
  startHost(state) {
    this.host = new Host({
      seats: this.seats, card: activeCard(), state, settings,
      onView: (s, v) => {
        if (s === 0) setView(v);
        else { const c = this.conns.get(this.seats[s].token); if (c) this.net.send(c, { t: 'view', view: v }); }
      },
      save: st => store.set('host', { code: this.code, mode: this.mode, seats: this.seats, state: st, at: Date.now() }),
    });
    for (let s = 1; s < this.seats.length; s++) if (this.seats[s].kind === 'remote' && !this.conns.has(this.seats[s].token)) this.host.offline.add(s);
    this.host.changed();
  }
  sys(text) { addChat({ sys: true, text }); this.net.broadcast({ t: 'chat', sys: true, text }); }
  relayChat(seat, text) { const name = this.seats[seat].name; addChat({ name, text }); this.net.broadcast({ t: 'chat', name, text }); }
  relayEmoji(seat, e) { bubble(seat, e); this.net.broadcast({ t: 'emo', seat, e }); }
  act(a) { if (!this.host) return { ok: false }; const r = this.host.act(0, a); if (!r.ok) toast(esc(r.error)); return r; }
  nextHand() { this.host?.nextHand(); }
  chat(text) { this.relayChat(0, text); }
  emoji(e) { this.relayEmoji(0, e); }
  leave() { this.host?.stop(); this.net.destroy(); }
}

class GuestSession {
  constructor(code, resume) {
    this.kind = 'guest';
    this.canNext = false;
    this.code = code;
    const saved = store.get('guest', null);
    this.token = resume && saved?.code === code ? saved.token : Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.name = settings.name || 'Guest';
    store.set('guest', { code, token: this.token, name: this.name, at: Date.now() });
    this.lobby = null;
    ui.lobby = this;
    ui.banner = 'Connecting to room ' + code + '…';
    showScreen('lobby');
    this.net = new GuestNet(code, { name: this.name, token: this.token }, {
      onMessage: m => this.message(m),
      onStatus: t => { ui.banner = t; render(); },
      onFail: t => { ui.banner = null; this.leave(); ui.session = null; showScreen('home'); toast(esc(t), 6000); },
    });
  }
  message(m) {
    if (m.t === 'welcome') { ui.me = m.seat; ui.banner = null; render(); }
    else if (m.t === 'lobby') { this.lobby = m; if (ui.screen !== 'lobby') showScreen('lobby'); else render(); }
    else if (m.t === 'view') { ui.me = m.view.seat; setView(m.view); store.set('guest', { code: this.code, token: this.token, name: this.name, at: Date.now() }); }
    else if (m.t === 'chat') addChat(m);
    else if (m.t === 'emo') bubble(m.seat, m.e);
    else if (m.t === 'err') toast(esc(m.msg));
    else if (m.t === 'full') { toast(esc(m.msg), 5000); store.del('guest'); this.leave(); ui.session = null; showScreen('home'); }
  }
  act(a) { this.net.send({ t: 'act', a }); return { ok: true }; }
  nextHand() {}
  chat(text) { this.net.send({ t: 'chat', text }); }
  emoji(e) { this.net.send({ t: 'emo', e }); }
  leave() { this.net.destroy(); }
}

// ================================================================== view handling
function setView(v) {
  const prev = ui.view;
  ui.view = v;
  // keep the player's own tile order; new tiles go on the end
  const hand = v.players[v.seat].hand || [];
  const kept = ui.order.filter(id => hand.includes(id));
  const added = hand.filter(id => !kept.includes(id));
  ui.order = settings.autoSort ? sortIds(hand, settings.sortMode) : [...kept, ...added];
  if (settings.autoSort && v.drawn != null) ui.order = [...sortIds(hand.filter(i => i !== v.drawn), settings.sortMode), v.drawn];
  for (const id of [...ui.sel]) if (!hand.includes(id)) ui.sel.delete(id);
  if (!prev || prev.phase !== v.phase || prev.ch.stage !== v.ch.stage) { ui.sel.clear(); ui.hint = null; }
  if (prev && prev.turn !== v.turn) ui.hint = null;
  ui.newId = v.drawn;
  sounds(prev, v);
  if (window.__amjAutoplay) autoplay();
  if (ui.screen !== 'game') showScreen('game'); else render();
}

function sounds(prev, v) {
  const fresh = v.log.filter(l => l.i > ui.lastSeq);
  ui.lastSeq = v.seq;
  if (!prev) return;
  for (const l of fresh) {
    if (l.t === 'discard') play('discard');
    else if (l.t === 'call') play('call');
    else if (l.t === 'pass') play('pass');
    else if (l.t === 'win') play('win');
    else if (l.t === 'dead') play('dead');
    else if (l.t === 'wall') play('wall');
    else if (l.t === 'draw' && l.s === v.seat) play('turn');
  }
}

// a game-state-shaped object built from a view, so hints and autoplay can reuse the bot code
function pseudoState(v) {
  const resp = {};
  if (v.claim) for (const s of v.claim.answered) resp[s] = { claim: 'pass' };
  const done = Object.fromEntries(v.ch.done.map(s => [s, true]));
  return {
    n: v.n, card: v.card, cardKey: v.cardKey, phase: v.phase, turn: v.turn, dealer: v.dealer,
    players: v.players.map(p => ({ ...p, hand: p.hand || [] })), discards: v.discards,
    ch: { stages: v.ch.stages, stage: v.ch.stage, subs: done, votes: done, courtesy: done },
    claim: v.claim ? { ...v.claim, resp } : null, wall: [],
  };
}
function autoplay() { // test hook: let the bot brain play this guest seat
  const v = ui.view; if (!v || v.phase === 'over') return;
  clearTimeout(ui.autoT);
  ui.autoT = setTimeout(() => {
    const a = botAction(pseudoState(v), v.seat, 'medium');
    if (a && ui.view === v) ui.session.act(a);
  }, 120);
}

function addChat(m) {
  ui.chat.push(m);
  if (ui.chat.length > 100) ui.chat.shift();
  if (ui.sheet !== 'chat') ui.unread++;
  if (!m.sys) play('chat');
  render();
}
function bubble(seat, e) {
  ui.bubbles[seat] = { e, at: Date.now() };
  render();
  setTimeout(() => { if (ui.bubbles[seat]?.e === e) { delete ui.bubbles[seat]; render(); } }, 2600);
}

// ================================================================== rendering
function showScreen(s) { ui.screen = s; ui.sheet = null; render(); window.scrollTo(0, 0); }

function render() {
  applyTheme();
  const root = $('#app');
  let html = '';
  if (ui.banner) html += `<div class="banner">${esc(ui.banner)}</div>`;
  if (ui.screen === 'home') html += renderHome();
  else if (ui.screen === 'lobby') html += renderLobby();
  else if (ui.screen === 'game') html += renderGame();
  else if (ui.screen === 'editor') html += renderEditor();
  if (ui.sheet) html += `<div class="overlay" data-act="closeSheet"><div class="sheet" data-stop="1">${renderSheet()}</div></div>`;
  const scroller = root.querySelector('.sheet');
  const keep = scroller ? scroller.scrollTop : 0;
  const pool = root.querySelector('.pool');
  const keepPool = pool ? pool.scrollTop : null;
  const focusedId = document.activeElement?.id;
  root.innerHTML = html;
  const sc2 = root.querySelector('.sheet');
  if (sc2 && keep) sc2.scrollTop = keep;
  const p2 = root.querySelector('.pool');
  if (p2) p2.scrollTop = keepPool == null || ui.poolBottom ? p2.scrollHeight : keepPool;
  if (focusedId) { const f = document.getElementById(focusedId); if (f) { f.focus(); if (f.setSelectionRange && f.value) f.setSelectionRange(f.value.length, f.value.length); } }
  const cl = root.querySelector('.chatlog'); if (cl) cl.scrollTop = cl.scrollHeight;
}

function renderHome() {
  const solo = store.get('solo', null);
  const host = store.get('host', null);
  const guest = store.get('guest', null);
  const recent = x => x && Date.now() - x.at < 1000 * 60 * 60 * 12;
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(settings[key]) === String(v) ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const hash = new URLSearchParams(location.hash.slice(1));
  const joinCode = cleanCode(hash.get('join') || '');
  return `<div class="home">
    <div class="logo"><div class="row">${['F', 'c2', 'O', 'b2', 'd6', 'J'].map(k => tileHTML(null, '', k)).join('')}</div>
      <h1>Mahjong Night</h1><p>American-style mahjong · solo or with friends</p></div>
    ${!settings.name ? `<div class="card-box"><label for="nm">What should we call you?</label><input id="nm" maxlength="20" placeholder="Your name" data-input="name"></div>` : ''}
    ${joinCode ? `<div class="card-box"><h3>You're invited!</h3><p class="muted">Join room <b>${joinCode}</b>.</p><button class="big" data-act="join" data-code="${joinCode}">Join room ${joinCode}</button></div>` : ''}
    ${solo && solo.state?.phase !== 'over' ? `<div class="card-box"><button class="big" data-act="resumeSolo">▶ Resume your solo game</button></div>` : ''}
    ${recent(host) && host.state ? `<div class="card-box"><button class="big" data-act="resumeHost">▶ Resume hosting room ${esc(host.code)}</button><p class="muted">Friends will reconnect automatically.</p></div>` : ''}
    ${recent(guest) ? `<div class="card-box"><button class="big" data-act="rejoin">↻ Rejoin room ${esc(guest.code)}</button></div>` : ''}
    <div class="card-box"><h3>Play solo</h3>
      <label>Opponents</label>${seg('soloPlayers', [[4, '3 bots'], [2, '1 bot (2-player)']])}
      <label>Bot skill</label>${seg('botLevel', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']])}
      <div style="height:12px"></div><button class="big" data-act="solo">Start solo game</button></div>
    ${ONLINE_OK ? '' : `<div class="card-box"><h3>Play online</h3><p class="muted">Online play needs the full website version of this game (this preview page can't make direct connections between phones).</p></div>`}
    <div class="card-box" ${ONLINE_OK ? '' : 'hidden'}><h3>Play online</h3><p class="muted">No sign-up. Host a room and send the code (or link) to friends. Empty seats get bots.</p>
      <button class="big" data-act="hostRoom">Host a room</button>
      <label for="code">Have a code?</label>
      <div class="btn-row"><input id="code" class="code-in" maxlength="5" placeholder="ABCDE" value="${joinCode}" autocomplete="off" autocapitalize="characters"><button data-act="joinInput">Join</button></div></div>
    <div class="card-box"><h3>Tile set</h3>${themePicker()}</div>
    <div class="card-box btn-row">
      <button class="ghost" data-act="tutorial">How to play</button>
      <button class="ghost" data-act="sheet" data-s="rules">Rules</button>
      <button class="ghost" data-act="sheet" data-s="card">View card</button>
      <button class="ghost" data-act="editor">Card editor</button>
      <button class="ghost" data-act="sheet" data-s="settings">Settings</button>
    </div>
    <p class="muted" style="text-align:center">Card in use: <b>${esc(activeCard().name)}</b></p>
  </div>`;
}

function themePicker() {
  return `<div class="theme-pick">${Object.entries(THEMES).map(([k, t]) => `<button class="${settings.theme === k ? 'on' : ''}" data-act="theme" data-v="${k}">
    <div class="row">${['c9', 'b3', 'd2', 'N', 'G'].map(x => `<div class="tile">${tileSVG(x, k)}</div>`).join('')}</div>
    <b>${t.name}</b><div class="muted">${t.desc}</div></button>`).join('')}</div>`;
}

function renderLobby() {
  const s = ui.session;
  if (!s) return '';
  if (s.kind === 'host') {
    const link = location.origin + location.pathname + '#join=' + s.code;
    const guests = s.seats.filter(x => x.kind === 'remote').length;
    return `<div class="home"><div class="card-box"><h3>Your room</h3>
      ${s.ready ? `<div class="bigcode">${s.code}</div><p class="muted" style="text-align:center">Friends open this app and enter the code, or use the link.</p>
      <div class="btn-row"><button data-act="share" data-link="${esc(link)}">Share invite link</button></div>` : '<p>Opening room…</p>'}
      <label>Game type</label>
      <div class="seg"><button class="${s.mode === '4' ? 'on' : ''}" data-act="mode" data-v="4">4 seats (bots fill in)</button><button class="${s.mode === '2' ? 'on' : ''}" data-act="mode" data-v="2">2 players, no bots</button></div>
      ${s.mode === '4' ? `<label>Bot skill</label><div class="seg">${['easy', 'medium', 'hard'].map(l => `<button class="${settings.botLevel === l ? 'on' : ''}" data-act="set" data-k="botLevel" data-v="${l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}</div>` : ''}
      <ul class="seat-list">${s.seats.map((x, i) => `<li><span>${esc(x.name)}${i === 0 ? ' (you, host)' : ''}</span><span class="muted">${x.kind === 'remote' ? 'friend' : 'host'}</span></li>`).join('')}
      ${s.mode === '4' ? Array.from({ length: 4 - s.seats.length }, () => '<li><span class="muted">Empty — a bot will play</span></li>').join('') : ''}</ul>
      <button class="big" data-act="startOnline" ${guests ? '' : 'disabled'}>Start game</button>
      <p class="muted">Card: ${esc(activeCard().name)}</p>
      </div><button class="ghost" data-act="home">Cancel</button></div>`;
  }
  const L = s.lobby;
  return `<div class="home"><div class="card-box"><h3>Room ${esc(s.code)}</h3>
    ${L ? `<p>Waiting for the host to start…</p><p class="muted">${L.mode === '2' ? '2-player game' : '4 seats — bots fill empty seats'}</p>
    <ul class="seat-list">${L.seats.map(x => `<li>${esc(x.name)}</li>`).join('')}</ul>` : '<p>Connecting…</p>'}
    </div><button class="ghost" data-act="home">Leave</button></div>`;
}

function relPos(seat) { const v = ui.view; return (seat - v.seat + v.n) % v.n; }
function windOf(seat) {
  const v = ui.view;
  const i = (seat - v.dealer + v.n) % v.n;
  return v.n === 2 ? ['East', 'West'][i] : WIND_NAMES[i];
}

function renderGame() {
  const v = ui.view;
  if (!v) return '<p style="padding:20px">Loading…</p>';
  const me = v.players[v.seat];
  const others = [];
  for (let k = 1; k < v.n; k++) others.push((v.seat + k) % v.n);
  // order panels: left, across, right
  const order = v.n === 4 ? [others[2], others[1], others[0]] : others;
  const myTurn = v.phase === 'play' && v.turn === v.seat;
  return `
  <div class="topbar">
    <button class="icon" data-act="sheet" data-s="menu" aria-label="Menu">☰</button>
    <div class="info">Hand ${v.round} · <b>${v.wallCount}</b> in wall<br>${esc(activeCardName(v))}</div>
    <button class="icon" data-act="mute" aria-label="Sound">${settings.muted ? '🔇' : '🔊'}</button>
    <button class="icon" data-act="hint" aria-label="Hint">💡</button>
    <button class="icon" data-act="sheet" data-s="card" aria-label="Card">📋</button>
    <button class="icon" data-act="sheet" data-s="chat" aria-label="Chat">💬${ui.unread ? '<span class="dot"></span>' : ''}</button>
  </div>
  <div class="table">
    <div class="opps ${v.n === 2 ? 'two' : ''}">${order.map(s => renderOpp(s)).join('')}</div>
    <div class="center">
      <div class="status">${statusText()}</div>
      ${renderClaim()}
      <div class="pool">${v.discards.map((d, i) => tileHTML(d.id, 'mini' + (i === v.discards.length - 1 ? ' last' : ''))).join('')}</div>
    </div>
    <div class="me ${myTurn ? 'turn' : ''}">
      <div class="head"><b>${esc(me.name)}</b><span class="badge wind">${windOf(v.seat)}</span><span class="muted">${me.score} pts</span>
        ${me.dead ? '<span class="badge dead">DEAD HAND</span>' : ''}
        ${ui.bubbles[v.seat] ? `<span style="font-size:22px">${ui.bubbles[v.seat].e}</span>` : ''}
        <span style="flex:1"></span><button class="small ghost" data-act="sort">Sort: ${settings.sortMode === 'suit' ? 'suit' : 'number'}</button></div>
      ${me.exp.length ? `<div class="exps">${me.exp.map(e => `<div class="exp">${e.ids.map(id => tileHTML(id, 'mini')).join('')}</div>`).join('')}</div>` : ''}
      <div class="hand">${ui.order.map(id => tileHTML(id, tileClasses(id))).join('')}</div>
      <div class="prompt">${promptText()}</div>
      <div class="actions">${actionButtons()}</div>
    </div>
  </div>`;
}
function activeCardName(v) { return v.card?.name || ''; }

function renderOpp(s) {
  const v = ui.view, p = v.players[s];
  const turn = (v.phase === 'play' && v.turn === s) || (v.phase === 'claim' && v.claim?.by === s);
  const done = ['charleston', 'vote', 'courtesy'].includes(v.phase) && v.ch.done.includes(s);
  const backs = Math.min(p.count, 14);
  return `<div class="opp pos-${relPos(s)} ${v.phase === 'play' && v.turn === s ? 'turn' : ''}">
    ${ui.bubbles[s] ? `<div class="bubble">${ui.bubbles[s].e}</div>` : ''}
    <div class="nm">${esc(p.name)}</div>
    <div class="sub"><span class="badge wind">${windOf(s)}</span><span>${p.score} pts</span>${p.bot ? `<span>🤖</span>` : ''}
      ${p.dead ? '<span class="badge dead">DEAD</span>' : ''}${done ? '<span class="badge ok">✓</span>' : ''}${turn && v.phase === 'play' ? '<span>…</span>' : ''}</div>
    <div class="backs">${Array.from({ length: backs }, () => backHTML('')).join('')}</div>
    ${p.exp.length ? `<div class="exps">${p.exp.map(e => `<div class="exp">${e.ids.map(id => tileHTML(id, 'mini')).join('')}</div>`).join('')}</div>` : ''}
  </div>`;
}

function tileClasses(id) {
  const v = ui.view;
  const c = [];
  if (ui.sel.has(id)) c.push('sel');
  if (id === ui.newId && v.phase === 'play') c.push('new');
  const recv = v.players[v.seat].lastReceived;
  if (recv && recv.includes(id) && ['charleston', 'vote', 'courtesy'].includes(v.phase)) c.push('recv');
  if (ui.hint?.ids?.includes(id)) c.push('hint');
  if (['charleston', 'courtesy'].includes(v.phase) && kindOf(id) === 'J') c.push('joker-off');
  return c.join(' ');
}

function nameOf(s) { return esc(ui.view.players[s].name); }
function statusText() {
  const v = ui.view;
  const dirWord = v.n === 2 ? 'across' : DIRS[v.ch.stages[v.ch.stage]];
  switch (v.phase) {
    case 'charleston': return `Charleston ${v.ch.stage < 3 ? '1' : '2'} — pass ${v.ch.stage % 3 + 1} of 3: <b>${dirWord}</b>`;
    case 'vote': return 'First Charleston done. Another round?';
    case 'courtesy': return 'Courtesy pass with the player across';
    case 'play': return v.turn === v.seat ? '<b>Your turn</b>' : `${nameOf(v.turn)}'s turn`;
    case 'claim': return `${nameOf(v.claim.by)} discarded <b>${esc(tileName(kindOf(v.claim.id)))}</b>`;
    case 'over': return v.result?.wall ? 'Wall game — nobody won' : `<b>${nameOf(v.result.winner)}</b> wins!`;
  }
  return '';
}

function renderClaim() {
  const v = ui.view;
  const o = v.claimOpts;
  if (v.phase !== 'claim' || !o || v.claim.answered.includes(v.seat)) return '';
  const label = n => ({ 3: 'Pung (3)', 4: 'Kong (4)', 5: 'Quint (5)', 6: 'Sextet (6)' }[n]);
  const sizes = o.sizes.filter(z => z.fits || !settings.assist);
  const remain = v.claim.deadline ? Math.max(0, v.claim.deadline - Date.now()) : 0;
  return `<div class="claim"><div class="what">${tileHTML(v.claim.id)}<span>Call this tile?</span></div>
    <div class="btn-row">
      ${sizes.map(z => `<button data-act="claim" data-c="expose" data-n="${z.n}">${label(z.n)}${z.fits ? '' : ' ⚠'}</button>`).join('')}
      ${o.win || !settings.assist ? `<button class="danger" data-act="claim" data-c="mahjong">Mahjong!</button>` : ''}
      <button class="ghost" data-act="claim" data-c="pass">Pass</button></div>
    ${remain ? `<div class="timer"><i style="animation-duration:${remain}ms"></i></div>` : ''}</div>`;
}

function promptText() {
  const v = ui.view;
  const me = v.players[v.seat];
  const sel = ui.sel.size;
  if (v.phase === 'charleston') {
    if (v.ch.done.includes(v.seat)) return 'Passed. Waiting for the others…';
    const blind = blindAllowed({ phase: 'charleston', ch: v.ch });
    return `Pick <b>3</b> tiles to pass ${v.n === 2 ? 'across' : DIRS[v.ch.stages[v.ch.stage]]}.${blind ? ' Pick fewer to <b>blind pass</b> the rest of what you receive.' : ''} (${sel}/3)`;
  }
  if (v.phase === 'vote') return v.ch.done.includes(v.seat) ? 'Waiting for the others…' : 'Do a second Charleston? Everyone must agree.';
  if (v.phase === 'courtesy') return v.ch.done.includes(v.seat) ? 'Waiting for the others…' : `Pick 0–3 tiles to offer the player across (${sel} picked).`;
  if (v.phase === 'play' && v.turn === v.seat) {
    if (me.dead) return 'Your hand is dead. Keep discarding until the hand ends.';
    return sel ? 'Tap <b>Discard</b> (or tap the tile again).' : 'Pick a tile to discard.';
  }
  if (v.phase === 'claim') return v.claim.answered.includes(v.seat) || !v.claimOpts ? 'Waiting…' : '';
  if (v.phase === 'over') return '';
  return 'Waiting…';
}

function canWinNow() {
  const v = ui.view, me = v.players[v.seat];
  return !!findWin(getCard(v), me.hand || [], me.exp);
}

function actionButtons() {
  const v = ui.view;
  const me = v.players[v.seat];
  const sel = ui.sel.size;
  const b = [];
  if (v.phase === 'charleston' && !v.ch.done.includes(v.seat)) {
    const blind = blindAllowed({ phase: 'charleston', ch: v.ch });
    const ok = sel === 3 || (blind && sel < 3);
    b.push(`<button data-act="pass" ${ok ? '' : 'disabled'}>${sel < 3 && blind ? `Pass ${sel} + ${3 - sel} blind` : 'Pass 3 →'}</button>`);
  } else if (v.phase === 'vote' && !v.ch.done.includes(v.seat)) {
    b.push('<button data-act="vote" data-go="1">Yes, again</button><button class="ghost" data-act="vote" data-go="0">No, start playing</button>');
  } else if (v.phase === 'courtesy' && !v.ch.done.includes(v.seat)) {
    b.push(`<button data-act="courtesy">${sel ? `Offer ${sel}` : 'Offer none'}</button>`);
  } else if (v.phase === 'play' && v.turn === v.seat) {
    b.push(`<button data-act="discard" ${sel === 1 ? '' : 'disabled'}>Discard</button>`);
    if (!me.dead && (canWinNow() || !settings.assist)) b.push('<button class="danger" data-act="mahjong">Mahjong!</button>');
    if (v.swaps?.length && !me.dead) b.push(`<button class="ghost" data-act="sheet" data-s="swap">Joker swap (${v.swaps.length})</button>`);
  } else if (v.phase === 'over') {
    b.push(`<button data-act="sheet" data-s="result">Show result</button>`);
  }
  return b.join('');
}

// ------------------------------------------------------------------ sheets
function renderSheet() {
  const close = '<button class="small ghost x" data-act="closeSheet">✕</button>';
  switch (ui.sheet) {
    case 'card': return close + renderCardSheet();
    case 'rules': return close + RULES_HTML;
    case 'settings': return close + renderSettings();
    case 'chat': return close + renderChat();
    case 'menu': return close + renderMenu();
    case 'swap': return close + renderSwap();
    case 'result': return close + renderResult();
    case 'tutorial': return renderTutorial();
    case 'ask': return `<p style="font-size:17px">${ui.ask.msg}</p><div class="btn-row"><button class="danger" data-act="askYes">${esc(ui.ask.yes)}</button><button class="ghost" data-act="closeSheet">Cancel</button></div>`;
    case 'log': return close + `<h2>Game log</h2><div class="log">${(ui.view?.log || []).slice().reverse().map(l => `<div>${esc(l.msg)}</div>`).join('')}</div>`;
  }
  return '';
}

function renderCardSheet() {
  const v = ui.view;
  const cardSrc = v ? v.card : activeCard();
  let needs = null;
  if (v && v.players[v.seat].hand) {
    const me = v.players[v.seat];
    needs = new Map(rankHands(getCard(v), me.hand, me.exp).map(r => [r.hand.idx, r.need]));
  }
  const cats = [];
  cardSrc.hands.forEach((h, i) => {
    let c = cats.find(x => x.name === (h.cat || 'Hands'));
    if (!c) cats.push(c = { name: h.cat || 'Hands', hands: [] });
    c.hands.push({ h, i });
  });
  const best = needs && needs.size ? Math.min(...needs.values()) : null;
  return `<h2>${esc(cardSrc.name)}</h2>
    ${needs ? '<p class="muted">The badge shows how many more tiles you need for each hand (with your current tiles). — means a hand is no longer possible.</p>' : ''}
    ${cats.map(c => `<div class="cat">${esc(c.name)}</div>${c.hands.map(({ h, i }) => {
      const n = needs ? needs.get(i) : undefined;
      return `<div class="hrow ${needs && n === best ? 'close' : ''}"><div style="flex:1"><div class="pat">${patternHTML(h.pattern)}</div>
        <div class="note">${esc(h.note || '')}${h.shift === 'any' ? ' · numbers can shift' : h.shift === 'even' ? ' · numbers can shift by 2' : ''}</div></div>
        ${needs ? `<span class="need ${n === 0 ? 'n0' : ''}">${n === undefined ? '—' : n === 0 ? 'Mahjong!' : 'need ' + n}</span>` : ''}
        <div class="val">${h.c ? 'C' : 'X'} ${h.value}</div></div>`;
    }).join('')}`).join('')}`;
}

function renderSettings() {
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(settings[key]) === String(v) ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `<h2>Settings</h2>
    <label for="nm2">Your name</label><input id="nm2" maxlength="20" value="${esc(settings.name)}" data-input="name">
    <label>Tile set</label>${themePicker()}
    <label>Time to call a discard</label>${seg('claimSeconds', [[5, '5s'], [10, '10s'], [20, '20s'], [0, 'No limit']])}
    <label>Assist (only offer legal calls and Mahjong)</label>${seg('assist', [[true, 'On'], [false, 'Off — real-table rules']])}
    <label>Keep my hand sorted</label>${seg('autoSort', [[true, 'Yes'], [false, 'No']])}
    <label>Bot speed</label>${seg('fastBots', [[false, 'Normal'], [true, 'Fast']])}
    <label>Sound</label>${seg('muted', [[false, 'On'], [true, 'Off']])}
    <p class="muted">Settings are saved on this device.</p>`;
}

function renderChat() {
  return `<h2>Chat</h2>
    <div class="emojis">${EMOJIS.map(e => `<button data-act="emoji" data-e="${e}">${e}</button>`).join('')}</div>
    <div class="chatlog">${ui.chat.map(m => m.sys ? `<div class="m sys">${esc(m.text)}</div>` : `<div class="m"><b>${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('') || '<div class="muted">No messages yet.</div>'}</div>
    ${ui.session?.kind === 'solo' ? '<p class="muted">The bots only speak emoji. 😉</p>' : ''}
    <div class="btn-row"><input id="chatin" maxlength="300" placeholder="Say something…" style="flex:3"><button data-act="sendChat">Send</button></div>`;
}

function renderMenu() {
  return `<h2>Menu</h2><div style="display:grid;gap:8px">
    <button class="ghost" data-act="sheet" data-s="rules">Rules</button>
    <button class="ghost" data-act="tutorial">How to play</button>
    <button class="ghost" data-act="sheet" data-s="log">Game log</button>
    <button class="ghost" data-act="sheet" data-s="settings">Settings</button>
    ${ui.session?.kind !== 'solo' && ui.session?.code ? `<p class="muted">Room code: <b>${esc(ui.session.code)}</b></p>` : ''}
    <button class="danger" data-act="home">Leave to home screen</button>
    <p class="muted">Solo games are saved automatically — you can resume later.</p></div>`;
}

function renderSwap() {
  const v = ui.view;
  return `<h2>Joker swap</h2><p class="muted">Trade a tile from your hand for a joker in an exposed group.</p>
    ${v.swaps.map((o, i) => `<div class="hrow">${tileHTML(o.id, 'mini')} <span>→</span>
      <div class="exp">${v.players[o.target].exp[o.exp].ids.map(id => tileHTML(id, 'mini')).join('')}</div>
      <span style="flex:1" class="note">${o.target === v.seat ? 'your group' : nameOf(o.target) + "'s group"}</span>
      <button class="small" data-act="swap" data-i="${i}">Swap</button></div>`).join('')}`;
}

function renderResult() {
  const v = ui.view, r = v.result;
  if (!r) return '';
  const rows = v.players.map((p, i) => `<tr><td>${esc(p.name)}</td><td class="${r.pay?.[i] > 0 ? 'pos' : r.pay?.[i] < 0 ? 'neg' : ''}">${r.pay ? (r.pay[i] > 0 ? '+' : '') + r.pay[i] : '0'}</td><td>${p.score}</td></tr>`).join('');
  let head;
  if (r.wall) head = `<h2>Wall game</h2><p>${esc(r.why)} Nobody pays.</p>`;
  else {
    const w = v.players[r.winner];
    head = `<h2>${r.winner === v.seat ? '🎉 You win! 🎉' : esc(w.name) + ' wins!'}</h2>
      <p>${r.selfDraw ? 'Self-drawn' : 'On ' + nameOf(r.from) + "'s discard"} · ${esc(r.cat)} · ${r.base} points${r.jokerless ? ' × 2 jokerless' : ''} = <b>${r.value}</b></p>
      <div class="hrow"><div class="pat">${patternHTML(r.pattern)}</div></div>
      <div class="result-tiles">${w.exp.map(e => e.ids.map(id => tileHTML(id, 'mini')).join('')).join('<span style="width:6px"></span>')}<span style="width:6px"></span>${sortIds(w.hand || []).map(id => tileHTML(id, 'mini')).join('')}</div>`;
  }
  const others = v.players.map((p, i) => i === r.winner ? '' : `<div class="muted" style="margin-top:6px">${esc(p.name)}${p.dead ? ' (dead)' : ''}</div><div class="result-tiles">${p.exp.map(e => e.ids.map(id => tileHTML(id, 'mini')).join('')).join('')} ${sortIds(p.hand || []).map(id => tileHTML(id, 'mini')).join('')}</div>`).join('');
  return `${head}<table class="scores"><tr><th>Player</th><th>This hand</th><th>Total</th></tr>${rows}</table>
    <details><summary class="muted">Everyone's tiles</summary>${others}</details>
    <div class="btn-row" style="margin-top:12px">${ui.session?.canNext ? '<button data-act="nextHand">Next hand</button>' : '<p class="muted">Waiting for the host to deal the next hand…</p>'}
    <button class="ghost" data-act="home">Home</button></div>`;
}

function renderTutorial() {
  const s = TUTORIAL[ui.slide];
  return `<div class="slide"><p class="muted">${ui.slide + 1} / ${TUTORIAL.length}</p><h2>${esc(s.title)}</h2>
    <div class="row">${s.tiles.map(k => tileHTML(null, '', k)).join('')}</div><p style="font-size:17px;line-height:1.45">${esc(s.body)}</p></div>
    <div class="btn-row">${ui.slide ? '<button class="ghost" data-act="slide" data-d="-1">Back</button>' : ''}
    ${ui.slide < TUTORIAL.length - 1 ? '<button data-act="slide" data-d="1">Next</button>' : '<button data-act="closeSheet">Let\'s play</button>'}</div>`;
}

// ------------------------------------------------------------------ card editor
function renderEditor() {
  const cards = customCards();
  const ed = ui.editing;
  if (!ed) {
    return `<div class="home"><h2>Cards</h2>
      <p class="muted">Pick the card to play with, or make your own. Custom cards are saved on this device. When you host online, your card is used for everyone.</p>
      <div class="hrow"><div style="flex:1"><b>${esc(PRACTICE_CARD.name)}</b><div class="note">Built in · ${PRACTICE_CARD.hands.length} hands</div></div>
        ${settings.cardId === 'practice' ? '<span class="badge ok">in use</span>' : '<button class="small" data-act="useCard" data-id="practice">Use</button>'}
        <button class="small ghost" data-act="copyCard" data-id="practice">Copy &amp; edit</button></div>
      ${cards.map(c => `<div class="hrow"><div style="flex:1"><b>${esc(c.name)}</b><div class="note">${c.hands.length} hands</div></div>
        ${settings.cardId === c.id ? '<span class="badge ok">in use</span>' : `<button class="small" data-act="useCard" data-id="${c.id}">Use</button>`}
        <button class="small ghost" data-act="editCard" data-id="${c.id}">Edit</button></div>`).join('')}
      <div class="btn-row" style="margin-top:12px"><button data-act="newCard">New blank card</button><button class="ghost" data-act="importCard">Import</button></div>
      <div style="margin-top:12px"><button class="ghost" data-act="home">← Home</button></div></div>`;
  }
  return `<div class="home"><button class="ghost small" data-act="edBack">← All cards</button>
    <label for="ed-name">Card name</label><input id="ed-name" value="${esc(ed.name)}" data-input="edName" maxlength="40" style="width:100%">
    <details class="card-box"><summary><b>How to write a hand</b></summary><div class="muted" style="line-height:1.5">
      Write groups separated by spaces. Repeated symbols make a group: <b>FF</b> pair of flowers, <b>222</b> pung, <b>2222</b> kong.
      Mixed symbols are singles: <b>2026</b> is 2, 0, 2, 6.<br>
      Symbols: <b>1–9</b> numbers, <b>0</b> white dragon, <b>N E W S</b> winds, <b>R</b> red dragon, <b>G</b> green dragon, <b>D</b> dragon matching the suit, <b>F</b> flower.<br>
      Add a suit letter at the end of a group: <b>a</b>, <b>b</b> or <b>c</b> (shown green, red, blue). Same letter = same suit, different letters = different suits. Example: <b>FF 2222a 4444b 6666c</b>.<br>
      "Numbers can shift" lets a run like 111 222 333 slide to any other numbers (and like-number hands use any number). Each hand needs exactly 14 tiles.</div></details>
    ${ed.hands.map((h, i) => {
      const errs = validateHand(h);
      return `<div class="ed-hand">
        <div class="grid"><input class="pattern" id="p${i}" value="${esc(h.pattern)}" data-input="edField" data-i="${i}" data-f="pattern" placeholder="FF 2222a 4444b 6666c">
        <input id="v${i}" type="number" value="${esc(h.value)}" data-input="edField" data-i="${i}" data-f="value" placeholder="25"></div>
        <div class="grid two" style="margin-top:6px"><input id="c${i}" value="${esc(h.cat || '')}" data-input="edField" data-i="${i}" data-f="cat" placeholder="Category">
        <input id="n${i}" value="${esc(h.note || '')}" data-input="edField" data-i="${i}" data-f="note" placeholder="Note"></div>
        <div class="btn-row" style="margin-top:6px;align-items:center">
          <label style="margin:0"><input type="checkbox" data-act="edToggle" data-i="${i}" data-f="c" ${h.c ? 'checked' : ''}> Concealed</label>
          <select data-change="edShift" data-i="${i}"><option value="" ${!h.shift ? 'selected' : ''}>Numbers fixed</option><option value="any" ${h.shift === 'any' ? 'selected' : ''}>Numbers can shift</option><option value="even" ${h.shift === 'even' ? 'selected' : ''}>Shift by 2s</option></select>
          <button class="small ghost" data-act="edMove" data-i="${i}" data-d="-1">↑</button><button class="small ghost" data-act="edMove" data-i="${i}" data-d="1">↓</button>
          <button class="small danger" data-act="edDel" data-i="${i}">Delete</button></div>
        <div id="msg${i}">${editorMsg(h, errs)}</div></div>`;
    }).join('')}
    <div class="btn-row"><button data-act="edAdd">+ Add hand</button></div>
    <div class="btn-row" style="margin-top:12px"><button data-act="edSave">Save card</button><button class="ghost" data-act="exportCard">Export / share</button><button class="danger" data-act="edDelCard">Delete card</button></div></div>`;
}
function editorMsg(h, errs) {
  if (errs.length) return `<div class="err">${errs.map(esc).join('<br>')}</div>`;
  return `<div class="ok">✓ Valid · example:</div><div class="preview">${exampleKinds(h).map(k => tileHTML(null, 'mini', k)).join('')}</div>`;
}

// ================================================================== events
function handleClick(e) {
  const el = e.target.closest('[data-act],[data-id].tile,[data-stop]');
  if (!el) return;
  if (el.dataset.stop && !e.target.closest('[data-act]') && !e.target.closest('.tile[data-id]')) return;
  if (el.classList.contains('tile') && !el.dataset.act) return tapTile(Number(el.dataset.id), el);
  const d = el.dataset;
  const s = ui.session;
  switch (d.act) {
    case 'askYes': { const f = ui.ask?.fn; ui.ask = null; ui.sheet = null; render(); f?.(); return; }
    case 'closeSheet': if (e.target === el || el.tagName === 'BUTTON') { ui.sheet = null; if (!settings.seenTutorial) { settings.seenTutorial = true; saveSettings(); } render(); } return;
    case 'sheet': ui.sheet = d.s; if (d.s === 'chat') ui.unread = 0; render(); return;
    case 'set': {
      let val = d.v;
      if (val === 'true') val = true; else if (val === 'false') val = false; else if (/^\d+$/.test(val)) val = Number(val);
      settings[d.k] = val; saveSettings();
      if (d.k === 'muted') setMuted(val);
      if (d.k === 'autoSort' && ui.view) setView(ui.view);
      render(); return;
    }
    case 'theme': settings.theme = d.v; saveSettings(); render(); return;
    case 'mute': settings.muted = !settings.muted; setMuted(settings.muted); saveSettings(); render(); return;
    case 'tutorial': ui.slide = 0; ui.sheet = 'tutorial'; render(); return;
    case 'slide': ui.slide = Math.max(0, Math.min(TUTORIAL.length - 1, ui.slide + Number(d.d))); render(); return;
    case 'solo': return startSession(() => new SoloSession(false));
    case 'resumeSolo': return startSession(() => new SoloSession(true));
    case 'hostRoom': store.del('host'); return startSession(() => new OnlineHost(false));
    case 'resumeHost': return startSession(() => new OnlineHost(true));
    case 'joinInput': { const c = cleanCode($('#code')?.value); if (c.length !== 5) { toast('Room codes have 5 letters.'); return; } return startSession(() => new GuestSession(c, false)); }
    case 'join': return startSession(() => new GuestSession(d.code, store.get('guest', {})?.code === d.code));
    case 'rejoin': { const g = store.get('guest', null); if (g) return startSession(() => new GuestSession(g.code, true)); return; }
    case 'home': leave(); return;
    case 'mode': s?.setMode(d.v); return;
    case 'startOnline': s?.start(); return;
    case 'share': {
      const link = d.link;
      if (navigator.share) navigator.share({ title: 'Mahjong Night', text: `Join my mahjong game! Room code ${s.code}`, url: link }).catch(() => {});
      else Promise.resolve(navigator.clipboard?.writeText(link)).then(() => toast('Link copied!'), () => toast(esc(link), 8000));
      return;
    }
    case 'pass': {
      const ids = [...ui.sel];
      const r = s.act({ type: 'pass', ids, blind: 3 - ids.length });
      if (r.ok) { ui.sel.clear(); play('pass'); }
      return;
    }
    case 'vote': s.act({ type: 'vote', go: d.go === '1' }); return;
    case 'courtesy': { const r = s.act({ type: 'courtesy', ids: [...ui.sel] }); if (r.ok) ui.sel.clear(); return; }
    case 'discard': return discardSelected();
    case 'mahjong': {
      const go = () => s.act({ type: 'mahjong' });
      if (!canWinNow()) return askThen("This doesn't match any hand on the card. Declaring now makes your hand DEAD.", 'Declare anyway', go);
      go(); return;
    }
    case 'claim': {
      const go = () => s.act({ type: 'claim', claim: d.c, n: Number(d.n) || undefined });
      if (d.c === 'expose' && !ui.view.claimOpts?.sizes.find(z => z.n === Number(d.n))?.fits) return askThen('No hand on the card fits this exposure. Calling it makes your hand DEAD.', 'Call anyway', go);
      if (d.c === 'mahjong' && !ui.view.claimOpts?.win) return askThen("This tile doesn't give you a hand on the card. Calling Mahjong makes your hand DEAD.", 'Call anyway', go);
      go(); return;
    }
    case 'swap': { const o = ui.view.swaps[Number(d.i)]; s.act({ type: 'swap', id: o.id, target: o.target, exp: o.exp }); ui.sheet = null; render(); return; }
    case 'nextHand': ui.sheet = null; s.nextHand(); return;
    case 'sort': settings.sortMode = settings.sortMode === 'suit' ? 'number' : 'suit'; saveSettings(); ui.order = sortIds(ui.order, settings.sortMode); render(); return;
    case 'hint': return showHint();
    case 'emoji': s?.emoji(d.e); ui.sheet = null; render(); return;
    case 'sendChat': { const t = $('#chatin')?.value.trim(); if (t && s) s.chat(t); return; }
    // card editor
    case 'editor': ui.editing = null; showScreen('editor'); return;
    case 'useCard': settings.cardId = d.id; saveSettings(); toast('Card selected for new games.'); render(); return;
    case 'copyCard': { const src = d.id === 'practice' ? PRACTICE_CARD : customCards().find(c => c.id === d.id); ui.editing = { id: 'c' + Date.now(), name: src.name + ' (copy)', hands: JSON.parse(JSON.stringify(src.hands)), isNew: true }; render(); return; }
    case 'newCard': ui.editing = { id: 'c' + Date.now(), name: 'My card', hands: [{ cat: 'Hands', pattern: 'FF 2222a 4444b 6666c', value: 25 }], isNew: true }; render(); return;
    case 'editCard': { const c = customCards().find(x => x.id === d.id); ui.editing = JSON.parse(JSON.stringify(c)); render(); return; }
    case 'edBack': ui.editing = null; render(); return;
    case 'edAdd': ui.editing.hands.push({ cat: ui.editing.hands.at(-1)?.cat || 'Hands', pattern: '', value: 25 }); render(); return;
    case 'edDel': ui.editing.hands.splice(Number(d.i), 1); render(); return;
    case 'edMove': { const i = Number(d.i), j = i + Number(d.d), H = ui.editing.hands; if (j >= 0 && j < H.length) [H[i], H[j]] = [H[j], H[i]]; render(); return; }
    case 'edToggle': ui.editing.hands[Number(d.i)][d.f] = el.checked; return;
    case 'edSave': {
      const ed = ui.editing;
      const bad = ed.hands.filter(h => validateHand(h).length).length;
      if (!ed.hands.length) { toast('Add at least one hand.'); return; }
      const cards = customCards().filter(c => c.id !== ed.id);
      cards.push({ id: ed.id, name: ed.name || 'My card', hands: ed.hands.map(h => ({ ...h, value: Number(h.value) })) });
      saveCustomCards(cards);
      ed.isNew = false;
      toast(bad ? `Saved. ${bad} hand(s) have problems and will be skipped in play.` : 'Card saved.');
      return;
    }
    case 'edDelCard': {
      const ed = ui.editing;
      return askThen(`Delete the card "${esc(ed.name)}" from this device?`, 'Delete', () => {
        saveCustomCards(customCards().filter(c => c.id !== ed.id));
        if (settings.cardId === ed.id) { settings.cardId = 'practice'; saveSettings(); }
        ui.editing = null; render();
      });
    }
    case 'exportCard': {
      const ed = ui.editing;
      const json = JSON.stringify({ name: ed.name, hands: ed.hands });
      ui.sheet = 'export'; render();
      $('.sheet').innerHTML = `<button class="small ghost x" data-act="closeSheet">✕</button><h2>Export card</h2><p class="muted">Copy this text and send it to a friend. They paste it into Card editor → Import.</p><textarea readonly id="exp">${esc(json)}</textarea><button data-act="copyExport">Copy</button>`;
      return;
    }
    case 'copyExport': { const ta = $('#exp'); ta.select(); Promise.resolve(navigator.clipboard?.writeText(ta.value)).then(() => toast('Copied!'), () => toast('Text selected — use your phone\'s Copy.')); return; }
    case 'importCard': {
      ui.sheet = 'import'; render();
      $('.sheet').innerHTML = `<button class="small ghost x" data-act="closeSheet">✕</button><h2>Import card</h2><p class="muted">Paste card text from Export.</p><textarea id="imp"></textarea><button data-act="doImport">Import</button>`;
      return;
    }
    case 'doImport': {
      try {
        const c = JSON.parse($('#imp').value);
        if (!Array.isArray(c.hands) || !c.hands.length) throw new Error('no hands');
        const hands = c.hands.slice(0, 200).map(h => ({ cat: String(h.cat || '').slice(0, 40), pattern: String(h.pattern || '').slice(0, 80), value: Number(h.value) || 25, c: !!h.c, shift: ['any', 'even'].includes(h.shift) ? h.shift : '', note: String(h.note || '').slice(0, 120) }));
        const card = { id: 'c' + Date.now(), name: String(c.name || 'Imported card').slice(0, 40), hands };
        saveCustomCards([...customCards(), card]);
        ui.sheet = null; ui.editing = null; toast('Card imported.'); render();
      } catch { toast("That text isn't a card export."); }
      return;
    }
  }
}

function handleInput(e) {
  const el = e.target;
  const d = el.dataset;
  if (d.input === 'name') { settings.name = el.value.trim().slice(0, 20); saveSettings(); return; }
  if (d.input === 'edName') { ui.editing.name = el.value; return; }
  if (d.input === 'edField') {
    const h = ui.editing.hands[Number(d.i)];
    h[d.f] = d.f === 'pattern' ? el.value.toUpperCase().replace(/([ABC])(?=\s|$)/g, m => m.toLowerCase()) : el.value;
    if (d.f === 'pattern' && el.value !== h.pattern) { const pos = el.selectionStart; el.value = h.pattern; el.setSelectionRange(pos, pos); }
    const box = document.getElementById('msg' + d.i);
    if (box) box.innerHTML = editorMsg(h, validateHand(h));
  }
}
function handleChange(e) {
  const d = e.target.dataset;
  if (d.change === 'edShift') { ui.editing.hands[Number(d.i)].shift = e.target.value; const h = ui.editing.hands[Number(d.i)]; const box = document.getElementById('msg' + d.i); if (box) box.innerHTML = editorMsg(h, validateHand(h)); }
}
function handleKey(e) {
  if (e.key === 'Enter' && e.target.id === 'chatin') { const t = e.target.value.trim(); if (t && ui.session) ui.session.chat(t); }
  if (e.key === 'Enter' && e.target.id === 'code') document.querySelector('[data-act=joinInput]')?.click();
}

function tapTile(id, el) {
  const v = ui.view;
  if (!v || ui.screen !== 'game') return;
  const mine = (v.players[v.seat].hand || []).includes(id);
  if (!mine || el.closest('.sheet')) return;
  const phase = v.phase;
  if (phase === 'charleston' || phase === 'courtesy') {
    if (v.ch.done.includes(v.seat)) return;
    if (kindOf(id) === 'J') { toast('Jokers can never be passed.'); return; }
    if (ui.sel.has(id)) ui.sel.delete(id);
    else if (ui.sel.size < 3) ui.sel.add(id);
    else toast('You can pick 3 tiles. Tap one to unpick it.');
    play('select');
  } else if (phase === 'play' && v.turn === v.seat) {
    if (ui.sel.has(id)) return discardSelected();
    ui.sel.clear(); ui.sel.add(id); play('select');
  } else return;
  render();
}

function discardSelected() {
  const id = [...ui.sel][0];
  if (id === undefined) return;
  const go = () => { const r = ui.session.act({ type: 'discard', id }); if (r.ok) ui.sel.clear(); };
  if (kindOf(id) === 'J') return askThen('Discard a Joker? Nobody can call it, but you lose it.', 'Discard Joker', go);
  go();
}

function askThen(msg, yes, fn) { ui.ask = { msg, yes, fn }; ui.sheet = 'ask'; render(); }

function showHint() {
  const v = ui.view;
  if (!v) return;
  const me = v.players[v.seat];
  const ranked = rankHands(getCard(v), me.hand || [], me.exp).slice(0, 3);
  const h = hintFor(pseudoState(v), v.seat);
  ui.hint = { ids: h.discard != null ? [h.discard] : h.pass || [] };
  const lines = ranked.map(r => `<div><b>${patternHTML(r.hand.pattern).replace(/color:#333/g, 'color:#fff')}</b> — ${r.need ? 'need ' + r.need : 'Mahjong!'}</div>`).join('');
  const what = h.discard != null ? 'Suggested discard is glowing.' : h.pass ? 'Suggested tiles to pass are glowing.' : '';
  toast(`<div style="text-align:left">${ranked.length ? 'Closest hands:' + lines : 'No hands are possible — your hand may be stuck.'}<div style="margin-top:4px">${what}</div></div>`, 6000);
  render();
}

function startSession(make) {
  leave(true);
  if (!settings.name) { settings.name = 'Player ' + Math.floor(Math.random() * 90 + 10); saveSettings(); }
  ui.view = null; ui.order = []; ui.sel.clear(); ui.chat = []; ui.unread = 0; ui.lastSeq = 0; ui.banner = null; ui.hint = null;
  try { ui.session = make(); render(); } catch (err) { console.error(err); toast('Could not start: ' + esc(err.message)); ui.session = null; showScreen('home'); }
}
function leave(silent) {
  if (ui.session) { try { ui.session.leave(); } catch { /* ignore */ } }
  ui.session = null; ui.view = null; ui.banner = null; ui.lobby = null;
  if (!silent) { history.replaceState(null, '', location.pathname + location.search); showScreen('home'); }
}

// ================================================================== boot
export function boot() {
  document.addEventListener('click', handleClick);
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleChange);
  document.addEventListener('keydown', handleKey);
  // refresh the claim timer bar and bubbles
  render();
  if (!settings.seenTutorial) { ui.slide = 0; ui.sheet = 'tutorial'; render(); }
  window.__amj = { ui, settings, store, setAutoplay(on) { window.__amjAutoplay = on; if (on) autoplay(); } };
}
