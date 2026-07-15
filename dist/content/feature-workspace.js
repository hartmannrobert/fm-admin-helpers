window.FM = window.FM || {};
window.FM.ADMIN_ITEM_PATH_MAP = window.FM.ADMIN_ITEM_PATH_MAP || {
  workspaceedit: "",
  itemdetails: "item-details-tab",
  descriptor: "descriptor-order",
  grid: "grid-tab",
  workflowitems: "managed-items-tab",
  bom: "bill-of-materials-tab",
  sourcing: "sourcing-tab",
  relationship: "workspace-relationships",
  tabsedit: "tab-names",
  printview: "print-views",
  advancedPrintViewList: "advanced-print-views",
  behavior: "behaviors",
  workflowEditor: "workflow-editor"
};


(function () {
  window.FM = window.FM || {};
  const ADMIN_ITEM_PATH_MAP = window.FM.ADMIN_ITEM_PATH_MAP;

  const FEATURE_KEY = "workspaceOpenInNewTab";
  const BTN_CLASS = "fm-open-newtab-btn";
  const ICON_CLASS = "material-icons fm-open-newtab-icon";
  const WRAP_CLASS = "fm-open-newtab-wrap";

  function isOnWorkspaceManagerSettingsTable() {
    return (
      !!document.querySelector("td.workspaceEditButtons") &&
      !!document.querySelector('a[data-ds-path][data-ds-item="workspaceedit"]')
    );
  }

  function decodeHtmlEntities(s) {
    if (!s || typeof s !== "string") return s;
    const ta = document.createElement("textarea");
    ta.innerHTML = s;
    return ta.value;
  }

  function toAbsoluteUrl(maybeRelativeOrAbs) {
    const path = decodeHtmlEntities((maybeRelativeOrAbs || "").trim());
    if (!path) return null;
    try {
      return new URL(path, location.origin).toString();
    } catch (e) {
      return null;
    }
  }

  function extractWorkspaceIdFromUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url, location.origin);

      const q =
        u.searchParams.get("workspaceID") ||
        u.searchParams.get("workspaceId") ||
        u.searchParams.get("workspaceid");
      if (q) return String(q);

      const hash = u.hash || "";
      const m = hash.match(/[?&]params=([^&]+)/);
      if (m && m[1]) {
        const decoded = decodeURIComponent(m[1]);
        try {
          const obj = JSON.parse(decoded);
          const w = obj.workspaceID || obj.workspaceId || obj.workspaceid;
          if (w) return String(w);
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  function getWorkspaceIdFromContextFallback() {
    try {
      const u = new URL(location.href);
      const wid = u.searchParams.get("workspaceID") || u.searchParams.get("workspaceId");
      if (wid) return String(wid);
    } catch (e) { }

    const any = document.querySelector('a[data-ds-path*="workspaceID="], a[data-ds-path*="workspaceId="]');
    const dsPath = any?.getAttribute("data-ds-path");
    const abs = toAbsoluteUrl(dsPath);
    const fromAny = extractWorkspaceIdFromUrl(abs);
    return fromAny || null;
  }

  function getWorkspaceIdForAnchor(anchor) {
    const dsPath = anchor.getAttribute("data-ds-path") || anchor.dataset?.dsPath;
    const abs = toAbsoluteUrl(dsPath);
    const fromDsPath = extractWorkspaceIdFromUrl(abs);
    if (fromDsPath) return fromDsPath;

    const ctx =
      anchor.closest("[data-ds-workspaceid]") ||
      anchor.closest("[data-ds-workspaceID]") ||
      anchor.closest("[data-workspaceid]") ||
      anchor.closest("[data-workspaceID]") ||
      anchor.closest("[data-fm-ws-id]") ||
      anchor.closest("[data-fm-workspaceid]");

    if (ctx) {
      const v =
        ctx.getAttribute("data-ds-workspaceid") ||
        ctx.getAttribute("data-ds-workspaceID") ||
        ctx.getAttribute("data-workspaceid") ||
        ctx.getAttribute("data-workspaceID") ||
        ctx.getAttribute("data-fm-ws-id") ||
        ctx.getAttribute("data-fm-workspaceid");
      if (v) return String(v).trim();
    }

    const badge = anchor.closest("tr, li, div")?.querySelector(".fm-ws-id-badge");
    if (badge) {
      const n = (badge.textContent || "").replace(/\D+/g, "").trim();
      if (n) return n;
    }

    return getWorkspaceIdFromContextFallback();
  }

  function buildAdminHashUrl({ item, workspaceID }) {
    const wid = encodeURIComponent(String(workspaceID));
    const base = `${location.origin}/plm/admin/workspace-manager/${wid}`;
    const suffix = ADMIN_ITEM_PATH_MAP[item];
    return suffix ? `${base}/${suffix}` : base;
  }

  function resolveTargetUrl(anchor) {
    const wid = getWorkspaceIdForAnchor(anchor);
    const td = anchor.closest("td");
    const dsItem =
      anchor.getAttribute("data-ds-item") ||
      anchor.dataset?.dsItem ||
      td?.getAttribute("data-ds-item") ||
      td?.dataset?.dsItem;

    const hashUrlMap = {
      workspaceedit: () => buildAdminHashUrl({ item: "workspaceedit", workspaceID: wid }),
      tabsedit: () => buildAdminHashUrl({ item: "tabsedit", workspaceID: wid }),
      printview: () => buildAdminHashUrl({ item: "printview", workspaceID: wid }),
      advancedPrintViewList: () => buildAdminHashUrl({ item: "advancedPrintViewList", workspaceID: wid }),
      behavior: () => buildAdminHashUrl({ item: "behavior", workspaceID: wid }),
      itemdetails: () => buildAdminHashUrl({ item: "itemdetails", workspaceID: wid, metaType: "D" }),
      descriptor: () => buildAdminHashUrl({ item: "descriptor", workspaceID: wid }),
      grid: () => buildAdminHashUrl({ item: "grid", workspaceID: wid, metaType: "G" }),
      workflowitems: () => buildAdminHashUrl({ item: "workflowitems", workspaceID: wid, metaType: "L" }),
      bom: () => buildAdminHashUrl({ item: "bom", workspaceID: wid, metaType: "B" }),
      sourcing: () => buildAdminHashUrl({ item: "sourcing", workspaceID: wid, metaType: "S" }),
      relationship: () => buildAdminHashUrl({ item: "relationship", workspaceID: wid }),
    };

    if (wid && dsItem && typeof hashUrlMap[dsItem] === "function") {
      return hashUrlMap[dsItem]();
    }

    const dsPath = anchor.getAttribute("data-ds-path") || anchor.dataset?.dsPath;
    const abs = toAbsoluteUrl(dsPath);
    if (abs) return abs;

    if (!wid) return null;

    const onclick = anchor.getAttribute("onclick") || "";
    if (onclick.includes("workflowEditorActions") && onclick.includes("showWorkflowModal")) {
      return `${location.origin}/workflowEditor.form?workspaceId=${encodeURIComponent(wid)}`;
    }

    return null;
  }

  function ensureWrap(anchor) {
    const td = anchor.closest("td");
    if (!td) return null;

    const existing = anchor.closest(`.${WRAP_CLASS}`);
    if (existing) return existing;

    const wrap = document.createElement("span");
    wrap.className = WRAP_CLASS;

    anchor.insertAdjacentElement("beforebegin", wrap);
    wrap.appendChild(anchor);

    return wrap;
  }

  function addOpenButtonNextTo(anchor) {
    if (!anchor || anchor.nodeType !== 1) return;
    if (anchor.dataset.fmNewtabInjected === "1") return;

    const url = resolveTargetUrl(anchor);
    const wrap = ensureWrap(anchor);
    if (!wrap) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.title = url ? "Open" : "No target URL found";

    const icon = document.createElement("span");
    icon.className = ICON_CLASS;
    icon.textContent = "open_in_new";
    btn.appendChild(icon);

    if (!url) {
      btn.disabled = true;
    } else {
      btn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (typeof FM.openUrlWithEvent === "function") {
            FM.openUrlWithEvent(url, e);
          } else if (e.button === 1 || e.shiftKey) {
            window.open(url, "_blank", "noopener,noreferrer");
          } else {
            window.location.assign(url);
          }
        },
        true
      );
    }

    wrap.appendChild(btn);

    anchor.dataset.fmNewtabInjected = "1";
  }

  function injectButtons(root) {

    root
      .querySelectorAll('td:not(.workspaceEditButtons) > a.link[data-ds-path]')
      .forEach((a) => {
        if (a.closest(".workspaceEditButtons")) return;
        if (a.querySelector("img")) return;
        addOpenButtonNextTo(a);
      });

    root.querySelectorAll("td:not(.workspaceEditButtons) > a.workspacewarning").forEach(addOpenButtonNextTo);
    root
      .querySelectorAll('td:not(.workspaceEditButtons) > a[onclick*="workflowEditorActions"][onclick*="showWorkflowModal"]')
      .forEach(addOpenButtonNextTo);
  }


  function getRoot() {
    return document.getElementById("layoutContainer") || document.body;
  }

  function observeRerenders(root) {
    if (root.dataset.fmObserverNewtab === "1") return;
    root.dataset.fmObserverNewtab = "1";

    const mo = new MutationObserver(() => {
      if (!isOnWorkspaceManagerSettingsTable()) return;
      injectButtons(root);
    });

    mo.observe(root, { childList: true, subtree: true });
  }

  window.FM.runWorkspaceManagerOpenInNewTab = function () {
    try {
      if (!isOnWorkspaceManagerSettingsTable()) return;

      const root = getRoot();
      injectButtons(root);
      observeRerenders(root);

      window.FM[FEATURE_KEY] = true;
    } catch (e) {
      console.warn("[FM] workspaceOpenInNewTab failed", e);
    }
  };
})();


