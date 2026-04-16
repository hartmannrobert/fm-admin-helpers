/**
 * Script snippet persistence with a user-selectable backend (chrome.storage.local setting fmSnippetStorageScope).
 * - extension: snippets in chrome.storage.local key fmScriptSnippets — shared across all Fusion Manage tenants.
 * - origin: snippets in page IndexedDB (FMSnippetDB) — one library per site origin (per-tenant).
 * Migrates legacy userSnippets into fmScriptSnippets when using extension storage; IDB path migrates legacy chrome data into IDB once per origin.
 */
(function () {
  const SCOPE_KEY = "fmSnippetStorageScope";
  const SCOPE_EXTENSION = "extension";
  const SCOPE_ORIGIN = "origin";

  const STORAGE_KEY = "fmScriptSnippets";
  const LEGACY_USER_SNIPPETS_KEY = "userSnippets";

  const DB_NAME = "FMSnippetDB";
  const DB_VERSION = 2;
  const STORE_NAME = "scriptSnippets_name";
  const MIGRATION_FLAG_KEY = "fm-snippets-migrated-to-idb";

  var snippetStorageListenerAttached = false;
  var idbPromise = null;

  function toRecord(s) {
    var name = (s && typeof s.name === "string" && s.name.trim() !== "")
      ? s.name.trim()
      : (s && s.id !== undefined && s.id !== null && String(s.id).trim() !== "")
        ? String(s.id).trim()
        : "";
    return {
      name: name,
      code: (s && s.code !== undefined && s.code !== null) ? String(s.code) : ""
    };
  }

  function normalizeSnippetArray(snippets) {
    if (!Array.isArray(snippets)) return [];
    var byName = Object.create(null);
    for (var i = 0; i < snippets.length; i++) {
      var r = toRecord(snippets[i]);
      if (r.name) byName[r.name] = r;
    }
    var keys = Object.keys(byName);
    keys.sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
    var out = [];
    for (var j = 0; j < keys.length; j++) {
      out.push(byName[keys[j]]);
    }
    return out;
  }

  function hasChromeStorage() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  }

  function storageGet(keys) {
    return new Promise(function (resolve, reject) {
      if (!hasChromeStorage()) {
        reject(new Error("chrome.storage.local not available"));
        return;
      }
      chrome.storage.local.get(keys, function (res) {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "storage get failed"));
          return;
        }
        resolve(res || {});
      });
    });
  }

  function storageSet(obj) {
    return new Promise(function (resolve, reject) {
      if (!hasChromeStorage()) {
        reject(new Error("chrome.storage.local not available"));
        return;
      }
      chrome.storage.local.set(obj, function () {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "storage set failed"));
          return;
        }
        resolve();
      });
    });
  }

  function readSnippetScope() {
    if (!hasChromeStorage()) return Promise.resolve(SCOPE_EXTENSION);
    return storageGet([SCOPE_KEY]).then(function (res) {
      if (res[SCOPE_KEY] === SCOPE_ORIGIN) return SCOPE_ORIGIN;
      return SCOPE_EXTENSION;
    }).catch(function () {
      return SCOPE_EXTENSION;
    });
  }

  function migrateLegacyUserSnippetsIfNeeded() {
    if (!hasChromeStorage()) return Promise.resolve();
    return storageGet([STORAGE_KEY, LEGACY_USER_SNIPPETS_KEY]).then(function (res) {
      if (Object.prototype.hasOwnProperty.call(res, STORAGE_KEY)) {
        return;
      }
      var legacy = res[LEGACY_USER_SNIPPETS_KEY];
      if (!Array.isArray(legacy) || legacy.length === 0) {
        return storageSet({ [STORAGE_KEY]: [] });
      }
      var normalized = normalizeSnippetArray(legacy);
      var patch = {};
      patch[STORAGE_KEY] = normalized;
      patch[LEGACY_USER_SNIPPETS_KEY] = [];
      return storageSet(patch);
    }).catch(function () {
      return Promise.resolve();
    });
  }

  function ensureCrossTabSnippetListener() {
    if (snippetStorageListenerAttached) return;
    try {
      if (window.self !== window.top) return;
    } catch (e) {
      return;
    }
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged) return;
    snippetStorageListenerAttached = true;
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== "local") return;
      if (!changes) return;
      if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY) &&
          !Object.prototype.hasOwnProperty.call(changes, SCOPE_KEY)) {
        return;
      }
      try {
        window.dispatchEvent(new CustomEvent("fm-snippets-changed"));
      } catch (e) { /* ignore */ }
    });
  }

  function openIndexedDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () { resolve(req.result); };
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        var tx = ev.target.transaction;
        if (ev.oldVersion < 2) {
          if (db.objectStoreNames.contains("scriptSnippets")) {
            var oldStore = tx.objectStore("scriptSnippets");
            var newStore = db.createObjectStore(STORE_NAME, { keyPath: "name" });
            var cursorReq = oldStore.openCursor();
            cursorReq.onsuccess = function () {
              var cursor = cursorReq.result;
              if (cursor) {
                var v = cursor.value;
                var name = (v.name && String(v.name).trim()) || (v.id && String(v.id).trim()) || "";
                if (name) {
                  newStore.put({
                    name: name,
                    code: (v.code !== undefined && v.code !== null) ? String(v.code) : ""
                  });
                }
                cursor.continue();
              } else {
                db.deleteObjectStore("scriptSnippets");
              }
            };
          } else if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "name" });
          }
        }
      };
    });
    return idbPromise;
  }

  function idbWithStore(mode, fn) {
    return openIndexedDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, mode);
        var store = tx.objectStore(STORE_NAME);
        var p = fn(store);
        if (p && typeof p.then === "function") {
          p.then(resolve).catch(reject);
        } else {
          resolve(p);
        }
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbMigrateFromChromeStorage() {
    if (!hasChromeStorage()) return Promise.resolve();
    return new Promise(function (resolve) {
      chrome.storage.local.get([MIGRATION_FLAG_KEY, LEGACY_USER_SNIPPETS_KEY], function (res) {
        if (res[MIGRATION_FLAG_KEY] === "1") {
          resolve();
          return;
        }
        var list = Array.isArray(res[LEGACY_USER_SNIPPETS_KEY]) ? res[LEGACY_USER_SNIPPETS_KEY] : [];
        if (list.length === 0) {
          chrome.storage.local.set({ [MIGRATION_FLAG_KEY]: "1" }, resolve);
          return;
        }
        var normalized = [];
        for (var i = 0; i < list.length; i++) {
          var r = toRecord(list[i]);
          if (r.name) normalized.push(r);
        }
        idbPutMany(normalized)
          .then(function () {
            chrome.storage.local.set({ [MIGRATION_FLAG_KEY]: "1" }, resolve);
          })
          .catch(function () { resolve(); });
      });
    });
  }

  function idbInit() {
    return openIndexedDB().then(function () {
      return idbMigrateFromChromeStorage();
    });
  }

  function idbGetAll() {
    return idbWithStore("readonly", function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.getAll();
        req.onsuccess = function () { resolve(normalizeSnippetArray(req.result || [])); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbGet(name) {
    if (name === undefined || name === null || String(name).trim() === "") return Promise.resolve(undefined);
    return idbWithStore("readonly", function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.get(String(name).trim());
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbPut(snippet) {
    var record = toRecord(snippet);
    if (!record.name) return Promise.reject(new Error("Snippet must have a non-empty name"));
    return idbWithStore("readwrite", function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.put(record);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbPutMany(snippets) {
    if (!Array.isArray(snippets) || snippets.length === 0) return Promise.resolve();
    return idbWithStore("readwrite", function (store) {
      var i = 0;
      function next() {
        if (i >= snippets.length) return Promise.resolve();
        var r = toRecord(snippets[i++]);
        if (!r.name) return next();
        return new Promise(function (resolve, reject) {
          var req = store.put(r);
          req.onsuccess = function () { resolve(next()); };
          req.onerror = function () { reject(req.error); };
        });
      }
      return next();
    });
  }

  function idbRemove(name) {
    if (name === undefined || name === null || String(name).trim() === "") return Promise.resolve();
    return idbWithStore("readwrite", function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.delete(String(name).trim());
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbRemoveMany(names) {
    if (!Array.isArray(names) || names.length === 0) return Promise.resolve();
    return idbWithStore("readwrite", function (store) {
      var i = 0;
      function next() {
        if (i >= names.length) return Promise.resolve();
        var n = names[i++];
        if (n === undefined || n === null || String(n).trim() === "") return next();
        return new Promise(function (resolve, reject) {
          var req = store.delete(String(n).trim());
          req.onsuccess = function () { resolve(next()); };
          req.onerror = function () { reject(req.error); };
        });
      }
      return next();
    });
  }

  function idbReplaceAll(snippets) {
    return idbWithStore("readwrite", function (store) {
      return new Promise(function (resolve, reject) {
        var clearReq = store.clear();
        clearReq.onsuccess = function () {
          var arr = normalizeSnippetArray(Array.isArray(snippets) ? snippets : []);
          if (arr.length === 0) {
            resolve();
            return;
          }
          var idx = 0;
          function putNext() {
            if (idx >= arr.length) {
              resolve();
              return;
            }
            var r = arr[idx++];
            var req = store.put(r);
            req.onsuccess = putNext;
            req.onerror = function () { reject(req.error); };
          }
          putNext();
        };
        clearReq.onerror = function () { reject(clearReq.error); };
      });
    });
  }

  function chromeGetAll() {
    if (!hasChromeStorage()) return Promise.resolve([]);
    return storageGet([STORAGE_KEY]).then(function (res) {
      var raw = res[STORAGE_KEY];
      if (!Array.isArray(raw)) return [];
      return normalizeSnippetArray(raw);
    }).catch(function () {
      return [];
    });
  }

  function chromeGet(name) {
    if (name === undefined || name === null || String(name).trim() === "") return Promise.resolve(undefined);
    var n = String(name).trim();
    return chromeGetAll().then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].name === n) return list[i];
      }
      return undefined;
    });
  }

  function chromePut(snippet) {
    var record = toRecord(snippet);
    if (!record.name) return Promise.reject(new Error("Snippet must have a non-empty name"));
    return chromeGetAll().then(function (list) {
      var byName = Object.create(null);
      for (var i = 0; i < list.length; i++) {
        byName[list[i].name] = list[i];
      }
      byName[record.name] = record;
      var merged = [];
      for (var k in byName) {
        if (Object.prototype.hasOwnProperty.call(byName, k)) merged.push(byName[k]);
      }
      return chromeReplaceAll(normalizeSnippetArray(merged));
    });
  }

  function chromePutMany(snippets) {
    if (!Array.isArray(snippets) || snippets.length === 0) return Promise.resolve();
    return chromeGetAll().then(function (existing) {
      var byName = Object.create(null);
      for (var e = 0; e < existing.length; e++) {
        byName[existing[e].name] = existing[e];
      }
      for (var i = 0; i < snippets.length; i++) {
        var r = toRecord(snippets[i]);
        if (r.name) byName[r.name] = r;
      }
      var merged = [];
      for (var k in byName) {
        if (Object.prototype.hasOwnProperty.call(byName, k)) merged.push(byName[k]);
      }
      return chromeReplaceAll(normalizeSnippetArray(merged));
    });
  }

  function chromeRemove(name) {
    if (name === undefined || name === null || String(name).trim() === "") return Promise.resolve();
    var n = String(name).trim();
    return chromeGetAll().then(function (list) {
      var filtered = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].name !== n) filtered.push(list[i]);
      }
      return chromeReplaceAll(filtered);
    });
  }

  function chromeRemoveMany(names) {
    if (!Array.isArray(names) || names.length === 0) return Promise.resolve();
    var removeSet = Object.create(null);
    for (var j = 0; j < names.length; j++) {
      if (names[j] !== undefined && names[j] !== null && String(names[j]).trim() !== "") {
        removeSet[String(names[j]).trim()] = true;
      }
    }
    return chromeGetAll().then(function (list) {
      var filtered = [];
      for (var i = 0; i < list.length; i++) {
        if (!removeSet[list[i].name]) filtered.push(list[i]);
      }
      return chromeReplaceAll(filtered);
    });
  }

  function chromeReplaceAll(snippets) {
    var normalized = normalizeSnippetArray(Array.isArray(snippets) ? snippets : []);
    if (!hasChromeStorage()) {
      return Promise.reject(new Error("chrome.storage.local not available"));
    }
    return storageSet({ [STORAGE_KEY]: normalized });
  }

  function withBackend(fn) {
    return readSnippetScope().then(function (scope) {
      return fn(scope);
    });
  }

  function init() {
    ensureCrossTabSnippetListener();
    return readSnippetScope().then(function (scope) {
      if (scope === SCOPE_ORIGIN) return idbInit();
      return migrateLegacyUserSnippetsIfNeeded();
    });
  }

  function openDB() {
    return init();
  }

  function getAll() {
    return withBackend(function (scope) {
      return scope === SCOPE_ORIGIN ? idbGetAll() : chromeGetAll();
    });
  }

  function get(name) {
    return withBackend(function (scope) {
      return scope === SCOPE_ORIGIN ? idbGet(name) : chromeGet(name);
    });
  }

  function put(snippet) {
    return withBackend(function (scope) {
      return scope === SCOPE_ORIGIN ? idbPut(snippet) : chromePut(snippet);
    });
  }

  function putMany(snippets) {
    return withBackend(function (scope) {
      return scope === SCOPE_ORIGIN ? idbPutMany(snippets) : chromePutMany(snippets);
    });
  }

  function remove(name) {
    return withBackend(function (scope) {
      return scope === SCOPE_ORIGIN ? idbRemove(name) : chromeRemove(name);
    });
  }

  function removeMany(names) {
    return withBackend(function (scope) {
      return scope === SCOPE_ORIGIN ? idbRemoveMany(names) : chromeRemoveMany(names);
    });
  }

  function replaceAll(snippets) {
    return withBackend(function (scope) {
      return scope === SCOPE_ORIGIN ? idbReplaceAll(snippets) : chromeReplaceAll(snippets);
    });
  }

  function getSnippetStorageScope() {
    return readSnippetScope();
  }

  function setSnippetStorageScope(scope) {
    if (scope !== SCOPE_ORIGIN && scope !== SCOPE_EXTENSION) {
      return Promise.reject(new Error("Invalid snippet storage scope"));
    }
    if (!hasChromeStorage()) {
      return Promise.reject(new Error("chrome.storage.local not available"));
    }
    return storageSet({ [SCOPE_KEY]: scope }).then(function () {
      return init();
    });
  }

  window.FM = window.FM || {};
  window.FM.snippetStorage = {
    init: init,
    openDB: openDB,
    getAll: getAll,
    get: get,
    put: put,
    putMany: putMany,
    remove: remove,
    removeMany: removeMany,
    replaceAll: replaceAll,
    getSnippetStorageScope: getSnippetStorageScope,
    setSnippetStorageScope: setSnippetStorageScope,
    SNIPPET_STORAGE_SCOPE_EXTENSION: SCOPE_EXTENSION,
    SNIPPET_STORAGE_SCOPE_ORIGIN: SCOPE_ORIGIN
  };
})();
