// Small synthesized sound effects (no audio files to download).
let ctx = null;
let muted = false;
export const setMuted = m => { muted = m; };
export const isMuted = () => muted;

function ac() {
  if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function clack(vol = 0.5, pitch = 1) {
  const a = ac(); if (!a) return;
  const len = Math.floor(a.sampleRate * 0.06);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200 * pitch; f.Q.value = 3;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}
function tone(freq, start, dur, vol = 0.15, type = 'triangle') {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = a.createGain();
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}

export function play(name) {
  if (muted) return;
  try {
    switch (name) {
      case 'discard': clack(0.6, 1); break;
      case 'draw': clack(0.25, 1.4); break;
      case 'select': clack(0.15, 1.8); break;
      case 'pass': clack(0.4, 1.1); setTimeout(() => clack(0.35, 1.2), 70); setTimeout(() => clack(0.3, 1.3), 140); break;
      case 'call': tone(523, 0, 0.18); tone(784, 0.1, 0.25); break;
      case 'turn': tone(880, 0, 0.18, 0.08, 'sine'); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.4, 0.14)); break;
      case 'dead': tone(300, 0, 0.3, 0.12, 'sawtooth'); tone(200, 0.2, 0.4, 0.12, 'sawtooth'); break;
      case 'chat': tone(1200, 0, 0.08, 0.05, 'sine'); break;
      case 'wall': tone(440, 0, 0.3, 0.1); tone(330, 0.2, 0.5, 0.1); break;
    }
  } catch { /* audio is optional */ }
}
