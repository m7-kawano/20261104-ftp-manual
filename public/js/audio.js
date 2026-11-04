// Web Audio API による効果音・BGM の手続き生成（外部音源ファイル不要）
let ctx = null;
let master, sfxGain, bgmGain, bgmLP, noiseBuf;
let muted = false;
const MUTE_KEY = 'stardust.muted';

try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.85;
  master.connect(comp);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.7;
  sfxGain.connect(master);
  bgmLP = ctx.createBiquadFilter();
  bgmLP.type = 'lowpass';
  bgmLP.frequency.value = 5200;
  bgmLP.Q.value = 0.8;
  bgmGain = ctx.createGain();
  bgmGain.gain.value = 0;
  bgmLP.connect(bgmGain);
  bgmGain.connect(master);
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
  if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05);
}

function env(g, t0, attack, dur, vol) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone({ freq, to, dur = 0.1, type = 'sine', vol = 0.1, attack = 0.005, when = 0, at, dest }) {
  if (!ctx) return;
  const t0 = at ?? ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, attack, dur, vol);
  o.connect(g);
  g.connect(dest || sfxGain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.1, f = 1000, fTo, ftype = 'bandpass', q = 1, attack = 0.005, when = 0, at, dest }) {
  if (!ctx) return;
  const t0 = at ?? ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = ftype;
  fl.frequency.setValueAtTime(f, t0);
  if (fTo) fl.frequency.exponentialRampToValueAtTime(fTo, t0 + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, attack, dur, vol);
  src.connect(fl);
  fl.connect(g);
  g.connect(dest || sfxGain);
  src.start(t0, Math.random() * 0.8);
  src.stop(t0 + dur + 0.05);
}

const last = {};
function throttle(key, ms) {
  const now = performance.now();
  if (last[key] && now - last[key] < ms) return false;
  last[key] = now;
  return true;
}

export const sfx = {
  hover() {
    if (!throttle('hover', 40)) return;
    tone({ freq: 1500, dur: 0.035, type: 'triangle', vol: 0.04 });
  },
  select() {
    tone({ freq: 660, dur: 0.08, type: 'square', vol: 0.05 });
    tone({ freq: 990, dur: 0.14, type: 'square', vol: 0.05, when: 0.06 });
  },
  back() {
    tone({ freq: 560, to: 360, dur: 0.12, type: 'triangle', vol: 0.08 });
  },
  start() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.08, when: i * 0.05 }));
    noise({ dur: 0.5, vol: 0.06, f: 600, fTo: 5000, attack: 0.2 });
  },
  count() {
    tone({ freq: 880, dur: 0.14, type: 'sine', vol: 0.14 });
    tone({ freq: 880, dur: 0.08, type: 'square', vol: 0.025 });
  },
  go() {
    [660, 880, 1320].forEach(f => tone({ freq: f, dur: 0.4, type: 'triangle', vol: 0.08 }));
    noise({ dur: 0.35, vol: 0.05, f: 2000, fTo: 7000 });
  },
  shot() {
    if (!throttle('shot', 110)) return;
    tone({ freq: 1700, to: 800, dur: 0.05, type: 'triangle', vol: 0.012 });
  },
  graze() {
    if (!throttle('graze', 45)) return;
    tone({ freq: 2600 + Math.random() * 500, to: 3600, dur: 0.035, type: 'sine', vol: 0.035 });
  },
  hit() {
    noise({ dur: 0.5, vol: 0.4, f: 3200, fTo: 180, ftype: 'lowpass' });
    tone({ freq: 240, to: 50, dur: 0.5, type: 'sawtooth', vol: 0.13 });
  },
  explode() {
    noise({ dur: 1.3, vol: 0.5, f: 2400, fTo: 60, ftype: 'lowpass', q: 0.7 });
    tone({ freq: 180, to: 28, dur: 1.2, type: 'sawtooth', vol: 0.16 });
    tone({ freq: 90, to: 30, dur: 1.4, type: 'sine', vol: 0.3 });
  },
  stageClear() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.07, when: i * 0.07 }));
    noise({ dur: 1.6, vol: 0.12, f: 250, fTo: 4500, attack: 0.9, q: 1.5 });
  },
  warpOut() {
    noise({ dur: 1.0, vol: 0.09, f: 4500, fTo: 300, attack: 0.05, q: 1.2 });
  },
  rankUp() {
    [1320, 1760, 2640].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'sine', vol: 0.07, when: i * 0.06 }));
  },
  tick() {
    if (!throttle('tick', 35)) return;
    tone({ freq: 2100, dur: 0.02, type: 'square', vol: 0.015 });
  },
  gameOver() {
    [523, 440, 349, 262].forEach((f, i) => tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.09, when: i * 0.2 }));
  },
  rank(id) {
    const big = id === 'S' || id === 'A';
    tone({ freq: 70, to: 40, dur: 0.4, type: 'sine', vol: 0.35 });
    noise({ dur: 0.3, vol: 0.12, f: 900, fTo: 120, ftype: 'lowpass' });
    const chords = { S: [523, 659, 784, 1047, 1568], A: [523, 659, 784, 1047], B: [440, 554, 659], C: [440, 523, 659], D: [392, 494], E: [349, 415], F: [294, 349] };
    (chords[id] || chords.F).forEach((f, i) => tone({ freq: f, dur: big ? 1.4 : 0.8, type: 'triangle', vol: 0.06, when: 0.05 + i * (big ? 0.06 : 0.03), attack: 0.02 }));
    if (big) for (let i = 0; i < 6; i++) tone({ freq: 2000 + Math.random() * 2000, dur: 0.12, type: 'sine', vol: 0.03, when: 0.3 + i * 0.08 });
  },
  record() {
    [784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'square', vol: 0.035, when: i * 0.08 }));
  },
  pause() { tone({ freq: 440, to: 660, dur: 0.12, type: 'triangle', vol: 0.08 }); },
  resume() { tone({ freq: 660, to: 440, dur: 0.12, type: 'triangle', vol: 0.08 }); },
};

