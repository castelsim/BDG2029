// js/demo.js — scena v2: anello-timer, blocco in formazione, competizione della mempool
import {
  feeTier, particleColor, particleRadius, haloAlpha,
  ringProgress, capSelected, evictionIndex,
} from './mapping.js';
import { mulberry32 } from './fallback.js';

const TAU = Math.PI * 2;
const BEAT = { BLACKOUT: 150, FALL: 1200, QUIET: 3000 }; // ms
const RING = 'rgb(255, 178, 94)'; // l'anello resta ambra

export class Scene {
  constructor(canvas, { maxParticles = 900, reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.max = maxParticles;
    this.reduced = reducedMotion;
    this.particles = [];
    this.threshold = 1;   // tier minimo per il blocco (dal feeFloor reale)
    this.capSel = 0;      // posti visivi nel blocco (dal riempimento reale)
    this.tension = 0;
    this.cycleStart = performance.now(); // reset a ogni blocco reale
    this.beat = null;     // {t0} durante l'animazione del battito
    this.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.w = w; this.h = h;
    this.cx = w / 2;
    this.cy = h * 0.5;
    this.R = Math.min(w, h) * 0.28;
    if (this.bands) { this._crowdAt = 0; this._drawCrowd(); }
  }

  // ancora l'anello-timer al tempo reale già trascorso dall'ultimo blocco
  seedCycle(elapsedMs) {
    this.cycleStart = performance.now() - Math.min(600_000, Math.max(0, elapsedMs));
  }

  addTx({ vsize, feeRate, value }) {
    if (this.particles.length >= this.max) {
      const idx = evictionIndex(this.particles.map((p) => ({
        tier: p.t,
        age: performance.now() - p.born,
        selected: p.state === 'selected' || p.state === 'confirmed',
      })));
      if (idx >= 0) this.particles.splice(idx, 1);
      else return; // tutte protette: si rinuncia alla nuova (caso limite)
    }
    const t = feeTier(feeRate);
    this.particles.push({
      t,
      rad: particleRadius(vsize),
      color: particleColor(t),
      halo: haloAlpha(value),
      born: performance.now(),
      state: 'arriving', // arriving | waiting | selected | evicted | confirmed
      ang: Math.random() * TAU,
      angSpeed: (0.05 + t * 0.12) * (Math.random() < 0.5 ? 1 : -1), // rad/s
      orbit: this.R * (1.12 + (1 - t) * 0.6) * (0.94 + Math.random() * 0.12),
      inner: 0,
      r: this.R * 2.4,
      alpha: 0,
    });
  }

  // soglia e capienza dal blocco proiettato reale (o simulato)
  setBlock(feeFloor, fillRatio) {
    this.threshold = feeTier(feeFloor);
    this.capSel = capSelected(fillRatio);
    this._reconcile();
  }

  // lo strato-folla: TUTTA la coda reale, una fascia per blocco proiettato.
  // Ridisegnato su canvas fuori schermo al massimo ogni 20 s (è un'immagine, non particelle).
  setCrowd(bands) {
    if (!Array.isArray(bands) || bands.length === 0) return;
    this.bands = bands;
    const now = performance.now();
    if (!this._crowdAt || now - this._crowdAt > 20_000) this._drawCrowd();
  }

  _drawCrowd() {
    this._crowdAt = performance.now();
    const bands = this.bands;
    const off = this._crowd || (this._crowd = document.createElement('canvas'));
    if (off.width !== this.w || off.height !== this.h) { off.width = this.w; off.height = this.h; }
    const c = off.getContext('2d');
    c.clearRect(0, 0, this.w, this.h);
    let total = 0;
    for (const b of bands) total += b.nTx;
    const budget = Math.min(120_000, total);
    const scale = budget / Math.max(1, total);
    const nBands = bands.length;
    for (let i = 0; i < nBands; i++) {
      const b = bands[i];
      const rand = mulberry32(1000 + i); // seed fisso: la nube non «salta» tra un ridisegno e l'altro
      const n = Math.round(b.nTx * scale);
      const rBase = this.R * (1.18 + (i / nBands) * 1.15);
      const thick = this.R * (1.15 / nBands) * 1.6; // fasce sovrapposte: nube, non bersaglio
      // 5 secchielli di colore per fascia: fillStyle cambia 5 volte, non n volte
      for (let k = 0; k < 5; k++) {
        const fee = b.feeMin + ((b.feeMax - b.feeMin) * k * k) / 16; // quadratica: il grosso vicino al minimo
        c.fillStyle = particleColor(feeTier(fee));
        c.globalAlpha = 0.33;
        const nk = Math.ceil(n / 5);
        for (let j = 0; j < nk; j++) {
          const ang = rand() * TAU;
          const r = rBase + ((rand() + rand()) / 2) * thick; // bordi morbidi
          const s = rand() < 0.85 ? 1 : 2;
          c.fillRect(this.cx + Math.cos(ang) * r, this.cy + Math.sin(ang) * r, s, s);
        }
      }
    }
    c.globalAlpha = 1;
  }

  setTension(t) { this.tension = t; }

  _selectedCount() {
    let n = 0;
    for (const p of this.particles) if (p.state === 'selected') n++;
    return n;
  }

  _promote(p) {
    p.state = 'selected';
    p.inner = this.R * (0.18 + Math.random() * 0.62);
  }

  _evict(p) {
    p.state = 'evicted';
    p.evictedAt = performance.now();
  }

  // la selezione non è definitiva: promozioni ed espulsioni a ogni aggiornamento di soglia
  _reconcile() {
    for (const p of this.particles) {
      if (p.state === 'selected' && p.t < this.threshold) this._evict(p);
    }
    let free = this.capSel - this._selectedCount();
    if (free > 0) {
      const candidates = this.particles
        .filter((p) => p.state === 'waiting' && p.t >= this.threshold)
        .sort((a, b) => b.t - a.t);
      for (const p of candidates.slice(0, free)) this._promote(p);
    } else if (free < 0) {
      const sel = this.particles
        .filter((p) => p.state === 'selected')
        .sort((a, b) => a.t - b.t);
      for (const p of sel.slice(0, -free)) this._evict(p);
    }
  }

  // blocco reale trovato: le selezionate vengono confermate e assorbite, il ciclo riparte
  triggerBeat() {
    this.beat = { t0: performance.now() };
    this.cycleStart = this.beat.t0;
    for (const p of this.particles) {
      if (p.state === 'selected') p.state = 'confirmed';
    }
  }

  stats() {
    const s = { arriving: 0, waiting: 0, selected: 0, evicted: 0, confirmed: 0, forgotten: 0 };
    const now = performance.now();
    for (const p of this.particles) {
      s[p.state]++;
      if (p.t < 0.25 && now - p.born > 600_000) s.forgotten++;
    }
    return s;
  }

  _updateParticle(p, now, dt) {
    p.alpha = Math.min(1, p.alpha + dt * 0.0015);
    let target = p.orbit;
    let ease = 0.0009;
    switch (p.state) {
      case 'arriving':
        ease = 0.0014;
        if (Math.abs(p.r - p.orbit) < this.R * 0.06) p.state = 'waiting';
        break;
      case 'waiting':
        p.ang += p.angSpeed * (0.4 + p.t) * dt / 1000;
        break;
      case 'selected':
        target = p.inner;
        ease = 0.002;
        p.ang += p.angSpeed * 0.35 * dt / 1000;
        break;
      case 'evicted': {
        // spinta visibile verso l'esterno, poi rientro in attesa
        const since = now - p.evictedAt;
        target = p.orbit * 1.22;
        ease = 0.004;
        if (since > 900) p.state = 'waiting';
        break;
      }
      case 'confirmed':
        target = 0;
        ease = 0.006;
        p.alpha -= dt * 0.0011;
        break;
    }
    p.r += (target - p.r) * Math.min(1, dt * ease);
    return p.state === 'confirmed' && (p.alpha <= 0 || p.r < this.R * 0.03);
  }

  render(now, dt) {
    const ctx = this.ctx;
    const beatT = this.beat ? now - this.beat.t0 : -1;

    // ritorno da tab in pausa: niente scie sul frame di recupero (salti di posizione enormi)
    if (dt >= 90) for (const p of this.particles) p.px = undefined;

    ctx.fillStyle = 'rgba(5, 5, 6, 0.4)';
    ctx.fillRect(0, 0, this.w, this.h);

    if (beatT >= 0 && beatT < BEAT.BLACKOUT && !this.reduced) {
      ctx.fillStyle = '#050506';
      ctx.fillRect(0, 0, this.w, this.h);
      return;
    }

    const quiet = beatT > BEAT.BLACKOUT + BEAT.FALL;
    const dim = quiet ? 0.35 : 1;

    // la nube della fila vera: deriva lentissima, respiro leggero
    if (this._crowd) {
      ctx.save();
      ctx.globalAlpha = (quiet ? 0.12 : 0.5) * (0.85 + 0.15 * Math.sin((now / 9000) * TAU));
      ctx.translate(this.cx, this.cy);
      ctx.rotate(now * 0.0000025); // ~un giro in 42 minuti
      ctx.drawImage(this._crowd, -this.cx, -this.cy);
      ctx.restore();
    }

    // particelle: scia (valore, solo in movimento) + nucleo (fee)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (this._updateParticle(p, now, dt)) { this.particles.splice(i, 1); continue; }
      const x = this.cx + Math.cos(p.ang) * p.r;
      const y = this.cy + Math.sin(p.ang) * p.r;
      const tw = 0.55 + 0.45 * Math.sin(p.born + now * 0.001 * (0.6 + p.t * 1.6));
      const a = Math.max(0, p.alpha * tw * dim);

      // scia-cometa: lunghezza e luminosità = valore trasferito (scala log via halo);
      // appare solo nei movimenti veri (ingresso, espulsione, ingresso nel blocco),
      // mai nell'orbita di attesa: il gating è la velocità reale della particella.
      if (p.px !== undefined && !this.reduced) {
        const dx = x - p.px, dy = y - p.py;
        const speed = Math.hypot(dx, dy) / Math.max(1, dt) * 16.7; // px per frame a 60 fps
        if (speed > 1.4) {
          const len = Math.min(90, speed * (3 + p.halo * 24));
          const bx = x - (dx / Math.hypot(dx, dy)) * len;
          const by = y - (dy / Math.hypot(dx, dy)) * len;
          const grad = ctx.createLinearGradient(x, y, bx, by);
          grad.addColorStop(0, p.color);
          grad.addColorStop(1, 'rgba(5, 5, 6, 0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = p.rad * 1.5;
          ctx.lineCap = 'round';
          ctx.globalAlpha = a * (0.2 + 0.65 * p.halo);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }
      p.px = x; p.py = y;

      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.rad, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // anello base
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.R, 0, TAU);
    ctx.stroke();

    // arco: timer narrativo (90% in 10 min + respiro), o animazione del battito
    let arc = ringProgress(now - this.cycleStart);
    let flash = false;
    if (beatT >= BEAT.BLACKOUT && beatT < BEAT.BLACKOUT + 300) {
      arc = 1; flash = true;
    } else if (beatT >= BEAT.BLACKOUT + 300 && beatT < BEAT.BLACKOUT + BEAT.FALL) {
      arc = 1 - (beatT - BEAT.BLACKOUT - 300) / (BEAT.FALL - 300);
    } else if (quiet) {
      arc = 0;
    }
    const holding = arc >= 0.9 && beatT < 0;
    const amp = holding ? 0.05 + 0.07 * this.tension : 0.03;
    const period = 12000 - 6000 * this.tension;
    const pulse = 1 + amp * Math.sin((now / period) * TAU);

    if (arc > 0.003) {
      ctx.lineWidth = (flash ? 6 : 3) * pulse;
      ctx.strokeStyle = flash ? '#ffffff' : RING;
      ctx.shadowColor = RING;
      ctx.shadowBlur = flash ? 45 : 16;
      ctx.globalAlpha = quiet ? 0.15 : 0.9;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.R, -TAU / 4, -TAU / 4 + TAU * Math.min(1, arc));
      ctx.stroke();
      // punta luminosa dell'arco
      if (!flash && !quiet) {
        const tip = -TAU / 4 + TAU * Math.min(1, arc);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.cx + Math.cos(tip) * this.R, this.cy + Math.sin(tip) * this.R, 2.4 * pulse, 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // vignettatura di tensione
    const vig = ctx.createRadialGradient(
      this.cx, this.cy, this.R,
      this.cx, this.cy, Math.max(this.w, this.h) * 0.75,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${0.25 + 0.45 * this.tension})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.w, this.h);

    if (beatT > BEAT.BLACKOUT + BEAT.FALL + BEAT.QUIET) this.beat = null;
  }
}
