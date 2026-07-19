import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, nextBlockDelayMs, simTx } from '../js/fallback.js';

test('mulberry32: deterministico a parità di seed, in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('nextBlockDelayMs: sempre nei limiti [30 s, 40 min]', () => {
  const rand = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const d = nextBlockDelayMs(rand);
    assert.ok(d >= 30_000 && d <= 2_400_000);
  }
});

test('nextBlockDelayMs: la media è nell\'ordine dei 10 minuti', () => {
  const rand = mulberry32(3);
  let sum = 0;
  for (let i = 0; i < 2000; i++) sum += nextBlockDelayMs(rand);
  const mean = sum / 2000;
  assert.ok(mean > 350_000 && mean < 750_000, `media fuori scala: ${mean}`);
});

test('simTx: campi plausibili', () => {
  const rand = mulberry32(11);
  for (let i = 0; i < 500; i++) {
    const { vsize, feeRate } = simTx(rand);
    assert.ok(vsize >= 110 && vsize <= 4000);
    assert.ok(feeRate >= 0.2 && feeRate <= 61);
  }
});

test('simTx: la maggior parte delle fee è bassa (coda alta rara)', () => {
  const rand = mulberry32(13);
  const rates = Array.from({ length: 1000 }, () => simTx(rand).feeRate).sort((x, y) => x - y);
  assert.ok(rates[500] < 10, `mediana troppo alta: ${rates[500]}`);
});