// ---------------- BGM（シンプルな手続き生成シーケンサ） ----------------
const BPM = 112;
const STEP_SEC = 60 / BPM / 4;
const ROOTS = [0, -3, 2, -5, 5, -2];
// Am - F - C - G 系の進行（ルートからの半音）
const PROG = [
  { r: 0, t: [0, 3, 7] },
  { r: 8, t: [8, 12, 15] },
  { r: 3, t: [3, 7, 10] },
  { r: 10, t: [10, 14, 17] },
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 3, 2, 1, 2, 0];

const seq = { playing: false, step: 0, next: 0, timer: null, root: 0, intensity: 1, stopToken: 0 };

function midiHz(base, semis) { return base * Math.pow(2, semis / 12); }

function playStep(s, t) {
  const i = s % 16;
  const chord = PROG[Math.floor(s / 16) % 4];
  const root = seq.root;
  const dest = bgmLP;
  if (i === 0 || i === 6 || i === 8 || i === 14) {
    tone({ freq: midiHz(55, root + chord.r), dur: 0.24, type: 'triangle', vol: 0.2, at: t, dest });
  }
  if (i === 0 || i === 8) {
    tone({ freq: 130, to: 42, dur: 0.16, type: 'sine', vol: 0.22, at: t, dest });
  }
  const tones = chord.t;
  const n = tones[ARP[i] % tones.length] + ((i % 8) >= 4 ? 12 : 0);
  tone({ freq: midiHz(220, root + n), dur: 0.11, type: 'square', vol: 0.028, at: t, dest });
  if (seq.intensity >= 1.5 && i % 4 === 2) {
    noise({ dur: 0.04, vol: 0.03, f: 8000, ftype: 'highpass', at: t, dest });
  }
  if (seq.intensity >= 2.5 && i % 2 === 1) {
    noise({ dur: 0.025, vol: 0.015, f: 9000, ftype: 'highpass', at: t, dest });
  }
  if (i === 0) {
    for (const k of tones) {
      tone({ freq: midiHz(220, root + k), dur: STEP_SEC * 16, type: 'sawtooth', vol: 0.012, attack: 0.4, at: t, dest });
    }
  }
}

function schedule() {
  if (!ctx) return;
  while (seq.next < ctx.currentTime + 0.15) {
    playStep(seq.step, seq.next);
    seq.next += STEP_SEC;
    seq.step++;
  }
}

export const bgm = {
  start(stage = 1) {
    if (!ctx) return;
    seq.stopToken++;
    bgm.setStage(stage);
    if (!seq.playing) {
      seq.playing = true;
      seq.step = 0;
      seq.next = ctx.currentTime + 0.08;
      seq.timer = setInterval(schedule, 25);
    }
    bgmGain.gain.cancelScheduledValues(ctx.currentTime);
    bgmGain.gain.setTargetAtTime(0.55, ctx.currentTime, 0.3);
    bgm.filter(5200, 0.2);
  },
  stop(fade = 0.8) {
    if (!ctx || !seq.playing) return;
    const token = ++seq.stopToken;
    bgmGain.gain.cancelScheduledValues(ctx.currentTime);
    bgmGain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
    setTimeout(() => {
      if (token !== seq.stopToken) return;
      clearInterval(seq.timer);
      seq.playing = false;
    }, fade * 1000 + 300);
  },
  duck(on) {
    if (!ctx || !seq.playing) return;
    bgmGain.gain.cancelScheduledValues(ctx.currentTime);
    bgmGain.gain.setTargetAtTime(on ? 0.12 : 0.55, ctx.currentTime, 0.12);
    bgm.filter(on ? 700 : 5200, 0.12);
  },
  filter(freq, tc = 0.3) {
    if (!ctx) return;
    bgmLP.frequency.cancelScheduledValues(ctx.currentTime);
    bgmLP.frequency.setTargetAtTime(freq, ctx.currentTime, tc);
  },
  setStage(stage) {
    seq.root = ROOTS[(stage - 1) % ROOTS.length];
    seq.intensity = Math.min(3, 1 + (stage - 1) * 0.5);
  },
};
