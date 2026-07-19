// js/audio.js — motore sonoro v3: materia, non melodia.
// Due livelli: microscopico (grani-vetro, uno per transazione) e macroscopico
// (il letto della rete: densità, pressione, tensione). L'accordo del blocco nasce
// dall'istogramma reale delle risonanze accumulate nel ciclo.
// Tutti i parametri sono regolabili dal vivo: __bdg.audio.params
const SCALE = [0, 3, 5, 7, 10]; // gradi pentatonici come CENTRI DI RISONANZA, non note

export class GranularEngine {
  constructor() {
    this.ctx = null;
    this.active = false;
    this.grains = 0;
    this.hist = [0, 0, 0, 0, 0]; // gradi suonati nel ciclo → materiale dell'accordo
    this.macro = { pending: 60_000, medianFee: 1, fillRatio: 0.5 };
    this.tension = 0;
    this.silT0 = 0; // finestra di silenzio vero
    this.silT1 = 0;
    this.params = {
      master: 0.85,
      grainQ: 16,        // strettezza della risonanza: più alto = più vetro
      grainLevel: 1,
      grainDurMin: 0.06, // s, transazioni leggere
      grainDurMax: 0.24, // s, transazioni pesanti
      droneLevel: 1,
      droneBeatMax: 1.6, // Hz di battimento del drone a tensione piena
      macroLevel: 1,     // letto di rumore della mempool
      chordLevel: 1,
      selectionLevel: 1,
      verbSeconds: 3.5,
    };
  }

