import '@fontsource/m-plus-rounded-1c/800.css';
import './style.css';
import { GameScreen, MatchResult, Mode } from './gameScreen';
import type { Difficulty } from './game/ai';
import { sound } from './audio';
import { Board } from './game/board';
import { BoardView } from './render/boardView';
import { getSprite, SQ3 } from './render/sprites';
import { makeRng, idx, NORI, GARBAGE } from './game/core';

// ---------- 保存 ----------
const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem('onigiri.' + k);
      return v === null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem('onigiri.' + k, JSON.stringify(v));
    } catch {
      /* 保存できない環境 */
    }
  },
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const screens = ['title', 'diff', 'howto', 'game'];
function show(id: string) {
  for (const s of screens) $(`#${s}`).classList.toggle('active', s === id);
}
function overlay(id: string, on: boolean) {
  $(`#${id}`).classList.toggle('active', on);
}

// ---------- 設定 ----------
sound.seOn = store.get('se', true);
sound.bgmOn = store.get('bgm', true);
function refreshToggles() {
  const se = $('#tg-se');
  const bgm = $('#tg-bgm');
  se.textContent = `効果音 ${sound.seOn ? 'ON' : 'OFF'}`;
  bgm.textContent = `BGM ${sound.bgmOn ? 'ON' : 'OFF'}`;
  se.classList.toggle('off', !sound.seOn);
  bgm.classList.toggle('off', !sound.bgmOn);
}
$('#tg-se').addEventListener('click', () => {
  sound.unlock();
  sound.seOn = !sound.seOn;
  store.set('se', sound.seOn);
  refreshToggles();
  sound.se('select');
});
$('#tg-bgm').addEventListener('click', () => {
  sound.unlock();
  sound.bgmOn = !sound.bgmOn;
  store.set('bgm', sound.bgmOn);
  refreshToggles();
});
refreshToggles();

function refreshBest() {
  const best = store.get<number>('best.solo', 0);
  const wins = store.get<Record<string, number>>('wins', {});
  const parts: string[] = [];
  if (best) parts.push(`ひとりでハイスコア ${best.toLocaleString()}`);
  const w = (wins.easy ?? 0) + (wins.normal ?? 0) + (wins.hard ?? 0);
  if (w) parts.push(`CPUに${w}勝`);
  $('#best').textContent = parts.join('　');
}
refreshBest();

