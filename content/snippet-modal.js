/**
 * In-page modal for managing custom script snippets. Opens when the popup sends "fm-open-snippet-modal"
 * or the page dispatches "fm-open-snippet-modal-request". Prefill from the script Ace editor via
 * "fm-snippet-load-from-editor" (detail.code); selection is read in the content script using FM.getAceEditorSelectedText.
 * Uses IndexedDB via FM.snippetStorage. Name is the unique identifier.
 * Layout: left = form/editor (flex-grow), right = snippet list (clamp width so names stay readable).
 *
 * --- Draft state model (session-scoped, survives modal close while this tab/content script lives) ---
 * - persistedSnapshot: Array<{name, code}> — last load from IndexedDB on open (refreshed each time the modal is shown).
 * - draftByKey: Record<draftKey, DraftEntry> — working edits, deletes, and unsaved new rows. Keys: "p:<originalName>"
 *   for snippets that existed in persistedSnapshot when edited, or "n:<id>" for brand-new rows.
 * - activeDraftKey: which row the left form is bound to; null means an empty "new snippet" buffer (no row until
 *   the user types name or code).
 * - Edits are written into draftByKey on every input (and when switching rows). IndexedDB is updated only when the
 *   user clicks Save (replaceAll). Deletes and bulk removes are draft-only until Save.
 * - Clear: clears the left form and starts a fresh new-snippet buffer. Persisted-row edits stay in draftByKey;
 *   an in-progress "n:" row is removed if it was active. Does not discard the rest of the draft session.
 * - Close: hides the modal and clears ephemeral UI (search, selection, scroll); draftByKey and persistedSnapshot
 *   are kept so reopening continues the same session. A full page reload clears everything.
 */
