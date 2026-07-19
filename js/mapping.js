// js/mapping.js — funzioni pure: dato di rete → parametro visivo/sonoro
export const FEE_MIN = 0.1; // sat/vB
export const FEE_MAX = 200;

// 0..1 su scala logaritmica fra FEE_MIN e FEE_MAX
export function feeTier(feeRate) {
  const f = Math.min(Math.max(feeRate, FEE_MIN), FEE_MAX);
  return Math.log(f / FEE_MIN) / Math.log(FEE_MAX / FEE_MIN);
}

// gradiente ambra → bianco caldo → bianco freddo (calma → contesa)
const STOPS = [
  [0.0, [255, 178, 94]],
  [0.5, [255, 232, 200]],
  [1.0, [234, 242, 255]],
];

export function particleColor(t) {
  const x = Math.min(Math.max(t, 0), 1);
  let [p0, p1] = [STOPS[0], STOPS[1]];
  if (x > 0.5) [p0, p1] = [STOPS[1], STOPS[2]];
  const k = (x - p0[0]) / (p1[0] - p0[0]);
  const c = p0[1].map((v, i) => Math.round(v + (p1[1][i] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
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