// ---------- 背景 ----------
function drawBg() {
  const cv = $<HTMLCanvasElement>('#bg');
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const g = ctx.createLinearGradient(0, 0, 0, innerHeight);
  g.addColorStop(0, '#ffe3d1');
  g.addColorStop(1, '#fff3e6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  // うっすら三角模様
  const w = 46;
  const h = w * SQ3;
  ctx.globalAlpha = 0.18;
  for (let r = 0; r * h < innerHeight + h; r++)
    for (let c = -1; (c * w) / 2 < innerWidth + w; c++) {
      if ((r * 7 + c * 3) % 5 !== 0) continue;
      const up = ((r + c) & 1) === 0;
      const sp = getSprite((r + c * 2) % 5 < 0 ? 0 : (r + c * 2) % 5, up, w, dpr);
      ctx.drawImage(sp.canvas, (c * w) / 2 - sp.pad, r * h - sp.pad, sp.canvas.width / dpr, sp.canvas.height / dpr);
    }
  ctx.globalAlpha = 1;
}

function drawLogoArt() {
  const cv = $<HTMLCanvasElement>('#logo-art');
  const dpr = Math.min(3, devicePixelRatio || 1);
  cv.width = 320 * dpr;
  cv.height = 140 * dpr;
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const w = 72;
  // ▲▼▲▼▲ の5人ならび
  const order = [0, 1, 2, 3, 4];
  order.forEach((f, i) => {
    const up = i % 2 === 0;
    const sp = getSprite(f, up, w, dpr);
    const x = 160 - w * 1.5 + (i * w) / 2;
    const y = 40 + (i === 2 ? -12 : 0);
    ctx.drawImage(sp.canvas, x - sp.pad, y - sp.pad, sp.canvas.width / dpr, sp.canvas.height / dpr);
  });
}

// ---------- あそびかた ----------
interface Demo {
  title: string;
  text: string;
  cells: [number, number, number][];
  rows: [number, number];
  cols: [number, number];
  ghost?: boolean;
}

const DEMOS: Demo[] = [
  {
    title: '① ふたつ組で落ちてくる',
    text: '画面を左右にドラッグして移動、タップで左右を入れかえ。下にサッとはらうと一気に落とせます。着地すると1こずつバラけて（ちぎれて）下に落ちます。',
    cells: [
      [9, 3, 1],
      [9, 4, 2],
      [11, 2, 0],
      [11, 3, 3],
      [11, 4, 4],
      [11, 5, 0],
      [10, 5, 2],
      [11, 6, 1],
    ],
    rows: [8, 11],
    cols: [1, 7],
  },
  {
    title: '② 3つつながると消える',
    text: '同じ具のおにぎりが「辺」で3つ以上くっつくと消えます。つながっている所はくっついて見えるのでひと目でわかります。消えたあとに落ちてきて、また消えると「れんさ」！',
    cells: [
      [11, 2, 0],
      [11, 3, 0],
      [11, 4, 0],
      [10, 4, 1],
      [11, 5, 1],
      [11, 6, 1],
      [10, 3, 2],
      [11, 1, 3],
    ],
    rows: [9, 11],
    cols: [1, 7],
  },
  {
    title: '③ 4つで「にぎり！」',
    text: 'まん中の三角の3辺ぜんぶを同じ具でかこむと、大きな三角おにぎりが完成！「にぎり！」は大ダメージ＆まわりのこげもまとめて消せます。',
    cells: [
      [10, 4, 1],
      [11, 3, 1],
      [11, 4, 1],
      [11, 5, 1],
      [11, 2, 3],
      [11, 6, 4],
      [10, 5, 4],
    ],
    rows: [9, 11],
    cols: [1, 7],
  },
  {
    title: '④ ご注文と、のり',
    text: '上に出る「ご注文」の具を決められた数だけ消すと、黒い「のり」が届きます。のりが乗った（ふれた）具は、盤面にあるぶんぜんぶ消えます！',
    cells: [
      [10, 4, NORI],
      [11, 4, 2],
      [11, 3, 0],
      [11, 5, 1],
      [11, 2, 2],
      [11, 6, 2],
      [10, 6, 3],
    ],
    rows: [9, 11],
    cols: [1, 7],
  },
  {
    title: '⑤ こげ（おじゃま）',
    text: 'れんさ・にぎり・のりで相手にこげを送れます。こげはとなりで具を消すといっしょに消えます。届く前に自分も消せば相殺できます。出口がふさがると負け！',
    cells: [
      [11, 2, GARBAGE],
      [11, 3, GARBAGE],
      [11, 4, 3],
      [11, 5, GARBAGE],
      [10, 4, GARBAGE],
      [10, 5, 3],
      [10, 3, 3],
      [11, 6, 2],
    ],
    rows: [9, 11],
    cols: [1, 7],
  },
];

let howtoPage = 0;
function renderHowto() {
  const d = DEMOS[howtoPage];
  const host = $('#howto-pages');
  host.innerHTML = '';
  const cv = document.createElement('canvas');
  host.appendChild(cv);
  const h3 = document.createElement('h3');
  h3.textContent = d.title;
  const p = document.createElement('p');
  p.textContent = d.text;
  host.append(h3, p);
  const dpr = Math.min(3, devicePixelRatio || 1);
  const w = 64;
  const colsW = ((d.cols[1] - d.cols[0] + 2) / 2) * w;
  const rowsH = (d.rows[1] - d.rows[0] + 1) * w * SQ3;
  const pad = 14;
  cv.width = (colsW + pad * 2) * dpr;
  cv.height = (rowsH + pad * 2) * dpr;
  cv.style.maxWidth = `${colsW + pad * 2}px`;
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const board = new Board(makeRng(1), makeRng(2));
  for (const [r, c, v] of d.cells) board.grid[idx(r, c)] = v;
  const view = new BoardView(board);
  view.showGhost = false;
  view.layout(pad - (d.cols[0] * w) / 2, pad - d.rows[0] * w * SQ3, w);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, colsW + pad * 2, rowsH + pad * 2, 18);
  ctx.clip();
  ctx.fillStyle = '#fff6ea';
  ctx.fillRect(0, 0, colsW + pad * 2, rowsH + pad * 2);
  view.draw(ctx, dpr, 0);
  ctx.restore();
  if (howtoPage === 0) {
    // 矢印
    ctx.strokeStyle = '#ef3b55';
    ctx.fillStyle = '#ef3b55';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const y = pad + w * SQ3 * 0.5;
    const cx = pad + ((3 - d.cols[0]) * w) / 2 + w / 2 + w / 4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * w * 0.75, y);
      ctx.lineTo(cx + s * w * 1.25, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + s * w * 1.4, y);
      ctx.lineTo(cx + s * w * 1.2, y - 8);
      ctx.lineTo(cx + s * w * 1.2, y + 8);
      ctx.fill();
    }
  }
  const dots = $('#howto-dots');
  dots.innerHTML = DEMOS.map((_, i) => `<span class="${i === howtoPage ? 'on' : ''}"></span>`).join('');
}
$('#howto-prev').addEventListener('click', () => {
  howtoPage = (howtoPage + DEMOS.length - 1) % DEMOS.length;
  renderHowto();
  sound.se('move');
});
$('#howto-next').addEventListener('click', () => {
  howtoPage = (howtoPage + 1) % DEMOS.length;
  renderHowto();
  sound.se('move');
});

