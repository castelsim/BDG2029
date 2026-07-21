import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeBlock, normalizeProjected, normalizeBands, extractTx, pickTip, MempoolFeed } from '../js/feed.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/ws_samples.json', import.meta.url)));

test('normalizeBlock: campi essenziali, timestamp in ms', () => {
  const b = normalizeBlock(fx.block);
  assert.deepEqual(b, {
    height: 958705, txCount: 6014, weight: 3993852,
    totalFees: 1061266, timestampMs: 1784450605000,
  });
});

test('normalizeBlock: tollera extras mancante', () => {
  const b = normalizeBlock({ height: 1, timestamp: 10, tx_count: 2, weight: 3 });
  assert.equal(b.totalFees, 0);
});

test('normalizeProjected: riempimento e fee floor dal primo blocco proiettato', () => {
  const p = normalizeProjected(fx.mempoolBlocks);
  assert.ok(Math.abs(p.fillRatio - 0.997986) < 1e-6);
  assert.equal(p.feeFloor, fx.mempoolBlocks[0].feeRange[0]);
  assert.equal(p.medianFee, fx.mempoolBlocks[0].medianFee);
});

test('normalizeProjected: array vuoto → null, fillRatio mai > 1', () => {
  assert.equal(normalizeProjected([]), null);
  const p = normalizeProjected([{ blockVSize: 2_000_000, feeRange: [1], medianFee: 1 }]);
  assert.equal(p.fillRatio, 1);
});

test('normalizeBands: una fascia per blocco proiettato, con fee min/max e peso medio', () => {
  const bands = normalizeBands(fx.mempoolBlocks);
  assert.equal(bands.length, 2);
  assert.equal(bands[0].nTx, 5814);
  assert.equal(bands[0].feeMin, fx.mempoolBlocks[0].feeRange[0]);
  assert.equal(bands[0].feeMax, fx.mempoolBlocks[0].feeRange[6]);
  assert.ok(Math.abs(bands[0].vsizePerTx - 997986 / 5814) < 1e-6);
  assert.deepEqual(normalizeBands(undefined), []);
});

test('extractTx: usa rate se presente, scarta vsize non positivi', () => {
  const txs = extractTx(fx.transactions);
  assert.equal(txs.length, 2);
  assert.deepEqual(txs[0], { vsize: 140.5, feeRate: fx.transactions[0].rate, value: 9948050 });
});

test('extractTx: senza rate calcola fee/vsize; senza value usa 0', () => {
  const [tx] = extractTx([{ fee: 200, vsize: 100 }]);
  assert.equal(tx.feeRate, 2);
  assert.equal(tx.value, 0);
});

test('pickTip: sceglie il blocco più alto a prescindere dall\'ordine', () => {
  assert.equal(pickTip(fx.blocksSnapshot).height, 958705);
  assert.equal(pickTip([]), null);
});

// registra gli eventi emessi da una MempoolFeed senza aprire davvero un WebSocket
function spia(feed) {
  const ev = [];
  for (const t of ['block', 'init']) feed.addEventListener(t, (e) => ev.push({ t, height: e.detail.height }));
  return ev;
}

test('_route: primo snapshot = init (nessun battito), poi block solo su altezza che sale', () => {
  const feed = new MempoolFeed();
  const ev = spia(feed);
  feed._route({ blocks: [{ height: 100, timestamp: 10 }] });  // primo: init
  feed._route({ blocks: [{ height: 100, timestamp: 10 }] });  // re-send stessa altezza: init (ancora)
  feed._route({ block: { height: 101, timestamp: 20 } });     // nuovo blocco singolare: block
  feed._route({ blocks: [{ height: 102, timestamp: 30 }] });  // nuovo blocco via array: block
  assert.deepEqual(ev, [
    { t: 'init', height: 100 },
    { t: 'init', height: 100 },
    { t: 'block', height: 101 },
    { t: 'block', height: 102 },
  ]);
});

test('_route: un blocco annunciato su entrambi i canali conta una volta sola', () => {
  const feed = new MempoolFeed();
  feed.lastHeight = 200;
  const ev = spia(feed);
  feed._route({ blocks: [{ height: 201, timestamp: 10 }], block: { height: 201, timestamp: 10 } });
  assert.deepEqual(ev, [{ t: 'block', height: 201 }]); // niente doppio battito
});

test('_route: altezza che regredisce (reorg/array disordinato) viene ignorata', () => {
  const feed = new MempoolFeed();
  feed.lastHeight = 300;
  const ev = spia(feed);
  feed._route({ block: { height: 299, timestamp: 10 } });
  assert.deepEqual(ev, []);
});
