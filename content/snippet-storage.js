/**
 * IndexedDB storage layer for script snippets.
 * - No localStorage is used; all snippet data lives in IndexedDB.
 * - Migrates existing snippets from chrome.storage.local (userSnippets) on first use.
 * - Uses async/await and Promises; safe to use from content scripts and options page.
 */
(function () {
  const DB_NAME = "FMSnippetDB";
  const DB_VERSION = 1;
  const STORE_NAME = "scriptSnippets";
  const CHROME_LEGACY_KEY = "userSnippets";
  const MIGRATION_FLAG_KEY = "fm-snippets-migrated-to-idb";

  let dbPromise = null;

  /**
   * Opens the IndexedDB database and creates the object store if needed.
   * @returns {Promise<IDBDatabase>}
   */
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () { resolve(req.result); };
      req.onupgradeneeded = function (ev) {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
    });
    return dbPromise;
  }

  /**
   * Runs a read-only transaction and returns a result.
   * @param {string} storeName
   * @param {string} mode
   * @param {function(IDBObjectStore): Promise<any>} fn
   * @returns {Promise<any>}
   */
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

  /**
   * Migrate snippets from chrome.storage.local to IndexedDB (once per context).
   * @returns {Promise<void>}
   */
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
        putMany(list)
          .then(function () {
            chrome.storage.local.set({ [MIGRATION_FLAG_KEY]: "1" }, resolve);
          })
          .catch(function () { resolve(); });
      });
    });
  }

  /**
   * Ensure DB is open and migration has run. Call once before using other APIs if you want migration.
   * @returns {Promise<IDBDatabase>}
   */
  function init() {
    return openDB().then(function (db) {
      return migrateFromChromeStorage().then(function () { return db; });
    });
  }

  /**
   * Get all snippets.
   * @returns {Promise<Array<{id: string, name?: string, description?: string, code: string}>>}
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
   * Get one snippet by id.
   * @param {string} id
   * @returns {Promise<{id: string, name?: string, description?: string, code: string}|undefined>}
   */
  function get(id) {
    if (id == null || String(id).trim() === "") return Promise.resolve(undefined);
    return withStore(STORE_NAME, "readonly", function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.get(String(id).trim());
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /**
   * Create or update a single snippet.
   * @param {{id: string, name?: string, description?: string, code: string}} snippet
   * @returns {Promise<void>}
   */
  function put(snippet) {
    if (!snippet || typeof snippet.id !== "string" || String(snippet.id).trim() === "") {
      return Promise.reject(new Error("Snippet must have a non-empty id"));
    }
    var record = {
      id: String(snippet.id).trim(),
      name: typeof snippet.name === "string" ? snippet.name : (snippet.name ? String(snippet.name) : snippet.id),
      description: typeof snippet.description === "string" ? snippet.description : (snippet.description ? String(snippet.description) : ""),
      code: typeof snippet.code === "string" ? snippet.code : String(snippet.code || "")
    };
    return withStore(STORE_NAME, "readwrite", function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.put(record);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /**
   * Write multiple snippets (merge by id).
   * @param {Array<{id: string, name?: string, description?: string, code: string}>} snippets
   * @returns {Promise<void>}
   */
  function putMany(snippets) {
    if (!Array.isArray(snippets) || snippets.length === 0) return Promise.resolve();
    return withStore(STORE_NAME, "readwrite", function (store) {
      var i = 0;
      function next() {
        if (i >= snippets.length) return Promise.resolve();
        var s = snippets[i++];
        if (!s || typeof s.id !== "string" || String(s.id).trim() === "") return next();
        var record = {
          id: String(s.id).trim(),
          name: typeof s.name === "string" ? s.name : (s.name ? String(s.name) : s.id),
          description: typeof s.description === "string" ? s.description : (s.description ? String(s.description) : ""),
          code: typeof s.code === "string" ? s.code : String(s.code || "")
        };
        return new Promise(function (resolve, reject) {
          var req = store.put(record);
          req.onsuccess = function () { resolve(next()); };
          req.onerror = function () { reject(req.error); };
        });
      }
      return next();
    });
  }

  /**
   * Delete a snippet by id.
   * @param {string} id
   * @returns {Promise<void>}
   */
  function remove(id) {
    if (id == null || String(id).trim() === "") return Promise.resolve();
    return withStore(STORE_NAME, "readwrite", function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.delete(String(id).trim());
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /**
   * Replace all snippets with the given array (clear store then put many).
   * @param {Array<{id: string, name?: string, description?: string, code: string}>} snippets
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
            var s = snippets[i++];
            if (!s || typeof s.id !== "string" || String(s.id).trim() === "") {
              putNext();
              return;
            }
            var record = {
              id: String(s.id).trim(),
              name: typeof s.name === "string" ? s.name : (s.name ? String(s.name) : s.id),
              description: typeof s.description === "string" ? s.description : (s.description ? String(s.description) : ""),
              code: typeof s.code === "string" ? s.code : String(s.code || "")
            };
            var req = store.put(record);
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
    replaceAll: replaceAll
  };
})();