// ---------- ゲーム ----------
let game: GameScreen | null = null;
let lastMode: Mode = 'cpu';
let lastDiff: Difficulty = 'normal';

function startGame(mode: Mode, diff: Difficulty = 'normal') {
  sound.unlock();
  game?.destroy();
  lastMode = mode;
  lastDiff = diff;
  overlay('pause', false);
  overlay('result', false);
  show('game');
  const canvas = $<HTMLCanvasElement>('#game-canvas');
  game = new GameScreen(canvas, mode, diff);
  game.onEnd = onEnd;
  game.start();
  if (import.meta.env.DEV) (window as unknown as { __game: GameScreen }).__game = game;
  const hint = $('#hint');
  hint.classList.remove('hide');
  setTimeout(() => hint.classList.add('hide'), 5000);
}

function onEnd(r: MatchResult) {
  const title = $('#result-title');
  const stats = $('#result-stats');
  const best = $('#result-best');
  best.textContent = '';
  if (r.mode === 'solo') {
    title.textContent = 'おつかれさま！';
    const prev = store.get<number>('best.solo', 0);
    if (r.score > prev) {
      store.set('best.solo', r.score);
      best.textContent = prev ? 'ハイスコア更新！' : '';
    }
  } else {
    title.textContent = r.win ? 'かち！' : 'まけ…';
    if (r.win) {
      const wins = store.get<Record<string, number>>('wins', {});
      wins[r.difficulty ?? 'normal'] = (wins[r.difficulty ?? 'normal'] ?? 0) + 1;
      store.set('wins', wins);
    }
  }
  const mm = Math.floor(r.time / 60);
  const ss = Math.floor(r.time % 60)
    .toString()
    .padStart(2, '0');
  stats.innerHTML = `
    <dt>スコア</dt><dd>${r.score.toLocaleString()}</dd>
    <dt>さいだいれんさ</dt><dd>${r.maxChain}</dd>
    <dt>にぎり</dt><dd>${r.nigiri}</dd>
    <dt>注文たっせい</dt><dd>${r.orders}</dd>
    <dt>タイム</dt><dd>${mm}:${ss}</dd>`;
  drawResultArt(r.mode === 'solo' || r.win);
  refreshBest();
  overlay('result', true);
}

function drawResultArt(happy: boolean) {
  const cv = $<HTMLCanvasElement>('#result-art');
  const dpr = Math.min(3, devicePixelRatio || 1);
  cv.width = 240 * dpr;
  cv.height = 90 * dpr;
  cv.style.width = '240px';
  cv.style.height = '90px';
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const flavors = happy ? [1, 2, 1] : [GARBAGE, 4, GARBAGE];
  flavors.forEach((f, i) => {
    const up = i % 2 === 0;
    const w = 90;
    const sp = getSprite(f, up, w, dpr);
    ctx.drawImage(sp.canvas, 30 + (i * w) / 2 - sp.pad, 6 - sp.pad, sp.canvas.width / dpr, sp.canvas.height / dpr);
  });
}

function pause(p: boolean) {
  if (!game) return;
  game.setPaused(p);
  overlay('pause', p);
}

// ボタン類
document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('[data-act],[data-diff]') as HTMLElement | null;
  if (!t) return;
  sound.unlock();
  const act = t.dataset.act;
  const diff = t.dataset.diff as Difficulty | undefined;
  if (diff) {
    sound.se('select');
    startGame('cpu', diff);
    return;
  }
  switch (act) {
    case 'cpu':
      sound.se('select');
      show('diff');
      break;
    case 'solo':
      sound.se('select');
      startGame('solo');
      break;
    case 'howto':
      sound.se('select');
      howtoPage = 0;
      show('howto');
      renderHowto();
      break;
    case 'back':
      sound.se('move');
      show('title');
      break;
    case 'resume':
      pause(false);
      break;
    case 'retry':
      startGame(lastMode, lastDiff);
      break;
    case 'quit':
      game?.destroy();
      game = null;
      overlay('pause', false);
      overlay('result', false);
      refreshBest();
      show('title');
      break;
  }
});
$('#pause-btn').addEventListener('click', () => pause(!game?.isPaused));

