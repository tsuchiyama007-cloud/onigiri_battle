// 効果音・BGM は WebAudio で合成（音声ファイル不要・オフラインでも鳴る）

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  seOn = true;
  bgmOn = true;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private nextNoteTime = 0;
  private tempo = 132;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.22;
      this.bgmGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slide = 0, dest?: AudioNode) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, when = 0, freq = 800) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  private midi(n: number) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  se(name: 'move' | 'swap' | 'lock' | 'hard' | 'garbage' | 'order' | 'win' | 'lose' | 'select' | 'nori' | 'danger') {
    if (!this.seOn || !this.ctx) return;
    switch (name) {
      case 'move':
        this.tone(880, 0.03, 'square', 0.05);
        break;
      case 'swap':
        this.tone(660, 0.06, 'triangle', 0.15, 0, 1.5);
        break;
      case 'lock':
        this.tone(220, 0.08, 'sine', 0.25, 0, 0.6);
        break;
      case 'hard':
        this.noise(0.12, 0.25, 0, 600);
        this.tone(160, 0.12, 'sine', 0.35, 0, 0.5);
        break;
      case 'garbage':
        for (let i = 0; i < 3; i++) this.tone(110 - i * 10, 0.12, 'square', 0.12, i * 0.05, 0.7);
        this.noise(0.25, 0.25, 0, 400);
        break;
      case 'order':
        [72, 76, 79, 84].forEach((n, i) => this.tone(this.midi(n), 0.16, 'triangle', 0.22, i * 0.07));
        break;
      case 'nori':
        [84, 88, 91, 96, 100].forEach((n, i) => this.tone(this.midi(n), 0.12, 'sine', 0.2, i * 0.04));
        this.noise(0.3, 0.1, 0, 4000);
        break;
      case 'win':
        [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this.tone(this.midi(n), 0.2, 'triangle', 0.25, i * 0.11));
        break;
      case 'lose':
        [67, 64, 60, 55].forEach((n, i) => this.tone(this.midi(n), 0.3, 'triangle', 0.22, i * 0.18));
        break;
      case 'select':
        this.tone(this.midi(79), 0.08, 'triangle', 0.2);
        this.tone(this.midi(86), 0.1, 'triangle', 0.18, 0.06);
        break;
      case 'danger':
        this.tone(this.midi(81), 0.08, 'square', 0.06);
        break;
    }
  }

  /** 連鎖が伸びるほど音程が上がる */
  clear(chain: number, nigiri: boolean) {
    if (!this.seOn || !this.ctx) return;
    const base = 64 + PENTA[Math.min(chain - 1, PENTA.length - 1)];
    this.tone(this.midi(base), 0.18, 'triangle', 0.28);
    this.tone(this.midi(base + 7), 0.18, 'sine', 0.18, 0.05);
    this.tone(this.midi(base + 12), 0.22, 'sine', 0.12, 0.1);
    this.noise(0.08, 0.08, 0, 3000);
    if (nigiri) {
      [0, 4, 7, 12, 16].forEach((d, i) => this.tone(this.midi(base + d), 0.14, 'square', 0.08, 0.12 + i * 0.05));
    }
  }

  // ---- BGM（ゆるい和風ペンタトニックのループ）----
  private melody = [
    76, 0, 79, 81, 79, 0, 76, 74, 72, 0, 74, 76, 74, 0, 0, 0,
    76, 0, 79, 81, 84, 0, 81, 79, 76, 0, 79, 76, 74, 0, 0, 0,
    81, 0, 84, 0, 86, 84, 81, 0, 79, 0, 81, 79, 76, 0, 74, 0,
    72, 0, 74, 76, 79, 0, 76, 74, 72, 0, 0, 0, 72, 0, 0, 0,
  ];
  private bass = [48, 55, 52, 55, 45, 52, 48, 52, 41, 48, 45, 48, 43, 50, 47, 50];

  startBgm(tempo = 132) {
    this.tempo = tempo;
    if (!this.ctx || this.bgmTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.bgmStep = 0;
    this.bgmTimer = window.setInterval(() => this.schedule(), 50);
  }

  setTempo(t: number) {
    this.tempo = t;
  }

  stopBgm() {
    if (this.bgmTimer !== null) clearInterval(this.bgmTimer);
    this.bgmTimer = null;
  }

  private schedule() {
    if (!this.ctx || !this.bgmGain) return;
    const stepDur = 60 / this.tempo / 2;
    while (this.nextNoteTime < this.ctx.currentTime + 0.15) {
      const when = this.nextNoteTime - this.ctx.currentTime;
      if (this.bgmOn) {
        const m = this.melody[this.bgmStep % this.melody.length];
        if (m) this.tone(this.midi(m), stepDur * 1.6, 'triangle', 0.35, when, 0, this.bgmGain);
        if (this.bgmStep % 2 === 0) {
          const bn = this.bass[(this.bgmStep / 2) % this.bass.length];
          this.tone(this.midi(bn), stepDur * 1.8, 'sine', 0.5, when, 0, this.bgmGain);
        }
        if (this.bgmStep % 4 === 2) this.noiseTo(0.04, 0.12, when);
      }
      this.nextNoteTime += stepDur;
      this.bgmStep++;
    }
  }

  private noiseTo(dur: number, vol: number, when: number) {
    if (!this.ctx || !this.bgmGain) return;
    const t = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 5000;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.bgmGain);
    src.start(t);
  }
}

export const sound = new Sound();

export function vibrate(ms: number | number[]) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* 非対応端末 */
  }
}
