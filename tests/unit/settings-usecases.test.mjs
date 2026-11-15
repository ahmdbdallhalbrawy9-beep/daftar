import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { sha } from '../../src/infrastructure/crypto.js';
import { saveSettings, checkWipePassword, setWipePassword, changeWipePassword } from '../../src/application/settingsUseCases.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { makeFakeDb } from '../helpers/fakeAdapters.mjs';

test('saveSettings: merges the patch and persists the merged result', async () => {
  const db = makeFakeDb({ 'settings/main': DEFAULTS });
  const queue = createWriteQueue();
  const merged = await saveSettings(db, queue, DEFAULTS, { feePct: 2 });
  assert.equal(merged.feePct, 2);
  assert.equal(merged.vfSame, DEFAULTS.vfSame, 'untouched fields survive the merge');
  assert.equal(db.__dump()['settings/main'].feePct, 2);
});

test('setWipePassword + checkWipePassword: round-trips correctly, and rejects too-short passwords', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const tooShort = await setWipePassword(db, queue, sha, DEFAULTS, 'ab');
  assert.equal(tooShort.ok, false);

  const res = await setWipePassword(db, queue, sha, DEFAULTS, 'secret1');
  assert.equal(res.ok, true);
  assert.ok(await checkWipePassword(sha, res.settings, 'secret1'));
  assert.equal(await checkWipePassword(sha, res.settings, 'wrong'), false);
});

test('changeWipePassword: requires the correct old password and a long-enough new one', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const first = await setWipePassword(db, queue, sha, DEFAULTS, 'secret1');

  const badOld = await changeWipePassword(db, queue, sha, first.settings, 'nope', 'secret2');
  assert.equal(badOld.ok, false);
  assert.equal(badOld.error, 'wrong-password');

  const shortNew = await changeWipePassword(db, queue, sha, first.settings, 'secret1', 'ab');
  assert.equal(shortNew.ok, false);
  assert.equal(shortNew.error, 'too-short');

  const ok = await changeWipePassword(db, queue, sha, first.settings, 'secret1', 'secret2');
  assert.equal(ok.ok, true);
  assert.ok(await checkWipePassword(sha, ok.settings, 'secret2'));
  assert.equal(await checkWipePassword(sha, ok.settings, 'secret1'), false, 'old password no longer works');
});
