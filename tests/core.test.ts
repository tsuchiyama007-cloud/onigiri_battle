import { describe, it, expect } from 'vitest';
import { newGrid, idx, neighbors, applyGravity, findGroups, findNigiri, findClear, resolveAll, EMPTY, NORI, GARBAGE, isUp } from '../src/game/core';
import { Board } from '../src/game/board';
import { AiDriver } from '../src/game/ai';
import { makeRng } from '../src/game/core';

describe('三角グリッド', () => {
  it('▲は左右と下、▼は左右と上に隣接する', () => {
    expect(isUp(11, 4)).toBe(false);
    expect(neighbors(11, 4).sort()).toEqual([idx(10, 4), idx(11, 3), idx(11, 5)].sort());
    expect(isUp(10, 4)).toBe(true);
    expect(neighbors(10, 4).sort()).toEqual([idx(10, 3), idx(10, 5), idx(11, 4)].sort());
  });

  it('重力で列ごとに落ちる（ちぎり）', () => {
    const g = newGrid();
    g[idx(3, 2)] = 1;
    g[idx(11, 3)] = 0;
    g[idx(10, 3)] = 2;
    const moves = applyGravity(g);
    expect(g[idx(11, 2)]).toBe(1);
    expect(g[idx(10, 3)]).toBe(2);
    expect(moves.length).toBe(1);
  });

  it('同じ具が3つつながると消える', () => {
    const g = newGrid();
    g[idx(11, 2)] = 0;
    g[idx(11, 3)] = 0;
    g[idx(11, 4)] = 0;
    expect(findGroups(g).length).toBe(1);
    g[idx(11, 4)] = 1;
    expect(findGroups(g).length).toBe(0);
  });

  it('3辺を囲むと「にぎり」', () => {
    const grp = [idx(10, 4), idx(11, 3), idx(11, 4), idx(11, 5)];
    expect(findNigiri(grp)).toEqual([idx(11, 4)]);
  });

  it('のりは触れた具を全部消す', () => {
    const g = newGrid();
    g[idx(11, 4)] = 2;
    g[idx(11, 0)] = 2;
    g[idx(11, 8)] = 2;
    g[idx(10, 4)] = NORI;
    const res = findClear(g)!;
    expect(res.nori).toBe(true);
    expect(res.cells.length).toBe(4);
  });

  it('消去に隣接するこげも消える＆連鎖が数えられる', () => {
    const g = newGrid();
    g[idx(11, 2)] = 0;
    g[idx(11, 3)] = 0;
    g[idx(11, 4)] = 0;
    g[idx(11, 5)] = GARBAGE;
    const r = resolveAll(g);
    expect(r.chain).toBe(1);
    expect(g[idx(11, 5)]).toBe(EMPTY);
  });
});

function simulate(seed: number, d1: 'easy' | 'normal' | 'hard', d2: 'easy' | 'normal' | 'hard', maxTime = 400) {
  const a = new Board(makeRng(seed), makeRng(seed + 1));
  const b = new Board(makeRng(seed), makeRng(seed + 2));
  const stats = { chains: [0, 0], nigiri: [0, 0], nori: [0, 0], attack: [0, 0] };
  const wire = (me: Board, opp: Board, k: number) => {
    me.onEvent = (e) => {
      if (e.type === 'clear') {
        let atk = e.attack;
        const off = Math.min(me.pending, atk);
        me.pending -= off;
        atk -= off;
        opp.pending += atk;
        stats.attack[k] += e.attack;
        stats.chains[k] = Math.max(stats.chains[k], e.chain);
        stats.nigiri[k] += e.res.nigiri;
        if (e.res.nori) stats.nori[k]++;
      }
    };
  };
  wire(a, b, 0);
  wire(b, a, 1);
  const ai1 = new AiDriver(a, d1, makeRng(seed + 3));
  const ai2 = new AiDriver(b, d2, makeRng(seed + 4));
  a.start();
  b.start();
  let t = 0;
  const dt = 1 / 60;
  while (t < maxTime && !a.dead && !b.dead) {
    const level = 1 + Math.floor(t / 35);
    const iv = Math.max(0.06, 0.72 * Math.pow(0.86, level - 1));
    a.fallInterval = b.fallInterval = iv;
    ai1.update(dt);
    a.update(dt);
    ai2.update(dt);
    b.update(dt);
    t += dt;
  }
  return { t: Math.round(t), winner: a.dead ? 2 : b.dead ? 1 : 0, ...stats };
}

describe('CPU 対戦シミュレーション', () => {
  it('対戦が決着し、強さの差が出る', () => {
    const results: Record<string, number[]> = {};
    for (const [d1, d2] of [
      ['hard', 'easy'],
      ['hard', 'normal'],
      ['normal', 'easy'],
    ] as const) {
      const wins = [0, 0, 0];
      const times: number[] = [];
      for (let s = 1; s <= 6; s++) {
        const r = simulate(s * 1000, d1, d2);
        wins[r.winner]++;
        times.push(r.t);
        if (s === 1) console.log(d1, 'vs', d2, JSON.stringify(r));
      }
      results[`${d1}-${d2}`] = wins;
      console.log(d1, 'vs', d2, 'wins(draw,p1,p2)=', wins, 'times', times.join(','));
    }
    expect(results['hard-easy'][1]).toBeGreaterThanOrEqual(4);
  }, 120000);
});
