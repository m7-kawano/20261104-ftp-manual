import { W, H } from './config.js';

export class Starfield {
  constructor(n = 130) {
    this.stars = [];
    for (let i = 0; i < n; i++) {
      this.stars.push({ x: Math.random() * W, y: Math.random() * H, z: 0.15 + Math.random() * 0.85, tw: Math.random() * 6.28 });
    }
    this.t = 0;
  }

  update(dt, warp) {
    this.t += dt;
    const m = 1 + warp * 34;
    for (const s of this.stars) {
      s.y += (14 + 150 * s.z) * m * dt;
      if (s.y > H + 40) { s.y = -Math.random() * 40; s.x = Math.random() * W; }
    }
  }

  // alpha: overall brightness, warp 0..1, hue for nebula, nebA nebula alpha
  draw(ctx, alpha, warp, hue, nebA) {
    // nebula
    if (nebA > 0.005) {
      const t = this.t * 0.05;
      const blobs = [
        [W * 0.3 + Math.sin(t) * 60, H * 0.28 + Math.cos(t * 0.8) * 40, 340, hue, 0.55],
        [W * 0.75 + Math.cos(t * 1.1) * 50, H * 0.62 + Math.sin(t * 0.9) * 60, 380, hue + 45, 0.42],
        [W * 0.45 + Math.sin(t * 0.7) * 70, H * 0.92, 320, hue - 35, 0.4],
      ];
      for (const [x, y, r, h, a] of blobs) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `hsla(${h},70%,45%,${a * nebA})`);
        g.addColorStop(1, `hsla(${h},70%,30%,0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }
    // stars
    const streak = warp > 0.04;
    for (const s of this.stars) {
      const tw = 0.75 + 0.25 * Math.sin(this.t * 2 + s.tw);
      const a = Math.min(1, alpha * s.z * tw);
      if (a < 0.01) continue;
      if (streak) {
        const len = (14 + 150 * s.z) * warp * 34 * 0.045;
        ctx.strokeStyle = `rgba(200,215,255,${a})`;
        ctx.lineWidth = 0.6 + s.z * 1.4;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - len); ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(205,215,255,${a})`;
        const z = 0.8 + s.z * 1.6;
        ctx.fillRect(s.x, s.y, z, z);
      }
    }
  }
}
