// 三角グリッドの純粋ロジック（描画・時間に依存しない）
//
// 盤面は row/col で管理し、(row + col) が偶数なら ▲、奇数なら ▼。
// 隣り合う三角形は「辺」で接している場合だけ繋がる（最大3方向）。
//   ▲: 左・右・下   ▼: 左・右・上

export const COLS = 11;
export const ROWS = 12;
export const EMPTY = -1;
export const GARBAGE = 8; // こげごはん（おじゃま）
export const NORI = 9; // のり（注文達成ごほうび）
export const MATCH = 3; // 何個つながれば消えるか
export const FLAVOR_COUNT = 5;

export type Grid = Int8Array;

export const idx = (r: number, c: number) => r * COLS + c;
export const rowOf = (i: number) => Math.floor(i / COLS);
export const colOf = (i: number) => i % COLS;
export const isUp = (r: number, c: number) => ((r + c) & 1) === 0;
export const inBounds = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
export const isFlavor = (v: number) => v >= 0 && v < FLAVOR_COUNT;

export function newGrid(): Grid {
  return new Int8Array(ROWS * COLS).fill(EMPTY);
}

/** 辺で接している隣接セル（盤内のみ） */
export function neighbors(r: number, c: number): number[] {
  const out: number[] = [];
  if (c > 0) out.push(idx(r, c - 1));
  if (c < COLS - 1) out.push(idx(r, c + 1));
  const vr = isUp(r, c) ? r + 1 : r - 1;
  if (vr >= 0 && vr < ROWS) out.push(idx(vr, c));
  return out;
}

export interface FallMove {
  c: number;
  from: number; // row
  to: number; // row
  v: number;
}

/** 列ごとの重力。盤面を書き換え、動いたセルの一覧を返す */
export function applyGravity(g: Grid): FallMove[] {
  const moves: FallMove[] = [];
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const v = g[idx(r, c)];
      if (v === EMPTY) continue;
      if (write !== r) {
        g[idx(write, c)] = v;
        g[idx(r, c)] = EMPTY;
        moves.push({ c, from: r, to: write, v });
      }
      write--;
    }
  }
  return moves;
}

/** 同じ具が MATCH 個以上つながったグループ */
export function findGroups(g: Grid): number[][] {
  const seen = new Uint8Array(ROWS * COLS);
  const groups: number[][] = [];
  for (let i = 0; i < g.length; i++) {
    const v = g[i];
    if (!isFlavor(v) || seen[i]) continue;
    const group: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const n of neighbors(rowOf(cur), colOf(cur))) {
        if (!seen[n] && g[n] === v) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (group.length >= MATCH) groups.push(group);
  }
  return groups;
}

/**
 * 「にぎり」判定：1つの三角形の3辺すべてに同じ具が付いている形
 * ＝ 4枚で大きな三角形（▲型・▽型どちらも可）。中心セルの一覧を返す。
 */
export function findNigiri(group: number[]): number[] {
  const set = new Set(group);
  const centers: number[] = [];
  for (const i of group) {
    const ns = neighbors(rowOf(i), colOf(i));
    if (ns.length === 3 && ns.every((n) => set.has(n))) centers.push(i);
  }
  return centers;
}

const CHAIN_BONUS = [0, 0, 4, 8, 16, 32, 64, 96, 128, 160, 192, 224];

export interface ClearResult {
  cells: number[]; // 消える具（のり含む）
  garbage: number[]; // 一緒に消えるこげ
  nigiri: number; // にぎり数
  nigiriCenters: number[];
  flavors: number[];
  byFlavor: number[]; // 具ごとの消えた数
  nori: boolean;
}

/** 消えた具に隣接するこげを集める（にぎりは周囲2マスまで） */
function collectGarbage(g: Grid, cells: number[], nigiriCenters: number[]): number[] {
  const out = new Set<number>();
  for (const i of cells) {
    for (const n of neighbors(rowOf(i), colOf(i))) if (g[n] === GARBAGE) out.add(n);
  }
  for (const ctr of nigiriCenters) {
    const r0 = rowOf(ctr);
    const c0 = colOf(ctr);
    for (let r = r0 - 2; r <= r0 + 2; r++)
      for (let c = c0 - 3; c <= c0 + 3; c++) if (inBounds(r, c) && g[idx(r, c)] === GARBAGE) out.add(idx(r, c));
  }
  return [...out];
}

