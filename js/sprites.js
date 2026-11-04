import { BULLET_DEFS } from './config.js';

const PI2 = Math.PI * 2;
const cache = new Map();
const dotCache = new Map();
let curScale = 1;

export function setSpriteScale(s) {
  if (Math.abs(s - curScale) > 0.001) { cache.clear(); dotCache.clear(); curScale = s; }
}

function shapePath(c, shape, r, k) {
  c.beginPath();
  switch (shape) {
    case 'orb': c.arc(0, 0, r * k, 0, PI2); break;
    case 'rice': c.ellipse(0, 0, r * k, Math.max(r * k * 0.5, 0.8), 0, 0, PI2); break;
    case 'needle': c.ellipse(0, 0, r * k, Math.max(r * k * 0.22, 0.8), 0, 0, PI2); break;
    case 'diamond': {
      const a = r * k, b = Math.max(r * k * 0.62, 0.8);
      c.moveTo(a, 0); c.lineTo(0, b); c.lineTo(-a, 0); c.lineTo(0, -b); c.closePath();
      break;
    }
    case 'star':
      for (let i = 0; i < 8; i++) {
        const rr = (i % 2 ? 0.42 : 1) * r * k, an = i * Math.PI / 4;
        const x = Math.cos(an) * rr, y = Math.sin(an) * rr;
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.closePath();
      break;
  }
}

// returns { c, size (logical units) }
export function getSprite(type, hue) {
  const key = type * 1000 + hue;
  let s = cache.get(key);
  if (s) return s;
  const def = BULLET_DEFS[type];
  const pad = 7;
  const half = def.r + pad;
  const px = Math.ceil(half * 2 * curScale);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const k = px / (half * 2);
  const g = c.getContext('2d');
  g.scale(k, k);
  g.translate(half, half);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, half);
  grad.addColorStop(0, `hsla(${hue},100%,62%,0.55)`);
  grad.addColorStop(def.r / half, `hsla(${hue},100%,55%,0.34)`);
  grad.addColorStop(1, `hsla(${hue},100%,50%,0)`);
  g.fillStyle = grad;
  g.beginPath(); g.arc(0, 0, half, 0, PI2); g.fill();
  // outline layer
  shapePath(g, def.shape, def.r, 1);
  g.fillStyle = `hsl(${hue},100%,52%)`;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = `hsl(${hue},100%,38%)`;
  g.stroke();
  shapePath(g, def.shape, def.r, 0.78);
  g.fillStyle = `hsl(${hue},100%,74%)`;
  g.fill();
  shapePath(g, def.shape, def.r, 0.46);
  g.fillStyle = '#fff';
  g.fill();
  s = { c, size: half * 2, half };
  cache.set(key, s);
  return s;
}

// soft round dot (hue -1 = white). size in logical units = 24
export function getDot(hue) {
  let s = dotCache.get(hue);
  if (s) return s;
  const size = 24;
  const px = Math.ceil(size * curScale);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  g.scale(px / size, px / size);
  const gr = g.createRadialGradient(12, 12, 0, 12, 12, 12);
  const col = hue < 0 ? '255,255,255' : null;
  if (col) {
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    gr.addColorStop(0, 'hsla(0,0%,100%,1)');
    gr.addColorStop(0.2, `hsla(${hue},100%,80%,0.9)`);
    gr.addColorStop(0.55, `hsla(${hue},100%,60%,0.35)`);
    gr.addColorStop(1, `hsla(${hue},100%,55%,0)`);
  }
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  s = { c, size };
  dotCache.set(hue, s);
  return s;
}
