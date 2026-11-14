import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../../src/domain/plan.js';
import { rank } from '../../src/domain/rank.js';
import { compute } from '../../src/domain/compute.js';
import { DEFAULTS } from '../../src/domain/money.js';

function twoVfWallets() {
  return [
    { id: 'v1', name: 'فودافون 1', type: 'vf', base: 1000, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true },
    { id: 'v2', name: 'فودافون 2', type: 'vf', base: 500, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true },
  ];
}

test('buildPlan: splitting a transfer directly across several wallets', () => {
  const wallets = twoVfWallets();
  const C = compute({ ledger: {}, wallets, settings: DEFAULTS, now: Date.now() });
  const plan = buildPlan(
    { kind: 'out', amount: 1000, fee: 10, splitMode: 'direct', splits: { v1: '600', v2: '400' }, dest: 'vf' },
    wallets, C, DEFAULTS,
  );
  assert.equal(plan.legs.length, 2);
  assert.equal(plan.sum, 1000);
  assert.equal(plan.ctot, 2, 'two legs, 1 flat fee each (vf-same-network)');
  assert.equal(plan.diff, 0, 'fully allocated, no leftover');
  assert.equal(plan.short, false);
  assert.equal(plan.ok, true);
  assert.equal(plan.legs[0].f, 10, 'the customer commission is attached to the first leg only');
});

test('buildPlan: direct split flags shortfall when a wallet cannot cover its share', () => {
  const wallets = twoVfWallets();
  const C = compute({ ledger: {}, wallets, settings: DEFAULTS, now: Date.now() });
  // v2 only has 500: asking it to send 600 leaves it short
  const plan = buildPlan(
    { kind: 'out', amount: 1000, fee: 10, splitMode: 'direct', splits: { v1: '400', v2: '600' }, dest: 'vf' },
    wallets, C, DEFAULTS,
  );
  assert.equal(plan.bad.v2, 1);
  assert.equal(plan.short, true);
  assert.equal(plan.ok, false);
});

test('buildPlan: collect mode gathers from other wallets into the collector, then pays the customer', () => {
  const wallets = twoVfWallets();
  const C = compute({ ledger: {}, wallets, settings: DEFAULTS, now: Date.now() });
  const plan = buildPlan(
    { kind: 'out', amount: 800, fee: 10, splitMode: 'collect', collectorId: 'v1', splits: { v2: '300' }, dest: 'vf' },
    wallets, C, DEFAULTS,
  );
  assert.equal(plan.coll, true);
  assert.equal(plan.sum, 300, 'collected from v2');
  assert.equal(plan.own, 500, '800 - 300 comes from the collector\'s own balance');
  assert.equal(plan.ok, true);
  // legs: internal xfer v2->v1, then the outgoing v1->customer leg
  const xferLeg = plan.legs.find((l) => l.k === 'xfer');
  const finalLeg = plan.legs.find((l) => l.k === 'out');
  assert.ok(xferLeg && finalLeg);
  assert.equal(xferLeg.w, 'v2');
  assert.equal(xferLeg.to, 'v1');
  assert.equal(finalLeg.w, 'v1');
  assert.equal(finalLeg.a, 800);
});

test('rank: "out" ranks by remaining daily/monthly limit and flags insufficient balance', () => {
  const wallets = [
    { id: 'v1', name: 'ضيّقة', type: 'vf', base: 10000, baseTs: 0, dayLimit: 300, monthLimit: 200000, active: true },
    { id: 'v2', name: 'واسعة', type: 'vf', base: 10000, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true },
    { id: 'v3', name: 'فقيرة', type: 'vf', base: 50, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true },
  ];
  const now = Date.UTC(2026, 0, 15, 10, 0, 0);
  const C = compute({ ledger: {}, wallets, settings: DEFAULTS, now });
  const list = rank('out', 500, wallets, C, DEFAULTS, 1);
  const v1 = list.find((r) => r.w.id === 'v1');
  const v2 = list.find((r) => r.w.id === 'v2');
  const v3 = list.find((r) => r.w.id === 'v3');
  assert.equal(v1.fits, false, 'daily limit (300) is below the requested amount (500)');
  assert.equal(v2.fits, true);
  assert.equal(v3.fits, false, 'balance (50) is below the amount+fee (501)');
  // the widest-headroom fitting wallet should be ranked first
  assert.equal(list[0].w.id, 'v2');
});

test('rank: "cashout" ranks by balance and only checks balance, not limits', () => {
  const wallets = [
    { id: 'v1', name: 'كبيرة', type: 'vf', base: 5000, baseTs: 0, dayLimit: 100, monthLimit: 100, active: true },
    { id: 'v2', name: 'صغيرة', type: 'vf', base: 10, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true },
  ];
  const now = Date.UTC(2026, 0, 15, 10, 0, 0);
  const C = compute({ ledger: {}, wallets, settings: DEFAULTS, now });
  const list = rank('cashout', 200, wallets, C, DEFAULTS, 0);
  const v1 = list.find((r) => r.w.id === 'v1');
  const v2 = list.find((r) => r.w.id === 'v2');
  assert.equal(v1.fits, true, 'tiny day/month limits do not matter for cashout');
  assert.equal(v2.fits, false, 'balance 10 < amount 200');
  assert.equal(list[0].w.id, 'v1', 'ranked by balance, biggest first');
});
