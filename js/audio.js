// Procedural audio (Web Audio API). No audio files.
const MUTE_KEY = 'sd_mute';
const ST = (n) => Math.pow(2, n / 12);

function loadMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (_) { return false; }
}

class AudioMgr {
  constructor() {
    this.ctx = null;
    this.muted = loadMuted();
    this.lastT = {};
    this.bgmOn = false;
    this.stage = 0;
    this.step = 0;
    this.nextT = 0;
    this.timer = null;
    this.noiseBuf = null;
    this.onMuteChange = null;
  }

  unlock() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const c = (this.ctx = new AC());
        this.master = c.createGain();
        this.master.gain.value = this.muted ? 0 : 0.8;
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 6;
        this.master.connect(comp); comp.connect(c.destination);
        this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
        this.bgmBus = c.createGain(); this.bgmBus.gain.value = 0.42; this.bgmBus.connect(this.master);
        const len = c.sampleRate;
        this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (_) { this.ctx = null; return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (_) { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
    this.onMuteChange && this.onMuteChange(m);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // ---- primitives -------------------------------------------------
  tone({ f, f2, dur = 0.15, type = 'sine', vol = 0.1, delay = 0, attack = 0.005, bus, lp }) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o;
    if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; }
    n.connect(g); g.connect(bus || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.3, vol = 0.1, delay = 0, f1 = 1200, f2 = 200, q = 1, type = 'lowpass' }) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f1, t);
    fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---- sound effects ----------------------------------------------
  sfx(name) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const minGap = { graze: 0.045, hover: 0.03 }[name];
    if (minGap) { if (now - (this.lastT[name] || 0) < minGap) return; this.lastT[name] = now; }
    const T = (o) => this.tone(o);
    switch (name) {
      case 'hover': T({ f: 880, f2: 1180, dur: 0.06, vol: 0.04, type: 'sine' }); break;
      case 'select':
        T({ f: 660, dur: 0.1, vol: 0.09, type: 'triangle' });
        T({ f: 990, dur: 0.16, vol: 0.09, type: 'triangle', delay: 0.07 }); break;
      case 'back': T({ f: 520, f2: 330, dur: 0.14, vol: 0.08, type: 'triangle' }); break;
      case 'pause': T({ f: 420, f2: 300, dur: 0.12, vol: 0.07, type: 'sine' }); break;
      case 'resume': T({ f: 300, f2: 480, dur: 0.12, vol: 0.07, type: 'sine' }); break;
      case 'start':
        [392, 523, 659, 784].forEach((f, i) => T({ f, dur: 0.22, vol: 0.07, type: 'sawtooth', delay: i * 0.07, lp: 2400 }));
        this.noise({ dur: 0.5, vol: 0.05, f1: 300, f2: 5000, type: 'bandpass', q: 0.8 }); break;
      case 'go': T({ f: 880, dur: 0.25, vol: 0.09, type: 'square', lp: 2800 }); break;
      case 'graze':
        T({ f: 2000 + Math.random() * 500, dur: 0.035, vol: 0.035, type: 'square', lp: 5000 }); break;
      case 'hit':
        this.noise({ dur: 0.45, vol: 0.32, f1: 2400, f2: 120 });
        T({ f: 180, f2: 38, dur: 0.4, vol: 0.3, type: 'sawtooth', lp: 900 }); break;
      case 'lifeLost':
        [440, 330, 247].forEach((f, i) => T({ f, dur: 0.22, vol: 0.12, type: 'triangle', delay: 0.12 + i * 0.13 })); break;
      case 'warp':
        this.noise({ dur: 0.9, vol: 0.12, f1: 200, f2: 5200, type: 'bandpass', q: 1.2 }); break;
      case 'stageClear':
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
          T({ f, dur: 0.3, vol: 0.075, type: 'square', delay: i * 0.085, lp: 3200 });
          T({ f: f / 2, dur: 0.3, vol: 0.06, type: 'triangle', delay: i * 0.085 });
        });
        [523, 659, 784, 1047].forEach((f) => T({ f, dur: 0.9, vol: 0.04, type: 'triangle', delay: 0.5 }));
        this.sfx('warp'); break;
      case 'rank':
        T({ f: 260, f2: 900, dur: 0.18, vol: 0.12, type: 'triangle' });
        T({ f: 1568, dur: 0.3, vol: 0.07, type: 'sine', delay: 0.12 });
        T({ f: 2093, dur: 0.4, vol: 0.06, type: 'sine', delay: 0.2 }); break;
      case 'count': T({ f: 1200, dur: 0.02, vol: 0.02, type: 'square', lp: 4000 }); break;
      case 'gameOver':
        [392, 349, 311, 262, 196].forEach((f, i) => T({ f, dur: 0.5, vol: 0.1, type: 'sawtooth', delay: i * 0.3, lp: 1100 }));
        this.noise({ dur: 1.2, vol: 0.08, f1: 1500, f2: 80 }); break;
      case 'newRecord':
        [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => {
          T({ f, dur: 0.28, vol: 0.07, type: 'triangle', delay: i * 0.08 });
          T({ f: f * 2, dur: 0.2, vol: 0.025, type: 'sine', delay: i * 0.08 });
        }); break;
    }
  }

  // ---- BGM --------------------------------------------------------
  // stage 0 = title/menu
  startBgm(stage = 0) {
    if (!this.ctx) return;
    this.stage = stage;
    if (this.bgmOn) return;
    this.bgmOn = true;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 60);
  }
  stopBgm() {
    this.bgmOn = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  setStage(stage) { this.stage = stage; }
  duck(v) {
    if (this.ctx) this.bgmBus.gain.setTargetAtTime(v ? 0.12 : 0.42, this.ctx.currentTime, 0.1);
  }

  tick() {
    const c = this.ctx;
    if (!c || !this.bgmOn) return;
    if (this.nextT < c.currentTime - 0.5) this.nextT = c.currentTime + 0.05;
    const stepDur = this.stage === 0 ? 0.34 : Math.max(0.17, 0.27 - Math.min(this.stage, 10) * 0.009);
    while (this.nextT < c.currentTime + 0.3) {
      this.playStep(this.step, this.nextT - c.currentTime, stepDur);
      this.nextT += stepDur;
      this.step++;
    }
  }

  playStep(i, delay, stepDur) {
    const KEYS = [0, 2, -2, 3, -4, 1, 5, -1];
    const key = this.stage === 0 ? 0 : KEYS[(this.stage - 1) % 8];
    const chords = [[0, [0, 3, 7, 12]], [-4, [0, 4, 7, 12]], [3, [0, 4, 7, 12]], [-2, [0, 4, 7, 12]]];
    const [root, iv] = chords[((i / 8) | 0) % 4];
    const s8 = i % 8;
    const base = 220 * ST(key + root);
    const bus = this.bgmBus;
    const quiet = this.stage === 0 ? 0.6 : 1;
    if (s8 === 0) {
      const d = stepDur * 8;
      this.tone({ f: base / 2, dur: d, vol: 0.05 * quiet, type: 'sine', delay, attack: 0.4, bus });
      this.tone({ f: base * ST(iv[2]), dur: d, vol: 0.022 * quiet, type: 'sine', delay, attack: 0.6, bus });
      this.tone({ f: base * ST(iv[1]) * 2, dur: d, vol: 0.012 * quiet, type: 'sine', delay, attack: 0.8, bus });
    }
    if (s8 === 4) this.tone({ f: base / 2, dur: stepDur * 2, vol: 0.03 * quiet, type: 'sine', delay, bus });
    const pat = [0, 1, 2, 3, 2, 1, 2, 1];
    const f = base * 2 * ST(iv[pat[s8]]);
    this.tone({ f, dur: stepDur * 2.4, vol: 0.036 * quiet, type: 'triangle', delay, bus, lp: 2200 });
    if (this.stage > 0 && s8 % 2 === 1) this.tone({ f: f * 2, dur: stepDur, vol: 0.012, type: 'sine', delay: delay + stepDur * 0.5, bus });
  }
}

export const audio = new AudioMgr();
