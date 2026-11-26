import {
  COLS,
  ROWS,
  EMPTY,
  GARBAGE,
  NORI,
  FLAVOR_COUNT,
  Grid,
  idx,
  newGrid,
  applyGravity,
  findClear,
  scoreClear,
  ClearResult,
  FallMove,
  isUp,
} from './core';

export type PieceKind = 'pair' | 'nori';
export interface Piece {
  kind: PieceKind;
  a: number;
  b: number;
}

export interface Active extends Piece {
  r: number;
  c: number;
}

export interface Order {
  flavor: number;
  need: number;
  have: number;
}

export type GameEvent =
  | { type: 'move' }
  | { type: 'swap' }
  | { type: 'lock'; hard: boolean; dist: number }
  | { type: 'clear'; res: ClearResult; chain: number; score: number; attack: number }
  | { type: 'chainEnd'; chain: number }
  | { type: 'order'; order: Order }
  | { type: 'garbageDrop'; n: number }
  | { type: 'gameover' };

type Phase = 'fall' | 'gravity' | 'clearing' | 'dead' | 'idle';

export const CLEAR_TIME = 0.42;
const LOCK_DELAY = 0.45;
const MAX_LOCK_RESETS = 14;
const SPAWN_C = 5;
const MAX_GARBAGE_DROP = 16;

export interface CellAnim {
  c: number;
  from: number;
  to: number;
  v: number;
  t: number;
  dur: number;
}

export class Board {
  grid: Grid = newGrid();
  phase: Phase = 'idle';
  active: Active | null = null;
  queue: Piece[] = [];
  /** 描画用: 落下中のセル（grid には到着後の位置で入っている） */
  anims: CellAnim[] = [];
  /** 描画用: 着地バウンド */
  bounce = new Map<number, number>();
  clearing: ClearResult | null = null;
  clearT = 0;
  /** アクティブピースの向きが変わった時のくるっとアニメ */
  flipT = 1;

  fallInterval = 0.75;
  softDrop = false;
  private fallTimer = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private grounded = false;
  chain = 0;
  pending = 0; // 受け取る予定のおじゃま
  private garbageDroppedThisTurn = false;
  private noriQueued = false;

  score = 0;
  totalCleared = 0;
  maxChain = 0;
  nigiriCount = 0;
  ordersDone = 0;
  order: Order;

  onEvent: (e: GameEvent) => void = () => {};

  constructor(private rng: () => number, private orderRng: () => number) {
    this.order = this.makeOrder();
  }

  start() {
    this.grid = newGrid();
    this.queue = [this.randomPiece(), this.randomPiece()];
    this.spawn();
  }

  get dead() {
    return this.phase === 'dead';
  }

  private randomPiece(): Piece {
    return {
      kind: 'pair',
      a: Math.floor(this.rng() * FLAVOR_COUNT),
      b: Math.floor(this.rng() * FLAVOR_COUNT),
    };
  }

  private makeOrder(): Order {
    const need = Math.min(18, 9 + this.ordersDone * 2);
    return { flavor: Math.floor(this.orderRng() * FLAVOR_COUNT), need, have: 0 };
  }

  activeCells(p: Active | null = this.active): { r: number; c: number; v: number }[] {
    if (!p) return [];
    if (p.kind === 'nori') return [{ r: p.r, c: p.c, v: NORI }];
    return [
      { r: p.r, c: p.c, v: p.a },
      { r: p.r, c: p.c + 1, v: p.b },
    ];
  }

  private fits(p: Active): boolean {
    for (const cell of this.activeCells(p)) {
      if (cell.c < 0 || cell.c >= COLS || cell.r < 0 || cell.r >= ROWS) return false;
      if (this.grid[idx(cell.r, cell.c)] !== EMPTY) return false;
    }
    return true;
  }

