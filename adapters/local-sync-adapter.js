/*
 * Local sync adapter (for testing only)
 * --------------------------------------------------------------------------
 * Gives the app the small Firestore-like API it expects from
 * window.claude.use("db"), backed by localStorage. Every tab and window of the
 * SAME browser on the SAME computer shares one tournament, so you can open
 * index.html#admin in one window and index.html#seat1 / #audience in others.
 *
 * It does NOT sync between different computers. For real screens, replace
 * this file with a backend adapter (see adapters/firebase-adapter.example.js
 * and README.md, "Sync layer").
 *
 * API used by the app:
 *   db.doc(path).onSnapshot(next, error)   -> next({ exists, data() })
 *   db.doc(path).set(data)                 -> Promise
 *   db.collection(name).onSnapshot(next)   -> next({ docs: [{ id, data() }] })
 *   user.can("data.write")                 -> Promise<boolean>
 */
(function () {
  "use strict";
  var PREFIX = "rt_db:";
  var listeners = [];

  function read(path) {
    try { var v = localStorage.getItem(PREFIX + path); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function docSnap(path, data) {
    return { id: path.split("/").pop(), exists: data != null, data: function () { return data == null ? undefined : JSON.parse(JSON.stringify(data)); } };
  }
  function notify(path) { listeners.slice().forEach(function (fn) { fn(path); }); }

  // Other tabs of this browser: the "storage" event fires there when a key changes.
  window.addEventListener("storage", function (e) {
    if (e.key && e.key.indexOf(PREFIX) === 0) notify(e.key.slice(PREFIX.length));
  });

  function listen(fn) {
    listeners.push(fn);
    return function unsubscribe() { listeners = listeners.filter(function (x) { return x !== fn; }); };
  }

  var db = {
    doc: function (path) {
      return {
        onSnapshot: function (next) {
          setTimeout(function () { next(docSnap(path, read(path))); }, 0);
          return listen(function (p) { if (p === path) next(docSnap(path, read(path))); });
        },
        set: function (data) {
          try { localStorage.setItem(PREFIX + path, JSON.stringify(data)); }
          catch (e) { return Promise.reject({ code: "quota_exceeded" }); }
          notify(path); // this tab; other tabs get the storage event
          return Promise.resolve();
        }
      };
    },
    collection: function (name) {
      function all() {
        var out = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(PREFIX + name + "/") === 0) { var p = k.slice(PREFIX.length); out.push(docSnap(p, read(p))); }
        }
        return { docs: out };
      }
      return {
        onSnapshot: function (next) {
          setTimeout(function () { next(all()); }, 0);
          return listen(function (p) { if (p.indexOf(name + "/") === 0) next(all()); });
        }
      };
    }
  };

  window.claude = {
    use: function (capability) {
      if (capability === "db") return Promise.resolve(db);
      if (capability === "user") return Promise.resolve({ can: function () { return Promise.resolve(true); } });
      return Promise.resolve(null);
    }
  };

  // Clear the shared test data:  localStorage keys starting with "rt_db:"
  window.rtResetLocalTournament = function () {
    Object.keys(localStorage).forEach(function (k) { if (k.indexOf(PREFIX) === 0) localStorage.removeItem(k); });
    location.reload();
  };
})();
