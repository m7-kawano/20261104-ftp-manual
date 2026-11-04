// キーボード（十字キー / WASD）・マウス・タッチの入力管理
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'slow', ShiftRight: 'slow',
};

export class Input {
  constructor(canvas) {
    this.held = new Set();
    this.mouse = null;          // カーソル位置（マウス操作時）
    this.mouseActive = false;   // 直近の操作がマウスか
    this.touchId = null;        // ドラッグ中のタッチ
    this.touchLast = null;
    this.touchDX = 0;
    this.touchDY = 0;
    this.capture = false;       // プレイ中は矢印キーのスクロールを抑止

    window.addEventListener('keydown', e => {
      const k = KEYMAP[e.code];
      if (!k) return;
      this.held.add(k);
      if (k !== 'slow') this.mouseActive = false;
      if (this.capture && e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      const k = KEYMAP[e.code];
      if (k) this.held.delete(k);
    });
    window.addEventListener('blur', () => this.held.clear());

    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') {
        this.mouse = { x: e.clientX, y: e.clientY };
        this.mouseActive = true;
        return;
      }
      this.touchId = e.pointerId;
      this.touchLast = { x: e.clientX, y: e.clientY };
      this.mouseActive = false;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') {
        this.mouse = { x: e.clientX, y: e.clientY };
        this.mouseActive = true;
        return;
      }
      if (e.pointerId !== this.touchId || !this.touchLast) return;
      this.touchDX += e.clientX - this.touchLast.x;
      this.touchDY += e.clientY - this.touchLast.y;
      this.touchLast = { x: e.clientX, y: e.clientY };
    });
    const end = e => {
      if (e.pointerId === this.touchId) {
        this.touchId = null;
        this.touchLast = null;
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  axis() {
    let x = 0, y = 0;
    if (this.held.has('left')) x--;
    if (this.held.has('right')) x++;
    if (this.held.has('up')) y--;
    if (this.held.has('down')) y++;
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y, slow: this.held.has('slow') };
  }

  takeTouch() {
    const d = { x: this.touchDX, y: this.touchDY };
    this.touchDX = 0;
    this.touchDY = 0;
    return d;
  }

  get touching() { return this.touchId !== null; }
}
