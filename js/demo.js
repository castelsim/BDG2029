// js/demo.js — scena v2: anello-timer, blocco in formazione, competizione della mempool
import {
  feeTier, particleColor, particleRadius, haloAlpha,
  ringProgress, capSelected, evictionIndex,
} from './mapping.js';
import { mulberry32 } from './fallback.js';

const TAU = Math.PI * 2;
const BEAT = { BLACKOUT: 150, FALL: 1200, BANG: 900, QUIET: 3000 }; // ms
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
    // correnti interne della galassia: 12 campi lenti condivisi per settore angolare
    // (addensamenti migranti, microflussi radiali, variazioni di luce — periodi 2–6 min)
    this.currents = Array.from({ length: 12 }, (_, j) => ({
      w1: 0.000028 + (j % 4) * 0.000012 + Math.random() * 0.00002,
      p1: Math.random() * TAU,
      w2: 0.00002 + Math.random() * 0.000024,
      p2: Math.random() * TAU,
      w3: 0.000014 + Math.random() * 0.000019,
      p3: Math.random() * TAU,
    }));
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
    if (this.bands) this._buildCrowd();
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
      angSpeed: 0.05 + t * 0.12, // rad/s — tutte nello stesso verso della galassia
      orbit: this.R * (1.12 + (1 - t) * 0.6) * (0.94 + Math.random() * 0.12),
      inner: 0,
      r: this.R * 2.4,
      alpha: 0,
      flash: 0,
      dimTil: 0,
    });
  }

  // soglia e capienza dal blocco proiettato reale (o simulato)
  setBlock(feeFloor, fillRatio) {
    this.threshold = feeTier(feeFloor);
    this.capSel = capSelected(fillRatio);
    this._reconcile();
  }

  // la galassia della fila: campione animato della coda reale (una fascia per blocco
  // proiettato). Ogni punto rappresenta ~total/N transazioni; il conteggio vero sta in legenda.
  setCrowd(bands) {
    if (!Array.isArray(bands) || bands.length === 0) return;
    this.bands = bands;
    const now = performance.now();
    if (!this._crowdAt || now - this._crowdAt > 60_000) this._buildCrowd();
  }

  _buildCrowd() {
    this._crowdAt = performance.now();
    const bands = this.bands;
    const N = this.max >= 900 ? 2600 : 900; // campione: desktop / mobile
    const nBands = bands.length;
    if (nBands < 2) return;
    // la fascia 0 è il prossimo blocco: vive DENTRO l'anello (particelle selezionate),
    // non nella galassia. La fila inizia da chi aspetta i blocchi successivi.
    let queueTotal = 0;
    for (let i = 1; i < nBands; i++) queueTotal += bands[i].nTx;
    if (queueTotal === 0) return;
    // la fila copre TUTTO lo schermo: dal bordo dell'anello fino agli angoli
    const rIn = this.R * 1.15;
    const rOut = Math.hypot(this.cx, this.cy) * 1.02;
    const span = rOut - rIn;
    const dots = [];
    for (let i = 1; i < nBands; i++) {
      const b = bands[i];
      const rand = mulberry32(1000 + i); // seed fisso: il campione non «salta» tra un rebuild e l'altro
      const n = Math.round((b.nTx / queueTotal) * N);
      const qi = (i - 1) / (nBands - 1);
      const rBase = rIn + qi * span;
      const thick = (span / (nBands - 1)) * 1.6;
      const depth = (i - 1) / (nBands - 2 || 1); // 0 = subito dopo il prossimo blocco · 1 = fondo
      for (let j = 0; j < n; j++) {
        const fee = b.feeMin + (b.feeMax - b.feeMin) * rand() * rand(); // il grosso vicino al minimo
        const r = rBase + ((rand() + rand()) / 2) * thick;
        const ang = rand() * TAU;
        dots.push({
          r,
          ang,
          // stessa legge differenziale delle particelle vive: un sistema solo
          w: 0.022 * Math.pow(this.R / r, 1.5) * (0.85 + rand() * 0.3),
          color: particleColor(feeTier(fee)),
          s: Math.min(2.6, 0.8 + particleRadius(b.vsizePerTx * (0.5 + rand())) * 0.35 + rand() * 0.6),
          ph: rand() * TAU,
          twf: 0.25 + (1 - depth) * 0.9 + rand() * 0.2, // le dormienti scintillano piano
          a: 0.3 + (1 - depth) * 0.22, // continuità di luminosità con le vive
          cur: Math.floor((ang / TAU) * 12) % 12, // corrente del proprio settore
          depth,
          band: i,
          fade: 0,
        });
      }
    }
    this.crowd = dots;
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
    p.flash = performance.now(); // impulso di favore: si illumina ed entra decisa
  }

  _evict(p) {
    p.state = 'evicted';
    p.evictedAt = performance.now();
    p.dimTil = performance.now() + 10_000; // perde energia: torna in coda spenta
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
    } else {
      // capienza piena: chi offre di più scalza chi offre meno (sostituzione
      // fino all'ultimo istante; margine anti-sfarfallio tra fee quasi uguali)
      const cand = this.particles
        .filter((p) => p.state === 'waiting' && p.t >= this.threshold)
        .sort((a, b) => b.t - a.t)
        .slice(0, 12);
      if (cand.length) {
        const sel = this.particles
          .filter((p) => p.state === 'selected')
          .sort((a, b) => a.t - b.t);
        let ci = 0;
        for (const worst of sel) {
          if (ci >= cand.length || cand[ci].t <= worst.t + 0.02) break;
          this._evict(worst);
          this._promote(cand[ci]);
          ci++;
        }
      }
    }
  }

  // blocco reale trovato: le selezionate vengono confermate e assorbite, il ciclo riparte
  triggerBeat() {
    this.beat = { t0: performance.now() };
    this.cycleStart = this.beat.t0;
    for (const p of this.particles) {
      if (p.state === 'selected') p.state = 'confirmed';
    }
    // la prima fila della galassia diventa il nuovo blocco in formazione: sparisce
    // nel blackout, e la galassia si ricostruisce presto sui dati nuovi
    if (this.crowd) this.crowd = this.crowd.filter((d) => d.band !== 1);
    this._crowdAt = 0;
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
        // gravità: l'ingresso curva a spirale verso il centro, più forte da vicino
        p.ang += 0.09 * (this.R / Math.max(p.r, 1)) * dt / 1000;
        if (Math.abs(p.r - p.orbit) < this.R * 0.06) p.state = 'waiting';
        break;
      case 'waiting':
        // stessa legge di rotazione differenziale della galassia: un sistema solo;
        // compressione verso il nucleo con la fee e con la tensione dell'attesa
        target = p.orbit * (1 - 0.04 * p.t - 0.03 * this.tension);
        p.ang += 0.022 * Math.pow(this.R / Math.max(p.r, 1), 1.5) * (0.9 + p.t) * dt / 1000;
        break;
      case 'selected':
        target = p.inner;
        // appena promossa accelera decisa verso il blocco, poi si assesta
        ease = p.flash && now - p.flash < 700 ? 0.0045 : 0.002;
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

    // fasi del battito: blackout → collasso → BIG BANG → quiete
    const bangStart = BEAT.BLACKOUT + BEAT.FALL;
    const bangT = beatT - bangStart;
    const inBang = bangT >= 0 && bangT < BEAT.BANG;
    const quiet = beatT >= bangStart + BEAT.BANG;
    const dim = quiet ? 0.35 : 1;

    // onda d'urto del big bang: raggio e intensità
    let waveR = -1;
    let waveGlow = 0;
    if (inBang) {
      const k = bangT / BEAT.BANG;
      waveR = (1 - Math.pow(1 - k, 3)) * Math.max(this.w, this.h) * 0.72;
      waveGlow = Math.pow(1 - k, 1.4);
    }

    // la galassia della fila: punti individuali in lenta orbita differenziale;
    // al passaggio dell'onda d'urto, la fila si illumina
    if (this.crowd) {
      const crowdDim = quiet ? 0.25 : 1;
      // campi lenti delle correnti, calcolati una volta per frame
      const cf = this.currents.map((c) => ({
        lum: 0.78 + 0.22 * Math.sin(now * c.w1 + c.p1),
        rad: 7 * Math.sin(now * c.w2 + c.p2),
        angO: 0.02 * Math.sin(now * c.w3 + c.p3),
      }));
      for (const d of this.crowd) {
        d.ang += (d.w * dt) / 1000;
        if (d.fade < 1) d.fade = Math.min(1, d.fade + dt * 0.0005);
        const f = cf[d.cur];
        const agit = 0.35 + 0.65 * (1 - d.depth); // interno agitato, fondo quasi immobile
        const tw = 0.55 + 0.45 * Math.sin(d.ph + now * 0.001 * d.twf);
        const rr = d.r + 2 * Math.sin(d.ph * 1.7 + now * 0.0004) + f.rad * agit;
        const aa = d.ang + f.angO * agit;
        let a = d.a * tw * d.fade * crowdDim * (1 - agit * (1 - f.lum));
        if (waveR > 0) {
          const dist = Math.abs(rr - waveR);
          if (dist < 70) a = Math.min(1, a + ((1 - dist / 70) * 0.8 + 0.1) * waveGlow);
        }
        ctx.globalAlpha = a;
        ctx.fillStyle = d.color;
        ctx.fillRect(this.cx + Math.cos(aa) * rr, this.cy + Math.sin(aa) * rr, d.s, d.s);
      }
      ctx.globalAlpha = 1;
    }

    // particelle: scia (valore, solo in movimento) + nucleo (fee)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (this._updateParticle(p, now, dt)) { this.particles.splice(i, 1); continue; }
      const x = this.cx + Math.cos(p.ang) * p.r;
      const y = this.cy + Math.sin(p.ang) * p.r;
      const tw = 0.55 + 0.45 * Math.sin(p.born + now * 0.001 * (0.6 + p.t * 1.6));
      let a = Math.max(0, p.alpha * tw * dim);
      if (waveR > 0) {
        const dist = Math.abs(p.r - waveR);
        if (dist < 70) a = Math.min(1, a + (1 - dist / 70) * 0.7 * waveGlow);
      }
      // selezione leggibile: impulso di favore alla promozione, energia persa all'espulsione
      if (p.flash) {
        const ft = now - p.flash;
        if (ft < 600) a = Math.min(1, a + 0.5 * (1 - ft / 600));
      }
      if (p.dimTil > now) a *= 0.55 + 0.45 * (1 - (p.dimTil - now) / 10_000);

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

    // BIG BANG: lampo centrale, scintille di luce, onda d'urto. Energia, non transazioni:
    // ciò che è entrato nel blocco resta assorbito per sempre.
    if (inBang && !this.reduced) {
      if (!this.beat.sparks) {
        const nS = this.max >= 900 ? 90 : 40;
        this.beat.sparks = Array.from({ length: nS }, () => ({
          ang: Math.random() * TAU,
          sp: (2.5 + Math.random() * 9) * (this.R / 240),
          dist: this.R * 0.05,
          w: Math.random() < 0.7 ? 1.2 : 2,
          col: Math.random() < 0.55 ? '#ffffff' : RING,
        }));
      }
      for (const sk of this.beat.sparks) {
        sk.dist += (sk.sp * dt) / 16.7;
        const sx = this.cx + Math.cos(sk.ang) * sk.dist;
        const sy = this.cy + Math.sin(sk.ang) * sk.dist;
        const tail = Math.min(60, sk.sp * 7);
        const bx = this.cx + Math.cos(sk.ang) * Math.max(0, sk.dist - tail);
        const by = this.cy + Math.sin(sk.ang) * Math.max(0, sk.dist - tail);
        const g = ctx.createLinearGradient(sx, sy, bx, by);
        g.addColorStop(0, sk.col);
        g.addColorStop(1, 'rgba(5, 5, 6, 0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = sk.w;
        ctx.lineCap = 'round';
        ctx.globalAlpha = waveGlow;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // onda d'urto
      ctx.strokeStyle = `rgba(255, 232, 200, ${0.75 * waveGlow})`;
      ctx.lineWidth = 2 + 14 * waveGlow;
      ctx.shadowColor = RING;
      ctx.shadowBlur = 30 * waveGlow;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, waveR, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (inBang) {
      // lampo centrale (unica parte mantenuta anche con reduced motion, attenuata)
      const k = bangT / BEAT.BANG;
      const soft = this.reduced ? 0.35 : 1;
      const fr = this.R * (0.3 + 2.4 * (1 - Math.pow(1 - k, 2)));
      const fg = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, fr);
      fg.addColorStop(0, `rgba(255, 255, 255, ${soft * Math.pow(1 - k, 1.2)})`);
      fg.addColorStop(0.4, `rgba(255, 220, 170, ${0.7 * soft * Math.pow(1 - k, 1.4)})`);
      fg.addColorStop(1, 'rgba(255, 178, 94, 0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, this.w, this.h);
      // ACCECAMENTO: lavaggio bianco a tutto schermo, decade in fretta
      if (!this.reduced) {
        const wash = 0.95 * Math.pow(1 - k, 3);
        if (wash > 0.01) {
          ctx.fillStyle = `rgba(255, 252, 246, ${wash})`;
          ctx.fillRect(0, 0, this.w, this.h);
        }
      }
    }

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
    // fasi dell'anello: quieto → presente (75–100%) → PIENO: respiro sempre più affannoso
    const holding = arc >= 1 && beatT < 0;
    const adv = Math.max(0, Math.min(1, (arc - 0.75) / 0.25)); // fase avanzata pre-completamento
    const breathT = holding ? this.tension : 0;
    const amp = holding ? 0.06 + 0.18 * breathT : 0.03 + 0.03 * adv;
    const period = holding ? Math.max(2200, 9000 - 6500 * breathT) : 12000 - 5000 * adv;
    const breath = Math.sin((now / period) * TAU);
    // micro-sfarfallio controllato della fase avanzata (mai con reduced motion)
    const jitter = adv > 0 && !this.reduced
      ? 1 + 0.08 * adv * Math.sin(now * 0.046) * Math.sin(now * 0.0071)
      : 1;
    const pulse = (1 + amp * breath) * jitter;

    if (arc > 0.003) {
      ctx.lineWidth = (flash ? 9 : 3 + (holding ? 1.2 * breathT * (0.5 + 0.5 * breath) : 0)) * pulse;
      ctx.strokeStyle = flash ? '#ffffff' : RING;
      ctx.shadowColor = flash ? '#ffffff' : RING;
      // a cerchio pieno la luce si gonfia col respiro
      ctx.shadowBlur = flash ? 80 : 16 + (holding ? (12 + 22 * breathT) * (0.5 + 0.5 * breath) : 0);
      ctx.globalAlpha = quiet ? 0.15 : 0.88 + (holding ? 0.12 * (0.5 + 0.5 * breath) : 0) * 0.9;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.R, -TAU / 4, -TAU / 4 + TAU * Math.min(1, arc));
      ctx.stroke();
      // punta luminosa dell'arco (sparisce a cerchio completo; instabile in fase avanzata)
      if (!flash && !quiet && arc < 1) {
        const tip = -TAU / 4 + TAU * arc;
        const tipR = this.R + (adv > 0 && !this.reduced ? 1.5 * adv * Math.sin(now * 0.031) : 0);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.cx + Math.cos(tip) * tipR, this.cy + Math.sin(tip) * tipR, 2.4 * pulse, 0, TAU);
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

    if (beatT > BEAT.BLACKOUT + BEAT.FALL + BEAT.BANG + BEAT.QUIET) this.beat = null;
  }
}
