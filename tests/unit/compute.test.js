'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../harness/loadApp.js');

function baseWallets() {
  return [
    { id: 'v1', name: 'فودافون 1', type: 'vf', base: 1000, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true },
    { id: 'v2', name: 'فودافون 2', type: 'vf', base: 500, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true },
    { id: 'i1', name: 'إنستاباي 1', type: 'insta', base: 2000, baseTs: 0, dayLimit: 120000, monthLimit: 400000, active: true },
  ];
}

test('compute: empty ledger just reflects wallet bases and settings.baseCash', () => {
  const app = loadApp();
  app.S.wallets = baseWallets();
  app.S.ledger = {};
  app.S.settings = Object.assign({}, app.DEFAULTS, { baseCash: 300 });
  app.setNow(Date.UTC(2026, 0, 15, 10, 0, 0));
  const C = app.compute();
  assert.equal(C.W.v1.bal, 1000);
  assert.equal(C.W.v2.bal, 500);
  assert.equal(C.W.i1.bal, 2000);
  assert.equal(C.cash, 300);
  assert.equal(C.pDay, 0);
  assert.equal(C.pMon, 0);
});

test('compute: a Vodafone "out" (transfer) updates wallet, cash and profit', () => {
  const app = loadApp();
  app.S.wallets = baseWallets();
  const ts = Date.UTC(2026, 0, 15, 10, 0, 0);
  app.setNow(ts);
  // customer hands 100 cash + 5 commission, wallet pays a 1-pound same-network fee
  app.S.ledger = { d1: [{ id: 't1', ts, k: 'out', w: 'v1', a: 100, f: 5, c: 1, d: 'vf' }] };
  app.S.settings = Object.assign({}, app.DEFAULTS, { baseCash: 0 });
  const C = app.compute();
  assert.equal(C.W.v1.bal, 1000 - 101, 'wallet loses amount + wallet fee');
  assert.equal(C.cash, 105, 'drawer gains amount + commission');
  assert.equal(C.pDay, 4, 'profit = commission(5) - wallet fee(1)');
  assert.equal(C.pMon, 4);
  assert.equal(C.W.v1.dOut, 100, 'daily sent usage tracks the transfer amount');
  assert.equal(C.nDay, 1);
});

test('compute: InstaPay profit is tracked separately in pDayI/pMonI', () => {
  const app = loadApp();
  app.S.wallets = baseWallets();
  const ts = Date.UTC(2026, 0, 15, 10, 0, 0);
  app.setNow(ts);
  app.S.ledger = { d1: [{ id: 't1', ts, k: 'iout', w: 'i1', a: 200, f: 3, c: 0.2, d: undefined, ins: 1 }] };
  app.S.settings = Object.assign({}, app.DEFAULTS, { baseCash: 0 });
  const C = app.compute();
  assert.equal(C.pDay, 2.8);
  assert.equal(C.pDayI, 2.8, 'all of today\'s profit is from InstaPay');
});

test('compute: a voided transaction is excluded from balances and profit', () => {
  const app = loadApp();
  app.S.wallets = baseWallets();
  const ts = Date.UTC(2026, 0, 15, 10, 0, 0);
  app.setNow(ts);
  app.S.ledger = {
    d1: [
      { id: 't1', ts, k: 'out', w: 'v1', a: 100, f: 5, c: 1, d: 'vf' },
      { id: 'v1x', ts: ts + 1, k: 'void', ref: 't1' },
    ],
  };
  app.S.settings = Object.assign({}, app.DEFAULTS, { baseCash: 0 });
  const C = app.compute();
  assert.equal(C.W.v1.bal, 1000, 'wallet unaffected once the tx is voided');
  assert.equal(C.cash, 0);
  assert.equal(C.pDay, 0);
});

test('compute: wallet.base/baseTs only applies to transactions after it was set (re-based on close)', () => {
  const app = loadApp();
  const rebaseTs = Date.UTC(2026, 0, 15, 12, 0, 0);
  app.S.wallets = [
    { id: 'v1', name: 'ف1', type: 'vf', base: 900, baseTs: rebaseTs, dayLimit: 60000, monthLimit: 200000, active: true },
  ];
  app.setNow(Date.UTC(2026, 0, 15, 18, 0, 0));
  app.S.ledger = {
    d1: [
      // before the rebase: must NOT affect today's balance (already folded into base=900)
      { id: 'old', ts: rebaseTs - 1000, k: 'in', w: 'v1', a: 50, f: 0 },
      // after the rebase: must apply on top of base
      { id: 'new', ts: rebaseTs + 1000, k: 'in', w: 'v1', a: 30, f: 0 },
    ],
  };
  app.S.settings = Object.assign({}, app.DEFAULTS, { baseCash: 0 });
  const C = app.compute();
  assert.equal(C.W.v1.bal, 930, 'only the post-rebase +30 applies on top of base 900');
});

test('compute: daily limit usage resets at Cairo midnight, monthly usage does not', () => {
  const app = loadApp();
  app.S.wallets = baseWallets();
  app.S.settings = Object.assign({}, app.DEFAULTS, { baseCash: 0 });

  const yesterday = Date.UTC(2026, 0, 15, 10, 0, 0); // Cairo 2026-01-15 12:00
  const today = Date.UTC(2026, 0, 16, 10, 0, 0); // Cairo 2026-01-16 12:00
  app.S.ledger = {
    d1: [{ id: 'y1', ts: yesterday, k: 'out', w: 'v1', a: 1000, f: 10, c: 1, d: 'vf' }],
    d2: [{ id: 't1', ts: today, k: 'out', w: 'v1', a: 500, f: 5, c: 1, d: 'vf' }],
  };

  app.setNow(today);
  const C = app.compute();
  assert.equal(C.W.v1.dOut, 500, 'only today\'s transfer counts toward the daily limit');
  assert.equal(C.W.v1.mOut, 1500, 'both transfers are in the same month');
  assert.equal(C.pDay, 4, 'only today\'s profit counts for the day tile');
  assert.equal(C.pMon, 9 + 4, 'both days\' profit count for the month tile');
});

test('compute: monthly limit usage resets on the 1st of the month (Cairo time)', () => {
  const app = loadApp();
  app.S.wallets = baseWallets();
  app.S.settings = Object.assign({}, app.DEFAULTS, { baseCash: 0 });

  const lastMonth = Date.UTC(2026, 0, 31, 10, 0, 0); // Cairo 2026-01-31 12:00
  const thisMonth = Date.UTC(2026, 1, 1, 10, 0, 0); // Cairo 2026-02-01 12:00
  app.S.ledger = {
    d1: [{ id: 'm1', ts: lastMonth, k: 'out', w: 'v1', a: 1000, f: 10, c: 1, d: 'vf' }],
    d2: [{ id: 'm2', ts: thisMonth, k: 'out', w: 'v1', a: 500, f: 5, c: 1, d: 'vf' }],
  };

  app.setNow(thisMonth);
  const C = app.compute();
  assert.equal(C.W.v1.mOut, 500, 'last month\'s usage does not carry into this month\'s limit');
  assert.equal(C.pMon, 4, 'last month\'s profit is excluded from this month\'s tile');
});
