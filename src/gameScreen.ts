import { Board, GameEvent, Piece } from './game/board';
import { AiDriver, Difficulty } from './game/ai';
import { makeRng, rowOf, colOf, NORI, GARBAGE } from './game/core';
import { BoardView } from './render/boardView';
import { FLAVORS, SQ3, getSprite } from './render/sprites';
import { sound, vibrate } from './audio';

export type Mode = 'solo' | 'cpu';

export interface MatchResult {
  mode: Mode;
  win: boolean;
  score: number;
  maxChain: number;
  nigiri: number;
  orders: number;
  time: number;
  difficulty?: Difficulty;
}

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", sans-serif';
const CHAIN_COLORS = ['#ef3b55', '#ef3b55', '#ff8a1f', '#e0a800', '#2fb34f', '#2e8bf0', '#9b5cf0', '#ff3fa4'];

interface Shot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  amount: number;
  to: Board;
}

export class GameScreen {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cw = 0;
  private ch = 0;
  player: Board;
  cpu: Board | null = null;
  private pv: BoardView;
  private cv: BoardView | null = null;
  private ai: AiDriver | null = null;
  private time = 0;
  private level = 1;
  private paused = false;
  private ended = false;
  private endTimer = -1;
  private raf = 0;
  private last = 0;
  private shots: Shot[] = [];
  private soloRainTimer = 0;
  private hdr = { y: 0, h: 0, x: 0, w: 0 };
  private dangerBeep = 0;
  private banner: { text: string; t: number; color: string } | null = null;

  onEnd: (r: MatchResult) => void = () => {};
  onPauseRequest: () => void = () => {};

  constructor(
    private canvas: HTMLCanvasElement,
    public mode: Mode,
    public difficulty: Difficulty = 'normal',
  ) {
    this.ctx = canvas.getContext('2d')!;
    const seed = (Math.random() * 1e9) | 0;
    this.player = new Board(makeRng(seed), makeRng(seed ^ 0x5bd1e995));
    this.pv = new BoardView(this.player);
    this.player.onEvent = (e) => this.handle(e, this.player, this.pv, true);
    if (mode === 'cpu') {
      this.cpu = new Board(makeRng(seed), makeRng(seed ^ 0x1234567));
      this.cv = new BoardView(this.cpu);
      this.cv.showGhost = false;
      this.cpu.onEvent = (e) => this.handle(e, this.cpu!, this.cv!, false);
      this.ai = new AiDriver(this.cpu, difficulty, makeRng(seed ^ 0xabcdef));
    }
    this.resize();
  }

