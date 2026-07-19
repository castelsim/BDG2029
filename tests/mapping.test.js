import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  feeTier, particleColor, particleRadius,
  tension, minutesSince, lastBeatLabel,
  ringProgress, haloAlpha, capSelected, evictionIndex,
  FEE_MIN, FEE_MAX,
} from '../js/mapping.js';

test('feeTier: estremi e clamp (la rete oggi viaggia sotto 1 sat/vB)', () => {
  assert.equal(feeTier(FEE_MIN), 0);
  assert.equal(feeTier(FEE_MAX), 1);
  assert.equal(feeTier(0.01), 0);
  assert.equal(feeTier(5000), 1);
  assert.ok(feeTier(0.5) > 0.1, 'fee reali odierne non devono schiacciarsi a 0');
});

test('feeTier è monotona crescente', () => {
  assert.ok(feeTier(0.5) < feeTier(2));
  assert.ok(feeTier(2) < feeTier(50));
});

test('particleColor: stop del gradiente temperatura', () => {
  assert.equal(particleColor(0), 'rgb(255, 154, 60)');
  assert.equal(particleColor(0.45), 'rgb(255, 232, 200)');
  assert.equal(particleColor(0.8), 'rgb(220, 235, 255)');
  assert.equal(particleColor(1), 'rgb(180, 210, 255)');
});

test('ringProgress: 0 all\'inizio, 0.45 a 5 min, tetto 0.9 da 10 min in poi', () => {
  assert.equal(ringProgress(0), 0);
  assert.equal(ringProgress(300_000), 0.45);
  assert.equal(ringProgress(600_000), 0.9);
  assert.equal(ringProgress(1_800_000), 0.9);
  assert.equal(ringProgress(-5), 0);
});

test('haloAlpha: limiti e crescita col valore', () => {
  assert.ok(Math.abs(haloAlpha(10_000) - 0.12) < 1e-9);
  assert.ok(Math.abs(haloAlpha(1_000_000_000) - 0.85) < 1e-9);
  assert.ok(haloAlpha(100_000_000) > haloAlpha(1_000_000));
  assert.ok(haloAlpha(0) === haloAlpha(10_000));
  assert.ok(haloAlpha(undefined) === haloAlpha(10_000));
});

test('capSelected: proporzionale al riempimento, clamp 0..1', () => {
  assert.equal(capSelected(0), 0);
  assert.equal(capSelected(0.5), 125);
  assert.equal(capSelected(1), 250);
  assert.equal(capSelected(2), 250);
  assert.equal(capSelected(0.5, 100), 50);
});

test('evictionIndex: mai le selezionate, protegge le 40 dimenticate più vecchie, sceglie la più vecchia evincibile', () => {
  const items = [
    { tier: 0.1, age: 900_000, selected: false }, // dimenticata protetta
    { tier: 0.5, age: 800_000, selected: false }, // la più vecchia evincibile → attesa
    { tier: 0.9, age: 700_000, selected: true },  // selezionata: mai
    { tier: 0.5, age: 100_000, selected: false },
  ];
  assert.equal(evictionIndex(items), 1);
  const tuttiProtetti = [
    { tier: 0.1, age: 10, selected: false },
    { tier: 0.9, age: 20, selected: true },
  ];
  assert.equal(evictionIndex(tuttiProtetti), -1);
  const molteBasse = Array.from({ length: 45 }, (_, i) => ({ tier: 0.1, age: 1000 + i, selected: false }));
  const idx = evictionIndex(molteBasse);
  assert.ok(idx >= 0, 'oltre le 40 protette, le fee basse in eccesso sono evincibili');
  assert.equal(molteBasse[idx].age, 1004, 'evince la più vecchia NON protetta (le 40 più vecchie sono salve)');
});

test('particleRadius: limiti e crescita col peso', () => {
  assert.ok(particleRadius(140) >= 1.2 && particleRadius(140) <= 2);
  assert.ok(particleRadius(4000) > particleRadius(140));
  assert.ok(particleRadius(1_000_000) <= 6);
  assert.ok(particleRadius(60) >= 1.2);
});

test('tension: 0 a 0 min, 1 da 20 min in poi', () => {
  assert.equal(tension(0), 0);
  assert.equal(tension(10), 0.5);
  assert.equal(tension(20), 1);
  assert.equal(tension(45), 1);
});

test('minutesSince: arrotonda per difetto, mai negativo', () => {
  assert.equal(minutesSince(0, 90_000), 1);
  assert.equal(minutesSince(0, 59_000), 0);
  assert.equal(minutesSince(100_000, 0), 0);
});

test('lastBeatLabel: adesso / singolare / plurale', () => {
  assert.equal(lastBeatLabel(0), 'ultimo battito: adesso');
  assert.equal(lastBeatLabel(1), 'ultimo battito: 1 minuto fa');
  assert.equal(lastBeatLabel(7), 'ultimo battito: 7 minuti fa');
});