(function () {
  const MODAL_ID = "fm-snippet-modal-root";
  const SNIPPETS_CHANGED_EVENT = "fm-snippets-changed";
  const ROW_HEIGHT = 44;
  /** Modal body max height (matches injected CSS cap). */
  const PANEL_MAX_HEIGHT_PX = 1020;
  const MATERIAL_ICONS_URL = "https://fonts.googleapis.com/icon?family=Material+Icons";

  function normalizeCode(code) {
    if (typeof code !== "string") return "";
    return code.replace(/\\n/g, "\n");
  }

  function getStorage() {
    var storage = window.FM && window.FM.snippetStorage;
    if (!storage) return Promise.reject(new Error("FM.snippetStorage not available"));
    return storage.init().then(function () { return storage; });
  }

  function getStored(cb) {
    getStorage().then(function (storage) { return storage.getAll(); })
      .then(function (list) { cb(Array.isArray(list) ? list : []); })
      .catch(function () { cb([]); });
  }

  function notifySnippetsChanged() {
    try {
      window.dispatchEvent(new CustomEvent(SNIPPETS_CHANGED_EVENT));
    } catch (e) { /* ignore */ }
  }

  function setStored(list, cb) {
    getStorage().then(function (storage) { return storage.replaceAll(list || []); })
      .then(function () {
        notifySnippetsChanged();
        if (typeof cb === "function") cb();
      })
      .catch(function () { if (typeof cb === "function") cb(); });
  }

  function injectStyles() {
    var sheet = [
      "#" + MODAL_ID + " { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; font-size: 14px; }",
      "#" + MODAL_ID + " .fm-sm-panel { background: var(--fm-sm-bg, #fff); color: var(--fm-sm-fg, #1a1a1a); width: 100%; max-width: min(1680px, 98vw); height: min(96vh, " + PANEL_MAX_HEIGHT_PX + "px); max-height: min(96vh, " + PANEL_MAX_HEIGHT_PX + "px); display: flex; flex-direction: column; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); overflow: hidden; }",
      "#" + MODAL_ID + " .fm-sm-hd { padding: 14px 20px; border-bottom: 1px solid rgba(120,120,120,0.3); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; }",
      "#" + MODAL_ID + " .fm-sm-title { margin: 0; font-size: 18px; font-weight: 700; flex: 1; }",
      "#" + MODAL_ID + " .fm-sm-hd-actions { display: flex; align-items: center; gap: 8px; position: relative; flex-wrap: wrap; justify-content: flex-end; }",
      "#" + MODAL_ID + " .fm-sm-hd .fm-sm-hd-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 13px; font-family: inherit; }",
      "#" + MODAL_ID + " .fm-sm-hd button.fm-sm-save { background: #0969da; color: #fff; border-color: #0969da; font-weight: 600; }",
      "#" + MODAL_ID + " .fm-sm-hd button.fm-sm-save:hover { filter: brightness(1.06); }",
      "#" + MODAL_ID + " .fm-sm-hd button.fm-sm-save:disabled { opacity: 0.45; cursor: not-allowed; filter: none; }",
      "#" + MODAL_ID + " .fm-sm-remove-selected-header { display: none; align-items: center; justify-content: center; gap: 4px; padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 13px; font-family: inherit; }",
      "#" + MODAL_ID + " .fm-sm-remove-selected-header.fm-sm-visible { display: inline-flex; }",
      "#" + MODAL_ID + " .fm-sm-remove-selected-header .material-icons { font-size: 20px; }",
      "#" + MODAL_ID + " .fm-sm-remove-selected-header .fm-sm-btn-label { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-btn .material-icons { font-size: 20px; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-menu { position: absolute; top: 100%; right: 0; margin-top: 4px; min-width: 180px; background: var(--fm-sm-bg, #fff); border: 1px solid rgba(120,120,120,0.35); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); z-index: 10; padding: 6px 0; display: none; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-menu.open { display: block; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-menu > button[type=\"button\"] { display: block; width: 100%; box-sizing: border-box; margin: 0 !important; padding: 8px 14px !important; border: none; background: none; cursor: pointer; font-size: 13px; font-family: inherit; line-height: normal; text-align: left; appearance: none; -webkit-appearance: none; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-menu > button[type=\"button\"]::-moz-focus-inner { border: 0; padding: 0; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-menu > button[type=\"button\"]:hover { background: rgba(120,120,120,0.1); }",
      "#" + MODAL_ID + " .fm-sm-close { padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 13px; }",
      "#" + MODAL_ID + " .fm-sm-body { display: grid; grid-template-columns: minmax(0, 1fr) clamp(280px, 32%, 480px); grid-template-rows: minmax(0, 1fr); flex: 1; min-height: 0; transition: opacity 0.2s ease; }",
      "#" + MODAL_ID + " .fm-sm-left { min-width: 0; min-height: 0; padding: 20px 22px; border-right: 1px solid rgba(120,120,120,0.25); overflow-x: hidden; overflow-y: hidden; display: flex; flex-direction: column; align-items: stretch; }",
      "#" + MODAL_ID + " .fm-sm-left > #fm-sm-form { flex: 1 1 0%; min-height: 0; height: 100%; width: 100%; min-width: 0; display: flex; flex-direction: column; align-items: stretch; gap: 10px; overflow: hidden; }",
      "#" + MODAL_ID + " .fm-sm-left > .fm-sm-selection-badge.visible { flex-shrink: 0; }",
      "#" + MODAL_ID + " .fm-sm-form > .fm-sm-field:not(.fm-sm-field-code) { flex: 0 0 auto; margin-bottom: 0; }",
      "#" + MODAL_ID + " .fm-sm-form > .fm-sm-field-code { flex: 1 1 0%; min-width: 0; min-height: 0; display: flex; flex-direction: column; align-items: stretch; margin-bottom: 0; overflow: hidden; }",
      "#" + MODAL_ID + " .fm-sm-form > .fm-sm-field-code > .fm-sm-code-field-label { flex-shrink: 0; display: block; margin: 0; padding: 0; cursor: default; }",
      "#" + MODAL_ID + " .fm-sm-form > .fm-sm-field-code > .fm-sm-code-field-label > span { display: block; margin-bottom: 4px; font-weight: 500; }",
      "#" + MODAL_ID + " .fm-sm-form > .fm-sm-field-code > .fm-sm-code-field-label > span em { font-weight: normal; opacity: 0.8; }",
      "#" + MODAL_ID + " .fm-sm-code-editor-wrap { flex: 1 1 0%; min-width: 0; min-height: 10rem; position: relative; overflow: hidden; box-sizing: border-box; padding-bottom: 2px; }",
      "#" + MODAL_ID + " .fm-sm-code-editor-wrap.fm-sm-code-editor-wrap--sized { flex: 0 0 auto; }",
      "#" + MODAL_ID + " .fm-sm-code-editor-wrap textarea, #" + MODAL_ID + " textarea#fm-sm-code { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; box-sizing: border-box; resize: none; margin: 0; overflow: auto; display: block; }",
      "#" + MODAL_ID + " .fm-sm-form > .fm-sm-validation { flex: 0 0 auto; margin-top: 0; max-height: 5.5em; overflow-y: auto; }",
      "#" + MODAL_ID + " .fm-sm-right { min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 14px; box-sizing: border-box; }",
      "#" + MODAL_ID + " .fm-sm-selection-badge { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: #0a5f7a; background: rgba(8, 150, 215, 0.14); border: 1px solid rgba(8, 150, 215, 0.42); padding: 4px 10px; border-radius: 999px; line-height: 1.2; display: none; }",
      "#" + MODAL_ID + " .fm-sm-selection-badge.visible { display: inline-block; margin-bottom: 14px; }",
      "#" + MODAL_ID + " .fm-sm-hint { margin: 0 0 10px 0; font-size: 12px; opacity: 0.85; }",
      "#" + MODAL_ID + " .fm-sm-field { display: block; margin-bottom: 12px; }",
      "#" + MODAL_ID + " .fm-sm-field span { display: block; margin-bottom: 4px; font-weight: 500; }",
      "#" + MODAL_ID + " .fm-sm-field span em { font-weight: normal; opacity: 0.8; }",
      "#" + MODAL_ID + " .fm-sm-field input, #" + MODAL_ID + " .fm-sm-field textarea { width: 100%; padding: 8px 10px; border: 1px solid rgba(120,120,120,0.45); border-radius: 6px; font-family: inherit; font-size: 13px; box-sizing: border-box; }",
      "#" + MODAL_ID + " .fm-sm-field textarea { font-family: ui-monospace,monospace; resize: none; tab-size: 2; -moz-tab-size: 2; }",
      "#" + MODAL_ID + " .fm-sm-validation { margin-top: 8px; font-size: 12px; color: #c00; display: none; }",
      "#" + MODAL_ID + " .fm-sm-validation.visible { display: block; }",
      "#" + MODAL_ID + " .fm-sm-toolbar { display: flex; flex-direction: column; align-items: stretch; gap: 8px; margin-bottom: 8px; flex-shrink: 0; }",
      "#" + MODAL_ID + " .fm-sm-search { height: 32px; box-sizing: border-box; padding: 0 10px; border: 1px solid rgba(120,120,120,0.45); border-radius: 6px; font-size: 12px; width: 100%; min-width: 0; }",
      "#" + MODAL_ID + " .fm-sm-table-wrap { flex: 1; min-height: 0; border: 1px solid rgba(120,120,120,0.35); border-radius: 8px; overflow: auto; background: rgba(120,120,120,0.04); padding-bottom: 10px; box-sizing: border-box; }",
      "#" + MODAL_ID + " .fm-sm-table { width: 100%; border-collapse: collapse; table-layout: fixed; }",
      "#" + MODAL_ID + " .fm-sm-table thead { position: sticky; top: 0; z-index: 1; background: var(--fm-sm-bg, #fff); border-bottom: 2px solid rgba(120,120,120,0.4); }",
      "#" + MODAL_ID + " .fm-sm-table th { text-align: left; padding: 8px 6px; font-size: 11px; font-weight: 600; color: rgba(0,0,0,0.7); }",
      "#" + MODAL_ID + " .fm-sm-table th.fm-sm-th-cb { width: 32px; min-width: 32px; text-align: center; vertical-align: middle; }",
      "#" + MODAL_ID + " .fm-sm-table th.fm-sm-th-cb input[type=\"checkbox\"] { margin: 0; vertical-align: middle; cursor: pointer; }",
      "#" + MODAL_ID + " .fm-sm-table th.fm-sm-th-status { width: 38px; min-width: 38px; max-width: 38px; text-align: center; padding-left: 2px; padding-right: 2px; }",
      "#" + MODAL_ID + " .fm-sm-table th.fm-sm-th-name { width: auto; min-width: 0; }",
      "#" + MODAL_ID + " .fm-sm-table th.fm-sm-th-actions { width: 36px; min-width: 36px; padding-left: 2px; padding-right: 4px; }",
      "#" + MODAL_ID + " .fm-sm-table tbody tr { height: " + ROW_HEIGHT + "px; border-bottom: 1px solid rgba(120,120,120,0.2); }",
      "#" + MODAL_ID + " .fm-sm-table tbody tr:hover { background: rgba(120,120,120,0.08); }",
      "#" + MODAL_ID + " .fm-sm-table tbody tr.fm-sm-tr-editing { background: rgba(8,150,215,0.12); }",
      "#" + MODAL_ID + " .fm-sm-table tbody tr.fm-sm-tr-editing:hover { background: rgba(8,150,215,0.18); }",
      "#" + MODAL_ID + " .fm-sm-table tbody tr.fm-sm-tr-just-saved { box-shadow: inset 4px 0 0 #2ea043; background-color: rgba(46, 160, 67, 0.14); }",
      "#" + MODAL_ID + " .fm-sm-table tbody tr.fm-sm-tr-editing.fm-sm-tr-just-saved { background: rgba(8, 150, 215, 0.14); box-shadow: inset 4px 0 0 #2ea043; }",
      "#" + MODAL_ID + " .fm-sm-table tbody tr.fm-sm-tr-editing.fm-sm-tr-just-saved:hover { background: rgba(8, 150, 215, 0.2); }",
      "#" + MODAL_ID + " .fm-sm-table tbody tr.fm-sm-tr-pending-delete { opacity: 0.55; text-decoration: line-through; text-decoration-color: rgba(0,0,0,0.45); }",
      "#" + MODAL_ID + " .fm-sm-table tbody tr.fm-sm-tr-pending-delete .fm-sm-td-name { text-decoration: line-through; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-status { width: 38px; min-width: 38px; max-width: 38px; text-align: center; padding-left: 2px; padding-right: 2px; }",
      "#" + MODAL_ID + " .fm-sm-status-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 1.25em; padding: 1px 3px; border-radius: 3px; font-size: 9px; font-weight: 700; letter-spacing: 0.03em; line-height: 1.2; }",
      "#" + MODAL_ID + " .fm-sm-status-badge.fm-sm-st-ok { background: transparent; color: transparent; }",
      "#" + MODAL_ID + " .fm-sm-status-badge.fm-sm-st-mod { background: rgba(210, 153, 34, 0.2); color: #9a6700; }",
      "#" + MODAL_ID + " .fm-sm-status-badge.fm-sm-st-new { background: rgba(9, 105, 218, 0.15); color: #0550ae; }",
      "#" + MODAL_ID + " .fm-sm-status-badge.fm-sm-st-del { background: rgba(207, 34, 46, 0.14); color: #a40e26; }",
      "#" + MODAL_ID + " .fm-sm-status-badge.fm-sm-st-saved { background: rgba(46, 160, 67, 0.22); color: #1a7f37; }",
      "#" + MODAL_ID + " .fm-sm-table td { padding: 0 6px; vertical-align: middle; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-cb { width: 32px; min-width: 32px; text-align: center; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-cb input[type=\"checkbox\"] { margin: 0; vertical-align: middle; cursor: pointer; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-name { font-weight: 600; cursor: pointer; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-actions { width: 36px; min-width: 36px; white-space: nowrap; padding-right: 4px; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-actions .fm-sm-td-actions-inner { display: flex; align-items: center; justify-content: flex-end; gap: 4px; flex-wrap: nowrap; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-actions button { flex-shrink: 0; padding: 4px 6px; border-radius: 4px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-actions button .material-icons { font-size: 18px; }",
      "#" + MODAL_ID + " .fm-sm-delete-overlay { position: fixed; box-sizing: border-box; overflow: hidden; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: var(--fm-sm-bg, #fff); box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 2147483646; display: flex; align-items: center; justify-content: flex-end; transition: width 0.15s ease-out, left 0.15s ease-out; }",
      "#" + MODAL_ID + " .fm-sm-delete-overlay.fm-sm-delete-overlay--expanded { width: 230px; }",
      "#" + MODAL_ID + " .fm-sm-delete-overlay-inner { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 0 0 16px; flex-shrink: 0; width: 100%; box-sizing: border-box; min-height: " + ROW_HEIGHT + "px; }",
      "#" + MODAL_ID + " .fm-sm-delete-overlay-label { font-size: 12px; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
      "#" + MODAL_ID + " .fm-sm-delete-overlay-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: auto; }",
      "#" + MODAL_ID + " .fm-sm-delete-overlay-inner button { flex-shrink: 0; padding: 4px 6px; border-radius: 4px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 12px; color: #1a1a1a; display: inline-flex; align-items: center; justify-content: center; }",
      "#" + MODAL_ID + " .fm-sm-delete-overlay-inner button:hover { background: rgba(120,120,120,0.08); }",
      "#" + MODAL_ID + " .fm-sm-delete-overlay-inner button .material-icons { font-size: 18px; color: #303030; }",
      "#" + MODAL_ID + " .fm-sm-delete-overlay-inner button:hover .material-icons { color: #303030; }",
      "#" + MODAL_ID + " .fm-sm-table .fm-sm-empty { padding: 24px; text-align: center; color: rgba(0,0,0,0.5); font-size: 13px; }",
      "#" + MODAL_ID + " .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }"
    ].join("\n");
    var existingStyle = document.getElementById("fm-snippet-modal-styles");
    if (existingStyle) {
      existingStyle.textContent = sheet;
      return;
    }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MATERIAL_ICONS_URL;
    (document.head || document.documentElement).appendChild(link);
    var style = document.createElement("style");
    style.id = "fm-snippet-modal-styles";
    style.textContent = sheet;
    (document.head || document.documentElement).appendChild(style);
  }

  function createDefaultSessionState() {
    return {
      persistedSnapshot: [],
      draftByKey: Object.create(null),
      nextNewId: 1,
      activeDraftKey: null,
      selectedDraftKeys: new Set(),
      scrollTop: 0,
      searchQuery: "",
      justSavedHighlightNames: new Set(),
      pendingScrollToSavedName: null,
      justSavedFlashTimeoutId: null
    };
  }

  function cloneSnippetList(list) {
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (!x || typeof x !== "object") continue;
      out.push({ name: String(x.name || ""), code: String(x.code != null ? x.code : "") });
    }
    return out;
  }

  /**
   * @param {{ deferShow?: boolean, editorFocusNewSnippet?: boolean }} [opts]
   *   deferShow: refresh state without displaying (e.g. editor-selection prefill).
   *   editorFocusNewSnippet: after open, clear the form and focus the name field.
   */
  function createModal(opts) {
    opts = opts || {};
    injectStyles();
    var root = document.getElementById(MODAL_ID);
    if (root) {
      var state = root._fmSmState;
      var renderAll = root._fmSmRenderAll;
      if (state && renderAll) {
        if (typeof root._fmSmOnModalReopen === "function") {
          root._fmSmOnModalReopen();
        }
        if (opts.deferShow) {
          return root;
        }
        getStored(function (list) {
          if (typeof root._fmSmRefreshPersistedAndReconcile === "function") {
            root._fmSmRefreshPersistedAndReconcile(list);
          }
          renderAll();
          if (opts.editorFocusNewSnippet === true) {
            if (typeof root._fmSmClearForm === "function") root._fmSmClearForm();
            var ne = root._fmSmNameEl;
            if (ne && typeof ne.focus === "function") {
              try { ne.focus(); } catch (e) { /* ignore */ }
            }
          }
        });
        root.style.display = "flex";
        if (typeof root._fmSmScheduleCodeEditorLayout === "function") {
          root._fmSmScheduleCodeEditorLayout();
        }
        return root;
      }
      root.parentNode && root.parentNode.removeChild(root);
    }
    root = document.createElement("div");
    root.id = MODAL_ID;

    var panel = document.createElement("div");
    panel.className = "fm-sm-panel";

    var hd = document.createElement("div");
    hd.className = "fm-sm-hd";
    var title = document.createElement("h1");
    title.className = "fm-sm-title";
    title.textContent = "Fusion Manage - Script Snippet Manager";
    var hdActions = document.createElement("div");
    hdActions.className = "fm-sm-hd-actions";
    var removeSelectedBtn = document.createElement("button");
    removeSelectedBtn.type = "button";
    removeSelectedBtn.className = "fm-sm-remove-selected-header";
    removeSelectedBtn.title = "Remove selected snippets";
    removeSelectedBtn.setAttribute("aria-label", "Remove selected snippets");
    removeSelectedBtn.innerHTML = "<span class=\"material-icons\" aria-hidden=\"true\">delete</span><span class=\"fm-sm-btn-label\">Remove selected</span>";
    var dropdownBtn = document.createElement("button");
    dropdownBtn.type = "button";
    dropdownBtn.className = "fm-sm-dropdown-btn";
    dropdownBtn.title = "Import / Export";
    dropdownBtn.innerHTML = "<span class=\"material-icons\" aria-hidden=\"true\">more_vert</span><span>Actions</span>";
    var dropdownMenu = document.createElement("div");
    dropdownMenu.className = "fm-sm-dropdown-menu";
    dropdownMenu.setAttribute("role", "menu");
    var menuImportDefault = document.createElement("button");
    menuImportDefault.type = "button";
    menuImportDefault.setAttribute("role", "menuitem");
    menuImportDefault.textContent = "Import default";
    var menuExport = document.createElement("button");
    menuExport.type = "button";
    menuExport.setAttribute("role", "menuitem");
    menuExport.textContent = "Export as JSON";
    var menuImport = document.createElement("button");
    menuImport.type = "button";
    menuImport.setAttribute("role", "menuitem");
    menuImport.textContent = "Import from JSON";
    dropdownMenu.appendChild(menuImportDefault);
    dropdownMenu.appendChild(menuExport);
    dropdownMenu.appendChild(menuImport);
    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "fm-sm-hd-btn";
    clearBtn.textContent = "Clear";
    clearBtn.title = "Clear the editor and start a new snippet (other draft rows are kept)";
    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "fm-sm-hd-btn fm-sm-save";
    saveBtn.textContent = "Save";
    saveBtn.title = "Save all draft changes to storage";
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "fm-sm-close";
    closeBtn.textContent = "Close";
    hdActions.appendChild(removeSelectedBtn);
    hdActions.appendChild(dropdownBtn);
    hdActions.appendChild(dropdownMenu);
    var headerFileInput = document.createElement("input");
    headerFileInput.type = "file";
    headerFileInput.accept = ".json,application/json";
    headerFileInput.style.display = "none";
    hdActions.appendChild(headerFileInput);
    hdActions.appendChild(clearBtn);
    hdActions.appendChild(saveBtn);
    hdActions.appendChild(closeBtn);
    hd.appendChild(title);
    hd.appendChild(hdActions);
    panel.appendChild(hd);

    var body = document.createElement("div");
    body.className = "fm-sm-body";

    // ---- Left: form ----
    var left = document.createElement("div");
    left.className = "fm-sm-left";
    var selectionSourceBadge = document.createElement("span");
    selectionSourceBadge.className = "fm-sm-selection-badge";
    selectionSourceBadge.id = "fm-sm-selection-badge";
    selectionSourceBadge.setAttribute("role", "status");
    selectionSourceBadge.textContent = "Loaded from editor selection";
    left.appendChild(selectionSourceBadge);
    var form = document.createElement("form");
    form.id = "fm-sm-form";
    var nameLabel = document.createElement("label");
    nameLabel.className = "fm-sm-field";
    nameLabel.innerHTML = "<span>Name <em>(required, unique)</em></span>";
    var nameEl = document.createElement("input");
    nameEl.id = "fm-sm-name";
    nameEl.type = "text";
    nameEl.autocomplete = "off";
    nameEl.required = true;
    nameLabel.appendChild(nameEl);
    form.appendChild(nameLabel);
    var codeBlock = document.createElement("div");
    codeBlock.className = "fm-sm-field fm-sm-field-code";
    var codeFieldLabel = document.createElement("label");
    codeFieldLabel.className = "fm-sm-code-field-label";
    codeFieldLabel.setAttribute("for", "fm-sm-code");
    codeFieldLabel.innerHTML = "<span>Code <em>(required)</em></span>";
    var codeElRef = document.createElement("textarea");
    codeElRef.id = "fm-sm-code";
    codeElRef.required = true;
    var CODE_INDENT = "\t";
    function unindentLineStart(line) {
      if (line.charAt(0) === "\t") return line.slice(1);
      if (line.substring(0, 2) === "  ") return line.slice(2);
      if (line.charAt(0) === " ") return line.slice(1);
      return line;
    }
    function mapPosAfterUnindent(p, lbs, oldChunk, newChunkStr, linesArr, newLinesArr) {
      if (p < lbs) return p;
      var blockEnd = lbs + oldChunk.length;
      if (p >= blockEnd) {
        return lbs + newChunkStr.length + (p - blockEnd);
      }
      var acc = lbs;
      var newAcc = lbs;
      for (var i = 0; i < linesArr.length; i++) {
        var ol = linesArr[i];
        var nl = newLinesArr[i];
        var r = ol.length - nl.length;
        var ls = acc;
        var le = acc + ol.length;
        if (p >= ls && p <= le) {
          var d = p - ls;
          var nd = d <= r ? 0 : d - r;
          return newAcc + nd;
        }
        newAcc += nl.length + (i < linesArr.length - 1 ? 1 : 0);
        acc += ol.length + (i < linesArr.length - 1 ? 1 : 0);
      }
      return p;
    }
    function mapPosAfterIndent(p, lbs, oldChunk, newChunkStr, linesArr, indentStr) {
      if (p < lbs) return p;
      var blockEnd = lbs + oldChunk.length;
      var il = indentStr.length;
      if (p >= blockEnd) {
        return lbs + newChunkStr.length + (p - blockEnd);
      }
      var acc = lbs;
      var newAcc = lbs;
      for (var j = 0; j < linesArr.length; j++) {
        var ol = linesArr[j];
        var ls = acc;
        var le = acc + ol.length;
        if (p >= ls && p <= le) {
          return newAcc + il + (p - ls);
        }
        newAcc += il + ol.length + (j < linesArr.length - 1 ? 1 : 0);
        acc += ol.length + (j < linesArr.length - 1 ? 1 : 0);
      }
      return p;
    }
    codeElRef.addEventListener("keydown", function (ev) {
      if (ev.key !== "Tab") return;
      if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
      ev.preventDefault();
      var el = codeElRef;
      var start = el.selectionStart;
      var end = el.selectionEnd;
      var val = el.value;
      var lineBlockStart = val.lastIndexOf("\n", start - 1) + 1;
      var lineBlockEnd = val.indexOf("\n", end - 1);
      if (lineBlockEnd === -1) lineBlockEnd = val.length;
      var chunk = val.slice(lineBlockStart, lineBlockEnd);
      var lines = chunk.split("\n");
      var newChunk;
      var newStart;
      var newEnd;
      if (ev.shiftKey) {
        var newLines = lines.map(unindentLineStart);
        newChunk = newLines.join("\n");
        newStart = mapPosAfterUnindent(start, lineBlockStart, chunk, newChunk, lines, newLines);
        newEnd = mapPosAfterUnindent(end, lineBlockStart, chunk, newChunk, lines, newLines);
        if (newEnd < newStart) newEnd = newStart;
      } else {
        newChunk = lines.map(function (line) {
          return CODE_INDENT + line;
        }).join("\n");
        newStart = mapPosAfterIndent(start, lineBlockStart, chunk, newChunk, lines, CODE_INDENT);
        newEnd = mapPosAfterIndent(end, lineBlockStart, chunk, newChunk, lines, CODE_INDENT);
        if (newEnd < newStart) newEnd = newStart;
      }
      el.value = val.slice(0, lineBlockStart) + newChunk + val.slice(lineBlockEnd);
      el.selectionStart = newStart;
      el.selectionEnd = newEnd;
      flushFormToDraft();
      renderVirtualized();
      updateSaveButtonEnabled();
    });
    var codeEditorWrap = document.createElement("div");
    codeEditorWrap.className = "fm-sm-code-editor-wrap";
    codeEditorWrap.appendChild(codeElRef);
    codeBlock.appendChild(codeFieldLabel);
    codeBlock.appendChild(codeEditorWrap);
    form.appendChild(codeBlock);
    var validationEl = document.createElement("div");
    validationEl.className = "fm-sm-validation";
    validationEl.id = "fm-sm-validation";
    validationEl.setAttribute("role", "alert");
    form.appendChild(validationEl);
    left.appendChild(form);
    body.appendChild(left);

    // ---- Right: toolbar + table ----
    var right = document.createElement("div");
    right.className = "fm-sm-right";

    var toolbar = document.createElement("div");
    toolbar.className = "fm-sm-toolbar";
    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "fm-sm-search";
    searchInput.placeholder = "Search snippets…";
    searchInput.autocomplete = "off";
    searchInput.setAttribute("aria-label", "Search snippets by name");
    toolbar.appendChild(searchInput);
    right.appendChild(toolbar);

    var tableWrap = document.createElement("div");
    tableWrap.className = "fm-sm-table-wrap";
    var table = document.createElement("table");
    table.className = "fm-sm-table";
    table.setAttribute("role", "grid");
    var thead = document.createElement("thead");
    var theadRow = document.createElement("tr");
    var thSelectAll = document.createElement("th");
    thSelectAll.className = "fm-sm-th-cb";
    thSelectAll.setAttribute("scope", "col");
    var headerSelectAllCb = document.createElement("input");
    headerSelectAllCb.type = "checkbox";
    headerSelectAllCb.title = "Select all visible snippets";
    headerSelectAllCb.setAttribute("aria-label", "Select all visible snippets");
    thSelectAll.appendChild(headerSelectAllCb);
    theadRow.appendChild(thSelectAll);
    var thStatusCol = document.createElement("th");
    thStatusCol.className = "fm-sm-th-status";
    thStatusCol.setAttribute("scope", "col");
    thStatusCol.innerHTML = "<span class=\"sr-only\">Status</span>";
    thStatusCol.title = "Draft status";
    theadRow.appendChild(thStatusCol);
    var thNameCol = document.createElement("th");
    thNameCol.className = "fm-sm-th-name";
    thNameCol.setAttribute("scope", "col");
    thNameCol.textContent = "Name";
    theadRow.appendChild(thNameCol);
    var thActionsCol = document.createElement("th");
    thActionsCol.className = "fm-sm-th-actions";
    thActionsCol.setAttribute("scope", "col");
    thActionsCol.innerHTML = "<span class=\"sr-only\">Actions</span>";
    theadRow.appendChild(thActionsCol);
    thead.appendChild(theadRow);
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    right.appendChild(tableWrap);
    body.appendChild(right);
    panel.appendChild(body);
    root.appendChild(panel);
    document.body.appendChild(root);

    var CODE_EDITOR_WRAP_MIN_PX = 160;
    var MODAL_BOTTOM_GAP_PX = 14;
    /** Keep textarea bottom border inside .fm-sm-left (padding + overflow:hidden) and inside the wrap clip. */
    var EDITOR_BOTTOM_INSET_PX = 2;
    var CODE_EDITOR_LAYOUT_CLASS = "fm-sm-code-editor-wrap--sized";

    function resetCodeEditorWrapLayout() {
      if (codeEditorWrap) {
        codeEditorWrap.classList.remove(CODE_EDITOR_LAYOUT_CLASS);
        codeEditorWrap.style.removeProperty("height");
        codeEditorWrap.style.removeProperty("flex");
      }
    }

    function syncCodeEditorWrapHeight() {
      if (!root || root.style.display === "none") return;
      var tw = panel.querySelector(".fm-sm-table-wrap");
      var wrap = panel.querySelector(".fm-sm-code-editor-wrap");
      if (!tw || !wrap) return;
      var twRect = tw.getBoundingClientRect();
      var wrapRect = wrap.getBoundingClientRect();
      var panelRect = panel.getBoundingClientRect();
      var modalBottomLimit = panelRect.bottom - MODAL_BOTTOM_GAP_PX;
      var leftEl = panel.querySelector(".fm-sm-left");
      if (leftEl && typeof window.getComputedStyle === "function") {
        var lr = leftEl.getBoundingClientRect();
        var padB = parseFloat(window.getComputedStyle(leftEl).paddingBottom);
        if (isNaN(padB)) padB = 0;
        var leftInnerBottom = lr.bottom - padB;
        var limitFromLeftColumn = leftInnerBottom - EDITOR_BOTTOM_INSET_PX;
        if (limitFromLeftColumn < modalBottomLimit) modalBottomLimit = limitFromLeftColumn;
      }
      var targetBottom = twRect.bottom;
      if (modalBottomLimit < targetBottom) targetBottom = modalBottomLimit;
      if (validationEl.classList.contains("visible")) {
        var vr = validationEl.getBoundingClientRect();
        var valLimit = vr.top - 10;
        if (valLimit < targetBottom) targetBottom = valLimit;
      }
      var targetH = Math.round(targetBottom - wrapRect.top);
      if (targetH < CODE_EDITOR_WRAP_MIN_PX) targetH = CODE_EDITOR_WRAP_MIN_PX;
      wrap.classList.add(CODE_EDITOR_LAYOUT_CLASS);
      wrap.style.flex = "0 0 auto";
      wrap.style.height = targetH + "px";
    }

    function scheduleSyncCodeEditorLayout() {
      requestAnimationFrame(function () {
        requestAnimationFrame(syncCodeEditorWrapHeight);
      });
    }

    if (typeof ResizeObserver !== "undefined") {
      var panelResizeObs = new ResizeObserver(function () {
        scheduleSyncCodeEditorLayout();
      });
      panelResizeObs.observe(panel);
    }
    window.addEventListener("resize", scheduleSyncCodeEditorLayout);
    root._fmSmScheduleCodeEditorLayout = scheduleSyncCodeEditorLayout;

    // ---- State: persistedSnapshot + draftByKey (see file header) ----
    var state = createDefaultSessionState();

    var JUST_SAVED_FLASH_MS = 2600;

    function cancelJustSavedFlash() {
      if (state.justSavedFlashTimeoutId !== null) {
        clearTimeout(state.justSavedFlashTimeoutId);
        state.justSavedFlashTimeoutId = null;
      }
      state.justSavedHighlightNames.clear();
      state.pendingScrollToSavedName = null;
    }

    function snippetMatchesSearch(nameStr, q) {
      if (!q) return true;
      var name = String(nameStr || "").toLowerCase();
      return name.indexOf(q) !== -1;
    }

    function getBaselineRecord(persistedName) {
      for (var bi = 0; bi < state.persistedSnapshot.length; bi++) {
        if (state.persistedSnapshot[bi].name === persistedName) return state.persistedSnapshot[bi];
      }
      return null;
    }

    function refreshPersistedAndReconcile(list) {
      state.persistedSnapshot = cloneSnippetList(list);
      var names = new Set();
      for (var i = 0; i < state.persistedSnapshot.length; i++) {
        names.add(state.persistedSnapshot[i].name);
      }
      var keys = Object.keys(state.draftByKey);
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        if (k.indexOf("p:") !== 0) continue;
        var pn = k.slice(2);
        if (!names.has(pn)) delete state.draftByKey[k];
      }
    }

    function getMergedRowDescriptors() {
      var rows = [];
      for (var i = 0; i < state.persistedSnapshot.length; i++) {
        var base = state.persistedSnapshot[i];
        var key = "p:" + base.name;
        var d = state.draftByKey[key];
        if (d && d.deleted) {
          rows.push({
            draftKey: key,
            displayName: d.name != null && String(d.name).trim() !== "" ? String(d.name).trim() : base.name,
            code: d.code != null ? d.code : base.code,
            kind: "persisted",
            persistedName: base.name,
            pendingDelete: true,
            isNew: false,
            baseline: base
          });
          continue;
        }
        var dispName = d ? String(d.name != null ? d.name : "").trim() : base.name;
        var dispCode = d ? d.code : base.code;
        rows.push({
          draftKey: key,
          displayName: dispName,
          code: dispCode != null ? dispCode : "",
          kind: "persisted",
          persistedName: base.name,
          pendingDelete: false,
          isNew: false,
          baseline: base
        });
      }
      var dk = Object.keys(state.draftByKey);
      for (var j = 0; j < dk.length; j++) {
        var k = dk[j];
        if (k.indexOf("n:") !== 0) continue;
        var nd = state.draftByKey[k];
        if (!nd || nd.deleted) continue;
        var nn = String(nd.name != null ? nd.name : "").trim();
        var nc = normalizeCode(String(nd.code != null ? nd.code : "")).trim();
        if (nn === "" && nc === "") {
          if (state.activeDraftKey !== k) {
            delete state.draftByKey[k];
            state.selectedDraftKeys.delete(k);
          }
          continue;
        }
        rows.push({
          draftKey: k,
          displayName: nn,
          code: nd.code != null ? nd.code : "",
          kind: "new",
          persistedName: null,
          pendingDelete: false,
          isNew: true,
          baseline: null
        });
      }
      rows.sort(function (a, b) {
        var an = (a.displayName || "").toLowerCase();
        var bn = (b.displayName || "").toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        if (a.draftKey < b.draftKey) return -1;
        if (a.draftKey > b.draftKey) return 1;
        return 0;
      });
      return rows;
    }

    function persistedRowIsDirty(row) {
      if (row.pendingDelete) return true;
      if (!row.baseline) return false;
      var d = state.draftByKey[row.draftKey];
      if (!d || d.deleted) return false;
      var bc = normalizeCode(String(row.baseline.code != null ? row.baseline.code : "")).trim();
      var dn = String(d.name != null ? d.name : "").trim();
      var dc = normalizeCode(String(d.code != null ? d.code : "")).trim();
      return dn !== row.baseline.name || dc !== bc;
    }

    function getFilteredRows() {
      var q = (state.searchQuery || "").trim().toLowerCase();
      var all = getMergedRowDescriptors();
      if (q === "") return all;
      return all.filter(function (r) {
        return snippetMatchesSearch(r.displayName, q);
      });
    }

    function flushFormToDraft() {
      var name = String(nameEl.value || "").trim();
      var code = normalizeCode(codeElRef.value || "").trim();
      if (state.activeDraftKey === null) {
        if (name === "" && code === "") return;
        var nk = "n:" + String(state.nextNewId++);
        state.draftByKey[nk] = { kind: "new", name: name, code: code, deleted: false };
        state.activeDraftKey = nk;
        return;
      }
      var entry = state.draftByKey[state.activeDraftKey];
      if (!entry) {
        state.activeDraftKey = null;
        return;
      }
      entry.name = name;
      entry.code = code;
      if (entry.deleted) entry.deleted = false;
      if (entry.kind === "new") {
        var en = String(entry.name || "").trim();
        var ec = normalizeCode(String(entry.code != null ? entry.code : "")).trim();
        if (en === "" && ec === "") {
          delete state.draftByKey[state.activeDraftKey];
          state.activeDraftKey = null;
        }
      }
    }

    function ensurePersistedDraft(persistedName) {
      var key = "p:" + persistedName;
      if (!state.draftByKey[key]) {
        var base = getBaselineRecord(persistedName);
        state.draftByKey[key] = {
          kind: "persisted",
          persistedName: persistedName,
          name: base ? base.name : persistedName,
          code: base ? base.code : "",
          deleted: false
        };
      }
      return key;
    }

    function loadFormForDraftKey(key) {
      var entry = state.draftByKey[key];
      if (!entry) return;
      nameEl.value = entry.name != null ? entry.name : "";
      codeElRef.value = normalizeCode(entry.code != null ? entry.code : "");
    }

    function openRowForEdit(row) {
      flushFormToDraft();
      hideSelectionSourceNote();
      if (row.kind === "persisted") {
        ensurePersistedDraft(row.persistedName);
      }
      state.activeDraftKey = row.draftKey;
      loadFormForDraftKey(state.activeDraftKey);
      clearValidation();
      renderVirtualized();
    }

    function markDraftKeyDeleted(draftKey) {
      var entry = state.draftByKey[draftKey];
      if (entry && entry.kind === "new") {
        delete state.draftByKey[draftKey];
        if (state.activeDraftKey === draftKey) {
          state.activeDraftKey = null;
          nameEl.value = "";
          codeElRef.value = "";
        }
        state.selectedDraftKeys.delete(draftKey);
        return;
      }
      if (!entry) {
        var pn = draftKey.indexOf("p:") === 0 ? draftKey.slice(2) : "";
        var b = getBaselineRecord(pn);
        state.draftByKey[draftKey] = {
          kind: "persisted",
          persistedName: pn,
          name: b ? b.name : pn,
          code: b ? b.code : "",
          deleted: true
        };
      } else {
        entry.deleted = true;
      }
      if (state.activeDraftKey === draftKey) {
        state.activeDraftKey = null;
        nameEl.value = "";
        codeElRef.value = "";
        clearValidation();
      }
      state.selectedDraftKeys.delete(draftKey);
    }

    function hasUnsavedDraftWork() {
      flushFormToDraft();
      var rows = getMergedRowDescriptors();
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.pendingDelete) return true;
        if (r.isNew) return true;
        if (persistedRowIsDirty(r)) return true;
      }
      return false;
    }

    function updateSaveButtonEnabled() {
      saveBtn.disabled = !hasUnsavedDraftWork();
    }

    function buildCommitListOrError() {
      flushFormToDraft();
      var rows = getMergedRowDescriptors();
      var out = [];
      var seen = Object.create(null);
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.pendingDelete) continue;
        var nm = String(r.displayName || "").trim();
        var cd = normalizeCode(String(r.code != null ? r.code : "")).trim();
        if (nm === "" || cd === "") {
          return { error: "Every snippet must have a name and code before saving. Complete or remove empty rows." };
        }
        if (seen[nm]) {
          return { error: "Duplicate snippet name: \"" + nm + "\"." };
        }
        seen[nm] = true;
        out.push({ name: nm, code: cd });
      }
      return { list: out };
    }

    function statusBadgeForRow(row) {
      if (state.justSavedHighlightNames.has(row.displayName)) {
        return { cls: "fm-sm-st-saved", text: "OK", title: "Saved" };
      }
      if (row.pendingDelete) {
        return { cls: "fm-sm-st-del", text: "DEL", title: "Pending delete until Save" };
      }
      if (row.isNew) {
        return { cls: "fm-sm-st-new", text: "NEW", title: "New (not saved to storage yet)" };
      }
      if (persistedRowIsDirty(row)) {
        return { cls: "fm-sm-st-mod", text: "M", title: "Modified (draft)" };
      }
      return { cls: "fm-sm-st-ok", text: "", title: "Unchanged" };
    }

    var deleteOverlayOutsideListener = null;
    var deleteOverlayScrollListener = null;

    function closeDeleteOverlay() {
      var el = document.getElementById("fm-sm-delete-overlay");
      if (el && el.parentNode) el.parentNode.removeChild(el);
      if (deleteOverlayOutsideListener) {
        document.removeEventListener("click", deleteOverlayOutsideListener, true);
        deleteOverlayOutsideListener = null;
      }
      if (deleteOverlayScrollListener) {
        tableWrap.removeEventListener("scroll", deleteOverlayScrollListener);
        deleteOverlayScrollListener = null;
      }
    }

    var EXPANDED_OVERLAY_WIDTH = 150;
    var EXPANDED_OVERLAY_WIDTH_BULK = 250;

    function openDeleteOverlay(buttonEl, labelText, onConfirm, onCancel, expandedWidthPx) {
      closeDeleteOverlay();
      var expandedW = expandedWidthPx !== undefined && expandedWidthPx !== null ? expandedWidthPx : EXPANDED_OVERLAY_WIDTH;
      var rect = buttonEl.getBoundingClientRect();
      var overlay = document.createElement("div");
      overlay.id = "fm-sm-delete-overlay";
      overlay.className = "fm-sm-delete-overlay";
      var rowTop = rect.top + (rect.height / 2) - (ROW_HEIGHT / 2);
      overlay.style.left = rect.left + "px";
      overlay.style.top = rowTop + "px";
      overlay.style.width = rect.width + "px";
      overlay.style.height = ROW_HEIGHT + "px";

      var inner = document.createElement("div");
      inner.className = "fm-sm-delete-overlay-inner";

      var label = document.createElement("span");
      label.className = "fm-sm-delete-overlay-label";
      label.textContent = labelText;

      var actions = document.createElement("div");
      actions.className = "fm-sm-delete-overlay-actions";

      var confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.setAttribute("aria-label", "Confirm delete");
      confirmBtn.title = "Confirm delete";
      confirmBtn.innerHTML = "<span class=\"material-icons\" aria-hidden=\"true\">check</span>";

      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.setAttribute("aria-label", "Cancel");
      cancelBtn.title = "Cancel";
      cancelBtn.innerHTML = "<span class=\"material-icons\" aria-hidden=\"true\">close</span>";

      confirmBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeDeleteOverlay();
        onConfirm();
      });
      cancelBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeDeleteOverlay();
        onCancel();
      });

      actions.appendChild(confirmBtn);
      actions.appendChild(cancelBtn);
      inner.appendChild(label);
      inner.appendChild(actions);
      overlay.appendChild(inner);

      root.appendChild(overlay);

      var handler = function (e) {
        if (overlay.contains(e.target)) return;
        closeDeleteOverlay();
        onCancel();
      };
      deleteOverlayOutsideListener = handler;
      setTimeout(function () {
        document.addEventListener("click", deleteOverlayOutsideListener, true);
      }, 0);

      var scrollHandler = function () {
        closeDeleteOverlay();
        onCancel();
      };
      deleteOverlayScrollListener = scrollHandler;
      tableWrap.addEventListener("scroll", deleteOverlayScrollListener);

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          overlay.style.left = (rect.right - expandedW) + "px";
          overlay.style.width = expandedW + "px";
          overlay.classList.add("fm-sm-delete-overlay--expanded");
        });
      });
    }

    function clearValidation() {
      validationEl.textContent = "";
      validationEl.classList.remove("visible");
      scheduleSyncCodeEditorLayout();
    }

    function showValidation(msg) {
      validationEl.textContent = msg;
      validationEl.classList.add("visible");
      scheduleSyncCodeEditorLayout();
    }

    function hideSelectionSourceNote() {
      selectionSourceBadge.classList.remove("visible");
    }

    function formHasDraftContent() {
      return String(nameEl.value || "").trim() !== "" ||
        String(codeElRef.value || "").trim() !== "";
    }

    /**
     * Populate the create-snippet form from editor selection. Does not save.
     * @param {string} rawCode
     * @param {object} [_opts] reserved for future use
     * @returns {boolean} true if the form was updated
     */
    function applyLoadFromEditor(rawCode, _opts) {
      var code = normalizeCode(String(rawCode || "")).trim();
      if (!code) return false;
      if (formHasDraftContent()) {
        if (!window.confirm("Replace the current editor? Text in the fields will be replaced (other draft rows in the list are kept).")) {
          return false;
        }
      }
      cancelJustSavedFlash();
      state.activeDraftKey = null;
      nameEl.value = "";
      codeElRef.value = normalizeCode(rawCode);
      clearValidation();
      selectionSourceBadge.classList.add("visible");
      flushFormToDraft();
      renderVirtualized();
      updateSaveButtonEnabled();
      try {
        nameEl.focus();
      } catch (e) { /* ignore */ }
      return true;
    }

    /**
     * Clear: empties the editor and selects a fresh new-snippet buffer. Persisted snippets keep their draft edits in
     * the table; an active unsaved "new" row (n:…) is removed so you can start another snippet from scratch.
     */
    function clearForm() {
      flushFormToDraft();
      if (state.activeDraftKey !== null) {
        var ak = state.activeDraftKey;
        var ent = state.draftByKey[ak];
        if (ent && ent.kind === "new") {
          delete state.draftByKey[ak];
          state.selectedDraftKeys.delete(ak);
        }
      }
      state.activeDraftKey = null;
      cancelJustSavedFlash();
      nameEl.value = "";
      codeElRef.value = "";
      hideSelectionSourceNote();
      clearValidation();
      renderVirtualized();
      updateSaveButtonEnabled();
    }

    function updateBulkToolbar() {
      if (state.selectedDraftKeys.size === 0) {
        removeSelectedBtn.classList.remove("fm-sm-visible");
      } else {
        removeSelectedBtn.classList.add("fm-sm-visible");
      }
    }

    function syncHeaderSelectAll() {
      if (!headerSelectAllCb) return;
      var vis = getFilteredRows();
      if (vis.length === 0) {
        headerSelectAllCb.checked = false;
        headerSelectAllCb.indeterminate = false;
        headerSelectAllCb.disabled = true;
        return;
      }
      headerSelectAllCb.disabled = false;
      var allSel = true;
      var someSel = false;
      for (var hi = 0; hi < vis.length; hi++) {
        var on = state.selectedDraftKeys.has(vis[hi].draftKey);
        if (on) {
          someSel = true;
        } else {
          allSel = false;
        }
      }
      headerSelectAllCb.checked = allSel;
      headerSelectAllCb.indeterminate = someSel && !allSel;
    }

    function renderVirtualized() {
      flushFormToDraft();
      closeDeleteOverlay();
      state.scrollTop = tableWrap.scrollTop;
      var list = getFilteredRows();
      tbody.innerHTML = "";
      if (list.length === 0) {
        state.pendingScrollToSavedName = null;
        if (state.justSavedFlashTimeoutId !== null) {
          clearTimeout(state.justSavedFlashTimeoutId);
          state.justSavedFlashTimeoutId = null;
        }
        state.justSavedHighlightNames.clear();
        var trEmpty = document.createElement("tr");
        trEmpty.innerHTML = "<td colspan=\"4\" class=\"fm-sm-empty\">" + (state.searchQuery.trim() ? "No snippets match your search." : "No snippets in the working list yet. Type a name and code to add one.") + "</td>";
        tbody.appendChild(trEmpty);
        syncHeaderSelectAll();
        updateSaveButtonEnabled();
        return;
      }
      for (var i = 0; i < list.length; i++) {
        var row = list[i];
        var tr = document.createElement("tr");
        tr.dataset.draftKey = row.draftKey;
        tr.dataset.snippetName = row.displayName;
        tr.dataset.snippetIndex = String(i);
        if (state.activeDraftKey === row.draftKey) tr.classList.add("fm-sm-tr-editing");
        if (row.pendingDelete) tr.classList.add("fm-sm-tr-pending-delete");
        if (state.justSavedHighlightNames.has(row.displayName)) {
          tr.classList.add("fm-sm-tr-just-saved");
        }
        var cb = document.createElement("td");
        cb.className = "fm-sm-td-cb";
        var input = document.createElement("input");
        input.type = "checkbox";
        input.checked = state.selectedDraftKeys.has(row.draftKey);
        input.setAttribute("aria-label", "Select " + (row.displayName || "").replace(/"/g, ""));
        input.addEventListener("change", function (dk) {
          return function () {
            if (state.selectedDraftKeys.has(dk)) state.selectedDraftKeys.delete(dk);
            else state.selectedDraftKeys.add(dk);
            updateBulkToolbar();
            renderVirtualized();
          };
        }(row.draftKey));
        cb.appendChild(input);
        tr.appendChild(cb);
        var stCell = document.createElement("td");
        stCell.className = "fm-sm-td-status";
        var badge = document.createElement("span");
        var sb = statusBadgeForRow(row);
        badge.className = "fm-sm-status-badge " + sb.cls;
        badge.textContent = sb.text;
        badge.title = sb.title;
        badge.setAttribute("aria-label", sb.title);
        stCell.appendChild(badge);
        tr.appendChild(stCell);
        var nameCell = document.createElement("td");
        nameCell.className = "fm-sm-td-name";
        nameCell.textContent = row.displayName || "";
        nameCell.title = row.displayName ? "Click to edit " + row.displayName : "Click to edit";
        nameCell.setAttribute("role", "button");
        nameCell.setAttribute("tabindex", "0");
        nameCell.setAttribute("aria-label", "Edit snippet: " + (row.displayName || "").replace(/"/g, ""));
        nameCell.addEventListener("click", function (r) { return function () { openRowForEdit(r); }; }(row));
        nameCell.addEventListener("keydown", function (r) {
          return function (ev) {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              openRowForEdit(r);
            }
          };
        }(row));
        tr.appendChild(nameCell);
        var actionsCell = document.createElement("td");
        actionsCell.className = "fm-sm-td-actions";
        var innerWrap = document.createElement("div");
        innerWrap.className = "fm-sm-td-actions-inner";
        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.title = row.pendingDelete ? "Undo pending delete" : "Mark for delete (saved when you click Save)";
        delBtn.setAttribute("aria-label", row.pendingDelete ? "Undo delete" : "Delete snippet");
        delBtn.innerHTML = "<span class=\"material-icons\" aria-hidden=\"true\">delete</span>";
        delBtn.addEventListener("click", function (r) {
          return function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            if (r.pendingDelete) {
              var ent = state.draftByKey[r.draftKey];
              if (ent) ent.deleted = false;
              renderVirtualized();
              updateSaveButtonEnabled();
              return;
            }
            markDraftKeyDeleted(r.draftKey);
            renderVirtualized();
            updateSaveButtonEnabled();
          };
        }(row));
        innerWrap.appendChild(delBtn);
        actionsCell.appendChild(innerWrap);
        tr.appendChild(actionsCell);
        tbody.appendChild(tr);
      }
      updateBulkToolbar();
      syncHeaderSelectAll();
      updateSaveButtonEnabled();
      if (list.length > 0) {
        if (state.pendingScrollToSavedName !== null) {
          var scrollTarget = state.pendingScrollToSavedName;
          state.pendingScrollToSavedName = null;
          var scrollRow = null;
          var dataRows = tbody.querySelectorAll("tr[data-snippet-name]");
          for (var ri = 0; ri < dataRows.length; ri++) {
            if (dataRows[ri].dataset.snippetName === scrollTarget) {
              scrollRow = dataRows[ri];
              break;
            }
          }
          if (scrollRow) {
            scrollRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
            state.scrollTop = tableWrap.scrollTop;
          } else {
            tableWrap.scrollTop = state.scrollTop;
          }
        } else {
          tableWrap.scrollTop = state.scrollTop;
        }
      }
      if (state.justSavedHighlightNames.size > 0) {
        if (state.justSavedFlashTimeoutId !== null) {
          clearTimeout(state.justSavedFlashTimeoutId);
          state.justSavedFlashTimeoutId = null;
        }
        state.justSavedFlashTimeoutId = setTimeout(function () {
          state.justSavedFlashTimeoutId = null;
          state.justSavedHighlightNames.clear();
          var rowsFlash = tbody.querySelectorAll("tr[data-snippet-name]");
          for (var fi = 0; fi < rowsFlash.length; fi++) {
            rowsFlash[fi].classList.remove("fm-sm-tr-just-saved");
          }
          renderVirtualized();
        }, JUST_SAVED_FLASH_MS);
      }
    }

    function onTableScroll() {
      state.scrollTop = tableWrap.scrollTop;
    }

    function renderAll() {
      renderVirtualized();
    }

    headerSelectAllCb.addEventListener("change", function () {
      var vis = getFilteredRows();
      if (vis.length === 0) {
        syncHeaderSelectAll();
        return;
      }
      if (headerSelectAllCb.checked) {
        for (var hi = 0; hi < vis.length; hi++) {
          state.selectedDraftKeys.add(vis[hi].draftKey);
        }
      } else {
        for (var hj = 0; hj < vis.length; hj++) {
          state.selectedDraftKeys.delete(vis[hj].draftKey);
        }
      }
      renderVirtualized();
    });

    searchInput.addEventListener("input", function () {
      state.searchQuery = searchInput.value || "";
      state.scrollTop = 0;
      tableWrap.scrollTop = 0;
      renderAll();
    });

    removeSelectedBtn.addEventListener("click", function (ev) {
      var keys = Array.from(state.selectedDraftKeys);
      if (keys.length === 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      var n = keys.length;
      openDeleteOverlay(removeSelectedBtn, "Mark " + n + " selected for removal?",
        function () {
          for (var ki = 0; ki < keys.length; ki++) {
            markDraftKeyDeleted(keys[ki]);
          }
          state.selectedDraftKeys.clear();
          renderVirtualized();
          updateSaveButtonEnabled();
        },
        function () { },
        EXPANDED_OVERLAY_WIDTH_BULK
      );
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
    });

    nameEl.addEventListener("input", function () {
      flushFormToDraft();
      renderVirtualized();
    });
    codeElRef.addEventListener("input", function () {
      flushFormToDraft();
      renderVirtualized();
    });

    /**
     * Names to show OK / green flash after Save: new snippets or persisted rows whose code changed vs pre-save snapshot.
     * Unchanged rows (same name + same normalized code) are omitted.
     */
    function computeHighlightNamesAfterSave(commitList, priorPersisted) {
      var out = new Set();
      for (var i = 0; i < commitList.length; i++) {
        var item = commitList[i];
        var nm = item.name;
        var cd = normalizeCode(String(item.code != null ? item.code : "")).trim();
        var prior = null;
        for (var j = 0; j < priorPersisted.length; j++) {
          if (priorPersisted[j].name === nm) {
            prior = priorPersisted[j];
            break;
          }
        }
        if (!prior) {
          out.add(nm);
          continue;
        }
        var pc = normalizeCode(String(prior.code != null ? prior.code : "")).trim();
        if (pc !== cd) {
          out.add(nm);
        }
      }
      return out;
    }

    function commitSaveAll() {
      clearValidation();
      var built = buildCommitListOrError();
      if (built.error) {
        showValidation(built.error);
        return;
      }
      var commitList = built.list || [];
      if (commitList.length === 0 && !hasUnsavedDraftWork()) {
        showValidation("Nothing to save.");
        return;
      }
      var savedNames = commitList.map(function (x) { return x.name; });
      var priorSnap = cloneSnippetList(state.persistedSnapshot);
      getStorage().then(function (storage) { return storage.replaceAll(commitList); })
        .then(function () {
          notifySnippetsChanged();
          hideSelectionSourceNote();
          getStored(function (list) {
            refreshPersistedAndReconcile(list);
            state.draftByKey = Object.create(null);
            state.nextNewId = 1;
            state.activeDraftKey = null;
            state.selectedDraftKeys.clear();
            nameEl.value = "";
            codeElRef.value = "";
            if (state.justSavedFlashTimeoutId !== null) {
              clearTimeout(state.justSavedFlashTimeoutId);
              state.justSavedFlashTimeoutId = null;
            }
            var highlightNames = computeHighlightNamesAfterSave(commitList, priorSnap);
            state.justSavedHighlightNames = highlightNames;
            var hlArr = Array.from(highlightNames);
            state.pendingScrollToSavedName = hlArr.length > 0 ? hlArr[0] : null;
            var q = (state.searchQuery || "").trim().toLowerCase();
            if (q) {
              var checkList = hlArr.length > 0 ? hlArr : savedNames;
              var anyMatch = false;
              for (var si = 0; si < checkList.length; si++) {
                if (snippetMatchesSearch(checkList[si], q)) {
                  anyMatch = true;
                  break;
                }
              }
              if (!anyMatch) {
                state.searchQuery = "";
                searchInput.value = "";
              }
            }
            clearValidation();
            renderAll();
            updateSaveButtonEnabled();
          });
        })
        .catch(function () {
          showValidation("Failed to save. Try again.");
        });
    }

    saveBtn.addEventListener("click", function () {
      commitSaveAll();
    });
    clearBtn.addEventListener("click", clearForm);

    function closeDropdownMenu() {
      dropdownMenu.classList.remove("open");
    }
    dropdownBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      dropdownMenu.classList.toggle("open");
    });
    menuImportDefault.addEventListener("click", function () {
      closeDropdownMenu();
      importDefaultSnippets();
    });
    menuExport.addEventListener("click", function () {
      closeDropdownMenu();
      exportSnippets();
    });
    menuImport.addEventListener("click", function () {
      closeDropdownMenu();
      headerFileInput.click();
    });
    headerFileInput.addEventListener("change", function () {
      var file = headerFileInput.files && headerFileInput.files[0];
      if (file) importSnippets(file);
      headerFileInput.value = "";
    });
    document.addEventListener("click", function closeDropdownOnOutside(ev) {
      if (dropdownMenu.classList.contains("open") && !hdActions.contains(ev.target)) {
        closeDropdownMenu();
      }
    }, true);

    function exportSnippets() {
      getStored(function (list) {
        var json = JSON.stringify(list, null, 2);
        var blob = new Blob([json], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "fm-snippets.json";
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    function parseImportedList(data) {
      var parsed;
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        return { error: "Invalid JSON." };
      }
      if (!Array.isArray(parsed)) return { error: "File must be a JSON array of snippets." };
      var list = [];
      for (var i = 0; i < parsed.length; i++) {
        var raw = parsed[i];
        if (!raw || typeof raw !== "object") continue;
        var name = (typeof raw.name === "string" && raw.name.trim() !== "")
          ? raw.name.trim()
          : (typeof raw.id === "string" && raw.id.trim() !== "")
            ? raw.id.trim()
            : "";
        var code = typeof raw.code === "string" ? raw.code : String(raw.code || "");
        if (!name || !code) continue;
        list.push({
          name: name,
          code: normalizeCode(code).trim()
        });
      }
      return { list: list };
    }

    function importSnippets(file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var result = parseImportedList(reader.result);
        if (result.error) {
          alert(result.error);
          return;
        }
        if (result.list.length === 0) {
          alert("No valid snippets in file. Each item needs a name (or id) and code.");
          return;
        }
        getStored(function (current) {
          var byName = new Map();
          current.forEach(function (x) { byName.set(x.name, x); });
          result.list.forEach(function (item) { byName.set(item.name, item); });
          var merged = Array.from(byName.values());
          setStored(merged, function () {
            state.persistedSnapshot = cloneSnippetList(merged);
            state.draftByKey = Object.create(null);
            state.nextNewId = 1;
            state.activeDraftKey = null;
            state.selectedDraftKeys.clear();
            nameEl.value = "";
            codeElRef.value = "";
            hideSelectionSourceNote();
            clearValidation();
            cancelJustSavedFlash();
            renderAll();
            updateSaveButtonEnabled();
          });
        });
      };
      reader.readAsText(file, "UTF-8");
    }

    function importDefaultSnippets() {
      var url = chrome.runtime.getURL("data/default-snippets.json");
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (rawList) {
          if (!Array.isArray(rawList)) return;
          var list = rawList.map(function (raw) {
            var name = (typeof raw.name === "string" && raw.name.trim() !== "")
              ? raw.name.trim()
              : (typeof raw.id === "string" && raw.id.trim() !== "")
                ? raw.id.trim()
                : "";
            var code = typeof raw.code === "string" ? raw.code : String(raw.code || "");
            return {
              name: name,
              code: normalizeCode(code).trim()
            };
          }).filter(function (x) { return x.name && x.code; });
          getStored(function (current) {
            var byName = new Map();
            current.forEach(function (x) { byName.set(x.name, x); });
            list.forEach(function (item) { byName.set(item.name, item); });
            var merged = Array.from(byName.values());
            setStored(merged, function () {
              state.persistedSnapshot = cloneSnippetList(merged);
              state.draftByKey = Object.create(null);
              state.nextNewId = 1;
              state.activeDraftKey = null;
              state.selectedDraftKeys.clear();
              nameEl.value = "";
              codeElRef.value = "";
              hideSelectionSourceNote();
              clearValidation();
              cancelJustSavedFlash();
              renderAll();
              updateSaveButtonEnabled();
            });
          });
        })
        .catch(function () { alert("Could not load default snippets."); });
    }

    tableWrap.addEventListener("scroll", onTableScroll);

    /** Clears ephemeral UI when closing or reopening the modal; does not discard draftByKey or the editor buffer. */
    function resetEphemeralOnModalHide() {
      closeDeleteOverlay();
      closeDropdownMenu();
      cancelJustSavedFlash();
      state.selectedDraftKeys.clear();
      state.scrollTop = 0;
      state.searchQuery = "";
      searchInput.value = "";
      tableWrap.scrollTop = 0;
      validationEl.textContent = "";
      validationEl.classList.remove("visible");
      resetCodeEditorWrapLayout();
      headerFileInput.value = "";
    }

    function onModalReopen() {
      resetEphemeralOnModalHide();
    }

    function closeModal() {
      resetEphemeralOnModalHide();
      root.style.display = "none";
    }
    closeBtn.addEventListener("click", closeModal);
    root.addEventListener("click", function (ev) {
      if (ev.target === root) closeModal();
    });
    panel.addEventListener("click", function (ev) { ev.stopPropagation(); });

    getStored(function (list) {
      refreshPersistedAndReconcile(list);
      renderAll();
      requestAnimationFrame(function () {
        state.scrollTop = tableWrap.scrollTop;
        renderVirtualized();
        updateSaveButtonEnabled();
        if (opts.editorFocusNewSnippet === true) {
          clearForm();
          try { nameEl.focus(); } catch (e) { /* ignore */ }
        }
        scheduleSyncCodeEditorLayout();
      });
    });
    root._fmSmState = state;
    root._fmSmRenderAll = renderAll;
    root._fmSmApplyLoadFromEditor = applyLoadFromEditor;
    root._fmSmClearForm = clearForm;
    root._fmSmNameEl = nameEl;
    root._fmSmRefreshPersistedAndReconcile = refreshPersistedAndReconcile;
    root._fmSmOnModalReopen = onModalReopen;
    root._fmSmResetTransientSession = resetEphemeralOnModalHide;
    if (opts.deferShow) {
      root.style.display = "none";
    }
    return root;
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg && msg.type === "fm-open-snippet-modal") {
      createModal();
      sendResponse({ ok: true });
    }
    return false;
  });

  window.addEventListener("fm-open-snippet-modal-request", function (ev) {
    var detail = ev && ev.detail;
    createModal({
      editorFocusNewSnippet: detail && detail.editorFocusNewSnippet === true
    });
  });

  window.addEventListener("fm-snippet-load-from-editor", function (ev) {
    var detail = ev && ev.detail;
    var raw = detail && typeof detail.code === "string" ? detail.code : "";
    if (!normalizeCode(raw).trim()) return;
    var root = createModal({ deferShow: true });
    root.style.display = "none";
    getStored(function (list) {
      var st = root._fmSmState;
      var ra = root._fmSmRenderAll;
      if (st && ra && typeof root._fmSmRefreshPersistedAndReconcile === "function") {
        root._fmSmRefreshPersistedAndReconcile(list);
        ra();
      }
      if (typeof root._fmSmApplyLoadFromEditor === "function") {
        root._fmSmApplyLoadFromEditor(raw, { editorSelectionEntry: true });
      }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.style.removeProperty("display");
          if (typeof root._fmSmScheduleCodeEditorLayout === "function") {
            root._fmSmScheduleCodeEditorLayout();
          }
        });
      });
    });
  });
})();