  start() {
    this.player.start();
    this.cpu?.start();
    this.banner = { text: 'スタート！', t: 0, color: '#ef3b55' };
    sound.startBgm(128);
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    sound.stopBgm();
    this.player.softDrop = false;
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) sound.stopBgm();
    else {
      sound.startBgm(128 + this.level * 3);
      this.last = performance.now();
    }
  }

  get isPaused() {
    return this.paused;
  }

  // ---------- レイアウト ----------
  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const rect = this.canvas.getBoundingClientRect();
    this.cw = rect.width;
    this.ch = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    const top = 56; // HTML のトップバー分
    const bottom = 10;
    const AW = this.cw - 16;
    const AH = this.ch - top - bottom;
    // 盤面の幅 6w、高さ 12*0.866w ≈ 10.39w、ヘッダー 3.4w
    const w = Math.floor(Math.min(AW / 6.4, AH / (ROWS_H + 3.9)) * 2) / 2;
    const bw = 6 * w;
    const x = (this.cw - bw) / 2;
    this.hdr = { x, y: top, w: bw, h: w * 3.2 };
    const by = top + w * 3.2 + w * 0.65;
    this.pv.layout(x, by, w);
    if (this.cv) {
      const mw = Math.floor(w * 0.3 * 2) / 2;
      this.cv.layout(x + bw - mw * 6 - w * 0.05, top + w * 0.12, mw);
    }
  }

  // ---------- 入力 ----------
  input(action: 'left' | 'right' | 'swap' | 'hard' | 'softOn' | 'softOff') {
    if (this.paused || this.ended) return;
    sound.unlock();
    const b = this.player;
    switch (action) {
      case 'left':
        b.move(-1);
        break;
      case 'right':
        b.move(1);
        break;
      case 'swap':
        b.swap();
        break;
      case 'hard':
        b.hardDrop();
        break;
      case 'softOn':
        b.softDrop = true;
        break;
      case 'softOff':
        b.softDrop = false;
        break;
    }
  }

  moveTo(c: number) {
    if (this.paused || this.ended) return;
    this.player.moveTo(c);
  }

  get cellW() {
    return this.pv.w;
  }

  // ---------- イベント ----------
  private handle(e: GameEvent, b: Board, v: BoardView, isPlayer: boolean) {
    const opp = b === this.player ? this.cpu : this.player;
    const oppView = b === this.player ? this.cv : this.pv;
    switch (e.type) {
      case 'move':
        if (isPlayer) sound.se('move');
        break;
      case 'swap':
        if (isPlayer) sound.se('swap');
        break;
      case 'lock':
        if (isPlayer) {
          sound.se(e.hard ? 'hard' : 'lock');
          if (e.hard && e.dist > 2) v.shake = Math.max(v.shake, 0.25);
        }
        break;
      case 'clear': {
        const res = e.res;
        const all = [...res.cells, ...res.garbage];
        v.burst(all, b.grid, res.nigiri > 0 || e.chain >= 3 || res.nori);
        // 中心位置
        let sr = 0;
        let sc = 0;
        for (const i of res.cells) {
          sr += rowOf(i);
          sc += colOf(i);
        }
        const r = sr / res.cells.length;
        const c = sc / res.cells.length;
        const rr = Math.round(r);
        const cc = Math.round(c);
        if (res.nori) {
          v.popup('のり巻き！', rr, cc, '#1f6b46', 1.15, res.flavors.length ? `${FLAVORS[res.flavors[0]].name}をぜんぶ！` : undefined);
          v.flash = 0.8;
          if (isPlayer) sound.se('nori');
        }
        if (res.nigiri > 0) {
          v.popup(res.nigiri > 1 ? `にぎり×${res.nigiri}!!` : 'にぎり!!', rr - 1, cc, '#ff5a1f', 1.35, 'でっかいおにぎり完成');
          v.flash = Math.max(v.flash, 1);
          v.shake = Math.max(v.shake, 0.8);
        }
        if (e.chain >= 2) {
          v.popup(`${e.chain}れんさ!`, rr + (res.nigiri ? 1 : 0), cc, CHAIN_COLORS[Math.min(e.chain, CHAIN_COLORS.length - 1)], 1 + Math.min(0.6, e.chain * 0.08));
          v.shake = Math.max(v.shake, Math.min(1, 0.2 + e.chain * 0.15));
        }
        v.popup(`+${e.score}`, rr + 1, cc, '#7a4a2a', 0.55);
        if (isPlayer || !this.cv) {
          sound.clear(e.chain, res.nigiri > 0);
          vibrate(res.nigiri ? [20, 30, 40] : 15 + e.chain * 5);
        } else {
          sound.clear(Math.max(1, e.chain - 2), false);
        }
        // 攻撃
        let atk = e.attack;
        if (this.mode === 'solo') atk = 0;
        if (atk > 0) {
          const off = Math.min(b.pending, atk);
          b.pending -= off;
          atk -= off;
        }
        if (atk > 0 && opp && oppView) {
          const from = v.centroid(rr, cc);
          this.shots.push({
            x0: v.x + from.x,
            y0: v.y + from.y,
            x1: oppView.x + oppView.width / 2,
            y1: oppView.y + oppView.cellH,
            t: 0,
            dur: 0.5,
            amount: atk,
            to: opp,
          });
        }
        break;
      }
      case 'chainEnd':
        break;
      case 'order':
        if (isPlayer) {
          sound.se('order');
          this.banner = { text: '注文達成！のりが来るよ', t: 0, color: '#1f6b46' };
        }
        break;
      case 'garbageDrop':
        if (e.n > 0) {
          v.shake = Math.max(v.shake, 0.5 + Math.min(0.5, e.n / 20));
          if (isPlayer) {
            sound.se('garbage');
            vibrate(60);
          }
        }
        break;
      case 'gameover':
        this.finish(!isPlayer);
        break;
    }
  }

  private finish(win: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.endTimer = 0;
    this.player.softDrop = false;
    sound.stopBgm();
    sound.se(this.mode === 'solo' ? 'lose' : win ? 'win' : 'lose');
    this.banner = { text: this.mode === 'solo' ? 'おしまい！' : win ? 'かち！' : 'まけ…', t: 0, color: win ? '#ef3b55' : '#5a6b8a' };
  }

  // ---------- 更新 ----------
  private update(dt: number) {
    if (this.paused) return;
    if (!this.ended) this.time += dt;
    const p = this.player;
    const prevLevel = this.level;
    if (this.mode === 'solo') {
      this.level = 1 + Math.floor(p.totalCleared / 30);
      this.soloRainTimer += dt;
      if (this.level >= 3 && this.soloRainTimer > 24) {
        this.soloRainTimer = 0;
        p.pending += Math.min(8, this.level - 1);
      }
    } else {
      this.level = 1 + Math.floor(this.time / 35);
    }
    if (this.level !== prevLevel) {
      sound.setTempo(128 + this.level * 3);
      if (this.mode === 'solo') this.banner = { text: `レベル ${this.level}`, t: 0, color: '#2e8bf0' };
    }
    const interval = Math.max(0.06, 0.72 * Math.pow(0.86, this.level - 1));
    p.fallInterval = interval;
    if (this.cpu) this.cpu.fallInterval = interval;

    if (!this.ended) {
      p.update(dt);
      if (this.cpu) {
        this.ai!.update(dt);
        this.cpu.update(dt);
      }
    } else {
      this.endTimer += dt;
      if (this.endTimer > 1.6 && this.endTimer - dt <= 1.6) {
        this.onEnd({
          mode: this.mode,
          win: !p.dead,
          score: p.score,
          maxChain: p.maxChain,
          nigiri: p.nigiriCount,
          orders: p.ordersDone,
          time: this.time,
          difficulty: this.difficulty,
        });
      }
    }
    this.pv.update(dt);
    this.cv?.update(dt);
    for (const s of this.shots) {
      s.t += dt;
      if (s.t >= s.dur && s.amount > 0) {
        s.to.pending += s.amount;
        s.amount = 0;
      }
    }
    this.shots = this.shots.filter((s) => s.t < s.dur + 0.01);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 1.4) this.banner = null;
    }
    const d = p.danger();
    if (d > 0.4 && !this.ended) {
      this.dangerBeep += dt;
      if (this.dangerBeep > 0.6) {
        this.dangerBeep = 0;
        sound.se('danger');
      }
    }
  }

  // ---------- 描画 ----------
  private draw() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    const w = this.pv.w;

    this.drawHeader(ctx);
    this.drawPending(ctx, this.pv, this.player.pending);
    this.pv.draw(ctx, dpr, this.time);
    if (this.cv && this.cpu) {
      this.cv.draw(ctx, dpr, this.time);
      const label = { easy: 'CPU やさしい', normal: 'CPU ふつう', hard: 'CPU むずかしい' }[this.difficulty];
      ctx.font = `800 ${w * 0.24}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = this.cpu.pending > 0 ? '#c0392b' : '#c0703f';
      ctx.fillText(this.cpu.pending > 0 ? `おじゃま ${this.cpu.pending}` : label, this.cv.x + this.cv.width / 2, this.cv.y + this.cv.height + w * 0.42);
      if (this.cpu.dead) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(this.cv.x, this.cv.y, this.cv.width, this.cv.height);
      }
    }

    // 攻撃のたま
    for (const s of this.shots) {
      const k = Math.min(1, s.t / s.dur);
      const e = 1 - Math.pow(1 - k, 2);
      const x = s.x0 + (s.x1 - s.x0) * e;
      const y = s.y0 + (s.y1 - s.y0) * e - Math.sin(k * Math.PI) * w * 2;
      const rad = w * (0.25 + Math.min(0.35, s.amount * 0.03));
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2);
      g.addColorStop(0, 'rgba(255,255,220,1)');
      g.addColorStop(0.4, 'rgba(255,180,60,0.9)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // バナー
    if (this.banner) {
      const b = this.banner;
      const k = b.t / 1.4;
      const sc = k < 0.12 ? 0.5 + (k / 0.12) * 0.6 : k < 0.2 ? 1.1 - ((k - 0.12) / 0.08) * 0.1 : 1;
      const alpha = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
      const cx = this.pv.x + this.pv.width / 2;
      const cy = this.pv.y + this.pv.height * 0.4;
      ctx.save();
      ctx.globalAlpha = this.ended ? 1 : alpha;
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      const fs = Math.min(w * 0.85, (this.pv.width * 0.9) / Math.max(4, b.text.length));
      ctx.font = `900 ${fs}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = fs * 0.25;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, 0, 0);
      ctx.restore();
      if (this.ended) b.t = Math.min(b.t, 0.5);
    }
  }

  private drawPiece(ctx: CanvasRenderingContext2D, piece: Piece, x: number, y: number, w: number) {
    // x,y はピース外接矩形の左上
    const dpr = this.dpr;
    const draw = (v: number, up: boolean, px: number) => {
      const sp = getSprite(v, up, w, dpr);
      ctx.drawImage(sp.canvas, px - sp.pad, y - sp.pad, sp.canvas.width / dpr, sp.canvas.height / dpr);
    };
    if (piece.kind === 'nori') {
      draw(NORI, true, x + w * 0.25);
    } else {
      draw(piece.a, true, x);
      draw(piece.b, false, x + w / 2);
    }
  }

  private roundBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  private drawHeader(ctx: CanvasRenderingContext2D) {
    const w = this.pv.w;
    const { x, y } = this.hdr;
    const p = this.player;
    ctx.textBaseline = 'alphabetic';

    // NEXT
    const nx = x;
    const nw = w * 1.75;
    const nh = w * 2.45;
    this.roundBox(ctx, nx, y, nw, nh, w * 0.25, '#ffffff', '#f0c9a8');
    ctx.fillStyle = '#c0703f';
    ctx.font = `800 ${w * 0.28}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('つぎ', nx + nw / 2, y + w * 0.36);
    const pw = w * 0.85;
    if (p.queue[0]) this.drawPiece(ctx, p.queue[0], nx + (nw - pw * 1.5) / 2, y + w * 0.5, pw);
    const pw2 = w * 0.55;
    if (p.queue[1]) {
      ctx.globalAlpha = 0.65;
      this.drawPiece(ctx, p.queue[1], nx + (nw - pw2 * 1.5) / 2, y + w * 1.55, pw2);
      ctx.globalAlpha = 1;
    }

    // 注文チケット
    const ox = nx + nw + w * 0.15;
    const ow = this.cv ? w * 2.05 : w * 2.3;
    const oh = nh;
    this.roundBox(ctx, ox, y, ow, oh, w * 0.25, '#fffbe8', '#e6c46a');
    ctx.fillStyle = '#a0741a';
    ctx.font = `800 ${w * 0.28}px ${FONT}`;
    ctx.fillText('ご注文', ox + ow / 2, y + w * 0.36);
    const o = p.order;
    const sw = w * 0.8;
    const sp = getSprite(o.flavor, true, sw, this.dpr);
    ctx.drawImage(sp.canvas, ox + ow / 2 - sw / 2 - sp.pad, y + w * 0.5 - sp.pad, sp.canvas.width / this.dpr, sp.canvas.height / this.dpr);
    ctx.fillStyle = '#5a3a2a';
    ctx.font = `900 ${w * 0.3}px ${FONT}`;
    ctx.fillText(`${FLAVORS[o.flavor].name}`, ox + ow / 2, y + w * 1.55);
    // 進捗バー
    const bx = ox + w * 0.2;
    const bw2 = ow - w * 0.4;
    const by = y + w * 1.75;
    this.roundBox(ctx, bx, by, bw2, w * 0.24, w * 0.12, '#f3e3b5');
    const k = o.have / o.need;
    if (k > 0) this.roundBox(ctx, bx, by, Math.max(w * 0.24, bw2 * k), w * 0.24, w * 0.12, FLAVORS[o.flavor].base);
    ctx.font = `800 ${w * 0.22}px ${FONT}`;
    ctx.fillStyle = '#7a5a2a';
    ctx.fillText(`あと ${o.need - o.have}こ`, ox + ow / 2, by + w * 0.55);

    // 右側：CPU か スコア情報
    if (!this.cv) {
      const rx = ox + ow + w * 0.15;
      const rw = x + this.hdr.w - rx;
      this.roundBox(ctx, rx, y, rw, nh, w * 0.25, '#ffffff', '#f0c9a8');
      ctx.fillStyle = '#c0703f';
      ctx.font = `800 ${w * 0.26}px ${FONT}`;
      ctx.fillText('レベル', rx + rw / 2, y + w * 0.36);
      ctx.fillStyle = '#2e8bf0';
      ctx.font = `900 ${w * 0.7}px ${FONT}`;
      ctx.fillText(`${this.level}`, rx + rw / 2, y + w * 1.08);
      ctx.fillStyle = '#c0703f';
      ctx.font = `800 ${w * 0.22}px ${FONT}`;
      ctx.fillText(`さいだい ${p.maxChain}れんさ`, rx + rw / 2, y + w * 1.6);
      ctx.fillText(`にぎり ${p.nigiriCount}`, rx + rw / 2, y + w * 1.95);
      ctx.fillText(`注文 ${p.ordersDone}`, rx + rw / 2, y + w * 2.3);
    }

    // スコア行
    const sy = y + nh + w * 0.5;
    ctx.textAlign = 'left';
    ctx.font = `900 ${w * 0.36}px ${FONT}`;
    ctx.fillStyle = '#5a3a2a';
    ctx.fillText(`${p.score.toLocaleString()}`, x + w * 0.1, sy);
    ctx.textAlign = 'right';
    ctx.font = `800 ${w * 0.26}px ${FONT}`;
    ctx.fillStyle = '#c0703f';
    const mm = Math.floor(this.time / 60);
    const ss = Math.floor(this.time % 60)
      .toString()
      .padStart(2, '0');
    ctx.fillText(this.mode === 'cpu' ? `Lv${this.level}  ${mm}:${ss}` : `${mm}:${ss}`, (this.cv ? ox + ow : x + this.hdr.w - w * 0.1), sy);
  }

  /** おじゃま予告（盤面の上） */
  private drawPending(ctx: CanvasRenderingContext2D, v: BoardView, n: number) {
    if (n <= 0) return;
    const w = v.w;
    const icons: number[] = [];
    let rest = n;
    const units = [30, 6, 1];
    while (rest > 0 && icons.length < 7) {
      const u = units.find((u) => rest >= u) ?? 1;
      icons.push(u);
      rest -= u;
    }
    let x = v.x + v.width / 2 - (icons.length * w * 0.5) / 2;
    const y = v.y - w * 0.62;
    for (const u of icons) {
      const s = u === 30 ? w * 0.6 : u === 6 ? w * 0.5 : w * 0.34;
      const sp = getSprite(u === 30 ? GARBAGE : GARBAGE, true, s, this.dpr);
      const yy = y + (w * 0.55 - s * SQ3);
      ctx.drawImage(sp.canvas, x + (w * 0.5 - s) / 2 - sp.pad, yy - sp.pad, sp.canvas.width / this.dpr, sp.canvas.height / this.dpr);
      if (u === 30) {
        ctx.fillStyle = '#ffd21a';
        ctx.beginPath();
        ctx.arc(x + w * 0.25, yy, w * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      x += w * 0.5;
    }
  }
}

const ROWS_H = 12 * SQ3;