  private spawn() {
    if (this.noriQueued) {
      this.noriQueued = false;
      this.queue.unshift({ kind: 'nori', a: NORI, b: NORI });
    }
    const next = this.queue.shift()!;
    while (this.queue.length < 2) this.queue.push(this.randomPiece());
    const p: Active = { ...next, r: 0, c: SPAWN_C };
    this.active = p;
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.garbageDroppedThisTurn = false;
    this.flipT = 1;
    if (!this.fits(p)) {
      this.active = null;
      this.phase = 'dead';
      this.onEvent({ type: 'gameover' });
      return;
    }
    this.phase = 'fall';
  }

  // ---------- 入力 ----------
  move(dc: number): boolean {
    if (this.phase !== 'fall' || !this.active) return false;
    const p = { ...this.active, c: this.active.c + dc };
    if (!this.fits(p)) return false;
    this.active = p;
    this.flipT = 0;
    this.afterManipulate();
    this.onEvent({ type: 'move' });
    return true;
  }

  /** 列を直接指定（ドラッグ操作用）。途中の壁は越えない */
  moveTo(c: number) {
    if (!this.active) return;
    const step = Math.sign(c - this.active.c);
    while (step && this.active && this.active.c !== c) {
      if (!this.move(step)) break;
    }
  }

  swap() {
    if (this.phase !== 'fall' || !this.active || this.active.kind !== 'pair') return;
    if (this.active.a === this.active.b) {
      this.onEvent({ type: 'swap' });
      return;
    }
    this.active = { ...this.active, a: this.active.b, b: this.active.a };
    this.afterManipulate();
    this.onEvent({ type: 'swap' });
  }

  hardDrop() {
    if (this.phase !== 'fall' || !this.active) return;
    let dist = 0;
    let cur: Active = this.active;
    for (;;) {
      const p: Active = { ...cur, r: cur.r + 1 };
      if (!this.fits(p)) break;
      cur = p;
      dist++;
    }
    this.active = cur;
    this.lock(true, dist);
  }

