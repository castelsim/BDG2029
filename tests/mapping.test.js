import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  feeTier, particleColor, particleRadius,
  tension, minutesSince, lastBeatLabel, FEE_MIN, FEE_MAX,
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

test('particleColor: estremi e centro del gradiente', () => {
  assert.equal(particleColor(0), 'rgb(255, 178, 94)');
  assert.equal(particleColor(0.5), 'rgb(255, 232, 200)');
  assert.equal(particleColor(1), 'rgb(234, 242, 255)');
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
