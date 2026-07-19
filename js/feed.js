// js/feed.js — WebSocket mempool.space: normalizzazione messaggi + connessione.
// Più fonti compatibili (stesso protocollo, verificate il 20/07/2026): in caso di
// guasto si ruota alla successiva — failover a priorità, non media (mediare mempool
// leggermente desincronizzate creerebbe artefatti).
export const WS_URLS = [
  'wss://mempool.space/api/v1/ws',
  'wss://mempool.emzy.de/api/v1/ws',
  'wss://mempool.ninja/api/v1/ws',
  'wss://mempool.bitcoin-21.org/api/v1/ws',
];
export const WS_URL = WS_URLS[0];

// --- funzioni pure (testate in node) ---

export function normalizeBlock(b) {
  return {
    height: b.height,
    txCount: b.tx_count ?? 0,
    weight: b.weight ?? 0,
    totalFees: b.extras?.totalFees ?? 0,
    timestampMs: (b.timestamp ?? 0) * 1000,
  };
}

export function normalizeProjected(mempoolBlocks) {
  if (!Array.isArray(mempoolBlocks) || mempoolBlocks.length === 0) return null;
  const first = mempoolBlocks[0];
  return {
    fillRatio: Math.min(1, (first.blockVSize ?? 0) / 1_000_000),
    feeFloor: first.feeRange?.[0] ?? 0.1,
    medianFee: first.medianFee ?? 1,
  };
}

// una fascia per blocco proiettato: quante transazioni, con quali fee, che peso medio.
// È la distribuzione REALE dell'intera coda: la base dello strato-folla.
export function normalizeBands(mempoolBlocks) {
  if (!Array.isArray(mempoolBlocks)) return [];
  return mempoolBlocks.map((b) => ({
    nTx: b.nTx ?? 0,
    feeMin: b.feeRange?.[0] ?? 0.1,
    feeMax: b.feeRange?.[b.feeRange.length - 1] ?? 1,
    medianFee: b.medianFee ?? 1,
    vsizePerTx: b.nTx ? (b.blockVSize ?? 0) / b.nTx : 0,
  }));
}

export function extractTx(transactions) {
  if (!Array.isArray(transactions)) return [];
  return transactions
    .filter((t) => (t.vsize ?? 0) > 0)
    .map((t) => ({ vsize: t.vsize, feeRate: t.rate ?? t.fee / t.vsize, value: t.value ?? 0 }));
}

export function pickTip(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  return blocks.reduce((a, b) => (b.height > a.height ? b : a));
}

// --- connessione (solo browser; non importata dai test) ---

export class MempoolFeed extends EventTarget {
  constructor(urls = WS_URLS) {
    super();
    this.urls = Array.isArray(urls) ? urls : [urls];
    this.uIdx = 0;
    this.delay = 5000;
    this.ws = null;
    this.closed = false;
  }

  connect() {
    this.closed = false;
    const ws = (this.ws = new WebSocket(this.urls[this.uIdx]));
    ws.onopen = () => {
      this.delay = 5000;
      ws.send(JSON.stringify({ action: 'init' }));
      // stessa lista della sonda del 19/07: con questa il server spinge anche `transactions`
      ws.send(JSON.stringify({ action: 'want', data: ['blocks', 'stats', 'mempool-blocks', 'live-2h-chart'] }));
      this._emit('status', { state: 'up' });
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      this._route(m);
    };
    ws.onclose = () => { if (!this.closed) this._retry(); };
    ws.onerror = () => ws.close();
  }

  disconnect() { this.closed = true; this.ws?.close(); }

  _retry() {
    this._emit('status', { state: 'down' });
    this.uIdx = (this.uIdx + 1) % this.urls.length; // fonte successiva
    setTimeout(() => { if (!this.closed) this.connect(); }, this.delay);
    this.delay = Math.min(60_000, this.delay * 2);
  }

  _route(m) {
    if (m.blocks) {
      const tip = pickTip(m.blocks);
      if (tip) this._emit('init', { tipTimestampMs: tip.timestamp * 1000, height: tip.height });
    }
    if (m.block) this._emit('block', normalizeBlock(m.block));
    if (m['mempool-blocks']) {
      const p = normalizeProjected(m['mempool-blocks']);
      if (p) {
        p.bands = normalizeBands(m['mempool-blocks']);
        this._emit('projected', p);
      }
    }
    if (m.transactions) for (const tx of extractTx(m.transactions)) this._emit('tx', tx);
    if (m.mempoolInfo) {
      this._emit('stats', { pending: m.mempoolInfo.size ?? 0, vps: m.vBytesPerSecond ?? 0 });
    }
    // m.conversions (prezzi) viene ignorato di proposito: vietato dai vincoli editoriali
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
