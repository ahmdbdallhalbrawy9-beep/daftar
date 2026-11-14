import test from 'node:test';
import assert from 'node:assert/strict';
import { login, signup, resetPassword, logout, authErrorMessage } from '../../src/application/auth.js';
import { makeFakeAuth } from '../helpers/fakeAdapters.mjs';

test('authErrorMessage: maps known Firebase codes to Arabic text, unknowns get a generic message', () => {
  assert.equal(authErrorMessage('auth/wrong-password'), 'الإيميل أو كلمة السر غلط');
  assert.equal(authErrorMessage('auth/email-already-in-use'), 'الإيميل ده عليه حساب بالفعل. اضغط دخول');
  assert.match(authErrorMessage('auth/something-weird'), /حصل خطأ/);
});

test('login/signup: refuse missing fields without calling the auth port', async () => {
  const auth = makeFakeAuth();
  let called = false;
  auth.signIn = () => { called = true; return Promise.resolve(); };
  const res = await login(auth, '', '');
  assert.equal(res.ok, false);
  assert.equal(called, false);
});

test('login: surfaces a mapped error message on failure', async () => {
  const auth = makeFakeAuth({ 'bad@x.com': 'auth/wrong-password' });
  const res = await login(auth, 'bad@x.com', 'pw');
  assert.equal(res.ok, false);
  assert.equal(res.message, 'الإيميل أو كلمة السر غلط');
});

test('signup: succeeds against the fake auth port', async () => {
  const auth = makeFakeAuth();
  const res = await signup(auth, 'new@x.com', 'pw123456');
  assert.equal(res.ok, true);
});

test('resetPassword: requires an email, otherwise delegates to the auth port', async () => {
  const auth = makeFakeAuth();
  const missing = await resetPassword(auth, '');
  assert.equal(missing.ok, false);
  const ok = await resetPassword(auth, 'me@x.com');
  assert.equal(ok.ok, true);
});

test('logout: refuses while a write is still pending upload', async () => {
  const auth = makeFakeAuth();
  const res = await logout(auth, { wallets: { hp: true } });
  assert.equal(res.ok, false);
});

test('logout: signs out once nothing is pending', async () => {
  const auth = makeFakeAuth();
  const res = await logout(auth, { wallets: { hp: false } });
  assert.equal(res.ok, true);
});
