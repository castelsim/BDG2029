// js/mapping.js — funzioni pure: dato di rete → parametro visivo/sonoro
export const FEE_MIN = 0.1; // sat/vB
export const FEE_MAX = 200;

// 0..1 su scala logaritmica fra FEE_MIN e FEE_MAX
export function feeTier(feeRate) {
  const f = Math.min(Math.max(feeRate, FEE_MIN), FEE_MAX);
  return Math.log(f / FEE_MIN) / Math.log(FEE_MAX / FEE_MIN);
}

// gradiente temperatura: ambra profondo → bianco caldo → ghiaccio → freddo estremo
const STOPS = [
  [0.0, [255, 154, 60]],
  [0.45, [255, 232, 200]],
  [0.8, [220, 235, 255]],
  [1.0, [180, 210, 255]],
];

export function particleColor(t) {
  const x = Math.min(Math.max(t, 0), 1);
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [x0, c0] = STOPS[i - 1];
      const [x1, c1] = STOPS[i];
      const k = (x - x0) / (x1 - x0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return 'rgb(180, 210, 255)';
}

// raggio in px dal peso della transazione (mediana reale ~140 vB)
export function particleRadius(vsize) {
  const v = Math.min(Math.max(vsize, 60), 1_000_000);
  return Math.min(6, Math.max(1.2, 1.5 + Math.log2(v / 140) * 0.7));
}

// tensione dell'attesa: 0 → 1 in 20 minuti senza blocco
export function tension(minutes) {
  return Math.min(1, Math.max(0, minutes / 20));
}

export function minutesSince(thenMs, nowMs) {
  return Math.max(0, Math.floor((nowMs - thenMs) / 60_000));
}

export function lastBeatLabel(minutes) {
  if (minutes <= 0) return 'ultimo battito: adesso';
  if (minutes === 1) return 'ultimo battito: 1 minuto fa';
  return `ultimo battito: ${minutes} minuti fa`;
}

// avanzamento dell'anello-timer: 90% in 10 minuti, poi si ferma (respiro gestito dalla scena)
export function ringProgress(elapsedMs) {
  return 0.9 * (Math.min(600_000, Math.max(0, elapsedMs)) / 600_000);
}

// alone della particella dal valore trasferito (sats), scala log in 0.12..0.85
export function haloAlpha(valueSats) {
  const v = Math.min(Math.max(valueSats ?? 0, 10_000), 1_000_000_000);
  return 0.12 + 0.73 * (Math.log(v / 10_000) / Math.log(100_000));
}

// posti visivi nel blocco in formazione, proporzionali al riempimento reale
export function capSelected(fillRatio, max = 250) {
  return Math.round(max * Math.min(1, Math.max(0, fillRatio)));
}

// chi eliminare quando la popolazione supera il tetto:
// mai le selezionate; protette le `protectedLowFee` dimenticate (tier<0.25) più vecchie;
// tra le altre, la più vecchia. -1 se nessuna è evincibile.
export function evictionIndex(items, protectedLowFee = 40) {
  const low = [];
  for (let i = 0; i < items.length; i++) {
    if (!items[i].selected && items[i].tier < 0.25) low.push(i);
  }
  low.sort((a, b) => items[b].age - items[a].age);
  const safe = new Set(low.slice(0, protectedLowFee));
  let best = -1;
  for (let i = 0; i < items.length; i++) {
    if (items[i].selected || safe.has(i)) continue;
    if (best === -1 || items[i].age > items[best].age) best = i;
  }
  return best;
}