  private afterManipulate() {
    if (this.grounded && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  /** 着地予想（ちぎり後の各セル位置） */
  ghost(): { r: number; c: number; v: number }[] {
    if (!this.active) return [];
    const cells = this.activeCells();
    const out: { r: number; c: number; v: number }[] = [];
    for (const cell of cells) {
      let r = cell.r;
      while (r + 1 < ROWS && this.grid[idx(r + 1, cell.c)] === EMPTY) r++;
      out.push({ r, c: cell.c, v: cell.v });
    }
    return out;
  }

  // ---------- 進行 ----------
  update(dt: number) {
    this.flipT = Math.min(1, this.flipT + dt / 0.09);
    for (const [k, t] of this.bounce) {
      const nt = t + dt;
      if (nt > 0.18) this.bounce.delete(k);
      else this.bounce.set(k, nt);
    }
    switch (this.phase) {
      case 'fall':
        return this.updateFall(dt);
      case 'gravity': {
        let done = true;
        for (const a of this.anims) {
          if (a.t < a.dur) {
            a.t += dt;
            if (a.t >= a.dur) this.bounce.set(idx(a.to, a.c), 0);
            else done = false;
          }
        }
        if (done) {
          this.anims = [];
          this.afterGravity();
        }
        return;
      }
      case 'clearing':
        this.clearT += dt;
        if (this.clearT >= CLEAR_TIME) {
          const res = this.clearing!;
          for (const i of res.cells) this.grid[i] = EMPTY;
          for (const i of res.garbage) this.grid[i] = EMPTY;
          this.clearing = null;
          this.startGravity();
        }
        return;
    }
  }

  private updateFall(dt: number) {
    const p = this.active!;
    const interval = this.softDrop ? Math.min(this.fallInterval, 0.035) : this.fallInterval;
    const below = { ...p, r: p.r + 1 };
    if (this.fits(below)) {
      this.grounded = false;
      this.fallTimer += dt;
      if (this.fallTimer >= interval) {
        this.fallTimer -= interval;
        this.active = below;
        this.flipT = 0;
        if (this.softDrop) this.score += 1;
      }
    } else {
      this.grounded = true;
      this.fallTimer = 0;
      this.lockTimer += dt * (this.softDrop ? 3 : 1);
      if (this.lockTimer >= LOCK_DELAY) this.lock(false, 0);
    }
  }

  private lock(hard: boolean, dist: number) {
    const cells = this.activeCells();
    for (const cell of cells) this.grid[idx(cell.r, cell.c)] = cell.v;
    for (const cell of cells) this.bounce.set(idx(cell.r, cell.c), 0);
    this.active = null;
    this.chain = 0;
    this.onEvent({ type: 'lock', hard, dist });
    this.startGravity();
  }

  private startGravity() {
    const moves: FallMove[] = applyGravity(this.grid);
    if (!moves.length) {
      this.afterGravity();
      return;
    }
    this.anims = moves.map((m) => ({
      c: m.c,
      from: m.from,
      to: m.to,
      v: m.v,
      t: 0,
      dur: 0.05 + 0.032 * (m.to - m.from),
    }));
    this.phase = 'gravity';
  }

  private afterGravity() {
    const res = findClear(this.grid);
    if (res) {
      this.chain++;
      this.maxChain = Math.max(this.maxChain, this.chain);
      const { score, attack } = scoreClear(res, this.chain);
      this.score += score;
      this.totalCleared += res.cells.length;
      this.nigiriCount += res.nigiri;
      // 注文
      const got = res.byFlavor[this.order.flavor] ?? 0;
      if (got > 0 && !res.nori) {
        this.order.have = Math.min(this.order.need, this.order.have + got);
        if (this.order.have >= this.order.need) {
          this.ordersDone++;
          this.noriQueued = true;
          this.score += 300 * this.ordersDone;
          this.onEvent({ type: 'order', order: { ...this.order } });
          this.order = this.makeOrder();
        }
      }
      this.clearing = res;
      this.clearT = 0;
      this.phase = 'clearing';
      this.onEvent({ type: 'clear', res, chain: this.chain, score, attack });
      return;
    }
    if (this.chain > 0) {
      this.onEvent({ type: 'chainEnd', chain: this.chain });
      this.chain = 0;
    }
    if (this.pending > 0 && !this.garbageDroppedThisTurn) {
      this.garbageDroppedThisTurn = true;
      this.dropGarbage();
      return;
    }
    this.spawn();
  }

  private dropGarbage() {
    const n = Math.min(this.pending, MAX_GARBAGE_DROP);
    this.pending -= n;
    const cols = [...Array(COLS).keys()].sort(() => this.orderRng() - 0.5);
    const perCol = new Array(COLS).fill(0);
    let placed = 0;
    let k = 0;
    while (placed < n && k < COLS * ROWS) {
      const c = cols[k % COLS];
      k++;
      let r = -1;
      for (let rr = ROWS - 1; rr >= 0; rr--)
        if (this.grid[idx(rr, c)] === EMPTY) {
          r = rr;
          break;
        }
      if (r < 0) continue;
      this.grid[idx(r, c)] = GARBAGE;
      const from = -2 - perCol[c] * 1.2;
      perCol[c]++;
      this.anims.push({ c, from, to: r, v: GARBAGE, t: 0, dur: 0.22 + 0.025 * (r - from) });
      placed++;
    }
    this.onEvent({ type: 'garbageDrop', n: placed });
    if (this.anims.length) this.phase = 'gravity';
    else this.afterGravity();
  }

  /** 危険度（出現位置付近の高さ） 0〜1 */
  danger(): number {
    let top = ROWS;
    for (const c of [SPAWN_C - 1, SPAWN_C, SPAWN_C + 1, SPAWN_C + 2]) {
      for (let r = 0; r < ROWS; r++)
        if (this.grid[idx(r, c)] !== EMPTY) {
          top = Math.min(top, r);
          break;
        }
    }
    return top >= 4 ? 0 : (4 - top) / 4;
  }
}

export { isUp, ROWS, COLS };