(function () {
  window.FM = window.FM || {};
  const ADMIN_ITEM_PATH_MAP = window.FM.ADMIN_ITEM_PATH_MAP;

  // ===== Feature: Workspace shortcut buttons in the new Admin UI MUI DataGrid =====
  // - Targets rows like <div class="workspace-row" data-id="workspace-{id}__category-{n}">
  // - Injects a fixed set of admin quicklink pills inside .workspace-name-cell,
  //   right before the .MuiDataGrid-actionsCell menu.

  const QUICKLINKS_ATTR = "data-fm-ws-quicklinks";
  const BAR_CLASS = "fm-ws-links-bar";
  const PILL_CLASS = "fm-ws-pill";

  // MUI's DataGrid re-renders rows during a live row-reorder drag (drop-target
  // highlight, hover state), which wipes the nodes we inject below. If our tick
  // re-injects them while the native HTML5 drag is still open, the resulting
  // DOM/height churn desyncs the grid's own drop-target row math from what's on
  // screen, so drops land on the wrong (or same) index. Suspend injection for the
  // duration of the drag and let the grid settle before touching the DOM again.
  let reorderDragActive = false;
  document.addEventListener(
    "dragstart",
    (ev) => {
      if (ev.target?.closest?.(".MuiDataGrid-rowReorderCell")) reorderDragActive = true;
    },
    true
  );
  document.addEventListener(
    "dragend",
    () => {
      reorderDragActive = false;
    },
    true
  );

  function buildAdminHashUrl(args) {
    const item = args?.item;
    const wid = encodeURIComponent(String(args?.workspaceID));
    const base = `${location.origin}/plm/admin/workspace-manager/${wid}`;
    const suffix = ADMIN_ITEM_PATH_MAP[item];
    return suffix ? `${base}/${suffix}` : base;
  }

  function getAllCompactTargets(workspaceId) {
    const wid = String(workspaceId || "").trim();
    if (!wid) return {};

    return {
      ws: buildAdminHashUrl({ item: "workspaceedit", workspaceID: wid }),

      itemdetails: buildAdminHashUrl({ item: "itemdetails", workspaceID: wid, metaType: "D" }),
      descriptor: buildAdminHashUrl({ item: "descriptor", workspaceID: wid }),
      grid: buildAdminHashUrl({ item: "grid", workspaceID: wid, metaType: "G" }),
      workflowitems: buildAdminHashUrl({ item: "workflowitems", workspaceID: wid, metaType: "L" }),
      bom: buildAdminHashUrl({ item: "bom", workspaceID: wid, metaType: "B" }),
      sourcing: buildAdminHashUrl({ item: "sourcing", workspaceID: wid, metaType: "S" }),
      relationship: buildAdminHashUrl({ item: "relationship", workspaceID: wid }),

      tabs: buildAdminHashUrl({ item: "tabsedit", workspaceID: wid }),
      print: buildAdminHashUrl({ item: "printview", workspaceID: wid }),
      advprint: buildAdminHashUrl({ item: "advancedPrintViewList", workspaceID: wid }),
      behavior: buildAdminHashUrl({ item: "behavior", workspaceID: wid }),
      wf: buildAdminHashUrl({ item: "workflowEditor", workspaceID: wid })
    };
  }

  const LINK_DEFS = [
    { key: "ws", icon: "settings", title: "Workspace Settings" },

    { key: "itemdetails", icon: "list_alt", title: "Item Details Tab" },
    { key: "descriptor", icon: "sell", title: "Descriptor" },
    { key: "grid", icon: "grid_on", title: "Grid Tab" },
    { key: "workflowitems", icon: "add_to_queue", title: "Managed Items Tab" },
    { key: "bom", icon: "list", title: "Bill of Materials Tab" },
    { key: "sourcing", icon: "local_shipping", title: "Sourcing Tab" },
    { key: "relationship", icon: "link", title: "Workspace Relationships" },

    { key: "tabs", icon: "tab", title: "Tab Names" },
    // { key: "print", icon: "print", title: "Print Views" },
    // { key: "advprint", icon: "tune", title: "Advanced Print Views" },

    { key: "behavior", icon: "tune", title: "Behaviors" },
    { key: "wf", icon: "schema", title: "Workflow Editor" }
  ];

  function extractWorkspaceIdFromRow(rowEl) {
    const id = rowEl.getAttribute("data-id") || "";
    const m = id.match(/^workspace-(\d+)/);
    return m ? m[1] : null;
  }

  function buildShortcutBar(wsId) {
    const urls = getAllCompactTargets(wsId);

    const bar = document.createElement("span");
    bar.setAttribute(QUICKLINKS_ATTR, "1");
    bar.className = BAR_CLASS;

    for (const def of LINK_DEFS) {
      const url = urls[def.key];
      if (!url) continue;

      const a = document.createElement("a");
      a.href = url;
      a.title = `${def.title} (WS ${wsId})`;
      a.className = PILL_CLASS;

      const icon = document.createElement("span");
      icon.className = "material-icons fm-ws-pill-icon";
      icon.textContent = def.icon;

      a.appendChild(icon);
      a.addEventListener(
        "click",
        (e) => {
          if (!e.metaKey && !e.ctrlKey) return;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          window.open(url, "_blank", "noopener,noreferrer");
        },
        true
      );
      bar.appendChild(a);
    }

    return bar;
  }

  // The MUI DataGrid row/header are plain flex rows, and the last unpinned
  // column ("Type") auto-fills whatever space is left over based on the
  // grid's own measured total column width. Adding brand-new flex siblings
  // confuses that measurement and collapses/misaligns the trailing columns.
  // So instead of inserting fake columns, we widen the two REAL columns that
  // flank where we want new content ("__reorder__" for the ID, "name" for
  // Shortcuts) and visually split each into labeled sub-regions inside.

  // The grid continuously re-balances column widths to fill its container
  // (a live auto-fit), so setting header/cell pixel widths ourselves gets
  // fought and reverted on the next re-render while our cell content
  // doesn't, causing header/cell drift. Going through the grid's own
  // public apiRef.setColumnWidth() updates its real internal state instead,
  // so the auto-fit math (and the trailing "Type" column) stays consistent.
  //
  // apiRef hangs off the React fiber tree, which is only reachable from the
  // page's own JS context — not from this isolated-world content script.
  // content/workspace-grid-bridge.js (MAIN world) does the actual resizing
  // on request and reports back the pre-resize width via a DOM event.

  const ID_EXTRA_WIDTH = 30;
  const SHORTCUTS_EXTRA_WIDTH = 360;

  let reorderColBaseline = null;
  let nameColBaseline = null;

  document.addEventListener("fm-ws-grid-columns-resized", function (ev) {
    const detail = ev.detail || {};
    if (typeof detail.__reorder__ === "number") reorderColBaseline = detail.__reorder__;
    if (typeof detail.name === "number") nameColBaseline = detail.name;
  });

  function requestColumnResize(fields) {
    document.dispatchEvent(
      new CustomEvent("fm-ws-grid-resize-columns", {
        detail: {
          fields: fields.map((field) => ({
            field,
            extraWidth: field === "__reorder__" ? ID_EXTRA_WIDTH : SHORTCUTS_EXTRA_WIDTH,
          })),
        },
      })
    );
  }

  function ensureReorderHeaderLabeled() {
    const header = document.querySelector('.MuiDataGrid-columnHeader[data-field="__reorder__"]');
    const titleContent = header?.querySelector(".MuiDataGrid-columnHeaderTitleContainerContent");
    if (!titleContent || titleContent.querySelector(".fm-ws-id-header-label")) return;

    const label = document.createElement("span");
    label.className = "fm-ws-id-header-label";
    label.textContent = "ID";
    titleContent.appendChild(label);
  }

  function ensureNameHeaderSplit() {
    const header = document.querySelector('.MuiDataGrid-columnHeader[data-field="name"]');
    const titleContent = header?.querySelector(".MuiDataGrid-columnHeaderTitleContainerContent");
    if (!titleContent || titleContent.classList.contains("fm-ws-name-header-split")) return;

    const existingTitle = titleContent.querySelector(".MuiDataGrid-columnHeaderTitle");
    if (!existingTitle) return;
    titleContent.classList.add("fm-ws-name-header-split");

    const nameWrap = document.createElement("div");
    nameWrap.className = "fm-ws-name-subheader";
    nameWrap.style.flexBasis = `${nameColBaseline}px`;
    nameWrap.appendChild(existingTitle);

    const shortcutsWrap = document.createElement("div");
    shortcutsWrap.className = "fm-ws-shortcuts-subheader MuiDataGrid-columnHeaderTitle";
    shortcutsWrap.style.flexBasis = `${SHORTCUTS_EXTRA_WIDTH}px`;
    shortcutsWrap.textContent = "Shortcuts";

    titleContent.appendChild(nameWrap);
    titleContent.appendChild(shortcutsWrap);
  }

  const CELL_SPLIT_ATTR = "data-fm-split";

  function injectIdIntoRow(rowEl) {
    const cell = rowEl.querySelector('.MuiDataGrid-cell[data-field="__reorder__"]');
    if (!cell || cell.getAttribute(CELL_SPLIT_ATTR) === "1") return;

    const wsId = extractWorkspaceIdFromRow(rowEl);
    if (!wsId) return;

    const content = cell.querySelector(".MuiDataGrid-cellContent");
    if (!content) return;
    cell.setAttribute(CELL_SPLIT_ATTR, "1");

    const badge = document.createElement("span");
    badge.className = "fm-ws-id-badge";
    badge.textContent = String(wsId);
    content.appendChild(badge);
  }

  function injectShortcutsIntoRow(rowEl) {
    const nameCell = rowEl.querySelector('.MuiDataGrid-cell[data-field="name"]');
    if (!nameCell) return;

    const wsId = extractWorkspaceIdFromRow(rowEl);
    if (!wsId) return;

    let region = nameCell.querySelector(".fm-ws-shortcuts-region");
    if (!region) {
      const content = nameCell.querySelector(".MuiDataGrid-cellContent");
      if (!content) return;
      content.classList.add("fm-ws-name-cell-split");

      const nameRegion = content.querySelector(".workspace-name-cell");
      if (nameRegion) {
        nameRegion.style.flexBasis = `${nameColBaseline}px`;
        nameRegion.style.maxWidth = `${nameColBaseline}px`;
      }

      region = document.createElement("div");
      region.className = "fm-ws-shortcuts-region";
      region.style.flexBasis = `${SHORTCUTS_EXTRA_WIDTH}px`;
      content.appendChild(region);
    }

    if (region.querySelector(`.${BAR_CLASS}`)) return;
    region.appendChild(buildShortcutBar(wsId));
  }

  function injectIdAll() {
    const rows = document.querySelectorAll('.workspace-row[data-id^="workspace-"]');
    for (const row of rows) injectIdIntoRow(row);
  }

  function injectAll() {
    const rows = document.querySelectorAll('.workspace-row[data-id^="workspace-"]');
    for (const row of rows) injectShortcutsIntoRow(row);
  }

  function isFeatureEnabled() {
    if (window.FM && typeof window.FM.isEnabled === "function") {
      return window.FM.isEnabled("enabledWorkspace");
    }
    return true;
  }

  window.FM.runWorkspaceManagerShortcutsTick = function () {
    if (reorderDragActive) return;
    try {
      const enabled = isFeatureEnabled();
      requestColumnResize(enabled ? ["__reorder__", "name"] : ["__reorder__"]);

      if (reorderColBaseline != null) {
        ensureReorderHeaderLabeled();
        injectIdAll();
      }
      if (!enabled) return;
      if (nameColBaseline != null) {
        ensureNameHeaderSplit();
        injectAll();
      }
    } catch (e) {
      console.warn("[FM] workspaceManagerShortcuts failed", e);
    }
  };

  /** Returns array of { url, icon, title } for workspace admin quicklinks (used by feature-buttons popup). */
  window.FM.getWorkspaceQuicklinks = function (workspaceId) {
    const wid = String(workspaceId || "").trim();
    if (!wid) return [];
    const urls = getAllCompactTargets(wid);
    return LINK_DEFS.filter(function (d) {
      return urls[d.key];
    }).map(function (d) {
      return { url: urls[d.key], icon: d.icon, title: d.title };
    });
  };
})();
