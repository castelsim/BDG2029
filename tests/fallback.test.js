import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, nextBlockDelayMs, simTx, SimFeed } from '../js/fallback.js';

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
    const { vsize, feeRate, value } = simTx(rand);
    assert.ok(vsize >= 110 && vsize <= 4000);
    assert.ok(feeRate >= 0.2 && feeRate <= 61);
    assert.ok(value >= 10_000 && value <= 100_000_000);
  }
});

test('simTx: la maggior parte delle fee è bassa (coda alta rara)', () => {
  const rand = mulberry32(13);
  const rates = Array.from({ length: 1000 }, () => simTx(rand).feeRate).sort((x, y) => x - y);
  assert.ok(rates[500] < 10, `mediana troppo alta: ${rates[500]}`);
});

test('SimFeed: a start() emette subito tx/projected/stats con le shape di MempoolFeed', () => {
  const f = new SimFeed(mulberry32(5));
  const got = {};
  for (const ev of ['tx', 'projected', 'block', 'stats']) {
    f.addEventListener(ev, (e) => { got[ev] = e.detail; });
  }
  f.start();
  f.stop();
  assert.deepEqual(Object.keys(got.tx).sort(), ['feeRate', 'value', 'vsize']);
  assert.deepEqual(Object.keys(got.projected).sort(), ['bands', 'feeFloor', 'fillRatio', 'medianFee']);
  assert.equal(got.projected.bands.length, 8);
  assert.deepEqual(Object.keys(got.projected.bands[0]).sort(), ['feeMax', 'feeMin', 'medianFee', 'nTx', 'vsizePerTx']);
  assert.deepEqual(Object.keys(got.stats).sort(), ['pending', 'vps']);
  assert.equal(f.timers.length, 0, 'stop() svuota i timer');
});

test('SimFeed.seed: eredita riempimento/soglia/coda dalla rete vera (continuità)', () => {
  const f = new SimFeed(mulberry32(9));
  f.seed({ fillRatio: 0.92, feeFloor: 0.47, pending: 88_000 });
  assert.equal(f.fill, 0.92);
  assert.equal(f.feeFloor, 0.47);
  assert.equal(f.pending, 88_000);
  let proj = null;
  f.addEventListener('projected', (e) => { proj = e.detail; });
  f.start();
  f.stop();
  // il primo projected riparte dagli stessi valori reali → nessun salto di soglia/capienza
  // (fillRatio può crescere di un'inezia: start() aggiunge subito una transazione)
  assert.ok(Math.abs(proj.fillRatio - 0.92) < 0.01);
  assert.equal(proj.feeFloor, 0.47);
});

test('SimFeed.seed: ignora valori assenti o non finiti, mantiene i default', () => {
  const f = new SimFeed(mulberry32(3));
  f.seed({ fillRatio: null, feeFloor: undefined, pending: NaN });
  assert.equal(f.fill, 0.2);
  assert.equal(f.feeFloor, null);
  assert.equal(f.pending, 60_000);
});
