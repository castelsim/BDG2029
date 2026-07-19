// js/fallback.js — feed simulato: stessa interfaccia eventi di MempoolFeed,
// usato quando la rete vera non è raggiungibile. Etichettato onestamente in pagina.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// intervallo fra blocchi: esponenziale con media 10 min, limitato [30 s, 40 min]
export function nextBlockDelayMs(rand) {
  const raw = -Math.log(1 - rand()) * 600_000;
  return Math.min(2_400_000, Math.max(30_000, Math.round(raw)));
}

// transazione plausibile: dimensioni tipiche reali, commissioni con coda alta rara
export function simTx(rand) {
  const r = rand();
  const vsize = r < 0.6 ? 110 + Math.round(rand() * 140)
    : r < 0.9 ? 250 + Math.round(rand() * 550)
    : 800 + Math.round(rand() * 3200);
  const feeRate = 0.2 + 60 * Math.pow(rand(), 3);
  return { vsize, feeRate };
}

export class SimFeed extends EventTarget {
  constructor(rand = mulberry32(Date.now() & 0xffffffff)) {
    super();
    this.rand = rand;
    this.timers = [];
    this.running = false;
    this.height = 958_800;
    this.fill = 0.2;
    this.pending = 60_000;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._txLoop();
    this._statsLoop();
    this._blockLoop();
  }

  stop() {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  _after(ms, fn) { this.timers.push(setTimeout(fn, ms)); }

  _txLoop() {
    if (!this.running) return;
    const tx = simTx(this.rand);
    this._emit('tx', tx);
    this.pending += 1;
    this.fill = Math.min(1, this.fill + tx.vsize / 1_000_000);
    this._after(120 + this.rand() * 500, () => this._txLoop());
  }

  _statsLoop() {
    if (!this.running) return;
    this._emit('projected', { fillRatio: this.fill, feeFloor: 0.2 + this.fill * 2, medianFee: 1 });
    this._emit('stats', { pending: Math.round(this.pending), vps: 3000 });
    this._after(5000, () => this._statsLoop());
  }

  _blockLoop() {
    if (!this.running) return;
    this._after(nextBlockDelayMs(this.rand), () => {
      if (!this.running) return;
      this.height += 1;
      this._emit('block', {
        height: this.height,
        txCount: 3000 + Math.round(this.rand() * 3000),
        weight: 3_990_000,
        totalFees: 900_000,
        timestampMs: Date.now(),
      });
      this.fill = 0.05;
      this.pending = Math.max(20_000, this.pending - 5000);
      this._blockLoop();
    });
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
