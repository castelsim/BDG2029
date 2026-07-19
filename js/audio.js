// js/audio.js — motore sonoro: grani (transazioni), drone (la rete), accordo (blocco)
const SCALE = [0, 3, 5, 7, 10]; // pentatonica minore

export class GranularEngine {
  constructor() {
    this.ctx = null;
    this.active = false;
    this.grains = 0;
  }

  async start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this._build();
    }
    await this.ctx.resume();
    this.active = true;
    this.master.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.4);
  }

  stop() {
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    this.active = false;
  }

  _build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.bus = c.createGain();
    const dry = c.createGain(); dry.gain.value = 0.75;
    this.wet = c.createGain(); this.wet.gain.value = 0.25;
    const verb = c.createConvolver();
    verb.buffer = this._impulse(3.5);
    this.bus.connect(dry); dry.connect(this.master);
    this.bus.connect(verb); verb.connect(this.wet); this.wet.connect(this.master);
    this.master.connect(c.destination);
    // drone: due triangolari leggermente scordate su un passa-basso — il pavimento della rete
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 150; lp.Q.value = 0.7;
    for (const det of [-5, 4]) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 55;
      o.detune.value = det;
      o.connect(lp);
      o.start();
    }
    const droneGain = c.createGain();
    droneGain.gain.value = 0.06;
    lp.connect(droneGain); droneGain.connect(this.bus);
  }

  // riverbero procedurale: rumore con coda esponenziale
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

  setTension(t) {
    if (this.ctx) this.wet.gain.setTargetAtTime(0.2 + 0.5 * t, this.ctx.currentTime, 3);
  }

  _voice(midi, when, dur, peak) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    const g = c.createGain(); g.gain.value = 0;
    const pan = c.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.8;
    o.connect(g); g.connect(pan); pan.connect(this.bus);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.start(when);
    o.stop(when + dur + 0.05);
    return o;
  }

  // un grano per transazione: pitch dalla fascia di commissione (pentatonica su 3 ottave)
  grain(tier) {
    if (!this.active || this.grains > 24) return;
    this.grains++;
    const idx = Math.min(14, Math.floor(tier * 15));
    const midi = 57 + 12 * Math.floor(idx / 5) + SCALE[idx % 5];
    const o = this._voice(midi, this.ctx.currentTime, 0.1 + 0.18 * (1 - tier), 0.035 + 0.05 * tier);
    o.onended = () => this.grains--;
  }

  // il battito: accordo lungo a 4 voci, poi il silenzio della finalità, poi il ritorno
  chord() {
    if (!this.active) return;
    const t = this.ctx.currentTime;
    for (const [i, st] of [0, 5, 10, 14].entries()) {
      this._voice(45 + 12 * Math.floor(st / 5) + SCALE[st % 5], t + i * 0.04, 5, 0.09);
    }
    this.master.gain.setTargetAtTime(0.0001, t + 5, 0.2);
    this.master.gain.setTargetAtTime(0.85, t + 8, 0.8);
  }
}
