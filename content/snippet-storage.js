/**
 * IndexedDB storage layer for script snippets.
 * - No localStorage; all snippet data lives in IndexedDB.
 * - Unique key is snippet name (not id). Schema: { name, description?, code }.
 * - Migrates from chrome.storage.local and from id-based store (v1) to name-based (v2).
 */
(function () {
  const DB_NAME = "FMSnippetDB";
  const DB_VERSION = 2;
  const STORE_NAME = "scriptSnippets_name";
  const CHROME_LEGACY_KEY = "userSnippets";
  const MIGRATION_FLAG_KEY = "fm-snippets-migrated-to-idb";

  let dbPromise = null;

  /** Normalize raw snippet to stored shape: { name, description, code }. Name is required. */
  function toRecord(s) {
    var name = (s && typeof s.name === "string" && s.name.trim() !== "")
      ? s.name.trim()
      : (s && s.id != null && String(s.id).trim() !== "")
        ? String(s.id).trim()
        : "";
    return {
      name: name,
      description: (s && s.description != null) ? String(s.description) : "",
      code: (s && s.code != null) ? String(s.code) : ""
    };
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () { resolve(req.result); };
      req.onupgradeneeded = function (ev) {
        const db = ev.target.result;
        const tx = ev.target.transaction;
        if (ev.oldVersion < 2) {
          if (db.objectStoreNames.contains("scriptSnippets")) {
            const oldStore = tx.objectStore("scriptSnippets");
            const newStore = db.createObjectStore(STORE_NAME, { keyPath: "name" });
            const cursorReq = oldStore.openCursor();
            cursorReq.onsuccess = function () {
              const cursor = cursorReq.result;
              if (cursor) {
                const v = cursor.value;
                const name = (v.name && String(v.name).trim()) || (v.id && String(v.id).trim()) || "";
                if (name) {
                  newStore.put({
                    name: name,
                    description: (v.description != null) ? String(v.description) : "",
                    code: (v.code != null) ? String(v.code) : ""
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
    return dbPromise;
  }

  function withStore(storeName, mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const p = fn(store);
        if (p && typeof p.then === "function") {
          p.then(resolve).catch(reject);
        } else {
          resolve(p);
        }
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function migrateFromChromeStorage() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      chrome.storage.local.get([MIGRATION_FLAG_KEY, CHROME_LEGACY_KEY], function (res) {
        if (res[MIGRATION_FLAG_KEY] === "1") {
          resolve();
          return;
        }
        const list = Array.isArray(res[CHROME_LEGACY_KEY]) ? res[CHROME_LEGACY_KEY] : [];
        if (list.length === 0) {
          chrome.storage.local.set({ [MIGRATION_FLAG_KEY]: "1" }, resolve);
          return;
        }
        const normalized = [];
        for (var i = 0; i < list.length; i++) {
          var r = toRecord(list[i]);
          if (r.name) normalized.push(r);
        }
        putMany(normalized)
          .then(function () {
            chrome.storage.local.set({ [MIGRATION_FLAG_KEY]: "1" }, resolve);
          })
          .catch(function () { resolve(); });
      });
    });
  }

  function init() {
    return openDB().then(function (db) {
      return migrateFromChromeStorage().then(function () { return db; });
    });
  }

  /**
   * Get all snippets. Each item: { name, description?, code }.
   * @returns {Promise<Array<{name: string, description?: string, code: string}>>}
   */
  function getAll() {
    return withStore(STORE_NAME, "readonly", function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /**
   * Get one snippet by name.
   * @param {string} name
   * @returns {Promise<{name: string, description?: string, code: string}|undefined>}
   */
  function get(name) {
    if (name == null || String(name).trim() === "") return Promise.resolve(undefined);
    return withStore(STORE_NAME, "readonly", function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.get(String(name).trim());
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /**
   * Create or update a single snippet. Unique key is name.
   * @param {{name: string, description?: string, code: string}} snippet
   * @returns {Promise<void>}
   */
  function put(snippet) {
    var record = toRecord(snippet);
    if (!record.name) return Promise.reject(new Error("Snippet must have a non-empty name"));
    return withStore(STORE_NAME, "readwrite", function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.put(record);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /**
   * Write multiple snippets (merge by name).
   * @param {Array<{name: string, description?: string, code: string}>} snippets
   * @returns {Promise<void>}
   */
  function putMany(snippets) {
    if (!Array.isArray(snippets) || snippets.length === 0) return Promise.resolve();
    return withStore(STORE_NAME, "readwrite", function (store) {
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

  /**
   * Delete a snippet by name.
   * @param {string} name
   * @returns {Promise<void>}
   */
  function remove(name) {
    if (name == null || String(name).trim() === "") return Promise.resolve();
    return withStore(STORE_NAME, "readwrite", function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.delete(String(name).trim());
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /**
   * Remove multiple snippets by name.
   * @param {string[]} names
   * @returns {Promise<void>}
   */
  function removeMany(names) {
    if (!Array.isArray(names) || names.length === 0) return Promise.resolve();
    return withStore(STORE_NAME, "readwrite", function (store) {
      var i = 0;
      function next() {
        if (i >= names.length) return Promise.resolve();
        var n = names[i++];
        if (n == null || String(n).trim() === "") return next();
        return new Promise(function (resolve, reject) {
          var req = store.delete(String(n).trim());
          req.onsuccess = function () { resolve(next()); };
          req.onerror = function () { reject(req.error); };
        });
      }
      return next();
    });
  }

  /**
   * Replace all snippets with the given array.
   * @param {Array<{name: string, description?: string, code: string}>} snippets
   * @returns {Promise<void>}
   */
  function replaceAll(snippets) {
    return withStore(STORE_NAME, "readwrite", function (store) {
      return new Promise(function (resolve, reject) {
        const clearReq = store.clear();
        clearReq.onsuccess = function () {
          if (!Array.isArray(snippets) || snippets.length === 0) {
            resolve();
            return;
          }
          var i = 0;
          function putNext() {
            if (i >= snippets.length) {
              resolve();
              return;
            }
            var r = toRecord(snippets[i++]);
            if (!r.name) {
              putNext();
              return;
            }
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
    replaceAll: replaceAll
  };
})();
