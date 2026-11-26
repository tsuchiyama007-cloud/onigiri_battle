import { GARBAGE, NORI } from '../game/core';

export interface FlavorStyle {
  name: string;
  base: string;
  light: string;
  dark: string;
}

// 色相を大きく離し、さらに表情も具ごとに変えて「色だけに頼らない」見分けやすさに。
export const FLAVORS: FlavorStyle[] = [
  { name: '梅', base: '#ef3b55', light: '#ff8a9a', dark: '#8f1428' },
  { name: '鮭', base: '#ff8a1f', light: '#ffc07a', dark: '#9a4300' },
  { name: 'たくあん', base: '#ffd21a', light: '#fff09a', dark: '#946f00' },
  { name: '高菜', base: '#3cc35a', light: '#9cf0a8', dark: '#156b2a' },
  { name: 'ゆかり', base: '#9b5cf0', light: '#d3b3ff', dark: '#4b1f8f' },
];
export const GARBAGE_STYLE: FlavorStyle = { name: 'こげ', base: '#7a6658', light: '#a3907f', dark: '#3a2c23' };
export const NORI_STYLE: FlavorStyle = { name: 'のり', base: '#1f3a2c', light: '#3e6b52', dark: '#0b1610' };

export function styleOf(v: number): FlavorStyle {
  if (v === GARBAGE) return GARBAGE_STYLE;
  if (v === NORI) return NORI_STYLE;
  return FLAVORS[v];
}

export const SQ3 = Math.sqrt(3) / 2;

/** 三角形の頂点（左上原点、幅 w） */
export function triVerts(up: boolean, w: number): [number, number][] {
  const h = w * SQ3;
  return up
    ? [
        [w / 2, 0],
        [w, h],
        [0, h],
      ]
    : [
        [0, 0],
        [w, 0],
        [w / 2, h],
      ];
}

export function centroidY(up: boolean, w: number) {
  const h = w * SQ3;
  return up ? (h * 2) / 3 : h / 3;
}

export function insetVerts(vs: [number, number][], gap: number): [number, number][] {
  const cx = (vs[0][0] + vs[1][0] + vs[2][0]) / 3;
  const cy = (vs[0][1] + vs[1][1] + vs[2][1]) / 3;
  return vs.map(([x, y]) => {
    const dx = cx - x;
    const dy = cy - y;
    const d = Math.hypot(dx, dy);
    // 頂点→重心方向に gap*2 動かすと各辺がおよそ gap 内側へ
    const k = (gap * 2) / d;
    return [x + dx * k, y + dy * k] as [number, number];
  });
}

