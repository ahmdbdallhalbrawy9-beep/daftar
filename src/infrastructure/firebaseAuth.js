// @ts-check
/* global firebase */
// Firebase bootstrap (`initCloud`'s non-wiring half) and the `AuthPort`
// implementation. The actual app-flow wiring (switching to the Firestore
// adapter, starting/stopping sync, resetting the store on sign-in/out) is
// main.js's job (phase 5) — it owns the pieces from every layer that flow
// together there.

/**
 * @param {object} config `window.FIREBASE_CONFIG`
 * @returns {any} the `firebase.firestore()` instance
 */
export function initFirebase(config) {
  firebase.initializeApp(config);
  var fs = firebase.firestore();
  try { fs.enablePersistence({ synchronizeTabs: true }).catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
  return fs;
}

/** @returns {import('../application/ports.js').AuthPort} */
export function makeFirebaseAuth() {
  return {
    signIn: function (email, pw) { return firebase.auth().signInWithEmailAndPassword(email, pw); },
    signUp: function (email, pw) { return firebase.auth().createUserWithEmailAndPassword(email, pw); },
    sendPasswordReset: function (email) { return firebase.auth().sendPasswordResetEmail(email); },
    signOut: function () { return firebase.auth().signOut(); },
    onChange: function (cb) { firebase.auth().onAuthStateChanged(cb); },
  };
}
