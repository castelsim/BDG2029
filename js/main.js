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
const attesaHero = document.getElementById('attesa-hero');
const attesaHeroN = document.getElementById('attesa-hero-n');

const mobile = matchMedia('(max-width: 700px)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene = new Scene(canvas, { maxParticles: mobile ? 350 : 900, reducedMotion });
const audio = new GranularEngine();
// coerenza audio↔visivo: la selezione (promozioni/espulsioni) suona in forma aggregata
scene.onSelection = (nProm, nEvict) => audio.selection(nProm, nEvict);

let lastBlockMs = null;
let lastLiveMsg = 0;
let mode = 'connecting';
// ultimo stato reale della rete: con questo il simulatore parte dallo stesso punto,
// così un'eventuale caduta di connessione non fa «uscire in massa» le particelle
const lastLiveState = { feeFloor: null, fillRatio: null, pending: null };

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
    sim.seed(lastLiveState); // continuità: il sim riprende da dove era la rete vera
    sim.start();
  } else {
    sim.stop();
  }
}

function feedActive(src) { return (mode === 'sim') === (src === sim); }

// I messaggi della rete vera hanno la precedenza: appena ne arriva uno, torniamo «live»
// PRIMA di ogni altro controllo — così un blocco reale non viene mai scartato perché
// eravamo momentaneamente in simulazione.
function liveGuard(src) {
  if (src === live) { lastLiveMsg = performance.now(); setMode('live'); }
  return feedActive(src);
}

function wire(src) {
  src.addEventListener('tx', (e) => {
    if (!liveGuard(src)) return;
    // sgrana i lotti nel tempo, così l'arrivo appare continuo
    setTimeout(() => {
      const prt = scene.addTx(e.detail);
      // il suono arriva dalla direzione in cui la particella entra in scena
      const pan = prt ? Math.max(-0.9, Math.min(0.9, Math.cos(prt.ang) * 1.1)) : 0;
      audio.grain(feeTier(e.detail.feeRate), Math.min(1, (e.detail.vsize ?? 140) / 1200), pan);
    }, Math.random() * 1100);
  });
  src.addEventListener('projected', (e) => {
    if (!liveGuard(src)) return;
    if (src === live) {
      lastLiveState.feeFloor = e.detail.feeFloor;
      lastLiveState.fillRatio = e.detail.fillRatio;
    }
    scene.setBlock(e.detail.feeFloor, e.detail.fillRatio);
    if (e.detail.bands) scene.setCrowd(e.detail.bands);
    audio.setMacro({ medianFee: e.detail.medianFee, fillRatio: e.detail.fillRatio });
  });
  src.addEventListener('stats', (e) => {
    if (!liveGuard(src)) return;
    if (src === live) lastLiveState.pending = e.detail.pending;
    const n = e.detail.pending.toLocaleString('it-IT');
    const conto = document.getElementById('conto-attesa');
    if (conto) conto.textContent = n;
    attesaHeroN.textContent = n;
    attesaHero.hidden = false; // compare solo al primo dato reale, mai un placeholder
    audio.setMacro({ pending: e.detail.pending });
  });
  src.addEventListener('block', (e) => {
    if (!liveGuard(src)) return;
    lastBlockMs = e.detail.timestampMs;
    scene.triggerBeat();
    audio.blockCycle();
  });
  src.addEventListener('init', (e) => {
    if (src === live) {
      lastLiveMsg = performance.now();
      setMode('live');
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

// watchdog: una volta connessi, si «cavalcano» i cali brevi (le particelle restano in
// orbita, nessuna riorganizzazione) — si passa alla simulazione solo dopo un'assenza
// prolungata. A freddo (mai connessi) si passa prima, per non lasciare la scena vuota.
setInterval(() => {
  const gap = performance.now() - lastLiveMsg;
  const limit = mode === 'live' ? 30_000 : 9_000;
  if (gap > limit) setMode('sim');
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

// pannello di regia (?mixer=1): slider live sui parametri audio + copia valori
if (new URLSearchParams(location.search).has('mixer')) {
  import('./mixer.js').then((m) => m.buildMixer(audio));
}

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
window.__bdg = {
  scene, audio, sim, live,
  getMode: () => mode,
  setMode, // per riprodurre gli scenari di rete in verifica
  lastLiveState,
};
