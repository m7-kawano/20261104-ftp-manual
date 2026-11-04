import { W, H, PLAYER } from './config.js';

const KEYMAP = {
  ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r',
  ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
};

export const input = {
  down: { l: false, r: false, u: false, d: false },
  shift: false,
  touchFocus: false,
  mouse: { x: W / 2, y: H * 0.8, active: false },
  touch: { id: null, lx: 0, ly: 0, px: 0, py: 0 },
  cssPerUnit: 1,        // css pixels per logical unit
  onPause: null,
  onMute: null,

  get focus() { return this.shift || this.touchFocus; },

  axis() {
    const d = this.down;
    let x = (d.r ? 1 : 0) - (d.l ? 1 : 0);
    let y = (d.d ? 1 : 0) - (d.u ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  },

  reset() {
    for (const k in this.down) this.down[k] = false;
    this.shift = false;
    this.touch.id = null; this.touch.px = 0; this.touch.py = 0;
    this.mouse.active = false;
  },

  attach(canvas) {
    const self = this;
    window.addEventListener('keydown', (e) => {
      if (e.code in KEYMAP) {
        self.down[KEYMAP[e.code]] = true;
        self.mouse.active = false;
        if (e.target === document.body || e.target === canvas) e.preventDefault();
      } else if (e.key === 'Shift') {
        self.shift = true;
      } else if (!e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) {
        self.onPause && self.onPause();
      } else if (!e.repeat && e.code === 'KeyM') {
        self.onMute && self.onMute();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code in KEYMAP) self.down[KEYMAP[e.code]] = false;
      else if (e.key === 'Shift') self.shift = false;
    });
    window.addEventListener('blur', () => self.reset());

    const toLogical = (e) => {
      const r = canvas.getBoundingClientRect();
      self.mouse.x = ((e.clientX - r.left) / r.width) * W;
      self.mouse.y = ((e.clientY - r.top) / r.height) * H;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') { toLogical(e); self.mouse.active = true; return; }
      if (self.touch.id === null) {
        self.touch.id = e.pointerId;
        self.touch.lx = e.clientX; self.touch.ly = e.clientY;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { toLogical(e); self.mouse.active = true; return; }
      if (e.pointerId !== self.touch.id) return;
      const k = (self.touchFocus ? 0.45 : 1) * PLAYER.touchSens / self.cssPerUnit;
      self.touch.px += (e.clientX - self.touch.lx) * k;
      self.touch.py += (e.clientY - self.touch.ly) * k;
      self.touch.lx = e.clientX; self.touch.ly = e.clientY;
      e.preventDefault();
    });
    const end = (e) => {
      if (e.pointerId === self.touch.id) { self.touch.id = null; }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') self.mouse.active = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // block pinch zoom / scroll gestures on iOS
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });
  },
};
