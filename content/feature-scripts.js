(function () {
  // Ensure FM root
  window.FM = window.FM || {};
  FM.state = FM.state || {};

  // ---------- Shared utilities ----------
  const utils = (function () {
    function normalize(s) {
      return (s || "").toLowerCase().trim();
    }

    function bySelector(sel, root = document) {
      try { return root.querySelector(sel); } catch (e) { return null; }
    }

    function bySelectorAll(sel, root = document) {
      try { return Array.from(root.querySelectorAll(sel)); } catch (e) { return []; }
    }

    function safeInsertAfter(newEl, refEl) {
      if (!refEl || !refEl.parentElement) return false;
      refEl.parentElement.insertBefore(newEl, refEl.nextSibling);
      return true;
    }

    return {
      normalize,
      bySelector,
      bySelectorAll,
      safeInsertAfter,
      escapeCss(id) { return CSS && CSS.escape ? CSS.escape(id) : id.replace(/([^\w-])/g, "\\$1"); }
    };
  })();

  // ---------- SCRIPTS FEATURE ----------
  FM.features = FM.features || {};
  FM.features.scripts = (function () {
    const LS_KEY = "fmScriptsSimpleGridView";
    const BTN_CLASS = "fm-scripts-grid-toggle-btn";
    const GRID_BODY_CLASS = "fm-scripts-simple-grid";
    FM.state.scriptsFilterLastInputAt = FM.state.scriptsFilterLastInputAt || 0;

    // Helpers
    function isOnScriptsTab() {
      const href = String(location.href || "");
      const hash = String(location.hash || "");
      return href.includes("tab=scripts") || hash.includes("tab=scripts");
    }

    function isOnScriptFormPage() {
      const href = String(location.href || "");
      return href.includes("autodeskplm360.net") &&
        href.includes("script.form") &&
        /\bID=\d+/.test(href);
    }

    function setScriptFormPageTitle() {
      if (!isOnScriptFormPage()) return;
      const nameEl = document.getElementById("uniqueName");
      if (!nameEl) return;
      const name = (nameEl.value !== undefined ? nameEl.value : nameEl.textContent || "").toString().trim();
      if (!name) return;
      const targetDoc = window.top && window.top.document ? window.top.document : document;
      targetDoc.title = name;
    }

    function isScriptsGridEnabled() {
      return localStorage.getItem(LS_KEY) === "1";
    }
    function setScriptsGridEnabled(v) {
      localStorage.setItem(LS_KEY, v ? "1" : "0");
    }

    function getPrintBody() { return document.getElementById("print_body"); }
    function applyBodyGridClass(enabled) {
      const pb = getPrintBody();
      if (!pb) return;
      pb.classList.toggle(GRID_BODY_CLASS, !!enabled);
    }

    function updateToggleVisual(btn, enabled) {
      if (!btn) return;
      btn.classList.toggle("fm-active", !!enabled);
      btn.title = enabled ? "Switch to List View" : "Switch to Grid View";
      btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    }

    // Toggle button insertion (idempotent) — skip .itemsectionmenu inside whereused dialog
    function ensureToggleOnce() {
      const menus = document.querySelectorAll(".itemsectionmenu");
      let menu = null;
      for (let i = 0; i < menus.length; i++) {
        if (!menus[i].closest("#whereused-dialog")) {
          menu = menus[i];
          break;
        }
      }
      if (!menu) return;
      if (menu.querySelector(`.${BTN_CLASS}`)) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = BTN_CLASS + " fm-pill-toggle fm-toggle-btn-contained";
      btn.title = "Grid View";

      const labelEl = document.createElement("span");
      labelEl.className = "fm-toggle-label";
      labelEl.textContent = "Grid View";
      btn.appendChild(labelEl);

      const pillEl = document.createElement("span");
      pillEl.className = "fm-toggle-pill";
      const trackEl = document.createElement("span");
      trackEl.className = "fm-toggle-track";
      pillEl.appendChild(trackEl);
      const thumbEl = document.createElement("span");
      thumbEl.className = "fm-toggle-thumb";
      pillEl.appendChild(thumbEl);
      btn.appendChild(pillEl);

      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const next = !isScriptsGridEnabled();
        setScriptsGridEnabled(next);
        applyBodyGridClass(next);
        updateToggleVisual(btn, next);
      });

      menu.appendChild(btn);

      // initialize visuals
      const enabled = isScriptsGridEnabled();
      applyBodyGridClass(enabled);
      updateToggleVisual(btn, enabled);
    }

    // Filter input detection + "active typing" guard
    function findScriptsFilterInput() {
      return (
        document.querySelector("#fm-search-script input") ||
        document.querySelector("#fm-search-script") || // in-case a field created by us
        document.querySelector("#fm-search-script input") ||
        document.querySelector('.itemsectionmenu input[placeholder*="Filter"]') ||
        document.querySelector('.itemsectionmenu input[type="search"]') ||
        null
      );
    }

    function ensureScriptsFilterInputListener() {
      const input = findScriptsFilterInput();
      if (!input) return;
      if (input.dataset.fmFilterWatch === "1") return;
      input.dataset.fmFilterWatch = "1";
      const mark = () => { FM.state.scriptsFilterLastInputAt = Date.now(); };
      input.addEventListener("input", mark, { passive: true });
      input.addEventListener("keyup", mark, { passive: true });
    }

    function isActivelyFilteringScripts() {
      const input = findScriptsFilterInput();
      if (!input) return false;
      const recentlyTyped = Date.now() - (FM.state.scriptsFilterLastInputAt || 0) < 350;
      const focused = document.activeElement === input;
      const hasValue = String(input.value || "").trim().length > 0;
      return recentlyTyped || (focused && hasValue);
    }

    // Header / body reordering for scripts table
    function getScriptsTableRows() {
      const tables = document.querySelectorAll(".tableContainer");
      const rows = [];
      for (const t of tables) {
        const body = t.querySelector("tbody");
        if (!body) continue;
        for (const r of body.querySelectorAll("tr")) rows.push(r);
      }
      return rows;
    }

    function getScriptIdFromHref(href) {
      const h = String(href || "");
      const m = h.match(/script\.form\?ID=(\d+)/i);
      return m ? m[1] : null;
    }

    function identifyScriptsCells(row) {
      const tds = Array.from(row.querySelectorAll(":scope > td"));
      if (!tds.length) return null;

      const action = tds.find(td => td.querySelector('a[href*="script.form?ID="]')) || null;
      const whereUsed =
        tds.find(td => {
          const a = td.querySelector("a");
          const txt = (a?.textContent || td.textContent || "").toLowerCase();
          const onclick = String(a?.getAttribute("onclick") || "");
          return txt.includes("where used") || onclick.includes("showAjaxWhereUsed");
        }) || null;

      const name =
        tds.find(td => td.querySelector("b")) ||
        tds.find(td => (td.textContent || "").trim() && td.classList.contains("nowrap")) ||
        null;

      const used = new Set([action, whereUsed, name].filter(Boolean));
      const desc = tds.find(td => !used.has(td)) || null;

      return { action, name, desc, whereUsed, tds };
    }

    function reorderScriptsBody(tableContainerEl) {
      const tbody = tableContainerEl.querySelector("tbody");
      if (!tbody) return false;
      const rows = Array.from(tbody.querySelectorAll("tr"));
      let changed = false;

      for (const row of rows) {
        const info = identifyScriptsCells(row);
        if (!info) continue;
        const { name, action, desc, whereUsed } = info;
        if (!name || !action) continue;

        const desired = [name, action, desc, whereUsed].filter(Boolean);
        const current = Array.from(row.querySelectorAll(":scope > td"));
        const same =
          current.length === desired.length &&
          current.every((c, i) => c === desired[i]);

        if (same) continue;

        for (const cell of desired) row.appendChild(cell);
        changed = true;
      }

      return changed;
    }

    function rebuildScriptsHeader(tableContainerEl) {
      const theadRow = tableContainerEl.querySelector("thead tr");
      if (!theadRow) return;
      const ths = Array.from(theadRow.querySelectorAll(":scope > th"));
      if (!ths.length) return;

      const headerText = ths.map(th => (th.textContent || "").trim().toLowerCase()).join("|");
      const looksLikeScripts =
        headerText.includes("unique name") || headerText.includes("description") || headerText.includes("action");
      if (!looksLikeScripts) return;

      theadRow.innerHTML = "";
      const mk = (txt, style) => {
        const th = document.createElement("th");
        th.textContent = txt;
        if (style) th.setAttribute("style", style);
        return th;
      };

      theadRow.appendChild(mk("Unique Name", "min-width:8em"));
      theadRow.appendChild(mk("Action", ""));
      theadRow.appendChild(mk("Description", "width:100%"));
      theadRow.appendChild(mk("", ""));
    }

    // Form script field: Fusion Lifecycle uses <textarea id="code" name="code"> (hidden) with full content.
    function getCodeTextarea(doc) {
      var ta = doc.getElementById("code") || doc.querySelector('textarea[name="code"]');
      return ta && ta.tagName === "TEXTAREA" ? ta : null;
    }

    // Get script editor content: prefer live Ace editor (current edits), then textarea/scroll fallbacks.
    // ace-capture.js (world: MAIN) can expose full content via custom events when the page's Ace is captured.
    function getScriptEditorContent() {
      const doc = document;
      const aceEditors = doc.querySelectorAll(".ace_editor");

      function getFromMainWorldAce() {
        return new Promise(function (resolve) {
          var timeout = setTimeout(function () { resolve(null); }, 800);
          doc.addEventListener("fm-ace-content", function onContent(ev) {
            clearTimeout(timeout);
            doc.removeEventListener("fm-ace-content", onContent);
            resolve(typeof ev.detail === "string" ? ev.detail : null);
          }, { once: true });
          doc.dispatchEvent(new CustomEvent("fm-ace-get-content"));
        });
      }

      function getFromSession(session) {
        if (!session || typeof session.getLength !== "function" || typeof session.getLine !== "function") return null;
        try {
          const len = session.getLength();
          const parts = [];
          for (let r = 0; r < len; r += 1) parts.push(session.getLine(r) || "");
          return parts.join("\n");
        } catch (e) { /* ignore */ }
        return null;
      }

      function getFromEditor(editor) {
        if (!editor) return null;
        try {
          if (typeof editor.getValue === "function") return editor.getValue();
          const session = editor.session || (typeof editor.getSession === "function" ? editor.getSession() : null);
          if (session) {
            if (typeof session.getValue === "function") return session.getValue();
            if (session.getDocument && typeof session.getDocument === "function") {
              const docObj = session.getDocument();
              if (docObj && typeof docObj.getValue === "function") return docObj.getValue();
              if (docObj && typeof docObj.getAllLines === "function") {
                var newline = (typeof docObj.getNewLineCharacter === "function" ? docObj.getNewLineCharacter() : undefined) || "\n";
                return docObj.getAllLines().join(newline);
              }
            }
            const fromSession = getFromSession(session);
            if (fromSession !== null) return fromSession;
          }
        } catch (e) { /* ignore */ }
        return null;
      }

      function findEditorFromElement(el) {
        if (el.env && el.env.editor) return el.env.editor;
        try {
          if (typeof window.ace !== "undefined") return window.ace.edit(el.id || el);
        } catch (e) { /* ignore */ }
        var keys = [];
        try {
          for (var k in el) { if (Object.prototype.hasOwnProperty.call(el, k)) keys.push(k); }
        } catch (e) { return null; }
        for (var j = 0; j < keys.length; j += 1) {
          var val = el[keys[j]];
          if (val && typeof val === "object" && typeof val.getValue === "function" && (val.session || (typeof val.getSession === "function" && val.getSession()))) return val;
        }
        return null;
      }

      function runFallbacks() {
        for (let i = 0; i < aceEditors.length; i += 1) {
          const editor = findEditorFromElement(aceEditors[i]);
          if (editor) {
            const out = getFromEditor(editor);
            if (typeof out === "string") return Promise.resolve(out);
          }
        }
        var globalNames = ["aceEditor", "editor", "scriptEditor", "codeEditor"];
        for (var g = 0; g < globalNames.length; g += 1) {
          try {
            var w = typeof window !== "undefined" ? window : null;
            if (w && w[globalNames[g]]) {
              const out = getFromEditor(w[globalNames[g]]);
              if (typeof out === "string") return Promise.resolve(out);
            }
          } catch (e) { /* ignore */ }
        }
        if (typeof _plm !== "undefined" && _plm.callFunc) {
          try {
            const hostContent = _plm.callFunc("scriptEditor", "getValue") || _plm.callFunc("scriptEditor", "getContent");
            if (typeof hostContent === "string" && hostContent.length > 0) return Promise.resolve(hostContent);
          } catch (e) { /* ignore */ }
        }
        var codeTa = getCodeTextarea(doc);
        if (codeTa) {
          var val = (codeTa.value || "").trim();
          if (val.length > 0) return Promise.resolve(val);
        }
        return Promise.resolve("");
      }

      return getFromMainWorldAce().then(function (mainWorldContent) {
        if (typeof mainWorldContent === "string" && mainWorldContent.length > 0) return mainWorldContent;
        return runFallbacks();
      });
    }

    // If we landed on script.form without ID after a Copy & Save, redirect to script.form?ID=... (restore URL)
    function restoreScriptFormUrlAfterSave() {
      const href = String(location.href || "");
      const pathname = String(location.pathname || "");
      if (!pathname.includes("script.form") || /\bID=\d+/.test(href)) return;
      try {
        const stored = sessionStorage.getItem("fmScriptFormIdAfterSave");
        if (!stored) return;
        sessionStorage.removeItem("fmScriptFormIdAfterSave");
        const base = location.origin + pathname;
        location.replace(base + "?ID=" + stored);
      } catch (e) { /* ignore */ }
    }

    // Get Ace scroll/cursor state from main world (ace-capture.js) for restore-after-save.
    function getAceEditorState() {
      const doc = document;
      return new Promise(function (resolve) {
        const timeout = setTimeout(function () { resolve(null); }, 500);
        doc.addEventListener("fm-ace-state", function onState(ev) {
          clearTimeout(timeout);
          doc.removeEventListener("fm-ace-state", onState);
          resolve(ev.detail && typeof ev.detail === "object" ? ev.detail : null);
        }, { once: true });
        doc.dispatchEvent(new CustomEvent("fm-ace-get-state"));
      });
    }

    // Restore Ace scroll/cursor after reload (Copy & Save). Tries a few times so Ace is ready.
    function restoreAceEditorState() {
      const href = String(location.href || "");
      const idMatch = href.match(/script\.form\?ID=(\d+)/i) || href.match(/[?&]ID=(\d+)/i);
      const scriptId = idMatch ? idMatch[1] : null;
      if (!scriptId) return;
      let raw;
      try {
        raw = sessionStorage.getItem("fmAceRestoreState_" + scriptId);
      } catch (e) { return; }
      if (!raw) return;
      let state;
      try {
        state = JSON.parse(raw);
      } catch (e) { return; }
      if (!state || typeof state !== "object") return;

      const doc = document;
      function tryRestore() {
        doc.dispatchEvent(new CustomEvent("fm-ace-set-state", { detail: state }));
      }
      function clearStored() {
        try { sessionStorage.removeItem("fmAceRestoreState_" + scriptId); } catch (e) {}
      }
      doc.addEventListener("fm-ace-state-restored", function onRestored() {
        doc.removeEventListener("fm-ace-state-restored", onRestored);
        clearStored();
      }, { once: true });
      const delays = [400, 900, 1600];
      delays.forEach(function (ms) {
        setTimeout(tryRestore, ms);
      });
      setTimeout(clearStored, 2500);
    }

    // Script form page: add "Copy & Save" button in itemdisplayoptions — copy script to clipboard, then save
    function ensureCopySaveButton() {
      restoreScriptFormUrlAfterSave();
      if (!isOnScriptFormPage()) return;
      restoreAceEditorState();
      const container = document.getElementById("itemdisplayoptions") || document.querySelector(".itemdisplayoptions");
      if (!container) return;
      if (document.getElementById("fm-copy-save-script-btn")) return;
      const saveBtn = document.getElementById("savebutton");
      const btn = document.createElement("button");
      btn.id = "fm-copy-save-script-btn";
      btn.type = "button";
      btn.className = "submitinput fm-copy-save-script";
      btn.name = "fmCopySaveBtn";
      btn.textContent = "Copy to Clipboard and Save";
      btn.title = "Copy script to clipboard and save";
      btn.addEventListener("click", function () {
        const href = String(location.href || "");
        const idMatch = href.match(/script\.form\?ID=(\d+)/i) || href.match(/[?&]ID=(\d+)/i);
        const scriptId = idMatch ? idMatch[1] : null;
        if (scriptId) {
          try { sessionStorage.setItem("fmScriptFormIdAfterSave", scriptId); } catch (e) { /* ignore */ }
        }
        function triggerSave() {
          if (typeof _plm !== "undefined" && _plm.callFunc) _plm.callFunc("scriptEditor", "save");
          else if (saveBtn) saveBtn.click();
        }
        Promise.all([getAceEditorState(), getScriptEditorContent()]).then(function (results) {
          const state = results[0];
          const text = results[1];
          if (state && scriptId) {
            try { sessionStorage.setItem("fmAceRestoreState_" + scriptId, JSON.stringify(state)); } catch (e) { /* ignore */ }
          }
          if (typeof navigator.clipboard !== "undefined" && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(triggerSave, triggerSave);
          } else {
            triggerSave();
          }
        }).catch(function () { triggerSave(); });
      });
      if (saveBtn && saveBtn.parentNode === container) {
        container.insertBefore(btn, saveBtn);
      } else {
        container.appendChild(btn);
      }
    }

    // Script form page: find the table row that contains the "Code" label (td.fieldName with "Code")
    function findCodeRow(doc) {
      const byId = doc.getElementById("section-code");
      if (byId) return byId;
      const rows = utils.bySelectorAll("tr", doc);
      for (let i = 0; i < rows.length; i++) {
        const fd = rows[i].querySelector("td.fieldName");
        if (!fd) continue;
        const strong = fd.querySelector("strong");
        const text = (strong ? strong.textContent : fd.textContent || "").trim();
        if (utils.normalize(text) === "code") return rows[i];
      }
      return null;
    }

    // Script form page: Insert snippet button + dropdown. Click to insert at cursor or replace selection.
    // snippets: optional array; if omitted, uses built-in only (for backward compat). When provided, built-in + user merged.
    // forceRefresh: when true, remove existing wrap and rebuild (e.g. after storage change). When false, skip if wrap already exists so tick() does not constantly recreate the button.
    function ensureSnippetsButton(snippets, forceRefresh) {
      if (!isOnScriptFormPage()) return;
      const builtIn = window.FM && Array.isArray(window.FM.scriptSnippets) ? window.FM.scriptSnippets : [];
      const list = Array.isArray(snippets) ? snippets : builtIn;
      if (list.length === 0) return;

      const codeRow = findCodeRow(document);
      if (!codeRow) return;
      const existingWrap = codeRow.querySelector(".fm-snippets-wrap");
      if (existingWrap && !forceRefresh) return;
      if (existingWrap) existingWrap.remove();

      const nameCell = codeRow.querySelector("td.fieldName");
      if (!nameCell) return;

      const wrap = document.createElement("div");
      wrap.className = "fm-snippets-wrap";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fm-snippets-btn";
      btn.textContent = "Insert snippet";
      btn.title = "Click to insert at cursor or replace selection";

      const dropdown = document.createElement("div");
      dropdown.className = "fm-snippets-dropdown";
      dropdown.setAttribute("hidden", "");

      const listEl = document.createElement("div");
      listEl.className = "fm-snippets-list";

      const searchWrap = document.createElement("div");
      searchWrap.className = "fm-snippets-search-wrap";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.className = "fm-snippets-search";
      searchInput.placeholder = "Search snippets…";
      searchInput.autocomplete = "off";
      searchWrap.appendChild(searchInput);
      listEl.appendChild(searchWrap);

      const listScroll = document.createElement("div");
      listScroll.className = "fm-snippets-list-scroll";

      const noMatchesEl = document.createElement("div");
      noMatchesEl.className = "fm-snippets-no-matches";
      noMatchesEl.textContent = "No matching snippets";
      noMatchesEl.setAttribute("hidden", "");

      function applySearch() {
        const q = (searchInput.value || "").trim().toLowerCase();
        let visibleCount = 0;
        const items = listScroll.querySelectorAll(".fm-snippets-item");
        for (let i = 0; i < items.length; i++) {
          const s = list[Number(items[i].dataset.snippetIndex)];
          const name = (s && s.name ? s.name : "").toLowerCase();
          const desc = (s && s.description ? s.description : "").toLowerCase();
          const match = q === "" || name.indexOf(q) !== -1 || desc.indexOf(q) !== -1;
          items[i].style.display = match ? "" : "none";
          if (match) visibleCount += 1;
        }
        noMatchesEl.hidden = visibleCount > 0;
      }

      function openDropdown() {
        dropdown.removeAttribute("hidden");
        searchInput.value = "";
        applySearch();
        searchInput.focus();
        window.postMessage({ type: "fm-ace-snippet-dropdown-opened" }, window.location.origin || "*");
      }

      function closeDropdown(removePreview) {
        if (removePreview !== false) {
          window.postMessage({ type: "fm-ace-snippet-dropdown-closed" }, window.location.origin || "*");
        }
        dropdown.setAttribute("hidden", "");
      }

      function insertSnippet(snippet) {
        if (!snippet || typeof snippet.code !== "string") return;
        window.postMessage({ type: "fm-ace-insert-snippet", code: snippet.code }, window.location.origin || "*");
        /* Keep dropdown open so user can insert more or pick another snippet to replace. */
      }

      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const item = document.createElement("div");
        item.className = "fm-snippets-item";
        item.dataset.snippetId = s.id || String(i);
        item.dataset.snippetIndex = String(i);

        const nameEl = document.createElement("span");
        nameEl.className = "fm-snippets-item-name";
        nameEl.textContent = s.name || "Snippet";
        const descEl = document.createElement("span");
        descEl.className = "fm-snippets-item-desc";
        descEl.textContent = (s.description || "").trim() || s.name || "";

        item.appendChild(nameEl);
        item.appendChild(descEl);
        item.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          insertSnippet(s);
        });

        listScroll.appendChild(item);
      }

      listEl.appendChild(noMatchesEl);
      listEl.appendChild(listScroll);

      searchInput.addEventListener("input", applySearch);
      searchInput.addEventListener("keydown", function (ev) {
        ev.stopPropagation();
      });

      dropdown.appendChild(listEl);

      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (dropdown.hasAttribute("hidden")) openDropdown(); else closeDropdown();
      });

      wrap.appendChild(btn);
      wrap.appendChild(dropdown);

      document.addEventListener("click", function outside(ev) {
        if (dropdown.hasAttribute("hidden")) return;
        if (wrap.contains(ev.target)) return;
        closeDropdown();
      });

      nameCell.appendChild(wrap);
    }

    function refreshSnippetsDropdown(forceRefresh) {
      if (!isOnScriptFormPage()) return;
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        ensureSnippetsButton(undefined, forceRefresh);
        return;
      }
      chrome.storage.local.get(["userSnippets"], function (res) {
        const builtIn = window.FM && Array.isArray(window.FM.scriptSnippets) ? window.FM.scriptSnippets : [];
        const user = Array.isArray(res.userSnippets) ? res.userSnippets : [];
        ensureSnippetsButton(builtIn.concat(user), forceRefresh);
      });
    }

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== "local" || !changes.userSnippets) return;
        refreshSnippetsDropdown(true);
      });
    }

    // On script form page: make library script names in #section-includes clickable (open in new tab, color #5780AE)
    function ensureLibraryScriptLinksOpenInNewTab() {
      if (!isOnScriptFormPage()) return;
      const row = document.getElementById("section-includes");
      if (!row) return;
      const td = row.querySelector("td.fieldValue");
      if (!td) return;
      const list = td.querySelector("ul.includedScripts");
      if (!list) return;
      const items = list.querySelectorAll("li.library-link");
      for (const li of items) {
        if (li.dataset.fmLibraryLinkDone === "1") continue;
        const input = li.querySelector('input[name="dependsOnScripts"]');
        if (!input) continue;
        const scriptId = String(input.value || "").trim();
        if (!scriptId) continue;
        const span = li.querySelector("span[onclick*='openFile']");
        if (!span) continue;
        const scriptName = (span.textContent || "").trim();
        const a = document.createElement("a");
        a.href = `/script.form?ID=${encodeURIComponent(scriptId)}`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "fm-library-script-link";
        a.textContent = scriptName;
        span.replaceWith(a);
        li.dataset.fmLibraryLinkDone = "1";
      }
    }

    function ensureScriptNameOpensInNewTab(tableContainerEl) {
      const rows = tableContainerEl.querySelectorAll("tbody tr");
      for (const row of rows) {
        if (row.dataset.fmNameNewtab === "1") continue;
        const editLink = row.querySelector('a[href*="script.form?ID="]');
        if (!editLink) continue;
        const scriptId = getScriptIdFromHref(editLink.getAttribute("href"));
        if (!scriptId) continue;

        const nameCell =
          row.querySelector('td b')?.closest("td") ||
          row.querySelector("td.nowrap") ||
          row.querySelector("td");
        if (!nameCell) continue;

        nameCell.classList.add("fm-script-name-link");
        nameCell.style.cursor = "pointer";
        function openScriptInNewTab() {
          window.open(`/script.form?ID=${scriptId}`, "_blank", "noopener,noreferrer");
        }
        nameCell.addEventListener("click", (ev) => {
          if (ev.defaultPrevented) return;
          const interactive = ev.target?.closest?.("a, button, input, textarea, select, label");
          if (interactive) return;
          if (ev.button === 2) return;
          if (ev.button === 0 && (ev.shiftKey || ev.altKey)) return;
          if (ev.button !== 0 && ev.button !== 1) return;
          ev.preventDefault();
          ev.stopPropagation();
          openScriptInNewTab();
        });

        row.dataset.fmNameNewtab = "1";
      }
    }

    // Simple search field we inject (idempotent)
    function applyScriptsFilter(query) {
      const q = utils.normalize(query);
      const rows = getScriptsTableRows();
      if (rows.length === 0) return;
      for (const row of rows) {
        if (row.dataset.fmSearchText == null) row.dataset.fmSearchText = utils.normalize(row.textContent);
        const text = row.dataset.fmSearchText;
        const match = q === "" || text.includes(q);
        row.style.display = match ? "" : "none";
      }
    }

    function ensureScriptsSearchField() {
      if (!isOnScriptsTab()) return;
      const createBtn = document.getElementById("createbutton");
      if (!createBtn) return;
      if (document.getElementById("fm-search-script")) return;

      const input = document.createElement("input");
      input.id = "fm-search-script";
      input.type = "text";
      input.placeholder = "Filter Scripts";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.classList.add("fm-search-input");

      let t = null;
      input.addEventListener("input", () => {
        window.clearTimeout(t);
        t = window.setTimeout(() => applyScriptsFilter(input.value), 150);
      });

      utils.safeInsertAfter(input, createBtn);
      applyScriptsFilter(input.value);
    }

    function keepScriptsSearchFilterInSync() {
      const input = document.getElementById("fm-search-script");
      if (!input) return;
      applyScriptsFilter(input.value);
    }

    // Move "ACTION" element earlier (guarded)
    function moveActionToSecondPositionOnce() {
      const actionEl = document.getElementById("list-ACTION");
      const parent = actionEl?.parentElement;
      if (!parent) return;
      if (parent.dataset.fmScriptsOrderDone === "1") return;
      const ok = moveChildByIdToIndex(parent, "list-ACTION", 1);
      if (ok) parent.dataset.fmScriptsOrderDone = "1";
    }

    // Utility used above (kept local)
    function moveChildByIdToIndex(parentEl, childId, targetIndex) {
      if (!parentEl) return false;
      const child = parentEl.querySelector(`#${utils.escapeCss(childId)}`);
      if (!child) return false;
      const kids = Array.from(parentEl.children).filter(n => n.nodeType === 1);
      if (!kids.length) return false;
      const clampedIndex = Math.max(0, Math.min(targetIndex, kids.length - 1));
      if (kids[clampedIndex] === child) return true;
      parentEl.insertBefore(child, kids[clampedIndex]);
      return true;
    }

    // Public ticks called by mainTick
    function tickSimpleGridView() {
      if (!isOnScriptsTab()) return;
      ensureToggleOnce();

      // ensure visuals updated once
      const menu = document.querySelector(".itemsectionmenu");
      const btn = menu ? menu.querySelector(`.${BTN_CLASS}`) : null;
      const enabled = isScriptsGridEnabled();
      applyBodyGridClass(enabled);
      updateToggleVisual(btn, enabled);
    }

    function tickEnhancements() {
      if (!isOnScriptsTab()) {
        // cleanup marker
        for (const el of document.querySelectorAll('.tableContainer[data-fm-scripts-table="1"]')) {
          delete el.dataset.fmScriptsTable;
        }
        return;
      }

      ensureScriptsFilterInputListener();

      // If grid view active and user is typing, avoid DOM churn
      if (isScriptsGridEnabled() && isActivelyFilteringScripts()) return;

      moveActionToSecondPositionOnce();

      const containers = document.querySelectorAll(".tableContainer");
      if (!containers.length) return;

      for (const c of containers) {
        c.dataset.fmScriptsTable = "1";
        if (c.dataset.fmScriptsHeaderRebuilt !== "1") {
          rebuildScriptsHeader(c);
          c.dataset.fmScriptsHeaderRebuilt = "1";
        }
        reorderScriptsBody(c);
        ensureScriptNameOpensInNewTab(c);
      }
    }

    function tickSearchField() {
      ensureScriptsSearchField();
      keepScriptsSearchFilterInSync();
    }

    // Expose tick functions
    return {
      tick: function () {
        setScriptFormPageTitle();
        ensureCopySaveButton();
        refreshSnippetsDropdown();
        ensureLibraryScriptLinksOpenInNewTab();
        tickSimpleGridView();
        tickEnhancements();
        tickSearchField();
      },
      tickSimpleGridView,
      tickEnhancements,
      tickSearchField
    };
  })();

  // ---------- PICKLISTS FEATURE ----------
  FM.features.picklists = (function () {
    // Helpers
    function isOnPicklistsPage() {
      const path = String(location.pathname || "");
      const href = String(location.href || "");
      const hash = String(location.hash || "");
      const newUi = /^\/plm\/admin\/system-configuration\/picklist-manager(\/|$)/.test(path);
      const legacy = /picklist/i.test(href) || /picklist/i.test(hash) || /pickList/i.test(href) || /pickList/i.test(hash);
      return newUi || legacy;
    }

    function getPicklistTableEl() {
      const btn = document.getElementById("cancelbutton");
      return (
        btn?.closest("#print_body")?.querySelector(".tableContainer table") ||
        document.querySelector(".tableContainer table")
      );
    }

    function isHeaderLikeRow(rowEl) {
      if (!rowEl) return false;
      if (rowEl.querySelector("th")) return true;
      const tds = rowEl.querySelectorAll("td");
      if (!tds.length) return true;
      const cls = String(rowEl.className || "");
      if (/header|thead|group|title/i.test(cls)) return true;
      return false;
    }

    function applyPicklistsFilter(query) {
      const tableEl = getPicklistTableEl();
      if (!tableEl) return;
      const q = utils.normalize(query);
      const rows = Array.from(tableEl.querySelectorAll("tr"));
      if (!rows.length) return;
      for (const row of rows) {
        if (isHeaderLikeRow(row)) {
          row.style.display = "";
          continue;
        }
        const text = utils.normalize(row.innerText);
        row.style.display = !q || text.includes(q) ? "" : "none";
      }
    }

    function ensurePicklistsSearchField() {
      if (!isOnPicklistsPage()) return;
      const cancelBtn = document.getElementById("cancelbutton");
      if (!cancelBtn) return;
      if (document.getElementById("fm-search-picklists")) return;

      const input = document.createElement("input");
      input.id = "fm-search-picklists";
      input.type = "text";
      input.placeholder = "Filter picklists";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.classList.add("fm-search-input");

      let t = null;
      input.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => applyPicklistsFilter(input.value), 150);
      });

      utils.safeInsertAfter(input, cancelBtn);
      applyPicklistsFilter(input.value);
    }

    // Column reorder helpers
    function getHeaderRow(tableEl) {
      const rows = Array.from(tableEl.querySelectorAll("tr"));
      for (const r of rows) if (r.querySelector("th")) return r;
      return null;
    }

    function getFirstDataRow(tableEl) {
      const rows = Array.from(tableEl.querySelectorAll("tbody tr"));
      for (const r of rows) if (r.querySelector("td")) return r;
      return null;
    }

    function getRowCells(rowEl) {
      return Array.from(rowEl.querySelectorAll(":scope > th, :scope > td"));
    }

    function detectActionLabelFromCell(cellEl) {
      const a = cellEl?.querySelector?.("a.link");
      const t = utils.normalize(a?.textContent || cellEl?.textContent);
      if (t === "edit") return "Edit";
      if (t === "delete") return "Delete";
      if (t.includes("where used")) return "Where Used";
      return "Action";
    }

    function moveCells(rowEl, fromIndexesInOriginalOrder, insertAfterIndex) {
      const cells = getRowCells(rowEl);
      const toMove = fromIndexesInOriginalOrder.map(i => cells[i]).filter(Boolean);
      if (!toMove.length) return;
      let anchor = cells[insertAfterIndex] || rowEl.firstElementChild;
      for (const cell of toMove) {
        cell.remove();
        anchor.insertAdjacentElement("afterend", cell);
        anchor = cell;
      }
    }

    function reorderColgroup(tableEl, lastN, actionWidths, descIndex) {
      const colgroup = tableEl.querySelector("colgroup");
      if (!colgroup) return;
      const cols = Array.from(colgroup.querySelectorAll("col"));
      if (cols.length < lastN + 2) return;
      const n = cols.length;
      const nameCol = cols[0];
      const descCol = cols[descIndex] || cols[1];
      const actionCols = cols.slice(n - lastN);
      for (const c of cols) c.remove();
      colgroup.appendChild(nameCol);
      let usedActions = 0;
      for (let i = 0; i < actionCols.length; i++) {
        const c = actionCols[i];
        const w = Number(actionWidths?.[i]);
        if (Number.isFinite(w)) {
          c.setAttribute("width", String(w) + "%");
          usedActions += w;
        }
        colgroup.appendChild(c);
      }
      const nameW = parseInt(String(nameCol.getAttribute("width") || "0").replace("%", ""), 10);
      const namePct = Number.isFinite(nameW) ? nameW : 0;
      const remaining = Math.max(1, 100 - namePct - usedActions);
      descCol.setAttribute("width", String(remaining) + "%");
      colgroup.appendChild(descCol);
    }

    function rebuildHeaderRow(headerRow, lastN, actionLabels) {
      const ths = Array.from(headerRow.querySelectorAll("th"));
      if (ths.length < 2) return;
      const nameTh = ths[0];
      const descTh = ths[1];
      for (let i = ths.length - 1; i >= 2; i--) ths[i].remove();
      let anchor = nameTh;
      for (let i = 0; i < lastN; i++) {
        const th = document.createElement("th");
        th.textContent = actionLabels[i] || "Action";
        th.style.textAlign = "center";
        anchor.insertAdjacentElement("afterend", th);
        anchor = th;
      }
      descTh.remove();
      anchor.insertAdjacentElement("afterend", descTh);
    }

    function runReorder() {
      if (!isOnPicklistsPage()) return;
      const tableEl = getPicklistTableEl();
      if (!tableEl) return;

      if (tableEl.dataset.fmOwner && tableEl.dataset.fmOwner !== "picklists") return;
      tableEl.dataset.fmOwner = "picklists";
      if (tableEl.dataset.fmPicklistsReordered === "1") return;

      const headerRow = getHeaderRow(tableEl);
      const dataRow = getFirstDataRow(tableEl);
      if (!dataRow) return;

      const tds = Array.from(dataRow.querySelectorAll(":scope > td"));
      const cellCount = tds.length;
      const lastN = 3;
      const actionWidths = [5, 10, 5];
      if (cellCount < lastN + 2) return;

      const lastIndexes = [];
      for (let i = cellCount - lastN; i < cellCount; i++) lastIndexes.push(i);
      const actionLabels = lastIndexes.map(i => detectActionLabelFromCell(tds[i]));

      reorderColgroup(tableEl, lastN, actionWidths, 1);
      if (headerRow) rebuildHeaderRow(headerRow, lastN, actionLabels);

      const rows = Array.from(tableEl.querySelectorAll("tbody tr")).filter(r => r.querySelector("td"));
      for (const r of rows) moveCells(r, lastIndexes, 0);

      tableEl.dataset.fmPicklistsReordered = "1";
    }

    // Public tick combining both search and reorder
    function tick() {
      if (!isOnPicklistsPage()) {
        document.getElementById("fm-search-picklists")?.remove();
        return;
      }
      ensurePicklistsSearchField();
      const input = document.getElementById("fm-search-picklists");
      applyPicklistsFilter(input?.value || "");
      runReorder();
    }

    return { tick, runReorder, applyPicklistsFilter };
  })();

  // ---------- Expose convenience top-level tick helpers ----------
  FM.tickFeatures = function () {
    FM.features = FM.features || {};
    FM.features.scripts?.tick();
    FM.features.picklists?.tick();
  };

})();