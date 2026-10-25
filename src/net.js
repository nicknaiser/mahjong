// Online play over WebRTC (PeerJS). The host's browser holds the game; friends connect
// to it with a 5-letter room code. No accounts and no game server of our own.
import { Peer } from 'peerjs';

const PREFIX = 'amj26-room-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';

export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
export const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);

function peerOptions() {
  // ?peerhost=localhost&peerport=9000 lets tests use a local signalling server
  const q = new URLSearchParams(location.search);
  const o = { debug: 0 };
  if (q.get('peerhost')) {
    o.host = q.get('peerhost');
    o.port = Number(q.get('peerport') || 9000);
    o.path = q.get('peerpath') || '/';
    o.secure = q.get('peersecure') === '1';
  }
  return o;
}

// ---------------------------------------------------------------- host side
export class HostNet {
  constructor(code, handlers) {
    this.code = code;
    this.h = handlers; // { onOpen, onError, onHello(conn, msg), onMessage(conn, msg), onClose(conn) }
    this.conns = new Set();
    this.dead = false;
    this.tries = 0;
    this.open();
  }
  open() {
    this.peer = new Peer(PREFIX + this.code, peerOptions());
    this.peer.on('open', () => { this.tries = 0; this.h.onOpen?.(); });
    this.peer.on('error', err => {
      if (this.dead) return;
      // After a refresh the old room id can stay reserved for a little while.
      if (err.type === 'unavailable-id' && this.tries++ < 20) { this.peer.destroy(); setTimeout(() => this.open(), 3000); return; }
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') this.h.onError?.(err, true);
      else if (err.type !== 'peer-unavailable') this.h.onError?.(err, false);
    });
    this.peer.on('disconnected', () => { if (!this.dead) setTimeout(() => { try { this.peer.reconnect(); } catch { /* ignore */ } }, 2000); });
    this.peer.on('connection', conn => {
      conn.on('open', () => this.conns.add(conn));
      conn.on('data', msg => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'hello') this.h.onHello?.(conn, msg);
        else this.h.onMessage?.(conn, msg);
      });
      const gone = () => { if (this.conns.delete(conn)) this.h.onClose?.(conn); };
      conn.on('close', gone);
      conn.on('error', gone);
    });
  }
  send(conn, msg) { try { if (conn?.open) conn.send(msg); } catch { /* ignore */ } }
  broadcast(msg) { for (const c of this.conns) this.send(c, msg); }
  destroy() { this.dead = true; try { this.peer.destroy(); } catch { /* ignore */ } }
}

// ---------------------------------------------------------------- guest side
export class GuestNet {
  constructor(code, hello, handlers) {
    this.code = code;
    this.hello = hello; // { name, token }
    this.h = handlers; // { onMessage, onStatus(text|null), onFail(text) }
    this.dead = false;
    this.connected = false;
    this.everConnected = false;
    this.attempts = 0;
    this.peer = new Peer(peerOptions());
    this.peer.on('open', () => this.connect());
    this.peer.on('error', err => {
      if (this.dead) return;
      if (err.type === 'peer-unavailable') {
        if (!this.everConnected && this.attempts >= 3) { this.h.onFail?.(`Room ${code} wasn't found. Check the code, and make sure the host still has the game open.`); return; }
        this.retry();
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        this.h.onStatus?.('Network trouble — retrying…');
        setTimeout(() => { if (!this.dead) try { this.peer.reconnect(); } catch { /* ignore */ } }, 3000);
      }
    });
    this.peer.on('disconnected', () => { if (!this.dead) setTimeout(() => { try { this.peer.reconnect(); } catch { /* ignore */ } }, 2000); });
  }
  connect() {
    if (this.dead) return;
    this.attempts++;
    const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
    this.conn = conn;
    const timeout = setTimeout(() => { if (!conn.open && !this.dead) { try { conn.close(); } catch { /* ignore */ } this.retry(); } }, 12000);
    conn.on('open', () => {
      clearTimeout(timeout);
      this.connected = true; this.everConnected = true; this.attempts = 0;
      this.h.onStatus?.(null);
      conn.send({ t: 'hello', ...this.hello });
    });
    conn.on('data', msg => this.h.onMessage?.(msg));
    conn.on('close', () => {
      clearTimeout(timeout);
      if (this.dead || this.conn !== conn) return;
      this.connected = false;
      this.h.onStatus?.('Lost connection to the host — reconnecting…');
      this.retry();
    });
  }
  retry() {
    if (this.dead || this.retrying) return;
    this.retrying = true;
    setTimeout(() => { this.retrying = false; if (this.peer.disconnected) { try { this.peer.reconnect(); } catch { /* ignore */ } } else this.connect(); }, 3000);
  }
  send(msg) { try { if (this.conn?.open) this.conn.send(msg); } catch { /* ignore */ } }
  destroy() { this.dead = true; try { this.peer.destroy(); } catch { /* ignore */ } }
}
