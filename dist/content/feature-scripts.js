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

    /** Resolves with selected text from the script Ace editor (main-world bridge), or "" if none / timeout. */
    function getAceEditorSelectedText() {
      const doc = document;
      return new Promise(function (resolve) {
        const timeout = setTimeout(function () { resolve(""); }, 800);
        doc.addEventListener("fm-ace-selected-text", function onSel(ev) {
          clearTimeout(timeout);
          doc.removeEventListener("fm-ace-selected-text", onSel);
          resolve(typeof ev.detail === "string" ? ev.detail : "");
        }, { once: true });
        doc.dispatchEvent(new CustomEvent("fm-ace-get-selected-text"));
      });
    }

    FM.getAceEditorSelectedText = getAceEditorSelectedText;

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

    function showSnippetsToast(message) {
      const prev = document.getElementById("fm-snippets-toast");
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      const t = document.createElement("div");
      t.id = "fm-snippets-toast";
      t.className = "fm-snippets-toast";
      t.setAttribute("role", "status");
      t.textContent = message;
      document.body.appendChild(t);
      requestAnimationFrame(function () {
        t.classList.add("fm-snippets-toast--visible");
      });
      if (t._fmHideTimer) clearTimeout(t._fmHideTimer);
      t._fmHideTimer = setTimeout(function () {
        t.classList.remove("fm-snippets-toast--visible");
        setTimeout(function () {
          if (t.parentNode) t.parentNode.removeChild(t);
        }, 220);
      }, 3200);
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

    // Script form page: Insert Snippet (bar: list toggle + ⋮ menu) + Go to Function; panels independent; height from #codeEditor − 40px.
    // snippets: optional array; if omitted, uses built-in only (for backward compat). When provided, built-in + user merged.
    // forceRefresh: when true, remove existing wrap and rebuild (e.g. after storage change). When false, skip if wrap already exists so tick() does not constantly recreate the button.
    function ensureSnippetsButton(snippets, forceRefresh) {
      if (!isOnScriptFormPage()) return;
      const builtIn = window.FM && Array.isArray(window.FM.scriptSnippets) ? window.FM.scriptSnippets : [];
      const list = Array.isArray(snippets) ? snippets : builtIn;

      const codeRow = findCodeRow(document);
      if (!codeRow) return;
      const existingWrap = codeRow.querySelector(".fm-snippets-wrap");
      if (existingWrap && !forceRefresh) return;
      if (existingWrap) {
        if (existingWrap._fmOutsideClick) {
          document.removeEventListener("click", existingWrap._fmOutsideClick);
        }
        if (existingWrap._fmSettingsEscape) {
          document.removeEventListener("keydown", existingWrap._fmSettingsEscape);
        }
        if (typeof existingWrap._fmCloseSettingsMenu === "function") {
          existingWrap._fmCloseSettingsMenu();
        }
        if (existingWrap._fmCodeEditorResizeObserver && typeof existingWrap._fmCodeEditorResizeObserver.disconnect === "function") {
          existingWrap._fmCodeEditorResizeObserver.disconnect();
        }
        if (existingWrap._fmToolsStackWindowResize) {
          window.removeEventListener("resize", existingWrap._fmToolsStackWindowResize);
        }
        if (existingWrap._fmToolsStackHeightRaf != null) {
          cancelAnimationFrame(existingWrap._fmToolsStackHeightRaf);
        }
        existingWrap.remove();
      }
      const nameCell = codeRow.querySelector("td.fieldName");
      if (!nameCell) return;

      if (window.FM && typeof window.FM.injectMaterialIcons === "function") {
        window.FM.injectMaterialIcons();
      }

      const wrap = document.createElement("div");
      wrap.className = "fm-snippets-wrap";

      const toolsStack = document.createElement("div");
      toolsStack.className = "fm-editor-tools-stack";

      function clickTargetInsideCodeEditor(target) {
        var el = target;
        if (!el) return false;
        if (el.nodeType === 3 && el.parentElement) el = el.parentElement;
        if (!el || el.nodeType !== 1) return false;
        var host = document.getElementById("codeEditor");
        return !!(host && host.contains(el));
      }

      function getCodeEditorToolsMaxHeightPx() {
        var host = document.getElementById("codeEditor");
        if (!host) return 400;
        var h = host.getBoundingClientRect().height;
        if (!Number.isFinite(h) || h <= 0) return 400;
        return Math.max(120, Math.floor(h - 40));
      }

      function applyToolsStackLayoutHeight() {
        var cap = getCodeEditorToolsMaxHeightPx();
        toolsStack.style.maxHeight = cap + "px";
        if (snippetSectionOpen || gotoSectionOpen) {
          toolsStack.style.height = cap + "px";
        } else {
          toolsStack.style.height = "";
        }
      }

      function scheduleToolsStackHeightUpdate() {
        if (wrap._fmToolsStackHeightRaf != null) {
          cancelAnimationFrame(wrap._fmToolsStackHeightRaf);
        }
        wrap._fmToolsStackHeightRaf = requestAnimationFrame(function () {
          wrap._fmToolsStackHeightRaf = null;
          applyToolsStackLayoutHeight();
        });
      }

      const snippetSection = document.createElement("div");
      snippetSection.className = "fm-tool-section fm-tool-section--snippet";

      const bar = document.createElement("div");
      bar.className = "fm-snippets-bar fm-tool-section-header";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fm-snippets-btn fm-tool-accordion-trigger";
      btn.setAttribute("aria-expanded", "false");
      btn.title = "Show or hide snippet list — insert at cursor or replace selection";
      const btnLabel = document.createElement("span");
      btnLabel.className = "fm-tool-accordion-label";
      btnLabel.textContent = "Insert Snippet";
      const btnChevron = document.createElement("span");
      btnChevron.className = "material-icons fm-tool-accordion-chevron";
      btnChevron.setAttribute("aria-hidden", "true");
      btnChevron.textContent = "expand_more";
      btn.appendChild(btnLabel);
      btn.appendChild(btnChevron);

      const settingsBtn = document.createElement("button");
      settingsBtn.type = "button";
      settingsBtn.className = "fm-snippets-settings-btn";
      settingsBtn.title = "Snippet manager and tools";
      settingsBtn.setAttribute("aria-label", "Snippet manager and tools");
      settingsBtn.setAttribute("aria-haspopup", "true");
      settingsBtn.setAttribute("aria-expanded", "false");
      settingsBtn.innerHTML = "<span class=\"material-icons\" aria-hidden=\"true\">more_vert</span>";

      const settingsWrap = document.createElement("div");
      settingsWrap.className = "fm-snippets-settings-wrap";

      const settingsMenu = document.createElement("div");
      settingsMenu.className = "fm-snippets-settings-menu";
      settingsMenu.setAttribute("hidden", "");
      settingsMenu.setAttribute("role", "menu");

      const menuSnippetManager = document.createElement("button");
      menuSnippetManager.type = "button";
      menuSnippetManager.className = "fm-snippets-settings-menu-item";
      menuSnippetManager.setAttribute("role", "menuitem");
      menuSnippetManager.textContent = "Snippet Manager";

      const menuNewSnippet = document.createElement("button");
      menuNewSnippet.type = "button";
      menuNewSnippet.className = "fm-snippets-settings-menu-item";
      menuNewSnippet.setAttribute("role", "menuitem");
      menuNewSnippet.textContent = "New Snippet";

      const menuNewSnippetMarked = document.createElement("button");
      menuNewSnippetMarked.type = "button";
      menuNewSnippetMarked.className = "fm-snippets-settings-menu-item";
      menuNewSnippetMarked.setAttribute("role", "menuitem");
      menuNewSnippetMarked.textContent = "New Snippet with Marked Code";

      function setSettingsExpanded(open) {
        settingsBtn.setAttribute("aria-expanded", open ? "true" : "false");
      }

      function repositionSettingsMenu() {
        if (settingsMenu.hasAttribute("hidden")) return;
        const rect = settingsBtn.getBoundingClientRect();
        const pad = 8;
        const gap = 6;
        settingsMenu.classList.add("fm-snippets-settings-menu--fixed");
        settingsMenu.style.position = "fixed";
        settingsMenu.style.zIndex = "2147483640";
        const maxH = Math.max(100, window.innerHeight - 2 * pad);
        settingsMenu.style.maxHeight = maxH + "px";
        settingsMenu.style.overflowY = "auto";
        settingsMenu.style.right = "auto";
        settingsMenu.style.bottom = "auto";
        const mw = settingsMenu.offsetWidth;
        const mh = settingsMenu.offsetHeight;
        /* Open below the trigger; submenu’s left edge aligns with the button’s left edge (viewport-clamped). */
        let left = rect.left;
        let top = rect.bottom + gap;
        if (left < pad) {
          left = pad;
        }
        if (left + mw > window.innerWidth - pad) {
          left = Math.max(pad, window.innerWidth - pad - mw);
        }
        if (top + mh > window.innerHeight - pad) {
          top = Math.max(pad, rect.top - gap - mh);
        }
        if (top < pad) {
          top = pad;
        }
        settingsMenu.style.left = left + "px";
        settingsMenu.style.top = top + "px";
      }

      function closeSettingsMenu() {
        settingsMenu.setAttribute("hidden", "");
        setSettingsExpanded(false);
        settingsMenu.classList.remove("fm-snippets-settings-menu--fixed");
        settingsMenu.style.left = "";
        settingsMenu.style.top = "";
        settingsMenu.style.position = "";
        settingsMenu.style.zIndex = "";
        settingsMenu.style.maxHeight = "";
        settingsMenu.style.overflowY = "";
        settingsMenu.style.right = "";
        settingsMenu.style.bottom = "";
        if (wrap._fmSettingsMenuCaptureOutside) {
          document.removeEventListener("click", wrap._fmSettingsMenuCaptureOutside, true);
          wrap._fmSettingsMenuCaptureOutside = null;
        }
        if (wrap._fmSettingsMenuViewportListeners) {
          window.removeEventListener("resize", wrap._fmSettingsMenuViewportListeners);
          window.removeEventListener("scroll", wrap._fmSettingsMenuViewportListeners, true);
          wrap._fmSettingsMenuViewportListeners = null;
        }
      }

      function openSettingsMenu() {
        settingsMenu.removeAttribute("hidden");
        setSettingsExpanded(true);
        requestAnimationFrame(function () {
          repositionSettingsMenu();
          requestAnimationFrame(repositionSettingsMenu);
          if (!wrap._fmSettingsMenuViewportListeners) {
            const fn = function () {
              repositionSettingsMenu();
            };
            wrap._fmSettingsMenuViewportListeners = fn;
            window.addEventListener("resize", fn);
            window.addEventListener("scroll", fn, true);
          }
          setTimeout(function () {
            if (wrap._fmSettingsMenuCaptureOutside) {
              document.removeEventListener("click", wrap._fmSettingsMenuCaptureOutside, true);
              wrap._fmSettingsMenuCaptureOutside = null;
            }
            const captureOutside = function (e) {
              if (settingsWrap.contains(e.target)) return;
              if (clickTargetInsideCodeEditor(e.target)) return;
              closeSettingsMenu();
            };
            wrap._fmSettingsMenuCaptureOutside = captureOutside;
            document.addEventListener("click", captureOutside, true);
          }, 0);
        });
      }

      menuSnippetManager.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        closeSettingsMenu();
        window.dispatchEvent(new CustomEvent("fm-open-snippet-modal-request"));
      });

      menuNewSnippet.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        closeSettingsMenu();
        window.dispatchEvent(new CustomEvent("fm-open-snippet-modal-request", {
          detail: { editorFocusNewSnippet: true }
        }));
      });

      menuNewSnippetMarked.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        closeSettingsMenu();
        getAceEditorSelectedText().then(function (text) {
          const trimmed = String(text || "").trim();
          if (!trimmed) {
            showSnippetsToast("Select code in the editor first to use New Snippet with Marked Code.");
            return;
          }
          window.dispatchEvent(new CustomEvent("fm-snippet-load-from-editor", { detail: { code: text } }));
        });
      });

      settingsMenu.appendChild(menuSnippetManager);
      settingsMenu.appendChild(menuNewSnippet);
      settingsMenu.appendChild(menuNewSnippetMarked);

      function dispatchAceJumpToDefinition(lineNumber1Based, opts) {
        const n = Number(lineNumber1Based);
        if (!Number.isFinite(n) || n < 1) return;
        const row = Math.floor(n) - 1;
        const detail = { row: row, flash: true, scrollAlign: "top" };
        if (opts && opts.focusEditor === false) {
          detail.focusEditor = false;
        }
        document.dispatchEvent(new CustomEvent("fm-ace-jump-to-definition", {
          detail: detail
        }));
      }

      function selectionToFunctionQueryHint(text) {
        let t = String(text || "").split(/\r?\n/)[0].trim();
        if (t.length > 120) t = t.slice(0, 120);
        if (/^[$A-Za-z_][$A-Za-z0-9_]*$/.test(t)) return t;
        const m = t.match(/[$A-Za-z_][$A-Za-z0-9_]*/);
        return m ? m[0] : t;
      }

      const gotoSection = document.createElement("div");
      gotoSection.className = "fm-tool-section fm-tool-section--goto";

      const gotoHeaderBar = document.createElement("div");
      gotoHeaderBar.className = "fm-goto-fn-header fm-tool-section-header";

      const gotoAccordionBtn = document.createElement("button");
      gotoAccordionBtn.type = "button";
      gotoAccordionBtn.className = "fm-snippets-btn fm-tool-accordion-trigger fm-goto-fn-accordion-btn";
      gotoAccordionBtn.setAttribute("aria-expanded", "false");
      gotoAccordionBtn.title = "Show or hide function list and filter";
      const gotoBtnLabel = document.createElement("span");
      gotoBtnLabel.className = "fm-tool-accordion-label";
      gotoBtnLabel.textContent = "Go to Function";
      const gotoBtnChevron = document.createElement("span");
      gotoBtnChevron.className = "material-icons fm-tool-accordion-chevron";
      gotoBtnChevron.setAttribute("aria-hidden", "true");
      gotoBtnChevron.textContent = "expand_more";
      gotoAccordionBtn.appendChild(gotoBtnLabel);
      gotoAccordionBtn.appendChild(gotoBtnChevron);

      gotoHeaderBar.appendChild(gotoAccordionBtn);

      const gotoPanel = document.createElement("div");
      gotoPanel.className = "fm-tool-section-panel fm-goto-fn-panel";
      gotoPanel.setAttribute("hidden", "");

      const gotoPanelBody = document.createElement("div");
      gotoPanelBody.className = "fm-goto-fn-panel-body";

      const gotoSearchInput = document.createElement("input");
      gotoSearchInput.type = "text";
      gotoSearchInput.className = "fm-goto-fn-search";
      gotoSearchInput.placeholder = "Filter by function name…";
      gotoSearchInput.autocomplete = "off";
      gotoSearchInput.setAttribute("aria-label", "Filter function definitions");

      const gotoStatus = document.createElement("div");
      gotoStatus.className = "fm-goto-fn-status";
      gotoStatus.setAttribute("role", "status");

      const gotoListWrap = document.createElement("div");
      gotoListWrap.className = "fm-goto-fn-list-wrap";
      gotoListWrap.setAttribute("hidden", "");

      const gotoListScroll = document.createElement("div");
      gotoListScroll.className = "fm-goto-fn-list-scroll";

      gotoListWrap.appendChild(gotoListScroll);

      function refreshGotoCandidates(cb) {
        const parseDefs = window.FM && typeof window.FM.parseScriptFunctionDefinitions === "function"
          ? window.FM.parseScriptFunctionDefinitions
          : null;
        getScriptEditorContent().then(function (src) {
          const text = typeof src === "string" ? src : "";
          wrap._fmGotoCandidates = parseDefs ? parseDefs(text) : [];
          if (typeof cb === "function") cb();
        });
      }

      function appendGotoFnListItems(matches) {
        for (let mi = 0; mi < matches.length; mi += 1) {
          const c = matches[mi];
          if (!c || typeof c.lineNumber !== "number") continue;
          const item = document.createElement("button");
          item.type = "button";
          item.className = "fm-goto-fn-item";
          item.dataset.lineNumber = String(c.lineNumber);

          const nameEl = document.createElement("span");
          nameEl.className = "fm-goto-fn-item-name";
          nameEl.textContent = typeof c.functionName === "string" ? c.functionName : "";

          const lineEl = document.createElement("span");
          lineEl.className = "fm-goto-fn-item-line";
          lineEl.textContent = String(c.lineNumber);

          item.appendChild(nameEl);
          item.appendChild(lineEl);
          item.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            dispatchAceJumpToDefinition(c.lineNumber);
          });
          gotoListScroll.appendChild(item);
        }
      }

      function renderGotoFnResults() {
        const candidates = Array.isArray(wrap._fmGotoCandidates) ? wrap._fmGotoCandidates : [];
        const rankFn = window.FM && typeof window.FM.filterRankFunctionCandidates === "function"
          ? window.FM.filterRankFunctionCandidates
          : null;
        const sortFn = window.FM && typeof window.FM.sortFunctionDefinitionsByLine === "function"
          ? window.FM.sortFunctionDefinitionsByLine
          : null;
        const q = (gotoSearchInput.value || "").trim();
        gotoListScroll.textContent = "";
        wrap._fmGotoVisibleMatches = [];
        gotoStatus.style.whiteSpace = "";
        gotoStatus.textContent = "";
        gotoStatus.className = "fm-goto-fn-status";
        gotoListWrap.setAttribute("hidden", "");

        if (!rankFn || !sortFn) {
          gotoStatus.textContent = "Function navigation is unavailable.";
          return;
        }

        const matches = q.length === 0
          ? sortFn(candidates)
          : rankFn(candidates, q);
        wrap._fmGotoVisibleMatches = matches;

        if (matches.length === 0) {
          gotoStatus.textContent = q.length === 0
            ? "No function definitions found in this script."
            : "No matching function definitions.";
          return;
        }

        const filterActive = q.length > 0;

        if (matches.length >= 1) {
          gotoListWrap.removeAttribute("hidden");
          appendGotoFnListItems(matches);
        }

        if (!filterActive) {
          if (matches.length === 1) {
            gotoStatus.textContent = "1 definition — choose below or type to filter.";
          }
          return;
        }
      }

      function refocusGotoFilterSoon() {
        try {
          window.requestAnimationFrame(function () {
            gotoSearchInput.focus();
          });
        } catch (e) { /* ignore */ }
      }

      function tryJumpIfSingleMatch() {
        const vis = wrap._fmGotoVisibleMatches;
        if (vis && vis.length === 1) {
          dispatchAceJumpToDefinition(vis[0].lineNumber, { focusEditor: false });
          refocusGotoFilterSoon();
        }
      }

      gotoSearchInput.addEventListener("input", function () {
        gotoStatus.style.whiteSpace = "";
        renderGotoFnResults();
        const qAfter = (gotoSearchInput.value || "").trim();
        const vis = wrap._fmGotoVisibleMatches;
        if (qAfter.length > 0 && vis && vis.length === 1) {
          dispatchAceJumpToDefinition(vis[0].lineNumber, { focusEditor: false });
          refocusGotoFilterSoon();
        }
      });
      gotoSearchInput.addEventListener("keydown", function (ev) {
        ev.stopPropagation();
        if (ev.key === "Enter") {
          ev.preventDefault();
          tryJumpIfSingleMatch();
        }
      });
      gotoSearchInput.addEventListener("focus", function () {
        refreshGotoCandidates(function () {
          renderGotoFnResults();
        });
      });

      const gotoSearchRow = document.createElement("div");
      gotoSearchRow.className = "fm-goto-fn-search-row";
      gotoSearchRow.appendChild(gotoSearchInput);

      gotoPanelBody.appendChild(gotoSearchRow);
      gotoPanelBody.appendChild(gotoStatus);
      gotoPanelBody.appendChild(gotoListWrap);
      gotoPanel.appendChild(gotoPanelBody);

      var gotoBootstrapped = false;
      function ensureGotoBootstrapped() {
        if (gotoBootstrapped) return;
        gotoBootstrapped = true;
        refreshGotoCandidates(function () {
          getAceEditorSelectedText().then(function (sel) {
            gotoSearchInput.value = selectionToFunctionQueryHint(sel);
            renderGotoFnResults();
            const q = (gotoSearchInput.value || "").trim();
            const vis = wrap._fmGotoVisibleMatches;
            if (q && vis && vis.length === 1) {
              dispatchAceJumpToDefinition(vis[0].lineNumber, { focusEditor: false });
              refocusGotoFilterSoon();
            }
          });
        });
      }

      const snippetPanel = document.createElement("div");
      snippetPanel.className = "fm-tool-section-panel fm-snippets-tool-panel";
      snippetPanel.setAttribute("hidden", "");

      const snippetPanelBody = document.createElement("div");
      snippetPanelBody.className = "fm-snippets-panel-body";

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
          const match = q === "" || name.indexOf(q) !== -1;
          items[i].style.display = match ? "" : "none";
          if (match) visibleCount += 1;
        }
        noMatchesEl.hidden = visibleCount > 0;
      }

      function postSnippetAccordionOpened() {
        window.postMessage({ type: "fm-ace-snippet-dropdown-opened" }, window.location.origin || "*");
      }

      function postSnippetAccordionClosed() {
        window.postMessage({ type: "fm-ace-snippet-dropdown-closed" }, window.location.origin || "*");
      }

      var snippetSectionOpen = false;
      var gotoSectionOpen = false;

      function syncToolsStackExpandedClass() {
        scheduleToolsStackHeightUpdate();
      }

      function closeSnippetAccordionSoft() {
        snippetPanel.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
        snippetSection.classList.remove("is-expanded");
      }

      function closeGotoAccordionSoft() {
        gotoPanel.setAttribute("hidden", "");
        gotoAccordionBtn.setAttribute("aria-expanded", "false");
        gotoSection.classList.remove("is-expanded");
      }

      function toggleSnippetSection() {
        if (snippetSectionOpen) {
          postSnippetAccordionClosed();
          closeSnippetAccordionSoft();
          snippetSectionOpen = false;
        } else {
          closeSettingsMenu();
          snippetPanel.removeAttribute("hidden");
          btn.setAttribute("aria-expanded", "true");
          snippetSection.classList.add("is-expanded");
          snippetSectionOpen = true;
          searchInput.value = "";
          applySearch();
          postSnippetAccordionOpened();
          searchInput.focus();
        }
        syncToolsStackExpandedClass();
      }

      function toggleGotoSection() {
        if (gotoSectionOpen) {
          closeGotoAccordionSoft();
          gotoSectionOpen = false;
        } else {
          gotoPanel.removeAttribute("hidden");
          gotoAccordionBtn.setAttribute("aria-expanded", "true");
          gotoSection.classList.add("is-expanded");
          gotoSectionOpen = true;
          ensureGotoBootstrapped();
          window.requestAnimationFrame(function () {
            gotoSearchInput.focus();
          });
        }
        syncToolsStackExpandedClass();
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
        item.dataset.snippetId = s.name || String(i);
        item.dataset.snippetIndex = String(i);

        const nameEl = document.createElement("span");
        nameEl.className = "fm-snippets-item-name";
        nameEl.textContent = s.name || "Snippet";

        item.appendChild(nameEl);
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

      const snippetPanelToolbar = document.createElement("div");
      snippetPanelToolbar.className = "fm-snippets-panel-toolbar";
      snippetPanelToolbar.appendChild(searchWrap);

      snippetPanelBody.appendChild(snippetPanelToolbar);
      snippetPanelBody.appendChild(listEl);
      snippetPanel.appendChild(snippetPanelBody);

      snippetPanel.id = "fm-accordion-snippet-panel";
      gotoPanel.id = "fm-accordion-goto-panel";
      btn.setAttribute("aria-controls", snippetPanel.id);
      gotoAccordionBtn.setAttribute("aria-controls", gotoPanel.id);

      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleSnippetSection();
      });

      gotoAccordionBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleGotoSection();
      });

      settingsBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (settingsMenu.hasAttribute("hidden")) {
          openSettingsMenu();
        } else {
          closeSettingsMenu();
        }
      });

      function outsideClick(ev) {
        if (settingsMenu.hasAttribute("hidden")) return;
        if (wrap.contains(ev.target)) return;
        if (clickTargetInsideCodeEditor(ev.target)) return;
        closeSettingsMenu();
      }
      document.addEventListener("click", outsideClick);
      wrap._fmOutsideClick = outsideClick;

      const onSettingsEscape = function (e) {
        if (e.key !== "Escape") return;
        if (!settingsMenu.hasAttribute("hidden")) {
          closeSettingsMenu();
        }
      };
      document.addEventListener("keydown", onSettingsEscape);
      wrap._fmSettingsEscape = onSettingsEscape;
      wrap._fmCloseSettingsMenu = closeSettingsMenu;

      settingsWrap.appendChild(settingsBtn);
      settingsWrap.appendChild(settingsMenu);

      bar.appendChild(btn);
      bar.appendChild(settingsWrap);

      snippetSection.appendChild(bar);
      snippetSection.appendChild(snippetPanel);

      gotoSection.appendChild(gotoHeaderBar);
      gotoSection.appendChild(gotoPanel);

      toolsStack.appendChild(snippetSection);
      toolsStack.appendChild(gotoSection);
      wrap.appendChild(toolsStack);

      nameCell.appendChild(wrap);

      scheduleToolsStackHeightUpdate();
      var codeEditorEl = document.getElementById("codeEditor");
      if (codeEditorEl && typeof ResizeObserver !== "undefined") {
        var toolsStackRo = new ResizeObserver(function () {
          scheduleToolsStackHeightUpdate();
        });
        toolsStackRo.observe(codeEditorEl);
        wrap._fmCodeEditorResizeObserver = toolsStackRo;
      }
      function onToolsStackWindowResize() {
        scheduleToolsStackHeightUpdate();
      }
      window.addEventListener("resize", onToolsStackWindowResize);
      wrap._fmToolsStackWindowResize = onToolsStackWindowResize;
    }

    function refreshSnippetsDropdown(forceRefresh) {
      if (!isOnScriptFormPage()) return;
      var storage = window.FM && window.FM.snippetStorage;
      if (!storage) {
        ensureSnippetsButton(undefined, forceRefresh);
        return;
      }
      storage.init().then(function () { return storage.getAll(); }).then(function (user) {
        var builtIn = window.FM && Array.isArray(window.FM.scriptSnippets) ? window.FM.scriptSnippets : [];
        var list = Array.isArray(user) ? user : [];
        ensureSnippetsButton(builtIn.concat(list), forceRefresh);
      }).catch(function () {
        var builtIn = window.FM && Array.isArray(window.FM.scriptSnippets) ? window.FM.scriptSnippets : [];
        ensureSnippetsButton(builtIn, forceRefresh);
      });
    }

    window.addEventListener("fm-snippets-changed", function () { refreshSnippetsDropdown(true); });

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
        function openScriptFromEvent(ev) {
          var url = `/script.form?ID=${scriptId}`;
          if (typeof FM.openUrlWithEvent === "function") {
            FM.openUrlWithEvent(url, ev);
            return;
          }
          if (ev && (ev.button === 1 || ev.shiftKey)) {
            window.open(url, "_blank", "noopener,noreferrer");
          } else {
            window.location.assign(url);
          }
        }
        nameCell.addEventListener("click", (ev) => {
          if (ev.defaultPrevented) return;
          const interactive = ev.target?.closest?.("a, button, input, textarea, select, label");
          if (interactive) return;
          if (ev.button === 2) return;
          if (ev.altKey || ev.metaKey || ev.ctrlKey) return;
          if (ev.button !== 0 && ev.button !== 1) return;
          ev.preventDefault();
          ev.stopPropagation();
          openScriptFromEvent(ev);
        });
        nameCell.addEventListener("auxclick", (ev) => {
          if (ev.defaultPrevented || ev.button !== 1) return;
          const interactive = ev.target?.closest?.("a, button, input, textarea, select, label");
          if (interactive) return;
          ev.preventDefault();
          ev.stopPropagation();
          openScriptFromEvent(ev);
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