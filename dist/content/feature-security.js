window.FM = window.FM || {};

function getAdminUsersTab() {
  const href = String(location.href || '');
  const m = href.match(/admin#section=adminusers&tab=(users|roles|groups)\b/);
  return m ? m[1] : null;
}

function promoteFirstBodyRowToHeader() {
  const container = document.getElementById('itembody-2');
  if (!container) return;
  const table = container.querySelector('table');
  if (!table || table.dataset.fmHeaderFixed === '1') return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const firstRow = tbody.querySelector('tr');
  if (!firstRow) return;
  if (table.querySelector('thead')) {
    table.dataset.fmHeaderFixed = '1';
    return;
  }
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const cell of Array.from(firstRow.children)) {
    const th = document.createElement('th');
    th.innerHTML = cell.innerHTML;
    th.className = cell.className || '';
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.insertBefore(thead, table.firstChild);
  firstRow.remove();
  table.dataset.fmHeaderFixed = '1';
}

// ---- Per-column filter (Users tab) ----

FM._secFilter = (() => {
  const COL_DEFS = [
    { key: 'status',       label: 'Status',       aliases: ['status'],                         mode: 'select' },
    { key: 'authStatus',   label: 'Auth Status',   aliases: ['auth status'],                    mode: 'select' },
    { key: 'userName',     label: 'User Name',     aliases: ['user name', 'username'],          mode: 'text'   },
    { key: 'firstName',    label: 'First Name',    aliases: ['first name', 'firstname'],        mode: 'text'   },
    { key: 'lastName',     label: 'Last Name',     aliases: ['last name', 'lastname'],          mode: 'text'   },
    { key: 'email',        label: 'Email',         aliases: ['email'],                          mode: 'text'   },
    { key: 'organization', label: 'Organization',  aliases: ['organization', 'organisation'],   mode: 'text'   },
    { key: 'twoFactor',    label: '2FA',           aliases: ['2fa', 'two-factor'],              mode: 'select' },
  ];

  const COL_INPUT_PREFIX = 'fm-sec-col-';
  const COUNT_ID         = 'fm-sec-filter-count';
  const CLEAR_BTN_ID     = 'fm-sec-filter-clear';
  const EXPORT_BTN_ID    = 'fm-sec-export-csv';
  const ROW_HIDDEN_CLASS = 'fm-sec-row-hidden';
  const STYLE_ID         = 'fm-sec-filter-style';
  const FILTER_ROW_ATTR  = 'data-fm-sec-filter-row';
  const MENU_CTRL_CLASS  = 'fm-sec-menu-ctrl';

  let _indexedRows    = [];
  let _appliedFilters = _emptyFilters();
  let _activeTable    = null;
  let _activeRunId    = 0;
  let _suppressObs    = false;
  let _tableObserver  = null;
  let _debounceTimer  = null;
  let _lastTab        = null;

  function _emptyFilters() {
    const f = {};
    COL_DEFS.forEach(d => { f[d.key] = ''; });
    return f;
  }

  function _emptyColMap() {
    const m = {};
    COL_DEFS.forEach(d => { m[d.key] = -1; });
    return m;
  }

  function _norm(val) {
    return String(val || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function _titleCase(val) {
    const s = String(val || '');
    if (s === 'n/a') return s;
    if (s === 'sso') return 'SSO';
    return s.split(' ').map(t => t ? t[0].toUpperCase() + t.slice(1) : t).join(' ');
  }

  function _colInputId(key) { return COL_INPUT_PREFIX + key; }

  // Try reference selector first, fall back to the extension's #itembody-2 container
  function _getTable() {
    const t = document.querySelector('.itembody-users table');
    if (t) return t;
    const c = document.getElementById('itembody-2');
    return c ? c.querySelector('table') : null;
  }

  function _getRoot(table) {
    return table.closest('.itemdisplay') || table.closest('#itembody-2') || null;
  }

  function _getMenu(root) {
    return document.getElementById('itemmenu-2') || root.querySelector('.itemmenu') || null;
  }

  // ---- Column index resolution ----

  function _headerCells(table) {
    if (table.tHead && table.tHead.rows.length) return Array.from(table.tHead.rows[0].cells);
    const tbody = table.tBodies[0];
    if (!tbody) return [];
    for (const row of Array.from(tbody.rows)) {
      if (row.querySelector('th')) return Array.from(row.cells);
    }
    return [];
  }

  function _resolveColMap(table) {
    const map = _emptyColMap();
    const headers = _headerCells(table).map(c => _norm(c.textContent || c.getAttribute('title') || ''));
    for (const def of COL_DEFS) {
      for (let i = 0; i < headers.length; i++) {
        if (!headers[i]) continue;
        for (const alias of def.aliases) {
          if (headers[i] === _norm(alias) || headers[i].includes(_norm(alias))) {
            map[def.key] = i;
            break;
          }
        }
        if (map[def.key] !== -1) break;
      }
    }
    return map;
  }

  // ---- Cell value extraction ----

  function _norm2fa(cell) {
    const text = _norm(cell.textContent || '');
    if (text) return text;
    for (const img of Array.from(cell.querySelectorAll('img'))) {
      const token = _norm(img.getAttribute('src') || '') || _norm(img.getAttribute('title') || img.getAttribute('alt') || '');
      if (token.includes('sso') || token.includes('managed outside')) return 'sso';
      if (token.includes('/enabled'))  return 'on';
      if (token.includes('/not_enabled')) return 'off';
      if (token.includes('external')) return 'ext';
    }
    return 'n/a';
  }

  function _cellValue(cell, key) {
    if (!cell) return '';
    if (key === 'twoFactor') return _norm2fa(cell);
    const text = _norm(cell.textContent || '');
    if (text) return text;
    const img = cell.querySelector('img');
    return img ? _norm(img.getAttribute('title') || img.getAttribute('alt') || '') : '';
  }

  // ---- Row indexing ----

  function _buildIndex(table) {
    const colMap = _resolveColMap(table);
    const tbody = table.tBodies[0];
    if (!tbody) return { rows: [], colMap };
    const rows = [];
    for (const row of Array.from(tbody.rows)) {
      if (row.querySelector('th')) continue;
      const cells = Array.from(row.cells);
      const columns = _emptyFilters();
      for (const def of COL_DEFS) {
        const ci = colMap[def.key];
        if (ci >= 0 && ci < cells.length) columns[def.key] = _cellValue(cells[ci], def.key);
      }
      rows.push({ row, columns, visible: !row.classList.contains(ROW_HIDDEN_CLASS) });
    }
    return { rows, colMap };
  }

  // ---- Filter engine (two-stage: compute matches, then RAF-batch DOM writes) ----

  function _runFilter() {
    const runId = ++_activeRunId;
    const applied = _appliedFilters;
    const hasFilter = COL_DEFS.some(d => Boolean(applied[d.key]));

    const nextVis = _indexedRows.map(meta => {
      if (!hasFilter) return true;
      for (const def of COL_DEFS) {
        const fv = applied[def.key];
        if (!fv) continue;
        const cellVal = meta.columns[def.key] || '';
        const matches = def.mode === 'select' ? cellVal === fv : cellVal.includes(fv);
        if (!matches) return false;
      }
      return true;
    });

    window.requestAnimationFrame(() => {
      if (runId !== _activeRunId) return;
      let visible = 0;
      _suppressObs = true;
      _indexedRows.forEach((meta, i) => {
        const v = nextVis[i];
        if (v) visible++;
        if (meta.visible !== v) {
          meta.visible = v;
          meta.row.classList.toggle(ROW_HIDDEN_CLASS, !v);
        }
      });
      _suppressObs = false;
      _setCount(visible, _indexedRows.length, hasFilter);
    });
  }

  function _rebuildAndReapply() {
    if (!_activeTable) return;
    const { rows } = _buildIndex(_activeTable);
    _indexedRows = rows;
    _refreshSelectOptions();
    _runFilter();
  }

  function _scheduleReindex() {
    if (_debounceTimer !== null) window.clearTimeout(_debounceTimer);
    _debounceTimer = window.setTimeout(() => {
      _debounceTimer = null;
      _rebuildAndReapply();
    }, 120);
  }

  // ---- Table observer (reindex on tbody mutations) ----

  function _ensureObserver(table) {
    if (_tableObserver) return;
    const tbody = table.tBodies[0];
    if (!tbody) return;
    _tableObserver = new MutationObserver(() => {
      if (_suppressObs) return;
      _scheduleReindex();
    });
    _tableObserver.observe(tbody, { childList: true, subtree: true, characterData: true });
  }

  function _stopObserver() {
    if (!_tableObserver) return;
    _tableObserver.disconnect();
    _tableObserver = null;
  }

  // ---- Styles (injected once into <head>) ----

  function _ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      `.${ROW_HIDDEN_CLASS}{display:none!important}`,
      `th.fm-sec-filter-cell{padding:3px 4px;vertical-align:middle;font-weight:normal}`,
      `th.fm-sec-filter-cell input,th.fm-sec-filter-cell select{width:100%;min-width:55px;height:26px;padding:0 6px;border:1px solid #cfd8e3;border-radius:6px;background:#fff;color:#111827;font:500 11px/1 "ArtifaktElement","Segoe UI",Arial,sans-serif;outline:none;box-sizing:border-box;transition:border-color 120ms ease,box-shadow 120ms ease}`,
      `th.fm-sec-filter-cell input:focus,th.fm-sec-filter-cell select:focus{border-color:#7cb9dd;box-shadow:0 0 0 2px rgba(31,156,220,.12)}`,
      `.${MENU_CTRL_CLASS}{display:inline-flex;align-items:center;gap:6px;margin-left:10px;vertical-align:middle}`,
      `#${COUNT_ID}{display:inline-flex;align-items:center;justify-content:center;min-width:80px;height:22px;padding:0 8px;border:1px solid #c7d2e0;border-radius:999px;background:#f8fbff;font:700 11px/1 "ArtifaktElement","Segoe UI",Arial,sans-serif;color:#274c77;white-space:nowrap}`,
      `#${CLEAR_BTN_ID}{display:inline-flex;align-items:center;height:22px;padding:0 10px;border-radius:6px;font:600 11px/1 "ArtifaktElement","Segoe UI",Arial,sans-serif;cursor:pointer;border:1px solid #c7d2e0;background:#fff;color:#44566c;transition:background 120ms ease,border-color 120ms ease}`,
      `#${CLEAR_BTN_ID}:disabled{opacity:.55;cursor:default}`,
      `#${EXPORT_BTN_ID}{display:inline-flex;align-items:center;height:22px;padding:0 10px;border-radius:6px;font:600 11px/1 "ArtifaktElement","Segoe UI",Arial,sans-serif;cursor:pointer;border:1px solid #c7d2e0;background:#fff;color:#44566c;transition:background 120ms ease,border-color 120ms ease}`,
      `#${EXPORT_BTN_ID}:hover{background:#f0f4f8;border-color:#a8b8c8}`,
      `#${EXPORT_BTN_ID}:disabled{opacity:.55;cursor:default}`,
    ].join('');
    document.head.appendChild(style);
  }

  // ---- UI helpers ----

  function _setCount(visible, total, hasFilter) {
    const el = document.getElementById(COUNT_ID);
    if (!el) return;
    el.textContent = hasFilter ? `${visible} of ${total}` : `All (${total})`;
  }

  function _syncButtons() {
    const clearBtn = document.getElementById(CLEAR_BTN_ID);
    if (clearBtn) clearBtn.disabled = !_hasAppliedFilters();
  }

  function _isDraftDirty() {
    const draft = _readDraft();
    return COL_DEFS.some(d => draft[d.key] !== _appliedFilters[d.key]);
  }

  function _hasAppliedFilters() {
    return COL_DEFS.some(d => Boolean(_appliedFilters[d.key]));
  }

  function _readDraft() {
    const f = _emptyFilters();
    for (const def of COL_DEFS) {
      const input = document.getElementById(_colInputId(def.key));
      if (input) f[def.key] = _norm(input.value || '');
    }
    return f;
  }

  function _clearInputs() {
    for (const def of COL_DEFS) {
      const input = document.getElementById(_colInputId(def.key));
      if (input) input.value = '';
    }
  }

  function _refreshSelectOptions() {
    for (const def of COL_DEFS) {
      if (def.mode !== 'select') continue;
      const select = document.getElementById(_colInputId(def.key));
      if (!select) continue;
      const prev = _norm(select.value || '');
      const unique = Object.create(null);
      _indexedRows.forEach(meta => { const v = meta.columns[def.key]; if (v) unique[v] = true; });
      select.textContent = '';
      const all = document.createElement('option');
      all.value = '';
      all.textContent = 'All';
      select.appendChild(all);
      Object.keys(unique).sort().forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = _titleCase(v);
        select.appendChild(opt);
      });
      select.value = (prev && unique[prev]) ? prev : '';
    }
    _syncButtons();
  }

  function _onDraftChange() { _applyFilters(); }

  function _applyFilters() {
    _appliedFilters = _readDraft();
    _runFilter();
    _syncButtons();
  }

  function _clearFilters() {
    _clearInputs();
    _appliedFilters = _emptyFilters();
    _runFilter();
    _syncButtons();
  }

  function _exportCsv() {
    if (!_activeTable) return;
    const visibleRows = _indexedRows.filter(m => m.visible);
    if (!visibleRows.length) return;

    function _esc(v) {
      const s = String(v ?? '').replace(/\s+/g, ' ').trim();
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    const headers = _headerCells(_activeTable).map(c => _esc(c.textContent || c.getAttribute('title') || ''));
    const lines = [headers.join(',')];
    for (const meta of visibleRows) {
      lines.push(Array.from(meta.row.cells).map(c => _esc(c.textContent)).join(','));
    }

    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fm-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- Panel injection (idempotent) ----

  function _ensurePanel() {
    _ensureStyles();
    const table = _getTable();
    if (!table) return false;
    if (!table.tHead || !table.tHead.rows.length) return false;
    const root = _getRoot(table);
    const menu = root ? _getMenu(root) : null;

    if (!table.tHead.querySelector(`tr[${FILTER_ROW_ATTR}]`)) {
      const colMap = _resolveColMap(table);
      const colCount = table.tHead.rows[0].cells.length;
      const colIndexToDef = {};
      for (const def of COL_DEFS) {
        if (colMap[def.key] >= 0) colIndexToDef[colMap[def.key]] = def;
      }
      const filterRow = document.createElement('tr');
      filterRow.setAttribute(FILTER_ROW_ATTR, '1');
      for (let i = 0; i < colCount; i++) {
        const th = document.createElement('th');
        th.className = 'fm-sec-filter-cell';
        const def = colIndexToDef[i];
        if (def) {
          let control;
          if (def.mode === 'select') {
            control = document.createElement('select');
            const all = document.createElement('option');
            all.value = '';
            all.textContent = 'All';
            control.appendChild(all);
          } else {
            control = document.createElement('input');
            control.type = 'search';
            control.placeholder = '…';
            control.autocomplete = 'off';
            control.spellcheck = false;
            control.addEventListener('keydown', e => {
              if (e.key === 'Escape' && control.value) { control.value = ''; _onDraftChange(); }
            });
          }
          control.id = _colInputId(def.key);
          control.addEventListener('input', _onDraftChange);
          control.addEventListener('change', _onDraftChange);
          th.appendChild(control);
        }
        filterRow.appendChild(th);
      }
      table.tHead.appendChild(filterRow);
    }

    if (menu && !document.getElementById(COUNT_ID)) {
      const ctrl = document.createElement('span');
      ctrl.className = MENU_CTRL_CLASS;
      const count = document.createElement('span');
      count.id = COUNT_ID;
      count.textContent = '…';
      const clearBtn = document.createElement('button');
      clearBtn.id = CLEAR_BTN_ID;
      clearBtn.type = 'button';
      clearBtn.textContent = 'Clear Filters';
      clearBtn.addEventListener('click', _clearFilters);
      const exportBtn = document.createElement('button');
      exportBtn.id = EXPORT_BTN_ID;
      exportBtn.type = 'button';
      exportBtn.textContent = 'Export List';
      exportBtn.addEventListener('click', _exportCsv);
      ctrl.appendChild(count);
      ctrl.appendChild(clearBtn);
      ctrl.appendChild(exportBtn);
      menu.appendChild(ctrl);
    }

    _syncButtons();
    return true;
  }

  // ---- Attach / detach lifecycle ----

  function _detach() {
    _stopObserver();
    if (_debounceTimer !== null) { window.clearTimeout(_debounceTimer); _debounceTimer = null; }
    _indexedRows    = [];
    _appliedFilters = _emptyFilters();
    _activeTable    = null;
    const filterRow = document.querySelector(`tr[${FILTER_ROW_ATTR}]`);
    if (filterRow) filterRow.remove();
    const menuCtrl = document.querySelector(`.${MENU_CTRL_CLASS}`);
    if (menuCtrl) menuCtrl.remove();
  }

  function _attach(table) {
    if (_activeTable === table) {
      _ensurePanel();
      _ensureObserver(table);
      return;
    }
    _detach();
    _activeTable = table;
    _ensurePanel();
    _ensureObserver(table);
    _rebuildAndReapply();
  }

  // ---- Public tick (called from mainTick / bootstrap) ----

  function tick() {
    const tab = getAdminUsersTab();
    if (tab !== _lastTab) {
      _lastTab = tab;
      _detach();
    }
    if (tab !== 'users') return;
    const table = _getTable();
    if (!table) { _detach(); return; }
    _attach(table);
  }

  return { tick };
})();

FM.runAdminUsersSearchTick = function () {
  promoteFirstBodyRowToHeader();
  FM._secFilter.tick();
};

// Table location
function getSecurityTabTable() {
  const container = document.getElementById("itembody-2");
  if (!container) return null;
  return container.querySelector("table");
}

function getCells(rowEl) {
  return Array.from(rowEl.querySelectorAll(":scope > th, :scope > td"));
}

// Move cells from original indexes to after insertAfterIndex
function moveCellsAfterIndex(rowEl, fromIndexesInOriginalOrder, insertAfterIndex) {
  const cells = getCells(rowEl);
  if (!cells.length) return false;

  const toMove = fromIndexesInOriginalOrder.map(i => cells[i]).filter(Boolean);
  if (!toMove.length) return false;

  let anchor = cells[insertAfterIndex] || rowEl.firstElementChild;
  for (const cell of toMove) {
    cell.remove();
    anchor.insertAdjacentElement("afterend", cell);
    anchor = cell;
  }
  return true;
}

// Colgroup enforcement
function ensureColgroupWithCount(tableEl, count) {
  let colgroup = tableEl.querySelector("colgroup");
  if (!colgroup) {
    colgroup = document.createElement("colgroup");
    tableEl.insertBefore(colgroup, tableEl.firstChild);
  }

  let cols = Array.from(colgroup.querySelectorAll("col"));
  if (cols.length !== count) {
    colgroup.innerHTML = "";
    for (let i = 0; i < count; i++) colgroup.appendChild(document.createElement("col"));
    cols = Array.from(colgroup.querySelectorAll("col"));
  }
  return cols;
}

function setColWidths(cols, widthsPct) {
  for (let i = 0; i < cols.length && i < widthsPct.length; i++) {
    const w = String(widthsPct[i]) + "%";
    cols[i].setAttribute("width", w);
    cols[i].style.width = w;
  }
}

function applySecurityColgroupWidths(tableEl, tab) {
  if (tab === "roles") {
    // After move: Name | Modify | Manage | Description | Workspace
    const cols = ensureColgroupWithCount(tableEl, 5);
    setColWidths(cols, [10, 5, 5, 70, 10]);
  } else if (tab === "groups") {
    // After move: Name | Modify | Manage | Description
    const cols = ensureColgroupWithCount(tableEl, 4);
    setColWidths(cols, [10, 10, 10, 70]);
  }
}

// Main operation
function moveModifyManageAfterName(tableEl, tab) {
  // Prevent collisions with other scripts
  if (tableEl.dataset.fmOwner && tableEl.dataset.fmOwner !== "securityMoveCols") return;
  tableEl.dataset.fmOwner = "securityMoveCols";

  // Run once per table instance per tab
  const stamp = "1:" + tab;
  if (tableEl.dataset.fmSecurityMoved === stamp) return;

  // Indices based on your provided headers (original order before we move)
  // Roles: Name, Description, Workspace, Modify, Manage
  // Groups: Name, Description, Modify, Manage
  const fromIndexes = tab === "roles" ? [3, 4] : [2, 3];

  // Header row
  const headerRow = tableEl.querySelector("thead tr");
  if (headerRow) moveCellsAfterIndex(headerRow, fromIndexes, 0);

  // Body rows
  const bodyRows = Array.from(tableEl.querySelectorAll("tbody tr"));
  for (const row of bodyRows) {
    if (!row.querySelector("td")) continue;
    moveCellsAfterIndex(row, fromIndexes, 0);
  }

  tableEl.dataset.fmSecurityMoved = stamp;
}

// Public tick
FM.runSecurityRolesGroupsLayoutTick = function () {
  const tab = getAdminUsersTab();
  if (tab !== "roles" && tab !== "groups") return;

  const tableEl = getSecurityTabTable();
  if (!tableEl) return;

  // 1) Move columns
  moveModifyManageAfterName(tableEl, tab);

  // 2) Enforce colgroup widths (after move)
  applySecurityColgroupWidths(tableEl, tab);

  // 3) Per-column filter panel
  FM._rgFilter.tick();
};

// ---- Per-column filter (Roles / Groups tabs) ----

FM._rgFilter = (() => {
  const GROUPS_COL_DEFS = [
    { key: 'name',        label: 'Name',        aliases: ['name'],        mode: 'text' },
    { key: 'description', label: 'Description',  aliases: ['description'], mode: 'text' },
  ];
  const ROLES_COL_DEFS = [
    { key: 'name',        label: 'Name',        aliases: ['name'],        mode: 'text' },
    { key: 'description', label: 'Description',  aliases: ['description'], mode: 'text' },
    { key: 'workspace',   label: 'Workspace',    aliases: ['workspace'],   mode: 'text' },
  ];

  const COL_INPUT_PREFIX = 'fm-rg-col-';
  const COUNT_ID         = 'fm-rg-filter-count';
  const CLEAR_BTN_ID     = 'fm-rg-filter-clear';
  const ROW_HIDDEN_CLASS = 'fm-sec-row-hidden';
  const STYLE_ID         = 'fm-rg-filter-style';
  const FILTER_ROW_ATTR  = 'data-fm-rg-filter-row';
  const MENU_CTRL_CLASS  = 'fm-rg-menu-ctrl';

  let _indexedRows    = [];
  let _appliedFilters = {};
  let _activeTable    = null;
  let _activeRunId    = 0;
  let _suppressObs    = false;
  let _tableObserver  = null;
  let _debounceTimer  = null;
  let _lastTab        = null;

  function _colDefs() {
    return _lastTab === 'roles' ? ROLES_COL_DEFS : GROUPS_COL_DEFS;
  }

  function _emptyFilters() {
    const f = {};
    _colDefs().forEach(d => { f[d.key] = ''; });
    return f;
  }

  function _norm(val) {
    return String(val || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function _colInputId(key) { return COL_INPUT_PREFIX + key; }

  function _headerCells(table) {
    if (table.tHead && table.tHead.rows.length) return Array.from(table.tHead.rows[0].cells);
    const tbody = table.tBodies[0];
    if (!tbody) return [];
    for (const row of Array.from(tbody.rows)) {
      if (row.querySelector('th')) return Array.from(row.cells);
    }
    return [];
  }

  function _resolveColMap(table) {
    const defs = _colDefs();
    const map = {};
    defs.forEach(d => { map[d.key] = -1; });
    const headers = _headerCells(table).map(c => _norm(c.textContent || c.getAttribute('title') || ''));
    for (const def of defs) {
      for (let i = 0; i < headers.length; i++) {
        if (!headers[i]) continue;
        for (const alias of def.aliases) {
          if (headers[i] === _norm(alias) || headers[i].includes(_norm(alias))) {
            map[def.key] = i;
            break;
          }
        }
        if (map[def.key] !== -1) break;
      }
    }
    return map;
  }

  function _cellValue(cell) {
    if (!cell) return '';
    const text = _norm(cell.textContent || '');
    if (text) return text;
    const img = cell.querySelector('img');
    return img ? _norm(img.getAttribute('title') || img.getAttribute('alt') || '') : '';
  }

  function _buildIndex(table) {
    const defs = _colDefs();
    const colMap = _resolveColMap(table);
    const tbody = table.tBodies[0];
    if (!tbody) return [];
    const rows = [];
    for (const row of Array.from(tbody.rows)) {
      if (row.querySelector('th')) continue;
      const cells = Array.from(row.cells);
      const columns = {};
      for (const def of defs) {
        const ci = colMap[def.key];
        columns[def.key] = (ci >= 0 && ci < cells.length) ? _cellValue(cells[ci]) : '';
      }
      rows.push({ row, columns, visible: !row.classList.contains(ROW_HIDDEN_CLASS) });
    }
    return rows;
  }

  function _runFilter() {
    const runId = ++_activeRunId;
    const applied = _appliedFilters;
    const defs = _colDefs();
    const hasFilter = defs.some(d => Boolean(applied[d.key]));

    const nextVis = _indexedRows.map(meta => {
      if (!hasFilter) return true;
      for (const def of defs) {
        const fv = applied[def.key];
        if (!fv) continue;
        if (!(meta.columns[def.key] || '').includes(fv)) return false;
      }
      return true;
    });

    window.requestAnimationFrame(() => {
      if (runId !== _activeRunId) return;
      let visible = 0;
      _suppressObs = true;
      _indexedRows.forEach((meta, i) => {
        const v = nextVis[i];
        if (v) visible++;
        if (meta.visible !== v) {
          meta.visible = v;
          meta.row.classList.toggle(ROW_HIDDEN_CLASS, !v);
        }
      });
      _suppressObs = false;
      _setCount(visible, _indexedRows.length, hasFilter);
    });
  }

  function _rebuildAndReapply() {
    if (!_activeTable) return;
    _indexedRows = _buildIndex(_activeTable);
    _runFilter();
  }

  function _scheduleReindex() {
    if (_debounceTimer !== null) window.clearTimeout(_debounceTimer);
    _debounceTimer = window.setTimeout(() => {
      _debounceTimer = null;
      _rebuildAndReapply();
    }, 120);
  }

  function _ensureObserver(table) {
    if (_tableObserver) return;
    const tbody = table.tBodies[0];
    if (!tbody) return;
    _tableObserver = new MutationObserver(() => {
      if (_suppressObs) return;
      _scheduleReindex();
    });
    _tableObserver.observe(tbody, { childList: true, subtree: true, characterData: true });
  }

  function _stopObserver() {
    if (!_tableObserver) return;
    _tableObserver.disconnect();
    _tableObserver = null;
  }

  function _ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      `.${ROW_HIDDEN_CLASS}{display:none!important}`,
      `th.fm-rg-filter-cell{padding:3px 4px;vertical-align:middle;font-weight:normal}`,
      `th.fm-rg-filter-cell input{width:100%;min-width:55px;height:26px;padding:0 6px;border:1px solid #cfd8e3;border-radius:6px;background:#fff;color:#111827;font:500 11px/1 "ArtifaktElement","Segoe UI",Arial,sans-serif;outline:none;box-sizing:border-box;transition:border-color 120ms ease,box-shadow 120ms ease}`,
      `th.fm-rg-filter-cell input:focus{border-color:#7cb9dd;box-shadow:0 0 0 2px rgba(31,156,220,.12)}`,
      `.${MENU_CTRL_CLASS}{display:inline-flex;align-items:center;gap:6px;margin-left:10px;vertical-align:middle}`,
      `#${COUNT_ID}{display:inline-flex;align-items:center;justify-content:center;min-width:80px;height:22px;padding:0 8px;border:1px solid #c7d2e0;border-radius:999px;background:#f8fbff;font:700 11px/1 "ArtifaktElement","Segoe UI",Arial,sans-serif;color:#274c77;white-space:nowrap}`,
      `#${CLEAR_BTN_ID}{display:inline-flex;align-items:center;height:22px;padding:0 10px;border-radius:6px;font:600 11px/1 "ArtifaktElement","Segoe UI",Arial,sans-serif;cursor:pointer;border:1px solid #c7d2e0;background:#fff;color:#44566c;transition:background 120ms ease,border-color 120ms ease}`,
      `#${CLEAR_BTN_ID}:disabled{opacity:.55;cursor:default}`,
    ].join('');
    document.head.appendChild(style);
  }

  function _setCount(visible, total, hasFilter) {
    const el = document.getElementById(COUNT_ID);
    if (!el) return;
    el.textContent = hasFilter ? `${visible} of ${total}` : `All (${total})`;
  }

  function _syncButtons() {
    const clearBtn = document.getElementById(CLEAR_BTN_ID);
    if (clearBtn) clearBtn.disabled = !_colDefs().some(d => Boolean(_appliedFilters[d.key]));
  }

  function _readDraft() {
    const f = _emptyFilters();
    for (const def of _colDefs()) {
      const input = document.getElementById(_colInputId(def.key));
      if (input) f[def.key] = _norm(input.value || '');
    }
    return f;
  }

  function _clearInputs() {
    for (const def of _colDefs()) {
      const input = document.getElementById(_colInputId(def.key));
      if (input) input.value = '';
    }
  }

  function _onDraftChange() {
    _appliedFilters = _readDraft();
    _runFilter();
    _syncButtons();
  }

  function _clearFilters() {
    _clearInputs();
    _appliedFilters = _emptyFilters();
    _runFilter();
    _syncButtons();
  }

  function _ensurePanel() {
    _ensureStyles();
    const table = getSecurityTabTable();
    if (!table) return false;
    if (!table.tHead || !table.tHead.rows.length) return false;
    const root = table.closest('.itemdisplay') || table.closest('#itembody-2');
    const menu = document.getElementById('itemmenu-2') || (root ? root.querySelector('.itemmenu') : null);

    if (!table.tHead.querySelector(`tr[${FILTER_ROW_ATTR}]`)) {
      const colMap = _resolveColMap(table);
      const defs = _colDefs();
      const colCount = table.tHead.rows[0].cells.length;
      const colIndexToDef = {};
      for (const def of defs) {
        if (colMap[def.key] >= 0) colIndexToDef[colMap[def.key]] = def;
      }
      const filterRow = document.createElement('tr');
      filterRow.setAttribute(FILTER_ROW_ATTR, '1');
      for (let i = 0; i < colCount; i++) {
        const th = document.createElement('th');
        th.className = 'fm-rg-filter-cell';
        const def = colIndexToDef[i];
        if (def) {
          const control = document.createElement('input');
          control.type = 'search';
          control.placeholder = '…';
          control.autocomplete = 'off';
          control.spellcheck = false;
          control.id = _colInputId(def.key);
          control.addEventListener('input', _onDraftChange);
          control.addEventListener('change', _onDraftChange);
          control.addEventListener('keydown', e => {
            if (e.key === 'Escape' && control.value) { control.value = ''; _onDraftChange(); }
          });
          th.appendChild(control);
        }
        filterRow.appendChild(th);
      }
      table.tHead.appendChild(filterRow);
    }

    if (menu && !document.getElementById(COUNT_ID)) {
      const ctrl = document.createElement('span');
      ctrl.className = MENU_CTRL_CLASS;
      const count = document.createElement('span');
      count.id = COUNT_ID;
      count.textContent = '…';
      const clearBtn = document.createElement('button');
      clearBtn.id = CLEAR_BTN_ID;
      clearBtn.type = 'button';
      clearBtn.textContent = 'Clear Filters';
      clearBtn.addEventListener('click', _clearFilters);
      ctrl.appendChild(count);
      ctrl.appendChild(clearBtn);
      menu.appendChild(ctrl);
    }

    _syncButtons();
    return true;
  }

  function _detach() {
    _stopObserver();
    if (_debounceTimer !== null) { window.clearTimeout(_debounceTimer); _debounceTimer = null; }
    _indexedRows    = [];
    _appliedFilters = {};
    _activeTable    = null;
    const filterRow = document.querySelector(`tr[${FILTER_ROW_ATTR}]`);
    if (filterRow) filterRow.remove();
    const menuCtrl = document.querySelector(`.${MENU_CTRL_CLASS}`);
    if (menuCtrl) menuCtrl.remove();
  }

  function _attach(table) {
    if (_activeTable === table) {
      _ensurePanel();
      _ensureObserver(table);
      return;
    }
    _detach();
    _activeTable = table;
    _appliedFilters = _emptyFilters();
    _ensurePanel();
    _ensureObserver(table);
    _rebuildAndReapply();
  }

  function tick() {
    const tab = getAdminUsersTab();
    if (tab !== _lastTab) {
      _lastTab = tab;
      _detach();
    }
    if (tab !== 'roles' && tab !== 'groups') return;
    const table = getSecurityTabTable();
    if (!table) { _detach(); return; }
    _attach(table);
  }

  return { tick };
})();




// ############ ############ ############ ############ ############



// Security Window Features

  // Flag used to suppress javascript: navigation on FM anchors while automation runs
  FM._bulkMoveActive = false;

  // Prevent javascript: navigation on FM anchors during automation
  FM.ensureNoJavascriptHrefNav = function () {
    ["moveRight", "moveLeft"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.fmNoJsHref === "1") return;

      el.dataset.fmNoJsHref = "1";
      el.addEventListener(
        "click",
        (e) => {
          if (!FM._bulkMoveActive) return;
          e.preventDefault();
        },
        true
      );
    });
  };

  // Try to leave the window in a "neutral" state after bulk operations
  FM.clearOptionSelection = function () {
    const targets = [
      document.getElementById("permissiondescription"),
      document.querySelector(".optionDescription"),
      document.getElementById("leftPane"),
      document.getElementById("rightPane"),
      document.body
    ].filter(Boolean);

    // Blur any focused control
    try {
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
    } catch (e) {}

    // ESC often clears selection/focus in FM widgets
    try {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true })
      );
    } catch (e) {}

    // Click a neutral area to clear the faux-select highlight
    const t = targets[0];
    try {
      t.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } catch (e) {}
  };

  function runBulkMove({ sourcePaneId, optionSelector, moveButtonId, onDone }) {
    const sourcePane = document.getElementById(sourcePaneId);
    const moveBtn = document.getElementById(moveButtonId);
    if (!sourcePane || !moveBtn) return onDone?.();

    // Pick the next movable option
    const next = sourcePane.querySelector(optionSelector);
    if (!next) return onDone?.();

    let progressed = false;

    const mo = new MutationObserver(() => {
      if (progressed) return;
      progressed = true;
      mo.disconnect();
      Promise.resolve().then(() =>
        runBulkMove({ sourcePaneId, optionSelector, moveButtonId, onDone })
      );
    });

    mo.observe(sourcePane, { childList: true, subtree: true });

    // Select next item using FM handlers
    next.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    next.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

    // Move it
    moveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

    // Failsafe if FM does not mutate DOM
    window.setTimeout(() => {
      if (progressed) return;
      progressed = true;
      mo.disconnect();
      runBulkMove({ sourcePaneId, optionSelector, moveButtonId, onDone });
    }, 150);
  }

  FM.ensureBulkMoveButtonsInCenter = function () {
    const hash = String(location.hash || "");
    if (!hash.includes("section=adminusers")) return;

    const wrapper = document.querySelector(".roundButtonsWrapperWithDescription");
    if (!wrapper) return;

    if (document.getElementById("fm-bulk-buttons")) return;

    FM.ensureNoJavascriptHrefNav();

    const container = document.createElement("div");
    container.id = "fm-bulk-buttons";
    container.className = "fm-bulk-buttons";

    // Target real option nodes by the presence of _ds_fauxselect_value
    // and the standard option classes FM uses.
    const OPTION_SELECTOR =
      'div.unselectedOption[_ds_fauxselect_value], div.selectedOption[_ds_fauxselect_value]';

    // Move all left
    const btnLeft = document.createElement("button");
    btnLeft.type = "button";
    btnLeft.className = "fm-bulk-btn";
    btnLeft.innerHTML = '<span class="material-icons">keyboard_double_arrow_left</span>';
    btnLeft.title = "Remove All";

    btnLeft.addEventListener("click", () => {
      if (btnLeft.dataset.fmBusy === "1") return;
      btnLeft.dataset.fmBusy = "1";
      FM._bulkMoveActive = true;

      runBulkMove({
        sourcePaneId: "rightPane",
        optionSelector: OPTION_SELECTOR,
        moveButtonId: "moveLeft",
        onDone: () => {
          FM._bulkMoveActive = false;
          btnLeft.dataset.fmBusy = "0";
          FM.clearOptionSelection();
        }
      });
    });

    // Move all right
    const btnRight = document.createElement("button");
    btnRight.type = "button";
    btnRight.className = "fm-bulk-btn";
    btnRight.innerHTML = '<span class="material-icons">keyboard_double_arrow_right</span>';
    btnRight.title = "Add All";

    btnRight.addEventListener("click", () => {
      if (btnRight.dataset.fmBusy === "1") return;
      btnRight.dataset.fmBusy = "1";
      FM._bulkMoveActive = true;

      runBulkMove({
        sourcePaneId: "leftPane",
        optionSelector: OPTION_SELECTOR,
        moveButtonId: "moveRight",
        onDone: () => {
          FM._bulkMoveActive = false;
          btnRight.dataset.fmBusy = "0";
          FM.clearOptionSelection();
        }
      });
    });

    container.appendChild(btnLeft);
    container.appendChild(btnRight);

    // Insert above the single-move arrows
    wrapper.prepend(container);
  };