  async start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this._build();
    }
    await this.ctx.resume();
    this.active = true;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(this.params.master, this.ctx.currentTime, 0.4);
  }

  stop() {
    if (this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    }
    this.active = false;
  }

  _build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.bus = c.createGain();
    const dry = c.createGain();
    dry.gain.value = 0.75;
    this.wet = c.createGain();
    this.wet.gain.value = 0.25;
    const verb = c.createConvolver();
    verb.buffer = this._impulse(this.params.verbSeconds);
    this.bus.connect(dry); dry.connect(this.master);
    this.bus.connect(verb); verb.connect(this.wet); this.wet.connect(this.master);
    this.master.connect(c.destination);

    // rumore condiviso (2 s) per grani, letto macro e transienti
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // DRONE: coppia scordabile (i battimenti sono la tensione) + sub, su un passa-basso
    this.droneLp = c.createBiquadFilter();
    this.droneLp.type = 'lowpass';
    this.droneLp.frequency.value = 150;
    this.droneLp.Q.value = 0.7;
    this.droneOscs = [-4, 4].map((det) => {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 55;
      o.detune.value = det;
      o.connect(this.droneLp);
      o.start();
      return o;
    });
    this.sub = c.createOscillator();
    this.sub.type = 'sine';
    this.sub.frequency.value = 27.5;
    this.subGain = c.createGain();
    this.subGain.gain.value = 0.02;
    this.sub.connect(this.subGain);
    this.subGain.connect(this.bus);
    this.sub.start();
    this.droneGain = c.createGain();
    this.droneGain.gain.value = 0.06;
    this.droneLp.connect(this.droneGain);
    this.droneGain.connect(this.bus);

    // LETTO MACRO: la nube come rumore continuo, due bande (corpo + pressione)
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.macroLow = c.createBiquadFilter();
    this.macroLow.type = 'bandpass';
    this.macroLow.frequency.value = 240;
    this.macroLow.Q.value = 0.7;
    this.macroMid = c.createBiquadFilter();
    this.macroMid.type = 'bandpass';
    this.macroMid.frequency.value = 900;
    this.macroMid.Q.value = 1.1;
    this.macroLowG = c.createGain(); this.macroLowG.gain.value = 0.012;
    this.macroMidG = c.createGain(); this.macroMidG.gain.value = 0.005;
    src.connect(this.macroLow); this.macroLow.connect(this.macroLowG); this.macroLowG.connect(this.bus);
    src.connect(this.macroMid); this.macroMid.connect(this.macroMidG); this.macroMidG.connect(this.bus);
    src.start();
  }

  _impulse(seconds) {
    const c = this.ctx;
    const len = Math.floor(seconds * c.sampleRate);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.8;
    }
    return buf;
  }

  _inSilence() {
    const n = performance.now();
    return n >= this.silT0 && n < this.silT1;
  }

  // tensione dell'attesa: riverbero che si allunga, battimenti del drone che si stringono
  setTension(t) {
    this.tension = t;
    if (!this.ctx) return;
    const ct = this.ctx.currentTime;
    this.wet.gain.setTargetAtTime(0.2 + 0.5 * t, ct, 3);
    const beat = 0.3 + (this.params.droneBeatMax - 0.3) * t; // Hz di battimento
    const cents = 1200 * Math.log2((55 + beat / 2) / 55);
    this.droneOscs[0].detune.setTargetAtTime(-cents, ct, 8);
    this.droneOscs[1].detune.setTargetAtTime(cents, ct, 8);
  }

  // stato complessivo della mempool → livello macroscopico (variazioni lentissime)
  setMacro(part) {
    Object.assign(this.macro, part);
    if (!this.ctx) return;
    const ct = this.ctx.currentTime;
    const p = this.params;
    const dens = Math.min(1, Math.max(0, (this.macro.pending - 20_000) / 180_000)); // 20k…200k
    const feeT = Math.min(1, Math.max(0, Math.log((this.macro.medianFee + 0.001) / 0.1) / Math.log(2000)));
    this.subGain.gain.setTargetAtTime((0.015 + 0.04 * dens) * p.droneLevel, ct, 12);
    this.droneLp.frequency.setTargetAtTime(90 + 170 * feeT, ct, 15);
    this.macroLowG.gain.setTargetAtTime((0.006 + 0.02 * dens) * p.macroLevel, ct, 10);
    this.macroMidG.gain.setTargetAtTime((0.002 + 0.012 * this.macro.fillRatio) * p.macroLevel, ct, 10);
    this.droneGain.gain.setTargetAtTime((0.05 + 0.03 * this.macro.fillRatio) * p.droneLevel, ct, 12);
  }

  // GRANO-VETRO: rumore in banda stretta risonante sul grado pentatonico.
  // brillantezza ← fee (tier) · corpo/durata ← peso (weight 0..1)
  grain(tier, weight = 0.3) {
    if (!this.active || this.grains > 24 || this._inSilence()) return;
    this.grains++;
    const c = this.ctx;
    const p = this.params;
    const idx = Math.min(14, Math.floor(tier * 15));
    this.hist[idx % 5]++;
    const midi = 57 + 12 * Math.floor(idx / 5) + SCALE[idx % 5];
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const dur = p.grainDurMin + (p.grainDurMax - p.grainDurMin) * weight;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.85 + Math.random() * 0.3; // granularità irregolare
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = Math.max(3, p.grainQ * (1 - 0.55 * weight)); // pesante = più corpo, meno vetro
    const g = c.createGain();
    g.gain.value = 0;
    const pan = c.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.85;
    src.connect(bp); bp.connect(g); g.connect(pan); pan.connect(this.bus);
    const t = c.currentTime;
    const peak = (0.05 + 0.11 * tier) * p.grainLevel * Math.sqrt(p.grainQ / 4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    src.onended = () => this.grains--;
  }

  // selezione (aggregata): presenza breve per chi entra, assestamento sordo per chi esce
  selection(nProm, nEvict) {
    if (!this.active || this._inSilence() || (nProm === 0 && nEvict === 0)) return;
    const t = this.ctx.currentTime;
    const lvl = this.params.selectionLevel;
    if (nProm > 0) this._puff(t, 1400, 6, 0.2, Math.min(0.045, 0.006 * nProm) * lvl, 0.5);
    if (nEvict > 0) this._puff(t + 0.05, 170, 4, 0.34, Math.min(0.05, 0.007 * nEvict) * lvl, -0.4);
  }

  _puff(when, freq, q, dur, peak, panv) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    const pan = c.createStereoPanner(); pan.pan.value = panv;
    src.connect(bp); bp.connect(g); g.connect(pan); pan.connect(this.bus);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.start(when, Math.random() * 1.5);
    src.stop(when + dur + 0.05);
  }

  // CICLO DEL BLOCCO, allineato alla timeline visiva (BEAT di demo.js):
  // collasso (il pavimento affonda) → ACCORDO al lampo (il rumore diventa tono) →
  // coda chiusa → SILENZIO VERO → rinascita: prima il drone, poi il letto, poi i grani
  blockCycle() {
    if (!this.ctx) { this.hist = [0, 0, 0, 0, 0]; return; }
    const c = this.ctx;
    const t = c.currentTime;
    const tFlash = t + 1.68;   // FALL + SUSPEND
    const tSil = t + 5.38;     // + BANG + RESOLVE
    const tReb = t + 8.38;     // + QUIET
    // collasso: il pavimento affonda, il letto si ritira
    this.droneLp.frequency.cancelScheduledValues(t);
    this.droneLp.frequency.setTargetAtTime(65, t, 0.5);
    this.macroLowG.gain.setTargetAtTime(0.003, t, 0.6);
    this.macroMidG.gain.setTargetAtTime(0.001, t, 0.6);
    // l'accordo nasce dal materiale del ciclo
    if (this.active) this._chord(tFlash);
    // silenzio vero: tutto a zero, coda del riverbero compresa
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.active ? this.params.master : 0, tSil - 0.12);
    this.master.gain.linearRampToValueAtTime(0, tSil);
    // rinascita scaglionata
    if (this.active) {
      this.master.gain.setValueAtTime(0, tReb);
      this.master.gain.setTargetAtTime(this.params.master, tReb, 0.9);
    }
    this.droneLp.frequency.setTargetAtTime(90 + 170 * 0.2, tReb, 2);
    this.macroLowG.gain.setTargetAtTime(0.012 * this.params.macroLevel, tReb + 0.6, 2);
    this.macroMidG.gain.setTargetAtTime(0.005 * this.params.macroLevel, tReb + 0.6, 2);
    // i grani tacciono dal silenzio fino a rinascita avviata
    this.silT0 = performance.now() + 5380;
    this.silT1 = performance.now() + 9180;
    this.hist = [0, 0, 0, 0, 0];
  }

  // l'accordo: i gradi più suonati del ciclo convergono; il rumore diventa tono
  _chord(when) {
    const c = this.ctx;
    const p = this.params;
    const order = [...this.hist.keys()].sort((a, b) => this.hist[b] - this.hist[a]);
    const degrees = order.slice(0, 3);
    if (degrees.length === 0) degrees.push(0);
    // transiente d'attacco: un colpo d'aria larga
    this._puff(when, 600, 0.6, 0.14, 0.22 * p.chordLevel, 0);
    degrees.forEach((deg, i) => {
      const midi = 33 + 12 * (i + 1) + SCALE[deg]; // voci ancorate ad A1, su tre ottave
      const freq = 440 * 2 ** ((midi - 69) / 12);
      // voce-rumore che si stringe fino a diventare tono
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.setValueAtTime(2, when);
      bp.Q.exponentialRampToValueAtTime(30, when + 0.6);
      const g = c.createGain();
      g.gain.value = 0;
      const pan = c.createStereoPanner();
      pan.pan.value = (i - 1) * 0.5;
      src.connect(bp); bp.connect(g); g.connect(pan); pan.connect(this.bus);
      const peak = 0.11 * p.chordLevel / (1 + i * 0.3);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(peak, when + 0.03 + i * 0.02);
      g.gain.setTargetAtTime(peak * 0.6, when + 0.4, 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 3.2); // coda chiusa PRIMA del silenzio
      src.start(when, Math.random() * 1.5);
      src.stop(when + 3.4);
      // il tono puro affiora sotto il rumore
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const og = c.createGain();
      og.gain.value = 0;
      o.connect(og); og.connect(pan);
      og.gain.setValueAtTime(0, when + 0.25);
      og.gain.linearRampToValueAtTime(peak * 0.5, when + 1);
      og.gain.exponentialRampToValueAtTime(0.0001, when + 3.2);
      o.start(when + 0.25);
      o.stop(when + 3.4);
    });
  }

  // compatibilità: l'accordo isolato resta richiamabile
  chord() {
    if (this.active) this._chord(this.ctx.currentTime + 0.05);
  }
}
