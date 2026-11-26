import { Board } from '../game/board';
import { COLS, ROWS, EMPTY, GARBAGE, NORI, idx, isUp, rowOf, colOf, neighbors, isFlavor } from '../game/core';
import { getSprite, SQ3, styleOf, triVerts, centroidY, insetVerts } from './sprites';
import { CLEAR_TIME } from '../game/board';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  rice: boolean;
}

interface Popup {
  text: string;
  sub?: string;
  x: number;
  y: number;
  t: number;
  max: number;
  color: string;
  size: number;
}

/** 1人分の盤面描画とエフェクト */
export class BoardView {
  x = 0;
  y = 0;
  w = 40; // 三角形の一辺
  particles: Particle[] = [];
  popups: Popup[] = [];
  shake = 0;
  flash = 0;
  showGhost = true;
  showFaces = true;

  constructor(public board: Board) {}

  get cellH() {
    return this.w * SQ3;
  }
  get width() {
    return ((COLS + 1) / 2) * this.w;
  }
  get height() {
    return ROWS * this.cellH;
  }

  layout(x: number, y: number, w: number) {
    this.x = x;
    this.y = y;
    this.w = w;
  }

  /** セル重心（盤内ローカル座標） */
  centroid(r: number, c: number) {
    const up = isUp(r, c);
    return { x: (c * this.w) / 2 + this.w / 2, y: r * this.cellH + centroidY(up, this.w) };
  }