// ---- Open roles/groups/users items in new tab (Cmd/Ctrl+click) ----

function getAnyAdminTabTable() {
  var t = document.querySelector('.itembody-users table');
  if (t) return t;
  return getSecurityTabTable();
}

// Runs at script load: if another tab stored a pending row nav, find+highlight+click it
(function () {
  var raw = localStorage.getItem('fmPendingItemNav');
  if (!raw) return;
  try {
    var data = JSON.parse(raw);
    localStorage.removeItem('fmPendingItemNav');
    if (!data.rowText || Date.now() - (data.ts || 0) > 15000) return;

    function waitAndAct(count) {
      if (count > 40) return;
      var table = getAnyAdminTabTable();
      if (!table) { setTimeout(function () { waitAndAct(count + 1); }, 300); return; }

      var rows = Array.from(table.querySelectorAll('tbody tr'));
      var targetRow = null;
      for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].querySelectorAll('td, th');
        var isMatch = false;
        if (data.rowCells && data.rowCells.length > 0) {
          var cellTexts = Array.from(cells).map(function (c) { return c.textContent.trim(); });
          isMatch = data.rowCells.length === cellTexts.length &&
                    data.rowCells.every(function (t, idx) { return t === cellTexts[idx]; });
        } else {
          isMatch = cells.length > 0 && cells[0].textContent.trim() === data.rowText;
        }
        if (isMatch) { targetRow = rows[i]; break; }
      }

      if (!targetRow) { setTimeout(function () { waitAndAct(count + 1); }, 300); return; }

      targetRow.style.outline = '3px solid #f59e0b';
      targetRow.style.backgroundColor = 'rgba(251,191,36,0.15)';
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Match anchor by text across multiselect links first, then all anchors, then fallback [0]
      var anchors = Array.from(targetRow.querySelectorAll('a.multiselect'));
      var anchor = anchors.find(function (a) { return a.textContent.trim() === data.anchorText; });
      if (!anchor) {
        anchors = Array.from(targetRow.querySelectorAll('a'));
        anchor = anchors.find(function (a) { return a.textContent.trim() === data.anchorText; }) || anchors[0];
      }
      if (anchor) {
        anchor.click();
        window.addEventListener('hashchange', function () {
          targetRow.style.outline = '';
          targetRow.style.backgroundColor = '';
        }, { once: true });
      }
    }

    setTimeout(function () { waitAndAct(0); }, 700);
  } catch (_) {
    localStorage.removeItem('fmPendingItemNav');
  }
})();

