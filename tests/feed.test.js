import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeBlock, normalizeProjected, extractTx, pickTip } from '../js/feed.js';

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

test('extractTx: usa rate se presente, scarta vsize non positivi', () => {
  const txs = extractTx(fx.transactions);
  assert.equal(txs.length, 2);
  assert.deepEqual(txs[0], { vsize: 140.5, feeRate: fx.transactions[0].rate });
});

test('extractTx: senza rate calcola fee/vsize', () => {
  const [tx] = extractTx([{ fee: 200, vsize: 100 }]);
  assert.equal(tx.feeRate, 2);
});

test('pickTip: sceglie il blocco più alto a prescindere dall\'ordine', () => {
  assert.equal(pickTip(fx.blocksSnapshot).height, 958705);
  assert.equal(pickTip([]), null);
});