  // ---------- エフェクト ----------
  burst(cells: number[], grid: Int8Array, strong: boolean) {
    for (const i of cells) {
      const v = grid[i];
      const p = this.centroid(rowOf(i), colOf(i));
      const st = styleOf(v === EMPTY ? GARBAGE : v);
      const n = strong ? 10 : 6;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.6 + Math.random() * 1.6) * this.w * (strong ? 4.5 : 3.2);
        const rice = k % 2 === 0;
        this.particles.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - this.w * 2,
          life: 0,
          max: 0.5 + Math.random() * 0.4,
          color: rice ? '#fffdf5' : st.base,
          size: this.w * (rice ? 0.07 : 0.09) * (0.7 + Math.random() * 0.6),
          rice,
        });
      }
    }
  }

  popup(text: string, r: number, c: number, color: string, size = 1, sub?: string) {
    const p = this.centroid(r, c);
    const y = Math.min(Math.max(p.y, this.cellH * 2), this.height - this.cellH * 1.4);
    this.popups.push({ text, sub, x: Math.min(Math.max(p.x, this.width * 0.28), this.width * 0.72), y, t: 0, max: 1.1, color, size });
  }

  update(dt: number) {
    for (const p of this.particles) {
      p.life += dt;
      p.vy += this.w * 14 * dt;
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < p.max);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 3);
  }

  // ---------- 描画 ----------
  draw(ctx: CanvasRenderingContext2D, dpr: number, time: number) {
    const b = this.board;
    const w = this.w;
    const h = this.cellH;
    ctx.save();
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * w * 0.5 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * w * 0.5 : 0;
    ctx.translate(this.x + sx, this.y + sy);

    // 背景（三角のマス目）
    this.drawBackground(ctx, time);

    ctx.save();
    ctx.beginPath();
    ctx.rect(-w, 0, this.width + w * 2, this.height);
    ctx.clip();

    // アニメ中のセルは通常描画から外す
    const hidden = new Set<number>();
    for (const a of b.anims) if (a.t < a.dur) hidden.add(idx(a.to, a.c));
    const clearSet = b.clearing ? new Set([...b.clearing.cells, ...b.clearing.garbage]) : null;
    const nigiriSet = b.clearing ? new Set(b.clearing.nigiriCenters) : null;

    // ゴースト
    if (this.showGhost && b.active && b.phase === 'fall') {
      for (const g of b.ghost()) {
        this.drawSprite(ctx, dpr, g.v, isUp(g.r, g.c), g.r, g.c, 1, 1, 'ghost');
      }
    }

    // 盤面
    for (let i = 0; i < b.grid.length; i++) {
      const v = b.grid[i];
      if (v === EMPTY || hidden.has(i)) continue;
      const r = rowOf(i);
      const c = colOf(i);
      let scale = 1;
      let sy2 = 1;
      let variant: 'normal' | 'flash' = 'normal';
      let alpha = 1;
      if (clearSet && clearSet.has(i)) {
        const t = b.clearT / CLEAR_TIME;
        if (t < 0.45) {
          variant = Math.floor(t * 18) % 2 === 0 ? 'flash' : 'normal';
          scale = 1 + Math.sin(t * Math.PI * 4) * 0.06;
          if (nigiriSet!.size) scale *= 1.08;
        } else {
          const k = (t - 0.45) / 0.55;
          scale = 1 + k * 0.5;
          alpha = 1 - k;
        }
      }
      const bt = b.bounce.get(i);
      if (bt !== undefined) {
        const k = bt / 0.18;
        sy2 = 1 - Math.sin(k * Math.PI) * 0.18;
        scale *= 1 + Math.sin(k * Math.PI) * 0.06;
      }
      // 待機中のゆらゆら
      if (v !== GARBAGE && !clearSet) {
        const wob = Math.sin(time * 2.2 + i * 0.7) * 0.015;
        scale *= 1 + wob;
      }
      ctx.globalAlpha = alpha;
      this.drawSprite(ctx, dpr, v, isUp(r, c), r, c, scale, sy2 / 1, variant);
      ctx.globalAlpha = 1;
    }

    // つながりの橋（同じ具の隣同士）
    for (let i = 0; i < b.grid.length; i++) {
      const v = b.grid[i];
      if (!isFlavor(v) || hidden.has(i)) continue;
      if (clearSet && clearSet.has(i) && b.clearT > CLEAR_TIME * 0.45) continue;
      const r = rowOf(i);
      const c = colOf(i);
      for (const n of neighbors(r, c)) {
        if (n < i || b.grid[n] !== v || hidden.has(n)) continue;
        this.drawBridge(ctx, r, c, rowOf(n), colOf(n), v);
      }
    }

    // 落下中（ちぎり・おじゃま）
    for (const a of b.anims) {
      if (a.t >= a.dur) continue;
      const t = Math.min(1, a.t / a.dur);
      const e = t * t;
      const rr = a.from + (a.to - a.from) * e;
      this.drawFalling(ctx, dpr, a.v, a.from, a.to, a.c, rr, e);
    }

    // 操作中のペア
    if (b.active && b.phase === 'fall') {
      const cells = b.activeCells();
      const ft = b.flipT;
      if (cells.length === 2 && cells[0].v === cells[1].v) {
        this.drawBridge(ctx, cells[0].r, cells[0].c, cells[1].r, cells[1].c, cells[0].v);
      }
      for (const cell of cells) {
        const up = isUp(cell.r, cell.c);
        if (ft < 1) {
          const s = ft < 0.5 ? 1 - ft * 2 : ft * 2 - 1;
          const orient = ft < 0.5 ? !up : up;
          this.drawSpriteAt(ctx, dpr, cell.v, orient, this.centroid(cell.r, cell.c), 1, Math.max(0.45, s));
        } else {
          const pulse = cell.v === NORI ? 1 + Math.sin(time * 10) * 0.06 : 1;
          this.drawSprite(ctx, dpr, cell.v, up, cell.r, cell.c, pulse, 1, 'normal');
        }
      }
    }

    // 粒子
    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      if (p.rice) ctx.ellipse(p.x, p.y, p.size * 1.4, p.size, p.life * 8, 0, Math.PI * 2);
      else ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // フラッシュ
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // ポップアップ文字
    for (const p of this.popups) {
      const k = p.t / p.max;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : k < 0.25 ? 1.15 - ((k - 0.15) / 0.1) * 0.15 : 1;
      const fs = w * 0.62 * p.size * pop;
      ctx.save();
      ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      ctx.translate(p.x, p.y - k * h * 1.2);
      ctx.font = `900 ${fs}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = fs * 0.22;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      if (p.sub) {
        ctx.font = `800 ${fs * 0.5}px "M PLUS Rounded 1c", sans-serif`;
        ctx.lineWidth = fs * 0.14;
        ctx.strokeText(p.sub, 0, fs * 0.75);
        ctx.fillStyle = '#5a3a2a';
        ctx.fillText(p.sub, 0, fs * 0.75);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  private drawBackground(ctx: CanvasRenderingContext2D, time: number) {
    const w = this.w;
    const h = this.cellH;
    const danger = this.board.danger();
    ctx.save();
    const rr = w * 0.3;
    ctx.beginPath();
    ctx.roundRect(-w * 0.2, -w * 0.2, this.width + w * 0.4, this.height + w * 0.4, rr);
    ctx.fillStyle = '#fff6ea';
    ctx.fill();
    ctx.lineWidth = Math.max(2, w * 0.08);
    ctx.strokeStyle = danger > 0 ? `rgba(239,59,85,${0.4 + 0.4 * Math.abs(Math.sin(time * 6))})` : '#f0c9a8';
    ctx.stroke();
    ctx.restore();
    ctx.save();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const up = isUp(r, c);
        const vs = insetVerts(triVerts(up, w), w * 0.05);
        ctx.beginPath();
        ctx.moveTo((c * w) / 2 + vs[0][0], r * h + vs[0][1]);
        ctx.lineTo((c * w) / 2 + vs[1][0], r * h + vs[1][1]);
        ctx.lineTo((c * w) / 2 + vs[2][0], r * h + vs[2][1]);
        ctx.closePath();
        ctx.fillStyle = up ? '#ffeedd' : '#fde6d2';
        ctx.fill();
      }
    }
    // 出現位置の目印
    if (danger > 0) {
      ctx.fillStyle = `rgba(239,59,85,${0.12 + danger * 0.18})`;
      ctx.fillRect((4 * w) / 2, 0, 2 * w, h * 2);
    }
    ctx.restore();
  }

  private drawSprite(
    ctx: CanvasRenderingContext2D,
    dpr: number,
    v: number,
    up: boolean,
    r: number,
    c: number,
    scale: number,
    sy: number,
    variant: 'normal' | 'flash' | 'ghost',
  ) {
    this.drawSpriteAt(ctx, dpr, v, up, this.centroid(r, c), scale, sy, variant);
  }

  drawSpriteAt(
    ctx: CanvasRenderingContext2D,
    dpr: number,
    v: number,
    up: boolean,
    p: { x: number; y: number },
    scale: number,
    sy: number,
    variant: 'normal' | 'flash' | 'ghost' = 'normal',
  ) {
    const sp = getSprite(v, up, this.w, dpr, variant);
    const cy = centroidY(up, this.w);
    const cw = sp.canvas.width / dpr;
    const ch = sp.canvas.height / dpr;
    if (scale === 1 && sy === 1) {
      ctx.drawImage(sp.canvas, p.x - this.w / 2 - sp.pad, p.y - cy - sp.pad, cw, ch);
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale * sy);
    ctx.drawImage(sp.canvas, -this.w / 2 - sp.pad, -cy - sp.pad, cw, ch);
    ctx.restore();
  }

  private drawFalling(ctx: CanvasRenderingContext2D, dpr: number, v: number, from: number, to: number, c: number, rr: number, e: number) {
    const upTo = isUp(to, c);
    const flips = Math.abs(Math.round(to - from)) % 2 === 1;
    const pTo = this.centroid(to, c);
    const pFrom = { x: pTo.x, y: rr * this.cellH + centroidY(upTo, this.w) };
    let orient = upTo;
    let s = 1;
    if (flips) {
      s = e < 0.5 ? 1 - e * 2 : e * 2 - 1;
      orient = e < 0.5 ? !upTo : upTo;
    }
    const y = pFrom.y + (flips && orient !== upTo ? (centroidY(orient, this.w) - centroidY(upTo, this.w)) : 0);
    this.drawSpriteAt(ctx, dpr, v, orient, { x: pTo.x, y }, 1, Math.max(0.3, s));
  }

  /** 同じ具どうしが辺で接している時、すき間を埋めてつながって見せる */
  private drawBridge(ctx: CanvasRenderingContext2D, r1: number, c1: number, r2: number, c2: number, v: number) {
    const w = this.w;
    const h = this.cellH;
    const st = styleOf(v);
    const v1 = triVerts(isUp(r1, c1), w).map(([x, y]) => [x + (c1 * w) / 2, y + r1 * h]);
    const v2 = triVerts(isUp(r2, c2), w).map(([x, y]) => [x + (c2 * w) / 2, y + r2 * h]);
    // 共有辺の2頂点
    const shared = v1.filter((a) => v2.some((b) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5));
    if (shared.length !== 2) return;
    const c1p = this.centroid(r1, c1);
    const c2p = this.centroid(r2, c2);
    const [p, q] = shared;
    // 辺の両端を少し内側へ（角の丸みに合わせる）
    const shrink = 0.26;
    const pm = [p[0] + (q[0] - p[0]) * shrink, p[1] + (q[1] - p[1]) * shrink];
    const qm = [q[0] + (p[0] - q[0]) * shrink, q[1] + (p[1] - q[1]) * shrink];
    const toward = (pt: number[], c: { x: number; y: number }, k: number) => [pt[0] + (c.x - pt[0]) * k, pt[1] + (c.y - pt[1]) * k];
    const k = 0.32;
    const a1 = toward(pm, c1p, k);
    const b1 = toward(qm, c1p, k);
    const a2 = toward(pm, c2p, k);
    const b2 = toward(qm, c2p, k);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a1[0], a1[1]);
    ctx.lineTo(b1[0], b1[1]);
    ctx.lineTo(b2[0], b2[1]);
    ctx.lineTo(a2[0], a2[1]);
    ctx.closePath();
    if (r1 === r2) {
      const grad = ctx.createLinearGradient(0, r1 * h, 0, r1 * h + h);
      grad.addColorStop(0, st.light);
      grad.addColorStop(0.55, st.base);
      grad.addColorStop(1, st.base);
      ctx.fillStyle = grad;
    } else ctx.fillStyle = st.base;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, w * 0.055);
    ctx.strokeStyle = st.dark;
    ctx.lineCap = 'round';
    if (r1 !== r2) {
      // 上下でつながった時はのりを1枚でつなぐ
      const ex = (p[0] + q[0]) / 2;
      const ey = p[1];
      const nw = w * 0.28;
      const nh = h * 0.16;
      ctx.fillStyle = '#20382a';
      ctx.beginPath();
      ctx.roundRect(ex - nw / 2, ey - nh, nw, nh * 2, w * 0.04);
      ctx.fill();
    }
    ctx.beginPath();
    // 外側の縁だけ線を引く（すき間部分）
    const g1 = toward(pm, c1p, 0.08);
    const g2 = toward(pm, c2p, 0.08);
    const h1 = toward(qm, c1p, 0.08);
    const h2 = toward(qm, c2p, 0.08);
    ctx.moveTo(g1[0], g1[1]);
    ctx.lineTo(g2[0], g2[1]);
    ctx.moveTo(h1[0], h1[1]);
    ctx.lineTo(h2[0], h2[1]);
    ctx.stroke();
    ctx.restore();
  }
}
