// @ts-check
// Login/signup/reset/logout, against an AuthPort (implemented by
// infrastructure/firebaseAuth.js). Error-message mapping stays with the rest
// of auth since it's pure and only auth needs it.
import { anyPending } from './sync.js';

/** @param {string} [code] a Firebase Auth error code */
export function authErrorMessage(code) {
  var c = code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'الإيميل أو كلمة السر غلط';
  if (c === 'auth/email-already-in-use') return 'الإيميل ده عليه حساب بالفعل. اضغط دخول';
  if (c === 'auth/weak-password') return 'كلمة السر ضعيفة، اكتب 6 حروف على الأقل';
  if (c === 'auth/invalid-email') return 'الإيميل مش مكتوب صح';
  if (c === 'auth/network-request-failed') return 'مفيش نت. محتاج نت عشان تسجّل دخول';
  if (c === 'auth/too-many-requests') return 'محاولات كتير. استنى شوية وجرّب تاني';
  return 'حصل خطأ (' + (c || '؟') + ')';
}

/** @param {import('./ports.js').AuthPort} auth @param {string} email @param {string} pw */
export async function login(auth, email, pw) {
  if (!email || !pw) return { ok: false, message: 'اكتب الإيميل وكلمة السر' };
  try { await auth.signIn(email, pw); return { ok: true }; }
  catch (e) { return { ok: false, message: authErrorMessage(e && e.code) }; }
}

/** @param {import('./ports.js').AuthPort} auth @param {string} email @param {string} pw */
export async function signup(auth, email, pw) {
  if (!email || !pw) return { ok: false, message: 'اكتب الإيميل وكلمة السر' };
  try { await auth.signUp(email, pw); return { ok: true }; }
  catch (e) { return { ok: false, message: authErrorMessage(e && e.code) }; }
}

/** @param {import('./ports.js').AuthPort} auth @param {string} email */
export async function resetPassword(auth, email) {
  if (!email) return { ok: false, message: 'اكتب الإيميل الأول' };
  try { await auth.sendPasswordReset(email); return { ok: true, message: 'بعتنالك رابط تغيير كلمة السر على الإيميل' }; }
  catch (e) { return { ok: false, message: authErrorMessage(e && e.code) }; }
}

/**
 * Refuses to sign out while a write is still pending upload (matches
 * index.html's `doLogout`'s "don't lose offline writes" guard).
 * @param {import('./ports.js').AuthPort} auth
 * @param {Record<string, {hp?:boolean}>} meta
 */
export async function logout(auth, meta) {
  if (anyPending(meta)) return { ok: false, message: 'فيه بيانات لسه ما اترفعتش. استنى لما النت يشتغل وتتزامن' };
  await auth.signOut();
  return { ok: true };
}
