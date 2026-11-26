import { COLS, ROWS, EMPTY, Grid, idx, neighbors, isFlavor, resolveAll, columnHeight, NORI, rowOf, colOf, isUp } from './core';
import type { Board, Piece } from './board';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface Plan {
  c: number;
  swap: boolean;
  value: number;
}

const SETTINGS: Record<Difficulty, { think: number; step: number; noise: number; ply2: boolean; hard: boolean; patience: number }> = {
  easy: { think: 0.65, step: 0.22, noise: 35, ply2: false, hard: false, patience: 0.3 },
  normal: { think: 0.35, step: 0.11, noise: 10, ply2: false, hard: false, patience: 0.8 },
  hard: { think: 0.18, step: 0.07, noise: 2, ply2: true, hard: true, patience: 1 },
};

function place(g: Grid, piece: Piece, c: number, swap: boolean): Grid | null {
  const out = g.slice() as Grid;
  const cells =
    piece.kind === 'nori'
      ? [{ c, v: NORI }]
      : [
          { c, v: swap ? piece.b : piece.a },
          { c: c + 1, v: swap ? piece.a : piece.b },
        ];
  for (const cell of cells) {
    if (cell.c < 0 || cell.c >= COLS) return null;
    if (out[idx(0, cell.c)] !== EMPTY) return null;
    out[idx(0, cell.c)] = cell.v;
  }
  return out;
}

function reachable(g: Grid, piece: Piece, target: number): boolean {
  const width = piece.kind === 'nori' ? 1 : 2;
  const from = 5;
  const lo = Math.min(from, target);
  const hi = Math.max(from, target) + width - 1;
  for (let c = lo; c <= hi; c++) if (g[idx(0, c)] !== EMPTY || g[idx(1, c)] !== EMPTY) return false;
  return true;
}

/** 盤面の「伸びしろ」評価 */
function evaluate(g: Grid, patience: number): number {
  let v = 0;
  let maxH = 0;
  let bump = 0;
  let prevH = -1;
  for (let c = 0; c < COLS; c++) {
    const h = columnHeight(g, c);
    maxH = Math.max(maxH, h);
    if (prevH >= 0) bump += Math.abs(h - prevH);
    prevH = h;
    if (c >= 4 && c <= 7 && h > ROWS - 4) v -= 400 * (h - (ROWS - 4));
  }
  v -= maxH * maxH * 1.2;
  v -= bump * 1.5;
  // 2つ組・にぎり予備軍
  for (let i = 0; i < g.length; i++) {
    const f = g[i];
    if (!isFlavor(f)) continue;
    const ns = neighbors(rowOf(i), colOf(i));
    let same = 0;
    let empty = 0;
    for (const n of ns) {
      if (g[n] === f) same++;
      else if (g[n] === EMPTY) empty++;
    }
    v += same * 3 * patience + (same === 2 && empty >= 1 ? 6 * patience : 0);
    // 上が空いている ▲ の上に同じ具を置けば伸びる
    if (isUp(rowOf(i), colOf(i)) === false && empty) v += 0.5;
  }
  return v;
}

export function bestPlans(board: Board, diff: Difficulty, rand: () => number): Plan[] {
  const st = SETTINGS[diff];
  const cur = board.active;
  if (!cur) return [];
  const piece: Piece = { kind: cur.kind, a: cur.a, b: cur.b };
  const next = board.queue[0];
  const plans: Plan[] = [];
  const maxC = piece.kind === 'nori' ? COLS - 1 : COLS - 2;
  const danger = board.danger();
  for (let c = 0; c <= maxC; c++) {
    for (const swap of piece.kind === 'pair' && piece.a !== piece.b ? [false, true] : [false]) {
      if (!reachable(board.grid, piece, c)) continue;
      const g = place(board.grid, piece, c, swap);
      if (!g) continue;
      const sim = resolveAll(g);
      // 危ない時ほど即消しを重視、余裕がある時は大きい攻撃を狙う
      const atk = sim.attack;
      let value = atk >= 4 || danger > 0.3 ? atk * 60 + sim.chain * 40 : atk * 30 * (1 - st.patience * 0.5) + sim.cleared * 4;
      value += sim.nigiri * 50;
      value += evaluate(sim.grid, st.patience);
      if (st.ply2 && next) {
        let best = -1e9;
        const maxN = next.kind === 'nori' ? COLS - 1 : COLS - 2;
        for (let c2 = 0; c2 <= maxN; c2++)
          for (const s2 of [false, true]) {
            const g2 = place(sim.grid, next, c2, s2);
            if (!g2) continue;
            const sim2 = resolveAll(g2);
            const v2 = sim2.attack * 50 + sim2.nigiri * 40 + evaluate(sim2.grid, st.patience);
            if (v2 > best) best = v2;
          }
        if (best > -1e9) value += best * 0.6;
      }
      value += (rand() - 0.5) * st.noise * 2;
      plans.push({ c, swap, value });
    }
  }
  plans.sort((a, b) => b.value - a.value);
  return plans;
}

/** CPU の手を実際の入力に変換して少しずつ操作する */
export class AiDriver {
  private plan: Plan | null = null;
  private timer = 0;
  private lastActive: unknown = null;
  constructor(private board: Board, public diff: Difficulty, private rand: () => number) {}

  update(dt: number) {
    const b = this.board;
    if (b.phase !== 'fall' || !b.active) {
      this.plan = null;
      this.lastActive = null;
      b.softDrop = false;
      return;
    }
    const st = SETTINGS[this.diff];
    if (this.lastActive !== b.queue[0]) {
      // 新しいピース
      this.lastActive = b.queue[0];
      this.plan = null;
      b.softDrop = false;
      this.timer = -st.think;
    }
    this.timer += dt;
    if (!this.plan && this.timer >= 0) {
      const plans = bestPlans(b, this.diff, this.rand);
      if (this.diff === 'easy' && plans.length > 3 && this.rand() < 0.35) this.plan = plans[Math.floor(this.rand() * 3)];
      else this.plan = plans[0] ?? { c: b.active.c, swap: false, value: 0 };
    }
    if (!this.plan) return;
    while (this.timer >= st.step) {
      this.timer -= st.step;
      const p = b.active!;
      if (this.plan.swap) {
        b.swap();
        this.plan.swap = false;
      } else if (p.c !== this.plan.c) {
        if (!b.move(Math.sign(this.plan.c - p.c))) this.plan.c = p.c;
      } else {
        if (st.hard) b.hardDrop();
        else b.softDrop = true;
        return;
      }
      if (!b.active) return;
    }
  }
}
