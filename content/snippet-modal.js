/**
 * In-page modal for managing custom script snippets. Opens when the popup sends "fm-open-snippet-modal".
 * Uses IndexedDB via FM.snippetStorage. Name is the unique identifier.
 * Layout: left = form, right = virtualized table with selection and bulk actions.
 */
(function () {
  const MODAL_ID = "fm-snippet-modal-root";
  const SNIPPETS_CHANGED_EVENT = "fm-snippets-changed";
  const ROW_HEIGHT = 44;
  const TABLE_VISIBLE_ROWS = 12;
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

  function setStored(list, cb) {
    getStorage().then(function (storage) { return storage.replaceAll(list || []); })
      .then(function () {
        try { window.dispatchEvent(new CustomEvent(SNIPPETS_CHANGED_EVENT)); } catch (e) { /* ignore */ }
        if (typeof cb === "function") cb();
      })
      .catch(function () { if (typeof cb === "function") cb(); });
  }

  function injectStyles() {
    if (document.getElementById("fm-snippet-modal-styles")) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MATERIAL_ICONS_URL;
    (document.head || document.documentElement).appendChild(link);

    var style = document.createElement("style");
    style.id = "fm-snippet-modal-styles";
    style.textContent = [
      "#" + MODAL_ID + " { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; font-size: 14px; }",
      "#" + MODAL_ID + " .fm-sm-panel { background: var(--fm-sm-bg, #fff); color: var(--fm-sm-fg, #1a1a1a); width: 100%; max-width: 960px; max-height: min(90vh, 600px); display: flex; flex-direction: column; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); overflow: hidden; }",
      "#" + MODAL_ID + " .fm-sm-hd { padding: 14px 20px; border-bottom: 1px solid rgba(120,120,120,0.3); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; }",
      "#" + MODAL_ID + " .fm-sm-title { margin: 0; font-size: 18px; font-weight: 700; flex: 1; }",
      "#" + MODAL_ID + " .fm-sm-hd-actions { display: flex; align-items: center; gap: 8px; position: relative; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-btn .material-icons { font-size: 20px; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-menu { position: absolute; top: 100%; right: 0; margin-top: 4px; min-width: 180px; background: var(--fm-sm-bg, #fff); border: 1px solid rgba(120,120,120,0.35); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); z-index: 10; padding: 6px 0; display: none; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-menu.open { display: block; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-menu button { display: block; width: 100%; padding: 8px 14px; border: none; background: none; cursor: pointer; font-size: 13px; text-align: left; }",
      "#" + MODAL_ID + " .fm-sm-dropdown-menu button:hover { background: rgba(120,120,120,0.1); }",
      "#" + MODAL_ID + " .fm-sm-close { padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 13px; }",
      "#" + MODAL_ID + " .fm-sm-body { display: flex; flex: 1; min-height: 0; }",
      "#" + MODAL_ID + " .fm-sm-left { width: 340px; min-width: 280px; padding: 20px; border-right: 1px solid rgba(120,120,120,0.25); overflow-y: auto; flex-shrink: 0; }",
      "#" + MODAL_ID + " .fm-sm-right { flex: 1; display: flex; flex-direction: column; min-width: 0; padding: 16px; }",
      "#" + MODAL_ID + " .fm-sm-section-title { margin: 0 0 12px 0; font-size: 15px; font-weight: 600; }",
      "#" + MODAL_ID + " .fm-sm-hint { margin: 0 0 10px 0; font-size: 12px; opacity: 0.85; }",
      "#" + MODAL_ID + " .fm-sm-field { display: block; margin-bottom: 12px; }",
      "#" + MODAL_ID + " .fm-sm-field span { display: block; margin-bottom: 4px; font-weight: 500; }",
      "#" + MODAL_ID + " .fm-sm-field span em { font-weight: normal; opacity: 0.8; }",
      "#" + MODAL_ID + " .fm-sm-field input, #" + MODAL_ID + " .fm-sm-field textarea { width: 100%; padding: 8px 10px; border: 1px solid rgba(120,120,120,0.45); border-radius: 6px; font-family: inherit; font-size: 13px; box-sizing: border-box; }",
      "#" + MODAL_ID + " .fm-sm-field textarea { font-family: ui-monospace,monospace; resize: vertical; min-height: 100px; }",
      "#" + MODAL_ID + " .fm-sm-actions { display: flex; gap: 10px; margin-top: 16px; }",
      "#" + MODAL_ID + " .fm-sm-actions button { padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 13px; }",
      "#" + MODAL_ID + " .fm-sm-validation { margin-top: 8px; font-size: 12px; color: #c00; display: none; }",
      "#" + MODAL_ID + " .fm-sm-validation.visible { display: block; }",
      "#" + MODAL_ID + " .fm-sm-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }",
      "#" + MODAL_ID + " .fm-sm-toolbar button { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 13px; }",
      "#" + MODAL_ID + " .fm-sm-toolbar .material-icons { font-size: 18px; }",
      "#" + MODAL_ID + " .fm-sm-search { height: 32px; box-sizing: border-box; padding: 0 12px; border: 1px solid rgba(120,120,120,0.45); border-radius: 6px; font-size: 13px; min-width: 160px; flex: 1; max-width: 240px; }",
      "#" + MODAL_ID + " .fm-sm-table-wrap { flex: 1; min-height: 0; border: 1px solid rgba(120,120,120,0.35); border-radius: 8px; overflow: auto; background: rgba(120,120,120,0.04); }",
      "#" + MODAL_ID + " .fm-sm-table { width: 100%; border-collapse: collapse; table-layout: fixed; }",
      "#" + MODAL_ID + " .fm-sm-table thead { position: sticky; top: 0; z-index: 1; background: var(--fm-sm-bg, #fff); border-bottom: 2px solid rgba(120,120,120,0.4); }",
      "#" + MODAL_ID + " .fm-sm-table th { text-align: left; padding: 10px 10px; font-size: 12px; font-weight: 600; color: rgba(0,0,0,0.7); }",
      "#" + MODAL_ID + " .fm-sm-table th.fm-sm-th-cb { width: 40px; }",
      "#" + MODAL_ID + " .fm-sm-table th.fm-sm-th-name { width: 34%; }",
      "#" + MODAL_ID + " .fm-sm-table th.fm-sm-th-desc { width: 36%; }",
      "#" + MODAL_ID + " .fm-sm-table th.fm-sm-th-actions { width: 80px; }",
      "#" + MODAL_ID + " .fm-sm-table tbody tr { height: " + ROW_HEIGHT + "px; border-bottom: 1px solid rgba(120,120,120,0.2); }",
      "#" + MODAL_ID + " .fm-sm-table tbody tr:hover { background: rgba(120,120,120,0.08); }",
      "#" + MODAL_ID + " .fm-sm-table td { padding: 0 10px; vertical-align: middle; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-cb { width: 40px; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-name { font-weight: 600; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-desc { opacity: 0.9; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-actions { white-space: normal; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-actions button { padding: 4px 8px; margin-right: 4px; border-radius: 4px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; }",
      "#" + MODAL_ID + " .fm-sm-table td.fm-sm-td-actions button .material-icons { font-size: 18px; }",
      "#" + MODAL_ID + " .fm-sm-table .fm-sm-empty { padding: 24px; text-align: center; color: rgba(0,0,0,0.5); font-size: 13px; }",
      "#" + MODAL_ID + " .fm-sm-spacer { height: 0; pointer-events: none; }",
      "#" + MODAL_ID + " .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function createModal() {
    injectStyles();
    var root = document.getElementById(MODAL_ID);
    if (root) {
      root.style.display = "flex";
      getStored(function (list) { state.snippets = list; renderAll(); });
      return root;
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
    hdActions.appendChild(dropdownBtn);
    hdActions.appendChild(dropdownMenu);
    var headerFileInput = document.createElement("input");
    headerFileInput.type = "file";
    headerFileInput.accept = ".json,application/json";
    headerFileInput.style.display = "none";
    hdActions.appendChild(headerFileInput);
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "fm-sm-close";
    closeBtn.textContent = "Close";
    hd.appendChild(title);
    hd.appendChild(hdActions);
    hd.appendChild(closeBtn);
    panel.appendChild(hd);

    var body = document.createElement("div");
    body.className = "fm-sm-body";

    // ---- Left: form ----
    var left = document.createElement("div");
    left.className = "fm-sm-left";
    left.innerHTML = "<h2 class=\"fm-sm-section-title\">Add or edit snippet</h2><p class=\"fm-sm-hint\">Pasted code: literal backslash-n (<code>\\n</code>) is converted to newlines. Name must be unique.</p>";
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
    var descLabel = document.createElement("label");
    descLabel.className = "fm-sm-field";
    descLabel.innerHTML = "<span>Description</span>";
    var descEl = document.createElement("input");
    descEl.id = "fm-sm-desc";
    descEl.type = "text";
    descEl.autocomplete = "off";
    descLabel.appendChild(descEl);
    form.appendChild(descLabel);
    var codeLabel = document.createElement("label");
    codeLabel.className = "fm-sm-field";
    codeLabel.innerHTML = "<span>Code <em>(required)</em></span>";
    var codeElRef = document.createElement("textarea");
    codeElRef.id = "fm-sm-code";
    codeElRef.rows = 8;
    codeElRef.required = true;
    codeLabel.appendChild(codeElRef);
    form.appendChild(codeLabel);
    var validationEl = document.createElement("div");
    validationEl.className = "fm-sm-validation";
    validationEl.id = "fm-sm-validation";
    validationEl.setAttribute("role", "alert");
    form.appendChild(validationEl);
    var actions = document.createElement("div");
    actions.className = "fm-sm-actions";
    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.textContent = "Save";
    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.title = "Clear all form fields";
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(clearBtn);
    form.appendChild(actions);
    left.appendChild(form);
    body.appendChild(left);

    // ---- Right: toolbar + table ----
    var right = document.createElement("div");
    right.className = "fm-sm-right";
    var listTitle = document.createElement("h2");
    listTitle.className = "fm-sm-section-title";
    listTitle.textContent = "Your snippets";
    right.appendChild(listTitle);

    var toolbar = document.createElement("div");
    toolbar.className = "fm-sm-toolbar";
    var selectAllBtn = document.createElement("button");
    selectAllBtn.type = "button";
    selectAllBtn.className = "fm-sm-select-all";
    selectAllBtn.title = "Select all / Deselect all";
    selectAllBtn.innerHTML = "<span class=\"material-icons\" aria-hidden=\"true\">done_all</span><span class=\"fm-sm-btn-label\">Select all</span>";
    var removeSelectedBtn = document.createElement("button");
    removeSelectedBtn.type = "button";
    removeSelectedBtn.className = "fm-sm-remove-selected";
    removeSelectedBtn.title = "Remove selected snippets";
    removeSelectedBtn.innerHTML = "<span class=\"material-icons\" aria-hidden=\"true\">delete</span><span class=\"fm-sm-btn-label\">Remove selected</span>";
    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "fm-sm-search";
    searchInput.placeholder = "Search snippets…";
    searchInput.autocomplete = "off";
    searchInput.setAttribute("aria-label", "Search snippets by name or description");
    toolbar.appendChild(selectAllBtn);
    toolbar.appendChild(removeSelectedBtn);
    toolbar.appendChild(searchInput);
    right.appendChild(toolbar);

    var tableWrap = document.createElement("div");
    tableWrap.className = "fm-sm-table-wrap";
    var table = document.createElement("table");
    table.className = "fm-sm-table";
    table.setAttribute("role", "grid");
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th class=\"fm-sm-th-cb\" scope=\"col\"><span class=\"sr-only\">Select</span></th><th class=\"fm-sm-th-name\" scope=\"col\">Name</th><th class=\"fm-sm-th-desc\" scope=\"col\">Description</th><th class=\"fm-sm-th-actions\" scope=\"col\">Actions</th></tr>";
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    right.appendChild(tableWrap);
    body.appendChild(right);
    panel.appendChild(body);
    root.appendChild(panel);
    document.body.appendChild(root);

    // ---- State ----
    var state = {
      snippets: [],
      selectedNames: new Set(),
      editingName: null,
      scrollTop: 0,
      searchQuery: ""
    };

    function getFilteredList() {
      var q = (state.searchQuery || "").trim().toLowerCase();
      if (q === "") return state.snippets;
      return state.snippets.filter(function (s) {
        var name = (s.name || "").toLowerCase();
        var desc = (s.description || "").toLowerCase();
        return name.indexOf(q) !== -1 || desc.indexOf(q) !== -1;
      });
    }

    function clearValidation() {
      validationEl.textContent = "";
      validationEl.classList.remove("visible");
    }

    function showValidation(msg) {
      validationEl.textContent = msg;
      validationEl.classList.add("visible");
    }

    function clearForm() {
      state.editingName = null;
      nameEl.value = "";
      descEl.value = "";
      codeElRef.value = "";
      clearValidation();
    }

    function allVisibleSelected() {
      var list = getFilteredList();
      if (list.length === 0) return false;
      for (var i = 0; i < list.length; i++) {
        if (!state.selectedNames.has(list[i].name)) return false;
      }
      return true;
    }

    function updateSelectAllButton() {
      var list = getFilteredList();
      var label = selectAllBtn.querySelector(".fm-sm-btn-label");
      if (list.length === 0) {
        selectAllBtn.disabled = true;
        if (label) label.textContent = "Select all";
      } else {
        selectAllBtn.disabled = false;
        if (label) label.textContent = allVisibleSelected() ? "Deselect all" : "Select all";
      }
      removeSelectedBtn.disabled = state.selectedNames.size === 0;
    }

    function renderVirtualized() {
      var list = getFilteredList();
      tbody.innerHTML = "";
      if (list.length === 0) {
        var tr = document.createElement("tr");
        tr.innerHTML = "<td colspan=\"4\" class=\"fm-sm-empty\">" + (state.searchQuery.trim() ? "No snippets match your search." : "No custom snippets yet. Add one in the form.") + "</td>";
        tbody.appendChild(tr);
        return;
      }
      var wrapHeight = tableWrap.clientHeight || TABLE_VISIBLE_ROWS * ROW_HEIGHT;
      var startIndex = Math.max(0, Math.floor(state.scrollTop / ROW_HEIGHT));
      var endIndex = Math.min(list.length - 1, startIndex + Math.ceil(wrapHeight / ROW_HEIGHT) + 1);
      var spacerTop = document.createElement("tr");
      spacerTop.className = "fm-sm-spacer";
      spacerTop.innerHTML = "<td colspan=\"4\" style=\"height:" + (startIndex * ROW_HEIGHT) + "px; padding: 0; border: none; line-height: 0; vertical-align: top;\"></td>";
      tbody.appendChild(spacerTop);
      for (var i = startIndex; i <= endIndex; i++) {
        var s = list[i];
        var tr = document.createElement("tr");
        tr.dataset.snippetName = s.name;
        tr.dataset.snippetIndex = String(i);
        var cb = document.createElement("td");
        cb.className = "fm-sm-td-cb";
        var input = document.createElement("input");
        input.type = "checkbox";
        input.checked = state.selectedNames.has(s.name);
        input.setAttribute("aria-label", "Select " + (s.name || "").replace(/"/g, ""));
        input.addEventListener("change", function (sn) {
          return function () {
            if (state.selectedNames.has(sn)) state.selectedNames.delete(sn);
            else state.selectedNames.add(sn);
            updateSelectAllButton();
            renderVirtualized();
          };
        }(s.name));
        cb.appendChild(input);
        tr.appendChild(cb);
        var nameCell = document.createElement("td");
        nameCell.className = "fm-sm-td-name";
        nameCell.textContent = s.name || "";
        nameCell.title = s.name || "";
        tr.appendChild(nameCell);
        var descCell = document.createElement("td");
        descCell.className = "fm-sm-td-desc";
        descCell.textContent = (s.description && String(s.description).trim()) || "";
        descCell.title = (s.description && String(s.description).trim()) || "";
        tr.appendChild(descCell);
        var actionsCell = document.createElement("td");
        actionsCell.className = "fm-sm-td-actions";
        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.title = "Edit";
        editBtn.setAttribute("aria-label", "Edit snippet");
        editBtn.innerHTML = "<span class=\"material-icons\" aria-hidden=\"true\">edit</span>";
        editBtn.addEventListener("click", function (snip) {
          return function () {
            state.editingName = snip.name;
            nameEl.value = snip.name || "";
            descEl.value = snip.description || "";
            codeElRef.value = snip.code || "";
            clearValidation();
          };
        }(s));
        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.title = "Delete";
        delBtn.setAttribute("aria-label", "Delete snippet");
        delBtn.innerHTML = "<span class=\"material-icons\" aria-hidden=\"true\">delete</span>";
        delBtn.addEventListener("click", function (snip) {
          return function () {
            if (!confirm("Delete snippet \"" + (snip.name || "").replace(/"/g, "\\\"") + "\"?")) return;
            getStorage().then(function (storage) { return storage.remove(snip.name); })
              .then(function () {
                if (state.editingName === snip.name) clearForm();
                state.selectedNames.delete(snip.name);
                getStored(function (list) { state.snippets = list; renderAll(); });
              })
              .catch(function () {});
          };
        }(s));
        actionsCell.appendChild(editBtn);
        actionsCell.appendChild(delBtn);
        tr.appendChild(actionsCell);
        tbody.appendChild(tr);
      }
      var spacerBottom = document.createElement("tr");
      spacerBottom.className = "fm-sm-spacer";
      var bottomHeight = (list.length - 1 - endIndex) * ROW_HEIGHT;
      if (bottomHeight < 0) bottomHeight = 0;
      spacerBottom.innerHTML = "<td colspan=\"4\" style=\"height:" + bottomHeight + "px; padding: 0; border: none; line-height: 0;\"></td>";
      tbody.appendChild(spacerBottom);
      updateSelectAllButton();
      if (list.length > 0) {
        requestAnimationFrame(function () {
          tableWrap.scrollTop = state.scrollTop;
        });
      }
    }

    function onTableScroll() {
      state.scrollTop = tableWrap.scrollTop;
      renderVirtualized();
    }

    function renderAll() {
      renderVirtualized();
      updateSelectAllButton();
    }

    selectAllBtn.addEventListener("click", function () {
      var list = getFilteredList();
      if (list.length === 0) return;
      if (allVisibleSelected()) {
        list.forEach(function (s) { state.selectedNames.delete(s.name); });
      } else {
        list.forEach(function (s) { state.selectedNames.add(s.name); });
      }
      renderAll();
    });

    searchInput.addEventListener("input", function () {
      state.searchQuery = searchInput.value || "";
      state.scrollTop = 0;
      tableWrap.scrollTop = 0;
      renderAll();
    });

    removeSelectedBtn.addEventListener("click", function () {
      var names = Array.from(state.selectedNames);
      if (names.length === 0) return;
      if (!confirm("Remove " + names.length + " selected snippet(s)?")) return;
      getStorage().then(function (storage) { return storage.removeMany(names); })
        .then(function () {
          state.selectedNames.clear();
          if (state.editingName && names.indexOf(state.editingName) !== -1) clearForm();
          getStored(function (list) { state.snippets = list; renderAll(); });
        })
        .catch(function () {});
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearValidation();
      var name = String(nameEl.value || "").trim();
      var description = String(descEl.value || "").trim();
      var codeRaw = codeElRef.value;
      var code = normalizeCode(codeRaw).trim();
      if (!name) {
        showValidation("Name is required.");
        return;
      }
      if (!code) {
        showValidation("Code is required.");
        return;
      }
      var isEdit = state.editingName !== null;
      var nameExists = state.snippets.some(function (x) { return x.name === name; });
      if (!isEdit && nameExists) {
        showValidation("A snippet with this name already exists. Choose a different name.");
        return;
      }
      if (isEdit && state.editingName !== name && nameExists) {
        showValidation("A snippet with this name already exists. Choose a different name.");
        return;
      }
      var item = { name: name, description: description, code: code };
      getStorage().then(function (storage) {
        if (isEdit && state.editingName !== name) {
          return storage.remove(state.editingName).then(function () { return storage.put(item); });
        }
        return storage.put(item);
      }).then(function () {
        getStored(function (list) {
          state.snippets = list;
          clearForm();
          renderAll();
        });
      }).catch(function () {
        showValidation("Failed to save. Try again.");
      });
    });
    cancelBtn.addEventListener("click", clearForm);
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
    });

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
          description: (typeof raw.description === "string" ? raw.description : (raw.description != null ? String(raw.description) : "")).trim(),
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
            state.snippets = merged;
            clearForm();
            renderAll();
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
              description: (typeof raw.description === "string" ? raw.description : (raw.description != null ? String(raw.description) : "")).trim(),
              code: normalizeCode(code).trim()
            };
          }).filter(function (x) { return x.name && x.code; });
          getStored(function (current) {
            var byName = new Map();
            current.forEach(function (x) { byName.set(x.name, x); });
            list.forEach(function (item) { byName.set(item.name, item); });
            var merged = Array.from(byName.values());
            setStored(merged, function () {
              state.snippets = merged;
              clearForm();
              renderAll();
            });
          });
        })
        .catch(function () { alert("Could not load default snippets."); });
    }

    tableWrap.addEventListener("scroll", onTableScroll);

    function closeModal() {
      root.style.display = "none";
    }
    closeBtn.addEventListener("click", closeModal);
    root.addEventListener("click", function (ev) {
      if (ev.target === root) closeModal();
    });
    panel.addEventListener("click", function (ev) { ev.stopPropagation(); });

    getStored(function (list) {
      state.snippets = list;
      renderAll();
      requestAnimationFrame(function () { state.scrollTop = tableWrap.scrollTop; renderVirtualized(); });
    });
    return root;
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg && msg.type === "fm-open-snippet-modal") {
      createModal();
      sendResponse({ ok: true });
    }
    return false;
  });
})();
