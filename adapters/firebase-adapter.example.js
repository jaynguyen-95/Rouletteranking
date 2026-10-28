/*
 * Example backend adapter: Firebase Cloud Firestore (namespaced "compat" SDK)
 * --------------------------------------------------------------------------
 * NOT TESTED in this package (no Firebase project here). It shows the shape:
 * the app only needs window.claude.use("db") to return an object with
 * doc(path).onSnapshot / doc(path).set / collection(name).onSnapshot, and
 * Firestore's compat API already has exactly these methods.
 *
 * How to use
 *   1. Create a Firebase project + Firestore database. Turn on an auth method
 *      (e.g. Email/Password for staff, Anonymous for screens).
 *   2. In index.html, replace
 *        <script src="adapters/local-sync-adapter.js"></script>
 *      with
 *        <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
 *        <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
 *        <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
 *        <script src="adapters/firebase-adapter.js"></script>
 *      (copy this file to firebase-adapter.js and fill in FIREBASE_CONFIG).
 *   3. Security rules (suggestion): every signed-in screen may READ everything;
 *      only staff accounts may WRITE tourney/*; screens may write only seats/*.
 *
 * Documents used by the app (see README.md, "Data model"):
 *   tourney/config, tourney/q1 … tourney/q20, tourney/final, seats/{round}-s{seat}
 */
(function () {
  "use strict";
  var FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT"
  };
  firebase.initializeApp(FIREBASE_CONFIG);
  var auth = firebase.auth(), fs = firebase.firestore();

  // Screens sign in anonymously; staff can sign in with email/password on the admin device.
  var ready = new Promise(function (resolve) {
    auth.onAuthStateChanged(function (u) { if (u) resolve(u); else auth.signInAnonymously().catch(function () { resolve(null); }); });
  });

  // Map Firestore errors to the codes the app shows messages for.
  function wrapDb(db) {
    return {
      doc: function (path) {
        var ref = db.doc(path);
        return {
          onSnapshot: function (next, err) { return ref.onSnapshot(next, err); },
          set: function (data) {
            return ref.set(data).catch(function (e) {
              if (e && e.code === "permission-denied") throw { code: "invalid_argument" }; // app switches to view-only
              if (e && e.code === "resource-exhausted") throw { code: "quota_exceeded" };
              throw e;
            });
          }
        };
      },
      collection: function (name) { return db.collection(name); }
    };
  }

  window.claude = {
    use: function (capability) {
      if (capability === "db") return ready.then(function () { return wrapDb(fs); });
      if (capability === "user") return ready.then(function (u) {
        return {
          // Player screens must be able to write their own seats/* document (No Betting Chance,
          // language), so every signed-in screen answers true here. Who may change tourney/*
          // is enforced by the security rules: a refused write makes the app switch that
          // screen to view-only ("Not saved: this account can only view the shared data").
          can: function (what) { return Promise.resolve(what === "data.write" && !!u); }
        };
      });
      return Promise.resolve(null);
    }
  };
})();