export function roundedTriPath(ctx: CanvasRenderingContext2D | Path2D, vs: [number, number][], radius: number) {
  const n = vs.length;
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(vs[n - 1], vs[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const v = vs[i];
    const nx = vs[(i + 1) % n];
    const m = mid(v, nx);
    ctx.arcTo(v[0], v[1], m[0], m[1], radius);
  }
  ctx.closePath();
}

// ---------- 表情 ----------
function face(ctx: CanvasRenderingContext2D, v: number, cx: number, cy: number, s: number, up: boolean) {
  const ink = '#3a2418';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.2, s * 0.16);
  const ey = cy - s * 0.15 + (up ? s * 0.12 : -s * 0.05);
  const ex = s * 0.42;
  const my = ey + s * 0.45;
  const dot = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // ほっぺ
  if (v !== GARBAGE) {
    ctx.save();
    ctx.fillStyle = v === NORI ? 'rgba(255,170,200,0.55)' : 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.72, my - s * 0.05, s * 0.2, s * 0.13, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + s * 0.72, my - s * 0.05, s * 0.2, s * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  switch (v) {
    case 0: // 梅: すっぱい ><
      ctx.beginPath();
      ctx.moveTo(cx - ex - s * 0.16, ey - s * 0.14);
      ctx.lineTo(cx - ex + s * 0.12, ey);
      ctx.lineTo(cx - ex - s * 0.16, ey + s * 0.14);
      ctx.moveTo(cx + ex + s * 0.16, ey - s * 0.14);
      ctx.lineTo(cx + ex - s * 0.12, ey);
      ctx.lineTo(cx + ex + s * 0.16, ey + s * 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, my, s * 0.12, s * 0.15, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 1: // 鮭: にっこり ^^
      ctx.beginPath();
      ctx.arc(cx - ex, ey + s * 0.06, s * 0.16, Math.PI * 1.1, Math.PI * 1.9);
      ctx.moveTo(cx + ex + s * 0.15, ey);
      ctx.arc(cx + ex, ey + s * 0.06, s * 0.16, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, my - s * 0.08, s * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.fill();
      break;
    case 2: // たくあん: まんまる目 + にかっ
      dot(cx - ex, ey, s * 0.13);
      dot(cx + ex, ey, s * 0.13);
      ctx.save();
      ctx.fillStyle = '#fff';
      dot(cx - ex + s * 0.04, ey - s * 0.05, s * 0.04);
      dot(cx + ex + s * 0.04, ey - s * 0.05, s * 0.04);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.26, my - s * 0.08);
      ctx.quadraticCurveTo(cx, my + s * 0.28, cx + s * 0.26, my - s * 0.08);
      ctx.closePath();
      ctx.fill();
      break;
    case 3: // 高菜: キリッ
      ctx.beginPath();
      ctx.moveTo(cx - ex - s * 0.18, ey - s * 0.24);
      ctx.lineTo(cx - ex + s * 0.14, ey - s * 0.12);
      ctx.moveTo(cx + ex + s * 0.18, ey - s * 0.24);
      ctx.lineTo(cx + ex - s * 0.14, ey - s * 0.12);
      ctx.stroke();
      dot(cx - ex, ey + s * 0.04, s * 0.1);
      dot(cx + ex, ey + s * 0.04, s * 0.1);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.16, my);
      ctx.lineTo(cx + s * 0.16, my);
      ctx.stroke();
      break;
    case 4: // ゆかり: ねむねむ ω
      ctx.beginPath();
      ctx.moveTo(cx - ex - s * 0.15, ey + s * 0.02);
      ctx.lineTo(cx - ex + s * 0.15, ey + s * 0.02);
      ctx.moveTo(cx + ex - s * 0.15, ey + s * 0.02);
      ctx.lineTo(cx + ex + s * 0.15, ey + s * 0.02);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - s * 0.1, my - s * 0.04, s * 0.1, 0, Math.PI);
      ctx.arc(cx + s * 0.1, my - s * 0.04, s * 0.1, 0, Math.PI);
      ctx.stroke();
      break;
    case NORI: {
      ctx.fillStyle = '#fff';
      dot(cx - ex, ey, s * 0.13);
      dot(cx + ex, ey, s * 0.13);
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, my - s * 0.1, s * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      break;
    }
    case GARBAGE: {
      ctx.strokeStyle = 'rgba(30,18,10,0.75)';
      ctx.beginPath();
      const k = s * 0.12;
      for (const sx of [-1, 1]) {
        ctx.moveTo(cx + sx * ex - k, ey - k);
        ctx.lineTo(cx + sx * ex + k, ey + k);
        ctx.moveTo(cx + sx * ex + k, ey - k);
        ctx.lineTo(cx + sx * ex - k, ey + k);
      }
      ctx.moveTo(cx - s * 0.2, my + s * 0.05);
      ctx.quadraticCurveTo(cx, my - s * 0.12, cx + s * 0.2, my + s * 0.05);
      ctx.stroke();
      break;
    }
  }
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  pad: number;
}

const cache = new Map<string, Sprite>();