FM.initSecurityItemNewTab = function () {
  if (FM._secNewTabInit) return;
  FM._secNewTabInit = true;

  function handler(e) {
    if (!e.metaKey && !e.ctrlKey && e.button !== 1) return;
    var tab = getAdminUsersTab();
    if (tab !== 'roles' && tab !== 'groups' && tab !== 'users') return;
    var table = getAnyAdminTabTable();
    if (!table) return;
    var row = e.target.closest('tr');
    if (!row || !table.contains(row) || row.querySelector('th')) return;

    var anchorEl = e.target.closest('a') || e.target;
    var anchorText = anchorEl.textContent.trim();

    // All other row clicks (Edit, Permissions, Groups, etc.): prevent FM navigating current tab, open list in new tab via pending nav
    e.preventDefault();
    e.stopImmediatePropagation();

    var rowText = row.cells[0] ? row.cells[0].textContent.trim() : '';
    var rowCells = Array.from(row.cells).map(function (c) { return c.textContent.trim(); });
    var hashBase = location.hash.replace(/^#/, '').replace(/([&?]item=[^&]*)/g, '');
    var listUrl = location.origin + location.pathname + location.search + '#' + hashBase;

    try {
      localStorage.setItem('fmPendingItemNav', JSON.stringify({ rowText: rowText, rowCells: rowCells, anchorText: anchorText, ts: Date.now() }));
    } catch (_) {}

    window.open(listUrl, '_blank');
  }

  document.addEventListener('click', handler, true);
  document.addEventListener('auxclick', handler, true);
};
