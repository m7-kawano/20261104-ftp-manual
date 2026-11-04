// 背景の星空（プレイ中は十分に薄く描画される）
const TAU = Math.PI * 2;

export class Starfield {
  constructor(count = 220) {
    this.stars = [];
    for (let i = 0; i < count; i++) this.stars.push(this.make(true));
  }

  make(anywhere) {
    return {
      x: Math.random(),
      y: anywhere ? Math.random() : -0.03,
      z: Math.random(),
      tw: Math.random() * TAU,
    };
  }

  update(dt, speed) {
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.y += dt * (0.006 + s.z * 0.04) * speed;
      if (s.y > 1.05) this.stars[i] = this.make(false);
    }
  }

  draw(ctx, W, H, alpha, warp, t) {
    if (alpha <= 0.002) return;
    ctx.save();
    ctx.fillStyle = '#dfe6ff';
    ctx.strokeStyle = '#dfe6ff';
    ctx.lineCap = 'round';
    for (const s of this.stars) {
      const a = alpha * (0.25 + 0.75 * s.z) * (0.7 + 0.3 * Math.sin(t * 1.7 + s.tw));
      const x = s.x * W, y = s.y * H;
      const size = 0.5 + s.z * 1.5;
      ctx.globalAlpha = Math.min(1, a);
      if (warp > 0.04) {
        const len = warp * H * 0.12 * (0.2 + s.z);
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - len);
        ctx.stroke();
      } else {
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
    ctx.restore();
  }
}
