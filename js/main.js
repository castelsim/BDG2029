// js/main.js — orchestrazione v2: feed → scena, audio, badge, controlli
import { Scene } from './demo.js';
import { MempoolFeed } from './feed.js';
import { SimFeed } from './fallback.js';
import { GranularEngine } from './audio.js';
import { feeTier, minutesSince, tension } from './mapping.js';

const canvas = document.getElementById('scena');
const badge = document.getElementById('badge');
const listenBtn = document.getElementById('ascolta');
const fsBtn = document.getElementById('fullscreen');
const hint = document.getElementById('audio-hint');

const mobile = matchMedia('(max-width: 700px)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene = new Scene(canvas, { maxParticles: mobile ? 350 : 900, reducedMotion });
const audio = new GranularEngine();
// coerenza audio↔visivo: la selezione (promozioni/espulsioni) suona in forma aggregata
scene.onSelection = (nProm, nEvict) => audio.selection(nProm, nEvict);

let lastBlockMs = null;
let lastLiveMsg = 0;
let mode = 'connecting';

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
      const prt = scene.addTx(e.detail);
      // il suono arriva dalla direzione in cui la particella entra in scena
      const pan = prt ? Math.max(-0.9, Math.min(0.9, Math.cos(prt.ang) * 1.1)) : 0;
      audio.grain(feeTier(e.detail.feeRate), Math.min(1, (e.detail.vsize ?? 140) / 1200), pan);
    }, Math.random() * 1100);
  });
  src.addEventListener('projected', (e) => {
    if (!feedActive(src)) return;
    scene.setBlock(e.detail.feeFloor, e.detail.fillRatio);
    if (e.detail.bands) scene.setCrowd(e.detail.bands);
    audio.setMacro({ medianFee: e.detail.medianFee, fillRatio: e.detail.fillRatio });
  });
  src.addEventListener('stats', (e) => {
    if (!feedActive(src)) return;
    const conto = document.getElementById('conto-attesa');
    if (conto) conto.textContent = e.detail.pending.toLocaleString('it-IT');
    audio.setMacro({ pending: e.detail.pending });
  });
  src.addEventListener('block', (e) => {
    if (!feedActive(src)) return;
    lastBlockMs = e.detail.timestampMs;
    scene.triggerBeat();
    audio.blockCycle();
  });
  src.addEventListener('init', (e) => {
    if (src === live) {
      lastBlockMs = e.detail.tipTimestampMs;
      scene.seedCycle(Date.now() - lastBlockMs);
    }
  });
}
wire(live);
wire(sim);

live.addEventListener('status', (e) => {
  if (e.detail.state === 'up') lastLiveMsg = performance.now();
});
for (const ev of ['tx', 'projected', 'block', 'stats']) {
  live.addEventListener(ev, () => { lastLiveMsg = performance.now(); setMode('live'); });
}

// watchdog: 8 s senza messaggi live → simulazione entro ~10 s.
setInterval(() => {
  if (performance.now() - lastLiveMsg > 8_000) setMode('sim');
}, 2000);

live.connect();

// tensione dell'attesa (vignetta, respiro dell'anello, riverbero)
setInterval(() => {
  if (lastBlockMs == null) return;
  const t = tension(minutesSince(lastBlockMs, Date.now()));
  scene.setTension(t);
  audio.setTension(t);
}, 5000);

// audio: icona speaker + hint alla prima visita
if (!localStorage.getItem('bdg_hint')) {
  hint.hidden = false;
  setTimeout(() => { hint.hidden = true; }, 6000);
}
listenBtn.addEventListener('click', async () => {
  hint.hidden = true;
  localStorage.setItem('bdg_hint', '1');
  if (!audio.active) {
    await audio.start();
    listenBtn.setAttribute('aria-pressed', 'true');
    listenBtn.setAttribute('aria-label', "disattiva l'audio");
  } else {
    audio.stop();
    listenBtn.setAttribute('aria-pressed', 'false');
    listenBtn.setAttribute('aria-label', "attiva l'audio");
  }
});

// schermo intero (dov'è supportato; su iPhone l'icona resta nascosta)
if (document.documentElement.requestFullscreen) {
  fsBtn.hidden = false;
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });
}

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

// modalità prova (?prova=1): il tasto B scatena il ciclo del blocco, per regia e verifica
if (new URLSearchParams(location.search).has('prova')) {
  addEventListener('keydown', (e) => {
    if (e.key === 'b' || e.key === 'B') {
      scene.triggerBeat();
      audio.blockCycle();
    }
  });
}

// hook di debug per le verifiche manuali
window.__bdg = { scene, audio, sim, live };
