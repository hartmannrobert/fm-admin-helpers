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

    // Toggle button insertion (idempotent)
    function ensureToggleOnce() {
      const menu = document.querySelector(".itemsectionmenu");
      if (!menu) return;
      if (menu.querySelector(`.${BTN_CLASS}`)) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = BTN_CLASS;

      const icon = document.createElement("span");
      icon.className = "material-icons";
      icon.textContent = "calendar_view_week";
      btn.appendChild(icon);

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

        nameCell.style.cursor = "pointer";
        nameCell.addEventListener("click", (ev) => {
          if (ev.defaultPrevented) return;
          if (ev.button !== 0) return;
          if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
          const interactive = ev.target?.closest?.("a, button, input, textarea, select, label");
          if (interactive) return;
          ev.preventDefault();
          ev.stopPropagation();
          window.open(`/script.form?ID=${scriptId}`, "_blank", "noopener,noreferrer");
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

    // Table mover that moves the 3rd column to front (for scripts tab tables)
    function moveTableColumnToFront(tableEl, fromIndex) {
      // Reuse the earlier algorithm; avoid global name collision
      const theadRow = tableEl.querySelector("thead tr");
      const tbody = tableEl.querySelector("tbody");
      if (!theadRow || !tbody) return false;
      const headCells = theadRow.cells;
      if (!headCells || headCells.length <= fromIndex) return false;

      const hCell = headCells[fromIndex];
      hCell.remove();
      const headAfterRemoval = theadRow.cells.length;
      if (0 >= headAfterRemoval) theadRow.appendChild(hCell);
      else theadRow.insertBefore(hCell, theadRow.cells[0]);

      for (const row of Array.from(tbody.rows || [])) {
        if (!row.cells || row.cells.length <= fromIndex) continue;
        const cell = row.cells[fromIndex];
        cell.remove();
        const len = row.cells.length;
        if (0 >= len) row.appendChild(cell);
        else row.insertBefore(cell, row.cells[0]);
      }
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
        // convenience single-call that groups script features
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

    function ensurePicklistsGridDividerAfterDelete() {
      if (document.getElementById("fm-picklists-divider-style")) return;
      const style = document.createElement("style");
      style.id = "fm-picklists-divider-style";
      style.textContent = `
        .tableContainer table tr > th:nth-child(4),
        .tableContainer table tr > td:nth-child(4) {
          border-right: 1px solid #bdbdbd !important;
        }
      `;
      document.head.appendChild(style);
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
      ensurePicklistsGridDividerAfterDelete();
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