/** のりが接している具（下・左・右・辺の順） */
export function noriTarget(g: Grid, i: number): number {
  const r = rowOf(i);
  const c = colOf(i);
  const order: [number, number][] = [
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
    [isUp(r, c) ? r + 1 : r - 1, c],
  ];
  for (const [rr, cc] of order) {
    if (!inBounds(rr, cc)) continue;
    const v = g[idx(rr, cc)];
    if (isFlavor(v)) return v;
  }
  return EMPTY;
}

/** 盤面から次に消えるものを探す（なければ null） */
export function findClear(g: Grid): ClearResult | null {
  const byFlavor = new Array(FLAVOR_COUNT).fill(0);
  // のりを優先
  const noriIdx = g.findIndex((v) => v === NORI);
  if (noriIdx >= 0) {
    const target = noriTarget(g, noriIdx);
    const cells = [noriIdx];
    if (target !== EMPTY) {
      for (let i = 0; i < g.length; i++) if (g[i] === target) cells.push(i);
      byFlavor[target] = cells.length - 1;
    }
    const garbage = collectGarbage(g, cells, [noriIdx]);
    return { cells, garbage, nigiri: 0, nigiriCenters: [], flavors: target === EMPTY ? [] : [target], byFlavor, nori: true };
  }
  const groups = findGroups(g);
  if (!groups.length) return null;
  const cells: number[] = [];
  const centers: number[] = [];
  const flavors = new Set<number>();
  for (const gr of groups) {
    cells.push(...gr);
    centers.push(...findNigiri(gr));
    const f = g[gr[0]];
    flavors.add(f);
    byFlavor[f] += gr.length;
  }
  const garbage = collectGarbage(g, cells, centers);
  return { cells, garbage, nigiri: centers.length, nigiriCenters: centers, flavors: [...flavors], byFlavor, nori: false };
}

/** 得点と攻撃量（おじゃま数） */
export function scoreClear(res: ClearResult, chain: number): { score: number; attack: number } {
  const n = res.cells.length;
  let mult = CHAIN_BONUS[Math.min(chain, CHAIN_BONUS.length - 1)];
  mult += Math.min(10, Math.max(0, n - MATCH * Math.max(1, res.flavors.length)));
  if (res.flavors.length >= 2) mult += 3 * (res.flavors.length - 1);
  mult += res.nigiri * 10;
  if (res.nori) mult += 4;
  const score = n * 10 * Math.max(1, mult) + res.garbage.length * 5;
  const attack = Math.floor(score / 60);
  return { score, attack };
}

export interface SimResult {
  grid: Grid;
  chain: number;
  score: number;
  attack: number;
  nigiri: number;
  cleared: number;
}

/** 消去〜重力を連鎖が止まるまで即座に実行（AI 用） */
export function resolveAll(g: Grid): SimResult {
  let chain = 0;
  let score = 0;
  let attack = 0;
  let nigiri = 0;
  let cleared = 0;
  applyGravity(g);
  for (;;) {
    const res = findClear(g);
    if (!res) break;
    chain++;
    const s = scoreClear(res, chain);
    score += s.score;
    attack += s.attack;
    nigiri += res.nigiri;
    cleared += res.cells.length;
    for (const i of res.cells) g[i] = EMPTY;
    for (const i of res.garbage) g[i] = EMPTY;
    applyGravity(g);
  }
  return { grid: g, chain, score, attack, nigiri, cleared };
}

export function columnHeight(g: Grid, c: number): number {
  for (let r = 0; r < ROWS; r++) if (g[idx(r, c)] !== EMPTY) return ROWS - r;
  return 0;
}

/** シード付き乱数（対戦では両者同じ並びにして公平にする） */
export function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