// ---------- タッチ操作 ----------
{
  const canvas = $<HTMLCanvasElement>('#game-canvas');
  let id: number | null = null;
  let sx = 0;
  let sy = 0;
  let st = 0;
  let anchorX = 0;
  let anchorCol = 0;
  let lastActive: unknown = null;
  let moved = false;
  let soft = false;
  const hist: { y: number; t: number }[] = [];

  canvas.addEventListener('pointerdown', (e) => {
    if (!game || game.isPaused) return;
    sound.unlock();
    id = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    sx = anchorX = e.clientX;
    sy = e.clientY;
    st = performance.now();
    moved = false;
    soft = false;
    hist.length = 0;
    lastActive = game.player.active;
    anchorCol = game.player.active?.c ?? 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!game || e.pointerId !== id) return;
    const w = game.cellW;
    const p = game.player;
    if (p.active !== lastActive && p.active && (!lastActive || (lastActive as { r: number }).r > p.active.r)) {
      // 新しいピースが出たら基準を取り直す
      anchorX = e.clientX;
      anchorCol = p.active.c;
    }
    lastActive = p.active;
    const dx = e.clientX - anchorX;
    const dy = e.clientY - sy;
    hist.push({ y: e.clientY, t: performance.now() });
    while (hist.length > 6) hist.shift();
    if (Math.abs(e.clientX - sx) > w * 0.3 || Math.abs(dy) > w * 0.3) moved = true;
    if (p.active) {
      const target = anchorCol + Math.round(dx / (w * 0.5));
      if (target !== p.active.c) game.moveTo(target);
    }
    const wantSoft = dy > w * 0.9 && Math.abs(dy) > Math.abs(e.clientX - sx) * 1.2;
    if (wantSoft !== soft) {
      soft = wantSoft;
      game.input(soft ? 'softOn' : 'softOff');
    }
  });
  const end = (e: PointerEvent) => {
    if (!game || e.pointerId !== id) return;
    id = null;
    const w = game.cellW;
    const dt = performance.now() - st;
    const dy = e.clientY - sy;
    const dx = e.clientX - sx;
    let vy = 0;
    if (hist.length >= 2) {
      const a = hist[0];
      const b = hist[hist.length - 1];
      vy = (b.y - a.y) / Math.max(1, b.t - a.t);
    }
    if (soft) game.input('softOff');
    if (!moved && dt < 300) game.input('swap');
    else if (dy > w * 1.1 && vy > 0.9 && Math.abs(dy) > Math.abs(dx)) game.input('hard');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

// ---------- キーボード ----------
{
  const held = new Map<string, number>();
  let rep: number | null = null;
  const dirKey = (k: string) => (k === 'ArrowLeft' || k === 'a' ? 'left' : k === 'ArrowRight' || k === 'd' ? 'right' : null);
  addEventListener('keydown', (e) => {
    if (!game || !$('#game').classList.contains('active')) return;
    if (e.key === 'Escape' || e.key === 'p') {
      pause(!game.isPaused);
      return;
    }
    if (e.repeat) {
      e.preventDefault();
      return;
    }
    const d = dirKey(e.key);
    if (d) {
      game.input(d);
      held.set(d, performance.now());
      if (rep) clearInterval(rep);
      const start = performance.now();
      rep = window.setInterval(() => {
        if (!held.has(d)) return;
        if (performance.now() - start > 150) game?.input(d);
      }, 40);
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case 'ArrowUp':
      case 'z':
      case 'x':
      case 'w':
        game.input('swap');
        break;
      case 'ArrowDown':
      case 's':
        game.input('softOn');
        break;
      case ' ':
        game.input('hard');
        break;
      default:
        return;
    }
    e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    const d = dirKey(e.key);
    if (d) {
      held.delete(d);
      if (!held.size && rep) {
        clearInterval(rep);
        rep = null;
      }
    }
    if (e.key === 'ArrowDown' || e.key === 's') game?.input('softOff');
  });
}

// ---------- 画面サイズ・バックグラウンド ----------
addEventListener('resize', () => {
  drawBg();
  game?.resize();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !game.isPaused && $('#game').classList.contains('active')) pause(true);
});

// Android の戻るボタン（Capacitor 実行時のみ）
void (async () => {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      if ($('#game').classList.contains('active')) {
        if ($('#result').classList.contains('active')) $<HTMLButtonElement>('#result [data-act="quit"]').click();
        else pause(!game?.isPaused);
      } else if (!$('#title').classList.contains('active')) show('title');
      else void App.exitApp();
    });
  } catch {
    /* Web では何もしない */
  }
})();

drawBg();
drawLogoArt();
document.fonts?.ready.then(() => {
  drawBg();
});

