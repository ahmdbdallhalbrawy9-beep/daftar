// @ts-check
// The full-screen login/signup view. Extracted from index.html's `showAuth`
// plus the auth branches of its click delegation handler (`authGo`/
// `authReset`).
import { $ } from '../dom.js';
import { login, signup, resetPassword } from '../../application/auth.js';

/** @param {string} [msg] @param {boolean} [bad] */
export function showAuth(msg, bad) {
  $('#auth').hidden = false;
  var m = $('#authMsg');
  m.textContent = msg || '';
  m.className = 'notice' + (bad ? ' bad' : '');
  m.hidden = !msg;
}

/** @param {{auth: import('../../application/ports.js').AuthPort}} ctx @param {'login'|'signup'} mode */
export async function authGoAction(ctx, mode) {
  var e = $('#aEmail').value.trim(), pw = $('#aPass').value;
  if (!e || !pw) { showAuth('اكتب الإيميل وكلمة السر', true); return; }
  $('#loginBtn').disabled = $('#signupBtn').disabled = true;
  showAuth('جارٍ التحميل…');
  var res = mode === 'signup' ? await signup(ctx.auth, e, pw) : await login(ctx.auth, e, pw);
  if (res.ok) $('#aPass').value = '';
  else showAuth(res.message, true);
  $('#loginBtn').disabled = $('#signupBtn').disabled = false;
}

/** @param {{auth: import('../../application/ports.js').AuthPort}} ctx */
export async function authResetAction(ctx) {
  var e = $('#aEmail').value.trim();
  if (!e) { showAuth('اكتب الإيميل الأول', true); return; }
  var res = await resetPassword(ctx.auth, e);
  showAuth(res.message, !res.ok);
}