/** 1つのおにぎり三角をオフスクリーンに描いてキャッシュ */
export function getSprite(v: number, up: boolean, w: number, dpr: number, variant: 'normal' | 'flash' | 'ghost' = 'normal'): Sprite {
  const key = `${v}|${up}|${w.toFixed(1)}|${dpr}|${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 400) cache.clear();
  const pad = Math.ceil(w * 0.06) + 2;
  const h = w * SQ3;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil((w + pad * 2) * dpr);
  cv.height = Math.ceil((h + pad * 2) * dpr);
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(pad, pad);
  const st = styleOf(v);
  const gap = Math.max(1, w * 0.035);
  const vs = insetVerts(triVerts(up, w), gap);
  const radius = w * 0.14;
  const path = new Path2D();
  roundedTriPath(path, vs, radius);
  const lw = Math.max(1.5, w * 0.055);

  if (variant === 'ghost') {
    ctx.setLineDash([w * 0.08, w * 0.06]);
    ctx.lineWidth = lw * 0.8;
    ctx.strokeStyle = st.base;
    ctx.globalAlpha = 0.85;
    ctx.stroke(path);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = st.base;
    ctx.fill(path);
    const c = { x: w / 2, y: centroidY(up, w) };
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, w * 0.06, 0, Math.PI * 2);
    ctx.fill();
    cache.set(key, { canvas: cv, pad });
    return { canvas: cv, pad };
  }

  // 影
  ctx.save();
  ctx.translate(0, w * 0.03);
  ctx.fillStyle = 'rgba(60,30,20,0.18)';
  ctx.fill(path);
  ctx.restore();

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, st.light);
  grad.addColorStop(0.55, st.base);
  grad.addColorStop(1, st.base);
  ctx.fillStyle = grad;
  ctx.fill(path);

  // ごはん粒（こげ・のり以外は白い粒、こげは黒い粒）
  ctx.save();
  ctx.clip(path);
  let seed = v * 97 + (up ? 13 : 7);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = v === GARBAGE ? 'rgba(30,15,5,0.35)' : v === NORI ? 'rgba(120,200,150,0.25)' : 'rgba(255,255,255,0.38)';
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.035, w * 0.022, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // つや
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  const cy0 = centroidY(up, w);
  ctx.beginPath();
  ctx.ellipse(w * 0.38, up ? cy0 - h * 0.22 : h * 0.16, w * 0.13, w * 0.055, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = lw;
  ctx.strokeStyle = st.dark;
  ctx.lineJoin = 'round';
  ctx.stroke(path);

  // のり（おにぎりらしさ）: 底辺側に小さな帯
  if (v !== GARBAGE && v !== NORI) {
    const nw = w * 0.28;
    const nh = h * 0.14;
    const ny = up ? h - gap - lw * 0.5 - nh : gap + lw * 0.5;
    ctx.save();
    ctx.clip(path);
    ctx.beginPath();
    ctx.roundRect(w / 2 - nw / 2, ny, nw, nh, up ? [w * 0.05, w * 0.05, 0, 0] : [0, 0, w * 0.05, w * 0.05]);
    ctx.fillStyle = '#20382a';
    ctx.fill();
    ctx.fillStyle = 'rgba(140,200,160,0.35)';
    ctx.fillRect(w / 2 - nw / 2 + nw * 0.15, ny + nh * 0.25, nw * 0.12, nh * 0.5);
    ctx.restore();
  }

  if (v === NORI) {
    // キラキラ
    ctx.fillStyle = '#fff6a8';
    const star = (x: number, y: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rr = i % 2 ? r * 0.35 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    };
    star(w * 0.5, up ? h * 0.3 : h * 0.12, w * 0.07);
  }

  face(ctx, v, w / 2, centroidY(up, w) + (up ? -h * 0.07 : h * 0.05), w * 0.18, up);

  if (variant === 'flash') {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-pad, -pad, w + pad * 2, h + pad * 2);
  }
  const sp = { canvas: cv, pad };
  cache.set(key, sp);
  return sp;
}
