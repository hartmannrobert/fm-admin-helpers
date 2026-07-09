/**
 * Script snippet persistence in chrome.storage.local (key fmScriptSnippets) — shared across all Fusion Manage tenants.
 * Migrates legacy userSnippets into fmScriptSnippets on first init.
 */
(function () {
  const STORAGE_KEY = "fmScriptSnippets";
  const LEGACY_USER_SNIPPETS_KEY = "userSnippets";

  var snippetStorageListenerAttached = false;

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
      if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return;
      try {
        window.dispatchEvent(new CustomEvent("fm-snippets-changed"));
      } catch (e) { /* ignore */ }
    });
  }

  function getAll() {
    if (!hasChromeStorage()) return Promise.resolve([]);
    return storageGet([STORAGE_KEY]).then(function (res) {
      var raw = res[STORAGE_KEY];
      if (!Array.isArray(raw)) return [];
      return normalizeSnippetArray(raw);
    }).catch(function () {
      return [];
    });
  }

  function get(name) {
    if (name === undefined || name === null || String(name).trim() === "") return Promise.resolve(undefined);
    var n = String(name).trim();
    return getAll().then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].name === n) return list[i];
      }
      return undefined;
    });
  }

  function replaceAll(snippets) {
    var normalized = normalizeSnippetArray(Array.isArray(snippets) ? snippets : []);
    if (!hasChromeStorage()) {
      return Promise.reject(new Error("chrome.storage.local not available"));
    }
    return storageSet({ [STORAGE_KEY]: normalized });
  }

  function put(snippet) {
    var record = toRecord(snippet);
    if (!record.name) return Promise.reject(new Error("Snippet must have a non-empty name"));
    return getAll().then(function (list) {
      var byName = Object.create(null);
      for (var i = 0; i < list.length; i++) {
        byName[list[i].name] = list[i];
      }
      byName[record.name] = record;
      var merged = [];
      for (var k in byName) {
        if (Object.prototype.hasOwnProperty.call(byName, k)) merged.push(byName[k]);
      }
      return replaceAll(merged);
    });
  }

  function putMany(snippets) {
    if (!Array.isArray(snippets) || snippets.length === 0) return Promise.resolve();
    return getAll().then(function (existing) {
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
      return replaceAll(merged);
    });
  }

  function remove(name) {
    if (name === undefined || name === null || String(name).trim() === "") return Promise.resolve();
    var n = String(name).trim();
    return getAll().then(function (list) {
      var filtered = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].name !== n) filtered.push(list[i]);
      }
      return replaceAll(filtered);
    });
  }

  function removeMany(names) {
    if (!Array.isArray(names) || names.length === 0) return Promise.resolve();
    var removeSet = Object.create(null);
    for (var j = 0; j < names.length; j++) {
      if (names[j] !== undefined && names[j] !== null && String(names[j]).trim() !== "") {
        removeSet[String(names[j]).trim()] = true;
      }
    }
    return getAll().then(function (list) {
      var filtered = [];
      for (var i = 0; i < list.length; i++) {
        if (!removeSet[list[i].name]) filtered.push(list[i]);
      }
      return replaceAll(filtered);
    });
  }

  function init() {
    ensureCrossTabSnippetListener();
    return migrateLegacyUserSnippetsIfNeeded();
  }

  function openDB() {
    return init();
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
