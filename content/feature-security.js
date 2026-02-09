window.FM = window.FM || {};

function findFusionNativeFilterInput() {
  const container = document.getElementById("itembody-2");
  if (!container) return null;

  // Look for an existing text/search input that is NOT ours
  const inputs = Array.from(container.querySelectorAll('input[type="text"], input[type="search"]'))
    .filter((el) => el.id !== "fm-search-security");

  // Heuristic: prefer ones with placeholder containing "filter" or "search"
  const preferred = inputs.find((el) => /filter|search/i.test(el.placeholder || ""));
  return preferred || inputs[0] || null;
}

function driveFusionFilterFromOurInput(ourInput) {
  const nativeInput = findFusionNativeFilterInput();
  if (!nativeInput) return false;

  nativeInput.value = ourInput.value;

  // Trigger events on the native input so Fusion's handler runs
  nativeInput.dispatchEvent(new Event("input", { bubbles: true }));
  nativeInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
  nativeInput.dispatchEvent(new Event("change", { bubbles: true }));

  return true;
}

function getAdminUsersTab() {
  const match = location.href.match(/admin#section=adminusers&tab=(users|roles|groups)/);
  return match ? match[1] : null;
}
function ensureAdminUsersSearchField() {
  const tab = getAdminUsersTab();
  if (!tab) return;

  if (document.getElementById("fm-search-security")) return;

  const container = document.getElementById("itembody-2");
  if (!container) return;

  const input = document.createElement("input");
  input.id = "fm-search-security";
  input.type = "text";
  const tabLabel = tab.charAt(0).toUpperCase() + tab.slice(1);
  input.placeholder = `Filter ${tabLabel}`;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.classList.add("fm-search-input");

  let t = null;
  input.addEventListener("input", () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => {
      filterSecurityTable(input.value);
    }, 120);
  });

  container.insertAdjacentElement("afterbegin", input);

  // Apply once in case the user returns to the tab and the table is already there
  filterSecurityTable(input.value);
}

function filterSecurityTable(query) {
  const container = document.getElementById("itembody-2");
  if (!container) return;

  const table = container.querySelector("table");
  if (!table) return;

  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll("tr"));
  if (rows.length === 0) return;

  const q = (query || "").toLowerCase().trim();

  rows.forEach((row, index) => {
    // If your header is still in tbody as first row, keep it visible
    if (index === 0 && !table.querySelector("thead")) {
      row.style.display = "";
      return;
    }

    const text = (row.innerText || "").toLowerCase();
    const match = q === "" || text.includes(q);
    row.style.display = match ? "" : "none";
  });
}

function promoteFirstBodyRowToHeader() {
  const container = document.getElementById("itembody-2");
  if (!container) return;

  const table = container.querySelector("table");
  if (!table) return;

  // Run once per table instance
  if (table.dataset.fmHeaderFixed === "1") return;

  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const firstRow = tbody.querySelector("tr");
  if (!firstRow) return;

  // If a thead already exists, do nothing
  if (table.querySelector("thead")) {
    table.dataset.fmHeaderFixed = "1";
    return;
  }

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  // Convert the cells of the first row to <th>
  const cells = Array.from(firstRow.children);
  for (const cell of cells) {
    const th = document.createElement("th");
    th.innerHTML = cell.innerHTML;
    th.className = cell.className || "";
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.insertBefore(thead, table.firstChild);

  // Remove original first row from tbody
  firstRow.remove();

  table.dataset.fmHeaderFixed = "1";
}

let lastTab = null;

FM.runAdminUsersSearchTick = function () {
  const currentTab = getAdminUsersTab();

  if (currentTab !== lastTab) {
    lastTab = currentTab;
    const existing = document.getElementById("fm-search-security");
    if (existing) existing.remove();
  }

  ensureAdminUsersSearchField();
  promoteFirstBodyRowToHeader();

  const input = document.getElementById("fm-search-security");
  if (input) filterSecurityTable(input.value);
};

function triggerFusionFilter(input) {
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
}


// ###########################
window.FM = window.FM || {};

// Route guard
function getAdminUsersTab() {
  const href = String(location.href || "");
  const m = href.match(/admin#section=adminusers&tab=(users|roles|groups)\b/);
  return m ? m[1] : null;
}

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

function ensureSecurityDividerAfterManage() {
  if (document.getElementById("fm-security-manage-divider-style")) return;

  const style = document.createElement("style");
  style.id = "fm-security-manage-divider-style";
  style.textContent = `
    /* Roles/Groups security table: divider after Manage (col 3) */
    #itembody-2 table tr > th:nth-child(3),
    #itembody-2 table tr > td:nth-child(3) {
      border-right: 1px solid #bdbdbd !important;
    }

    /* Avoid double border on next col */
    #itembody-2 table tr > th:nth-child(4),
    #itembody-2 table tr > td:nth-child(4) {
      border-left: 0 !important;
    }
  `;
  document.head.appendChild(style);
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
  ensureSecurityDividerAfterManage();
};




// ############ ############ ############ ############ ############

FM.injectAdminUsersPaneCSS = function () {
  if (document.getElementById("fm-adminusers-panes-css")) return;

  const style = document.createElement("style");
  style.id = "fm-adminusers-panes-css";
  style.textContent = `
    #leftPane,
    #rightPane {
      height: 500px !important;
      max-height: 500px !important;
      min-height: 500px !important;
      overflow: auto !important;
    }

    /* Bulk move button above the arrows */
    #fm-move-all-right {
      display: flex !important;
      justify-content: center !important;
      width: 100% !important;
      margin: 0 0 6px 0 !important;
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      cursor: pointer !important;
    }

    #fm-move-all-right .roundButton {
      transform: scale(0.85);
      opacity: 0.9;
    }

    /* Ensure wrapper does not clip the new row */
    .roundButtonsWrapperWithDescription {
      height: auto !important;
      overflow: visible !important;
    }
  `;
  document.head.appendChild(style);
};





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