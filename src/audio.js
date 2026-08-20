// The original jar has no audio at all — confirmed by grepping the full
// decompiled source for playTone/Manager/javax.microedition.media: zero
// hits, and there are no sound files anywhere in the jar. MIDP-1.0 games
// commonly shipped silent. So this isn't a port of anything; it's a
// small, tasteful set of synthesized cues added for the browser version,
// using the Web Audio API (oscillators/noise, no audio files needed).

let ctx = null;
let muted = false;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(value) {
  muted = value;
  try { localStorage.setItem('dawnstar_muted', value ? '1' : '0'); } catch (e) { /* ignore */ }
}
export function isMuted() {
  return muted;
}
export function loadMutePref() {
  try { muted = localStorage.getItem('dawnstar_muted') === '1'; } catch (e) { /* ignore */ }
  return muted;
}

function tone(freq, duration, opts = {}) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const { type = 'square', gain = 0.08, sweep = null, delay = 0 } = opts;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  const t0 = c.currentTime + delay;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(sweep, t0 + duration);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noiseBurst(duration, gain = 0.06) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const bufferSize = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  src.connect(g);
  g.connect(c.destination);
  src.start();
}

export const sfx = {
  click: () => tone(520, 0.05, { type: 'square', gain: 0.05 }),
  move: () => tone(120, 0.04, { type: 'sine', gain: 0.03 }),
  bump: () => tone(80, 0.08, { type: 'square', gain: 0.05 }),
  hit: () => { tone(180, 0.08, { type: 'sawtooth', gain: 0.09, sweep: 60 }); noiseBurst(0.06, 0.04); },
  miss: () => tone(300, 0.06, { type: 'sine', gain: 0.03, sweep: 200 }),
  cast: () => { tone(600, 0.12, { type: 'sine', gain: 0.06, sweep: 900 }); tone(900, 0.15, { type: 'sine', gain: 0.04, delay: 0.05, sweep: 1200 }); },
  heal: () => { tone(500, 0.1, { type: 'sine', gain: 0.05, sweep: 800 }); tone(700, 0.12, { type: 'sine', gain: 0.04, delay: 0.08, sweep: 1000 }); },
  chest: () => { tone(400, 0.08, { type: 'triangle', gain: 0.06 }); tone(600, 0.1, { type: 'triangle', gain: 0.05, delay: 0.08 }); },
  gold: () => { tone(900, 0.05, { type: 'square', gain: 0.04 }); tone(1200, 0.06, { type: 'square', gain: 0.03, delay: 0.05 }); },
  victory: () => { tone(500, 0.1, { gain: 0.06 }); tone(650, 0.1, { gain: 0.06, delay: 0.1 }); tone(800, 0.16, { gain: 0.06, delay: 0.2 }); },
  levelUp: () => { [0, 0.1, 0.2, 0.3].forEach((d, i) => tone(440 * Math.pow(1.26, i), 0.15, { type: 'triangle', gain: 0.07, delay: d })); },
  defeat: () => { tone(220, 0.3, { type: 'sawtooth', gain: 0.06, sweep: 80 }); },
  door: () => tone(150, 0.15, { type: 'square', gain: 0.05, sweep: 100 }),
  paralyze: () => { tone(700, 0.05, { type: 'square', gain: 0.05 }); tone(700, 0.05, { type: 'square', gain: 0.05, delay: 0.1 }); },
};
