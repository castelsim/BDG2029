// js/demo.js — scena canvas: particelle (transazioni), anello (prossimo blocco), battito
import { feeTier, particleColor, particleRadius } from './mapping.js';

const TAU = Math.PI * 2;
const BEAT = { BLACKOUT: 150, FALL: 1200, QUIET: 3000 }; // ms

export class Scene {
  constructor(canvas, { maxParticles = 800, reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.max = maxParticles;
    this.reduced = reducedMotion;
    this.particles = [];
    this.ringFill = 0;      // valore dal feed
    this.ringShown = 0;     // valore animato (slew)
    this.ringColor = particleColor(0);
    this.tension = 0;
    this.beat = null;       // {t0} durante l'animazione del battito
    this.beatThreshold = 0; // tier sopra il quale le particelle «entrano nel blocco»
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
    this.cy = h * 0.44;
    this.R = Math.min(w, h) * 0.26;
  }

  addTx({ vsize, feeRate }) {
    if (this.particles.length >= this.max) this.particles.shift();
    const t = feeTier(feeRate);
    const ang = Math.random() * TAU;
    const spread = 1.15 + (1 - t) * 1.1; // fee alte → orbita vicina all'anello
    const rT = this.R * spread * (0.9 + Math.random() * 0.25);
    const r0 = this.R * 3.2;             // nasce fuori scena e migra verso l'orbita
    this.particles.push({
      t,
      rad: particleRadius(vsize),
      color: particleColor(t),
      x: this.cx + Math.cos(ang) * r0,
      y: this.cy + Math.sin(ang) * r0,
      tx: this.cx + Math.cos(ang) * rT,
      ty: this.cy + Math.sin(ang) * rT,
      phase: Math.random() * TAU,
      falling: false,
      alpha: 0,
    });
  }

  setRing(fillRatio, feeFloor) {
    this.ringFill = fillRatio;
    this.ringColor = particleColor(feeTier(feeFloor));
    this.beatThreshold = feeTier(feeFloor);
  }

  setTension(t) { this.tension = t; }

  triggerBeat() {
    this.beat = { t0: performance.now() };
    for (const p of this.particles) {
      if (p.t >= this.beatThreshold) p.falling = true;
    }
  }

  render(now, dt) {
    const ctx = this.ctx;
    const beatT = this.beat ? now - this.beat.t0 : -1;

    // fondo con scia
    ctx.fillStyle = 'rgba(5, 5, 6, 0.4)';
    ctx.fillRect(0, 0, this.w, this.h);

    // blackout del battito (respiro trattenuto)
    if (beatT >= 0 && beatT < BEAT.BLACKOUT && !this.reduced) {
      ctx.fillStyle = '#050506';
      ctx.fillRect(0, 0, this.w, this.h);
      return;
    }

    const quiet = beatT > BEAT.BLACKOUT + BEAT.FALL; // fase di silenzio
    const dim = quiet ? 0.3 : 1;

    // particelle
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.alpha = Math.min(1, p.alpha + dt * 0.0015);
      if (p.falling) {
        p.x += (this.cx - p.x) * Math.min(1, dt * 0.006);
        p.y += (this.cy - p.y) * Math.min(1, dt * 0.006);
        p.alpha -= dt * 0.0011;
        if (p.alpha <= 0 || Math.hypot(p.x - this.cx, p.y - this.cy) < 4) {
          this.particles.splice(i, 1);
          continue;
        }
      } else {
        p.x += (p.tx - p.x) * Math.min(1, dt * 0.0004);
        p.y += (p.ty - p.y) * Math.min(1, dt * 0.0004);
      }
      const tw = 0.55 + 0.45 * Math.sin(p.phase + now * 0.001 * (0.6 + p.t * 1.6));
      ctx.globalAlpha = Math.max(0, p.alpha * tw * dim);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.rad, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // anello: base scura + arco riempito (da ore 12, senso orario)
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.R, 0, TAU);
    ctx.stroke();

    if (beatT >= BEAT.BLACKOUT && beatT < BEAT.BLACKOUT + BEAT.FALL) {
      // svuotamento in sincrono con la caduta
      this.ringShown *= 1 - (beatT - BEAT.BLACKOUT) / BEAT.FALL;
    } else if (quiet) {
      this.ringShown = 0;
    } else {
      this.ringShown += (this.ringFill - this.ringShown) * Math.min(1, dt * 0.002);
    }

    const pulsePeriod = 12000 - 6000 * this.tension; // il respiro si accorcia con l'attesa
    const pulse = 1 + 0.05 * Math.sin((now / pulsePeriod) * TAU);
    const flash = beatT >= BEAT.BLACKOUT && beatT < BEAT.BLACKOUT + 300;

    if (this.ringShown > 0.002) {
      ctx.lineWidth = (flash ? 5 : 2.5) * pulse;
      ctx.strokeStyle = flash ? '#ffffff' : this.ringColor;
      ctx.shadowColor = this.ringColor;
      ctx.shadowBlur = flash ? 40 : 14;
      ctx.globalAlpha = quiet ? 0.15 : 0.9;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.R, -TAU / 4, -TAU / 4 + TAU * Math.min(1, this.ringShown));
      ctx.stroke();
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
