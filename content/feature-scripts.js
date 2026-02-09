window.FM = window.FM || {};

function moveTableColumnToFront(tableEl, colIndex) {
    const thead = tableEl.querySelector("thead");
    const tbody = tableEl.querySelector("tbody");
    if (!thead || !tbody) return false;
  
    const headerRow = thead.rows?.[0];
    if (!headerRow || headerRow.cells.length <= colIndex) return false;
  
    // Move header cell
    const headerCell = headerRow.cells[colIndex];
    headerRow.insertBefore(headerCell, headerRow.cells[0]);
  
    // Move body cells
    const bodyRows = tbody.rows || [];
    for (const row of bodyRows) {
      if (!row.cells || row.cells.length <= colIndex) continue;
      const cell = row.cells[colIndex];
      row.insertBefore(cell, row.cells[0]);
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
  