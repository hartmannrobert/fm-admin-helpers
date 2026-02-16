window.FM = window.FM || {};

function moveColumn(tableContainerEl, fromIndex, toIndex) {
  const theadRow = tableContainerEl.querySelector("thead tr");
  const tbody = tableContainerEl.querySelector("tbody");
  if (!theadRow || !tbody) return false;

  const headCells = theadRow.cells;
  if (!headCells || headCells.length <= fromIndex) return false;

  const hCell = headCells[fromIndex];
  hCell.remove();

  const headAfterRemoval = theadRow.cells.length;
  if (toIndex >= headAfterRemoval) theadRow.appendChild(hCell);
  else theadRow.insertBefore(hCell, theadRow.cells[toIndex]);

  for (const row of Array.from(tbody.rows || [])) {
    if (!row.cells || row.cells.length <= fromIndex) continue;

    const cell = row.cells[fromIndex];
    cell.remove();

    const len = row.cells.length;
    if (toIndex >= len) row.appendChild(cell);
    else row.insertBefore(cell, row.cells[toIndex]);
  }

  return true;
}


FM.runScriptsTabMover =function() {
    if (!isOnScriptsTab()) return;
  
    const tables = document.getElementsByClassName("tableContainer");
    if (!tables || tables.length === 0) return;
  
    for (const table of tables) {
      // Guard: only do this once per table instance
      if (table.dataset.fmMovedCols === "1") continue;
  
      const ok = moveTableColumnToFront(table, 2); // your "third column"
      if (ok) {
        table.dataset.fmMovedCols = "1";
      }
    }
  }

  function isOnScriptsTab() {
    const href = String(location.href || "");
    const hash = String(location.hash || "");
    return href.includes("tab=scripts") || hash.includes("tab=scripts");
  }
  
  function normalize(s) {
    return (s || "").toLowerCase().trim();
  }
  
  function getScriptsTableRows() {
    // Use your existing knowledge: scripts table(s) live in .tableContainer
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


  function ensureEditInNewTabButtons(tableContainerEl) {
    const rows = tableContainerEl.querySelectorAll("tbody tr");
    for (const row of rows) {
      const editLink = row.querySelector('a[href*="script.form?ID="]');
      if (!editLink) continue;

      const actionCell = editLink.closest("td");
      if (!actionCell) continue;

      if (actionCell.querySelector("a.fm-open-script-newtab")) continue;

      const scriptId = getScriptIdFromHref(editLink.getAttribute("href"));
      if (!scriptId) continue;

      actionCell.classList.add("fm-action-cell");

      const a = document.createElement("a");
      a.className = "fm-open-script-newtab";
      a.href = `/script.form?ID=${scriptId}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = "Edit (open in new tab)";

      const mi = document.createElement("span");
      mi.className = "material-icons";
      mi.textContent = "open_in_new";

      const fb = document.createElement("span");
      fb.className = "fm-fallback";
      fb.textContent = "↗";
      fb.style.display = "none";

      a.appendChild(mi);
      a.appendChild(fb);

      setTimeout(() => {
        const w = mi.getBoundingClientRect().width;
        if (!w || w < 10) {
          mi.style.display = "none";
          fb.style.display = "";
        }
      }, 0);

      actionCell.insertBefore(a, actionCell.firstChild);
    }
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
    if (!rows.length) return false;

    let changed = false;

    for (const row of rows) {
      const info = identifyScriptsCells(row);
      if (!info) continue;

      const { name, action, desc, whereUsed } = info;
      if (!name || !action) continue; // minimum to act safely

      // Desired order
      const desired = [name, action, desc, whereUsed].filter(Boolean);

      // If already in desired order, skip
      const current = Array.from(row.querySelectorAll(":scope > td"));
      const same =
        current.length === desired.length &&
        current.every((c, i) => c === desired[i]);

      if (same) continue;

      // Re-append in desired order
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

    // Only rebuild if it looks like the scripts header (has Action / Unique Name / Description)
    const headerText = ths.map(th => (th.textContent || "").trim().toLowerCase()).join("|");
    const looksLikeScripts =
      headerText.includes("unique name") || headerText.includes("description") || headerText.includes("action");
    if (!looksLikeScripts) return;

    // Create a clean 4-column header matching our body order
    theadRow.innerHTML = "";

    const mk = (txt, style) => {
      const th = document.createElement("th");
      th.textContent = txt;
      if (style) th.setAttribute("style", style);
      return th;
    };

    // Match your sample: name has min-width, description grows, action narrow, where used narrow
    theadRow.appendChild(mk("Unique Name", "min-width:8em"));
    theadRow.appendChild(mk("Action", ""));
    theadRow.appendChild(mk("Description", "width:100%"));
    theadRow.appendChild(mk("", "")); // Where Used has blank header in your DOM
  }

  FM.runScriptsTabEnhancements = function () {
    if (!isOnScriptsTab()) return;

    const containers = document.querySelectorAll(".tableContainer");
    if (!containers.length) return;

    
    for (const c of containers) {
      c.classList.add("fm-scripts-table");
      // IMPORTANT: do NOT permanently guard the whole function,
      // because tbody can re-render while the container stays the same.
      // We instead guard only the header rebuild.
      if (c.dataset.fmScriptsHeaderRebuilt !== "1") {
        rebuildScriptsHeader(c);
        c.dataset.fmScriptsHeaderRebuilt = "1";
      }

      // Always reorder body (idempotent) and ensure buttons (idempotent)
      reorderScriptsBody(c);
      ensureEditInNewTabButtons(c);
    }
  };
  function applyScriptsFilter(query) {
    const q = normalize(query);
    const rows = getScriptsTableRows();
    if (rows.length === 0) return;
  
    for (const row of rows) {
      // If table has “no data” placeholder rows, keep them visible
      const text = normalize(row.innerText);
      const match = q === "" || text.includes(q);
      row.style.display = match ? "" : "none";
    }
  }


  function ensureScriptsSearchField() {
    if (!isOnScriptsTab()) return;
  
    const createBtn = document.getElementById("createbutton");
    if (!createBtn) return;
  
    // Insert only once
    if (document.getElementById("fm-search-script")) return;
  
    const input = document.createElement("input");
    input.id = "fm-search-script";
    input.type = "text";
    input.placeholder = "Filter Scripts";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.classList.add("fm-search-input");
  
    // Simple debounce so filtering doesn’t feel “jittery”
    let t = null;
    input.addEventListener("input", () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => applyScriptsFilter(input.value), 150);
    });
  
    // Place next to the create button
    createBtn.insertAdjacentElement("afterend", input);
  
    // Apply once in case user navigated back and the field is prefilled later
    applyScriptsFilter(input.value);
    }


  function keepScriptsSearchFilterInSync() {
    // If scripts table rerenders, re-apply current filter
    const input = document.getElementById("fm-search-script");
    if (!input) return;
    applyScriptsFilter(input.value);
  }
  
  // Call these from your existing main tick / observer
FM.runScriptsSearchFeature = function() {
    ensureScriptsSearchField();
    keepScriptsSearchFilterInSync();
  }


  //######## Picklists
  
  window.FM = window.FM || {};

  // ---------- Shared gates (define ONCE) ----------
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
  
  function normalize(s) {
    return (s || "").toLowerCase().trim();
  }
  
  // ---------- Picklists: FILTER ----------
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
  
    const q = normalize(query);
    const rows = Array.from(tableEl.querySelectorAll("tr"));
    if (!rows.length) return;
  
    for (const row of rows) {
      if (isHeaderLikeRow(row)) {
        row.style.display = "";
        continue;
      }
      const text = normalize(row.innerText);
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
  
    cancelBtn.insertAdjacentElement("afterend", input);
    applyPicklistsFilter(input.value);
  }
  
  FM.runPicklistsSearchFeature = function () {
    if (!isOnPicklistsPage()) {
      document.getElementById("fm-search-picklists")?.remove();
      return;
    }
  
    ensurePicklistsSearchField();
    const input = document.getElementById("fm-search-picklists");
    applyPicklistsFilter(input?.value || "");
  };
  
  // ---------- Picklists: MOVE COLUMNS ----------
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
    const t = normalize(a?.textContent || cellEl?.textContent);
  
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
      .tableContainer table tr > th:nth-child(5),
      .tableContainer table tr > td:nth-child(5) {
        border-left: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }
  
  FM.runPicklistsReorderActionColumns = function () {
    if (!isOnPicklistsPage()) return;
  
    const tableEl = getPicklistTableEl();
    if (!tableEl) return;
  
    // Ownership marker to avoid collisions
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
  };
  
  // Optional convenience tick so mainTick calls only one function
  FM.runPicklistsTick = function () {
    FM.runPicklistsSearchFeature();
    FM.runPicklistsReorderActionColumns();
  };
  