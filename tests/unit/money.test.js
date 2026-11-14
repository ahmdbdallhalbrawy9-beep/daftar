'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../harness/loadApp.js');

test('walletCost: Vodafone -> Vodafone is the flat fee regardless of amount', () => {
  const app = loadApp();
  app.UI.dest = 'vf';
  assert.equal(app.walletCost('out', 50), app.DEFAULTS.vfSame);
  assert.equal(app.walletCost('out', 5000), app.DEFAULTS.vfSame);
  assert.equal(app.walletCost('out', 0), 0, 'no amount, no cost');
});

test('walletCost: Vodafone -> other network is percentage, capped', () => {
  const app = loadApp();
  app.UI.dest = 'other';
  // 100 * 0.5% = 0.5, below the 15 cap
  assert.equal(app.walletCost('out', 100), 0.5);
  // 5000 * 0.5% = 25, capped at 15
  assert.equal(app.walletCost('out', 5000), 15);
});

test('walletCost: InstaPay transfer is percentage, capped', () => {
  const app = loadApp();
  // 100 * 0.1% = 0.1
  assert.equal(app.walletCost('iout', 100), 0.1);
  // 30000 * 0.1% = 30, capped at 20
  assert.equal(app.walletCost('iout', 30000), 20);
});

test('walletCost: kinds with no owner-side wallet fee cost 0', () => {
  const app = loadApp();
  assert.equal(app.walletCost('in', 1000), 0);
  assert.equal(app.walletCost('topup', 1000), 0);
});

test('xferCost: internal wallet-to-wallet leg mirrors walletCost\'s vf/insta rules', () => {
  const app = loadApp();
  const vfWallet = { id: 'w1', type: 'vf' };
  const instaWallet = { id: 'i1', type: 'insta' };
  assert.equal(app.xferCost(vfWallet, 500), app.DEFAULTS.vfSame, 'vf-origin leg is the flat fee');
  assert.equal(app.xferCost(instaWallet, 100), 0.1, '0.1% of 100');
  assert.equal(app.xferCost(instaWallet, 30000), 20, 'capped at 20');
  assert.equal(app.xferCost(vfWallet, 0), 0);
});

test('maxAmt: largest amount whose amount+fee still fits the balance', () => {
  const app = loadApp();
  const flatFee = () => 1; // e.g. vf-same-network fee
  assert.equal(app.maxAmt(1000, flatFee), 999);
  assert.equal(app.maxAmt(1, flatFee), 0, 'fee alone would exceed balance of 1');
  assert.equal(app.maxAmt(0, flatFee), 0);

  // percentage fee with a cap, like InstaPay (0.1%, cap 20)
  const pctFee = (a) => Math.min(a * 0.1 / 100, 20);
  const bal = 10000;
  const a = app.maxAmt(bal, pctFee);
  assert.ok(a + pctFee(a) <= bal + 1e-9, 'amount + fee must not exceed balance');
  assert.ok(a + 1 + pctFee(a + 1) > bal + 1e-9, 'one pound more would not fit');
});

test('cd: cash-drawer delta per operation kind', () => {
  const app = loadApp();
  // "in" (سحب: customer hands over wallet money, gets cash): drawer loses (amount - fee)
  assert.equal(app.cd({ k: 'in', a: 100, f: 5 }), -95);
  // "out" (تحويل: customer pays cash, gets a transfer): drawer gains amount + fee
  assert.equal(app.cd({ k: 'out', a: 100, f: 5 }), 105);
  // "topup": cash goes from drawer into a wallet
  assert.equal(app.cd({ k: 'topup', a: 100, f: 2 }), -102);
  // "cashout": cash comes out of a wallet into the drawer, minus the loss fee
  assert.equal(app.cd({ k: 'cashout', a: 100, f: 2 }), 98);
});

test('wd: wallet-balance delta per operation kind', () => {
  const app = loadApp();
  assert.equal(app.wd({ k: 'in', a: 100 }), 100, 'in increases the wallet');
  assert.equal(app.wd({ k: 'topup', a: 100 }), 100, 'topup increases the wallet');
  assert.equal(app.wd({ k: 'out', a: 100, c: 1 }), -101, 'out decreases by amount + wallet fee');
  assert.equal(app.wd({ k: 'cashout', a: 100 }), -100, 'cashout decreases the wallet');
});

test('splitWallets: only active wallets of the matching service (vf vs insta)', () => {
  const app = loadApp();
  app.S.wallets = [
    { id: 'v1', type: 'vf', active: true },
    { id: 'v2', type: 'vf', active: false },
    { id: 'i1', type: 'insta', active: true },
  ];
  app.UI.kind = 'out';
  assert.deepEqual(app.splitWallets().map((w) => w.id), ['v1']);
  app.UI.kind = 'iout';
  assert.deepEqual(app.splitWallets().map((w) => w.id), ['i1']);
});
