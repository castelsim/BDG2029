// js/main.js — orchestrazione: feed → scena, audio, etichette
import { Scene } from './demo.js';
import { MempoolFeed } from './feed.js';
import { SimFeed } from './fallback.js';
import { GranularEngine } from './audio.js';
import { feeTier, minutesSince, lastBeatLabel, tension } from './mapping.js';

const canvas = document.getElementById('scena');
const badge = document.getElementById('badge');
const beatLabel = document.getElementById('ultimo-battito');
const pendingLabel = document.getElementById('in-attesa');
const listenBtn = document.getElementById('ascolta');

const mobile = matchMedia('(max-width: 700px)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene = new Scene(canvas, { maxParticles: mobile ? 300 : 800, reducedMotion });
const audio = new GranularEngine();

let lastBlockMs = null;
let lastLiveMsg = 0;
let mode = 'connecting'; // connecting | live | sim

const live = new MempoolFeed();
const sim = new SimFeed();

function setMode(m) {
  if (mode === m) return;
  mode = m;
  badge.dataset.state = m;
  badge.textContent =
    m === 'live' ? '● in diretta dalla rete Bitcoin'
    : m === 'sim' ? 'riproduzione simulata — la rete vera è momentaneamente non raggiungibile'
    : 'connessione alla rete…';
  if (m === 'sim') {
    if (lastBlockMs == null) lastBlockMs = Date.now();
    sim.start();
  } else {
    sim.stop();
  }
}

function feedActive(src) { return (mode === 'sim') === (src === sim); }

function wire(src) {
  src.addEventListener('tx', (e) => {
    if (!feedActive(src)) return;
    // sgrana i lotti nel tempo, così l'arrivo appare continuo
    setTimeout(() => {
      scene.addTx(e.detail);
      audio.grain(feeTier(e.detail.feeRate));
    }, Math.random() * 1100);
  });
  src.addEventListener('projected', (e) => {
    if (!feedActive(src)) return;
    scene.setRing(e.detail.fillRatio, e.detail.feeFloor);
  });
  src.addEventListener('block', (e) => {
    if (!feedActive(src)) return;
    lastBlockMs = e.detail.timestampMs;
    scene.triggerBeat();
    audio.chord();
  });
  src.addEventListener('stats', (e) => {
    if (!feedActive(src)) return;
    pendingLabel.textContent = `${e.detail.pending.toLocaleString('it-IT')} scambi in attesa`;
  });
  src.addEventListener('init', (e) => {
    if (src === live) lastBlockMs = e.detail.tipTimestampMs;
  });
}
wire(live);
wire(sim);

// ogni segnale live rinnova il watchdog e riporta in diretta
live.addEventListener('status', (e) => {
  if (e.detail.state === 'up') { lastLiveMsg = performance.now(); }
});
for (const ev of ['tx', 'projected', 'block', 'stats']) {
  live.addEventListener(ev, () => { lastLiveMsg = performance.now(); setMode('live'); });
}

// watchdog: 8 s senza messaggi live → simulazione entro ~10 s (criterio della spec).
// In diretta i messaggi arrivano ~1/s, quindi 8 s di vuoto = rete davvero giù.
setInterval(() => {
  if (performance.now() - lastLiveMsg > 8_000) setMode('sim');
}, 2000);

live.connect();

// hook di debug per le verifiche manuali (usato dai passi di test del piano)
window.__bdg = { scene, audio, sim };

// etichetta «ultimo battito» + tensione
setInterval(() => {
  if (lastBlockMs == null) return;
  const m = minutesSince(lastBlockMs, Date.now());
  beatLabel.textContent = lastBeatLabel(m);
  scene.setTension(tension(m));
  audio.setTension(tension(m));
}, 5000);

// pulsante Ascolta
listenBtn.addEventListener('click', async () => {
  if (!audio.active) {
    await audio.start();
    listenBtn.textContent = '⏸ silenzio';
    listenBtn.setAttribute('aria-pressed', 'true');
  } else {
    audio.stop();
    listenBtn.textContent = '▶ ascolta';
    listenBtn.setAttribute('aria-pressed', 'false');
  }
});

// ciclo di rendering
let prev = performance.now();
function frame(now) {
  const dt = Math.min(100, now - prev);
  prev = now;
  scene.render(now, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => scene.resize());
