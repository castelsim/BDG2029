// js/mixer.js — pannello di regia per il tuning a orecchio (solo con ?mixer=1).
// Slider applicati dal vivo su __bdg.audio.params + copia dei valori scelti.
export function buildMixer(audio) {
  const DEFS = [
    ['master', 0, 1, 0.01, 'volume generale'],
    ['grainLevel', 0, 2, 0.05, 'grani (particelle)'],
    ['glass', 0, 1, 0.05, 'vetro: 0 = tono puro'],
    ['grainQ', 4, 40, 1, 'strettezza vetro'],
    ['droneLevel', 0, 2, 0.05, 'basso di riempimento'],
    ['droneReactive', 0, 1, 0.05, 'reattività drone ai dati'],
    ['droneBeatMax', 0.3, 4, 0.1, 'battimenti max (Hz)'],
    ['macroLevel', 0, 1, 0.05, 'letto di rumore'],
    ['chordLevel', 0, 2, 0.05, 'accordo del blocco'],
    ['chordGlass', 0, 1, 0.05, 'aria nell’accordo'],
    ['selectionLevel', 0, 2, 0.05, 'suoni di selezione'],
  ];
  const box = document.createElement('div');
  box.id = 'mixer';
  box.innerHTML = `
    <style>
      #mixer { position: fixed; top: 0; right: 0; bottom: 0; width: 270px; z-index: 50;
        background: rgba(8, 8, 10, 0.94); border-left: 1px solid rgba(255, 178, 94, 0.35);
        padding: 14px 16px; overflow-y: auto; font-family: ui-monospace, Menlo, monospace;
        font-size: 11px; color: #ede7dc; }
      #mixer h3 { font-size: 12px; letter-spacing: 0.14em; color: #ffb25e; margin: 0 0 10px;
        text-transform: uppercase; font-weight: 600; }
      #mixer label { display: block; margin: 10px 0 2px; color: #a89f90; }
      #mixer .val { float: right; color: #ffe8c8; }
      #mixer input[type="range"] { width: 100%; accent-color: #ffb25e; }
      #mixer button { width: 100%; margin-top: 10px; padding: 8px; background: #ffb25e;
        color: #050506; border: none; border-radius: 6px; font-family: inherit;
        font-size: 11px; letter-spacing: 0.08em; cursor: pointer; text-transform: uppercase; }
      #mixer button.ghost { background: transparent; color: #ffb25e;
        border: 1px solid rgba(255, 178, 94, 0.5); }
      #mixer textarea { width: 100%; height: 84px; margin-top: 8px; background: #101013;
        color: #ede7dc; border: 1px solid rgba(255, 178, 94, 0.3); border-radius: 6px;
        font-family: inherit; font-size: 10px; padding: 6px; }
    </style>
    <h3>Regia audio</h3>
    <div id="mixer-sliders"></div>
    <button id="mixer-beat">B · battito di prova</button>
    <button id="mixer-copy" class="ghost">Copia valori</button>
    <textarea id="mixer-out" readonly placeholder="i valori scelti compaiono qui"></textarea>
  `;
  document.body.appendChild(box);
  // non coprire speaker e fullscreen
  const ctrl = document.querySelector('.controlli');
  if (ctrl) ctrl.style.right = '290px';
  const wrap = box.querySelector('#mixer-sliders');
  for (const [key, min, max, step, label] of DEFS) {
    const lab = document.createElement('label');
    lab.innerHTML = `${label} <span class="val" id="mv-${key}">${audio.params[key]}</span>`;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = min; inp.max = max; inp.step = step;
    inp.value = audio.params[key];
    inp.oninput = () => {
      const v = parseFloat(inp.value);
      audio.params[key] = v;
      box.querySelector(`#mv-${key}`).textContent = v;
      // i parametri di livello continuo vanno riapplicati subito
      audio.setMacro({});
      audio.setTension(audio.tension);
      if (key === 'master' && audio.active && audio.ctx) {
        audio.master.gain.setTargetAtTime(v, audio.ctx.currentTime, 0.1);
      }
    };
    wrap.appendChild(lab);
    wrap.appendChild(inp);
  }
  box.querySelector('#mixer-beat').onclick = () => {
    window.__bdg?.scene?.triggerBeat();
    audio.blockCycle();
  };
  box.querySelector('#mixer-copy').onclick = () => {
    const out = {};
    for (const [key] of DEFS) out[key] = audio.params[key];
    const txt = JSON.stringify(out, null, 1);
    box.querySelector('#mixer-out').value = txt;
    navigator.clipboard?.writeText(txt).catch(() => {});
  };
}
