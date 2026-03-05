window.FM = window.FM || {};

FM.isAdminUi = function () {
  return location.href.includes("autodeskplm360.net/admin");
};

/** Extract workspace ID from current URL when on workspace items (e.g. /plm/workspaces/57/items). Returns null if not on that pattern. */
FM.getWorkspaceIdFromItemsUrl = function (url) {
  if (typeof url !== "string") return null;
  var m = url.match(/\/plm\/workspaces\/(\d+)\/items/);
  return m ? m[1] : null;
};

FM.getOrCreateButtonsContainer = function () {
  let container = document.getElementById("fm-shortcuts");
  if (container) return container;
  container = document.createElement("div");
  container.id = "fm-shortcuts";
  container.style.display = "inline-flex";
  container.style.alignItems = "center";
  container.style.gap = "6px";
  container.style.marginRight = "10px";
  container.style.verticalAlign = "middle";
  container.setAttribute("data-fm-managed", "1");
  return container;
};

FM.insertContainerBeforeHeaderRight = function (container) {
  const right = document.getElementById("fusion-header-search");
  if (!right) return false;
  const parent = right.parentElement;
  if (!parent) return false;
  if (container.parentElement !== parent) {
    parent.insertBefore(container, right);
  }
  return true;
};

FM.insertContainerIntoGlobalNavAfterAdminMenu = function (container) {
  const nav = document.getElementById("global_navigation");
  if (!nav) return false;
  const adminLi = nav.querySelector("li.drop_down.nav_item.with_separator.systemlink-admin");
  if (!adminLi) return false;
  const parent = adminLi.parentElement || nav;
  if (container.parentElement !== parent || container.previousSibling !== adminLi) {
    parent.insertBefore(container, adminLi.nextSibling);
  }
  return true;
};

FM.createIconButton = function ({ id, icon, label, title, action }) {
  const btn = document.createElement("button");
  btn.id = id;
  btn.className = "fm-btn";
  btn.type = "button";
  btn.title = title || "";
  btn.tabIndex = 0;
  btn.setAttribute("data-fm-action", action || "");
  const iconEl = document.createElement("span");
  iconEl.className = "material-icons";
  iconEl.textContent = icon;
  btn.appendChild(iconEl);
  if (label) {
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    btn.appendChild(labelEl);
  }
  return btn;
};

FM.buildWorkspaceAdminUrl = function (currentUrl) {
  const tenant = FM.tenantNameFromLocation();
  let workspaceURL = "https://" + tenant + ".autodeskplm360.net/admin#section=setuphome&tab=workspaces";
  const gridMatch = currentUrl.match(/\/plm\/workspaces\/(\d+)\/items\/grid/);
  const bomMatch = currentUrl.match(/\/plm\/workspaces\/(\d+)\/items\/bom/);
  const wsMatch = currentUrl.match(/\/plm\/workspaces\/(\d+)\/items/);
  if (gridMatch) {
    const workspaceID = gridMatch[1];
    workspaceURL = "https://" + tenant + ".autodeskplm360.net/admin#section=setuphome&tab=workspaces&item=grid&params=" + encodeURIComponent(JSON.stringify({ workspaceID: String(workspaceID), metaType: "G" }));
  } else if (bomMatch) {
    const workspaceID = bomMatch[1];
    workspaceURL = "https://" + tenant + ".autodeskplm360.net/admin#section=setuphome&tab=workspaces&item=bom&params=" + encodeURIComponent(JSON.stringify({ workspaceID: String(workspaceID), metaType: "B" }));
  } else if (wsMatch) {
    const workspaceID = wsMatch[1];
    workspaceURL = "https://" + tenant + ".autodeskplm360.net/admin#section=setuphome&tab=workspaces&item=itemdetails&params=" + encodeURIComponent(JSON.stringify({ metaType: "D", workspaceID: String(workspaceID) }));
  }
  return workspaceURL;
};

FM.buildScriptsUrl = function () {
  const tenant = FM.tenantNameFromLocation();
  return "https://" + tenant + ".autodeskplm360.net/admin#section=setuphome&tab=scripts";
};

FM.buildRolesUrl = function () {
  const tenant = FM.tenantNameFromLocation();
  return "https://" + tenant + ".autodeskplm360.net/admin#section=adminusers&tab=roles";
};

FM.buildWorkflowUrl = function (currentUrl) {
  const tenant = FM.tenantNameFromLocation();
  let url = "https://" + tenant + ".autodeskplm360.net/admin#section=setuphome&tab=workspaces";
  const wsMatch = currentUrl.match(/\/plm\/workspaces\/(\d+)\/items/);
  if (wsMatch) {
    url = "https://" + tenant + ".autodeskplm360.net/workflowEditor.form?workspaceId=" + wsMatch[1];
  }
  return url;
};

FM.updateWorkflowButtonState = function () {
  const btn = document.getElementById("fm-btn-workflow");
  if (!btn) return;
  const hasWorkspaceContext = FM.isWorkspaceContext(location.href);
  btn.classList.toggle("disabled", !hasWorkspaceContext);
  btn.title = hasWorkspaceContext ? "Workflow Editor" : "Workspace Context Needed";
};

var ITEM_DETAILS_ADMIN_STORAGE_KEY = "fm-item-details-admin-mode";

FM.getItemDetailsAdminMode = function () {
  try {
    return sessionStorage.getItem(ITEM_DETAILS_ADMIN_STORAGE_KEY) === "1";
  } catch (e) {
    return false;
  }
};

FM.setItemDetailsAdminMode = function (on) {
  try {
    sessionStorage.setItem(ITEM_DETAILS_ADMIN_STORAGE_KEY, on ? "1" : "0");
  } catch (e) {}
};

/** Extract field ID from row-key or cell-key (e.g. "...57.1.NUMBER" -> "NUMBER"). */
FM.fieldIdFromRowKey = function (rowKey) {
  if (typeof rowKey !== "string") return "";
  var parts = rowKey.split(".");
  return parts.length > 0 ? parts[parts.length - 1] : rowKey;
};

FM._applyAdminToValueCell = function (valueCell, fieldId, insertParent, insertBeforeNextSibling) {
  valueCell.setAttribute("data-fm-admin-original-style", valueCell.getAttribute("style") || "");
  valueCell.style.width = "0";
  valueCell.style.minWidth = "0";
  valueCell.style.overflow = "hidden";
  valueCell.style.visibility = "hidden";
  valueCell.style.position = "absolute";
  valueCell.style.left = "-9999px";
  valueCell.style.pointerEvents = "none";
  var idEl = document.createElement("span");
  idEl.className = "plm-panel-cell fm-item-detail-field-id";
  idEl.setAttribute("data-fm-admin-field-id", "1");
  idEl.textContent = fieldId;
  idEl.title = "Click to copy field ID";
  if (insertBeforeNextSibling) {
    insertParent.insertBefore(idEl, valueCell.nextSibling);
  } else {
    insertParent.appendChild(idEl);
  }
};

FM.applyItemDetailsAdminMode = function () {
  var roots = document.querySelectorAll(".item-details-render");
  roots.forEach(function (root) {
    var rows = root.querySelectorAll(".plm-panel-row.plm-item-detail-field");
    rows.forEach(function (row) {
      if (row.getAttribute("data-fm-admin-applied") === "1") return;
      var rowKey = row.getAttribute("row-key");
      if (!rowKey) return;
      var valueCell = row.querySelector(".plm-panel-cell.plm-item-detail-field-value");
      if (!valueCell) return;
      var fieldId = FM.fieldIdFromRowKey(rowKey);
      FM._applyAdminToValueCell(valueCell, fieldId, row, true);
      row.setAttribute("data-fm-admin-applied", "1");
    });
  });
  var matrixCells = document.querySelectorAll(".plm-matrix td[cell-key]");
  matrixCells.forEach(function (td) {
    var cellKey = td.getAttribute("cell-key");
    if (!cellKey || cellKey.indexOf("urn:adsk.plm:") !== 0) return;
    if (td.getAttribute("data-fm-admin-applied") === "1") return;
    var valueSpan = td.querySelector(".plm-panel-cell.plm-item-detail-field-value");
    if (!valueSpan) return;
    var fieldId = FM.fieldIdFromRowKey(cellKey);
    FM._applyAdminToValueCell(valueSpan, fieldId, td, true);
    td.setAttribute("data-fm-admin-applied", "1");
  });
};

FM._restoreValueCell = function (valueCell) {
  var orig = valueCell.getAttribute("data-fm-admin-original-style");
  valueCell.removeAttribute("data-fm-admin-original-style");
  valueCell.setAttribute("style", orig || "");
};

FM.unapplyItemDetailsAdminMode = function () {
  var rows = document.querySelectorAll(".item-details-render .plm-item-detail-field[data-fm-admin-applied=\"1\"]");
  rows.forEach(function (row) {
    var valueCell = row.querySelector(".plm-panel-cell.plm-item-detail-field-value");
    if (valueCell) FM._restoreValueCell(valueCell);
    var idEl = row.querySelector(".fm-item-detail-field-id[data-fm-admin-field-id=\"1\"]");
    if (idEl && idEl.parentNode) idEl.parentNode.removeChild(idEl);
    row.removeAttribute("data-fm-admin-applied");
  });
  var matrixCells = document.querySelectorAll(".plm-matrix td[data-fm-admin-applied=\"1\"]");
  matrixCells.forEach(function (td) {
    var valueSpan = td.querySelector(".plm-panel-cell.plm-item-detail-field-value");
    if (valueSpan) FM._restoreValueCell(valueSpan);
    var idEl = td.querySelector(".fm-item-detail-field-id[data-fm-admin-field-id=\"1\"]");
    if (idEl && idEl.parentNode) idEl.parentNode.removeChild(idEl);
    td.removeAttribute("data-fm-admin-applied");
  });
};

FM.applyItemDetailsAdminModeIfActive = function () {
  var on = FM.isOnFrontendItemDetailsPage(location.href) && FM.getItemDetailsAdminMode();
  if (on) {
    FM.applyItemDetailsAdminMode();
  } else {
    FM.unapplyItemDetailsAdminMode();
  }
};

FM.updateItemDetailsAdminButtonState = function () {
  var btn = document.getElementById("fm-btn-itemdetails-admin");
  if (!btn) return;
  var onPage = FM.isOnFrontendItemDetailsPage(location.href);
  btn.classList.toggle("disabled", !onPage);
  btn.classList.toggle("fm-admin-mode-on", onPage && FM.getItemDetailsAdminMode());
  btn.title = onPage
    ? (FM.getItemDetailsAdminMode() ? "Item Details: ADMIN mode (hide values, show field IDs) – click to turn off" : "Item Details: show field IDs for copying – click to turn on")
    : "Only on Item Details page";
};

FM._fmPointerHandler = null;

FM._fmQuicklinksPopupClose = function (popup, onClose) {
  if (!popup || !popup.parentNode) return;
  popup.parentNode.removeChild(popup);
  document.removeEventListener("click", onClose, true);
  document.removeEventListener("scroll", onClose, true);
};

/** Shows a popup below the given button with workspace settings quicklinks. Uses FM.getWorkspaceQuicklinks(workspaceId). */
FM.showWorkspaceQuicklinksPopup = function (anchorButton) {
  var existing = document.getElementById("fm-ws-quicklinks-popup");
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  var workspaceId = FM.getWorkspaceIdFromItemsUrl(location.href);
  if (!workspaceId) return;

  var links = typeof FM.getWorkspaceQuicklinks === "function" ? FM.getWorkspaceQuicklinks(workspaceId) : [];
  var rect = anchorButton.getBoundingClientRect();

  var popup = document.createElement("div");
  popup.id = "fm-ws-quicklinks-popup";
  popup.className = "fm-ws-quicklinks-popup";

  var header = document.createElement("div");
  header.className = "fm-ws-quicklinks-popup-header";
  var closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "fm-ws-quicklinks-popup-close";
  closeBtn.title = "Close";
  closeBtn.setAttribute("aria-label", "Close");
  var closeIcon = document.createElement("span");
  closeIcon.className = "material-icons";
  closeIcon.textContent = "close";
  closeBtn.appendChild(closeIcon);
  header.appendChild(closeBtn);
  var headerTitle = document.createElement("span");
  headerTitle.className = "fm-ws-quicklinks-popup-title";
  headerTitle.textContent = "Workspace " + workspaceId + " settings";
  header.appendChild(headerTitle);

  var list = document.createElement("div");
  list.className = "fm-ws-quicklinks-popup-list";

  if (links.length === 0) {
    var empty = document.createElement("p");
    empty.className = "fm-ws-quicklinks-popup-empty";
    empty.textContent = "Quicklinks not available.";
    list.appendChild(empty);
  } else {
    links.forEach(function (item) {
      var a = document.createElement("a");
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = item.title;
      a.className = "fm-ws-quicklinks-popup-link";
      var icon = document.createElement("span");
      icon.className = "material-icons fm-ws-quicklinks-popup-icon";
      icon.textContent = item.icon;
      a.appendChild(icon);
      a.appendChild(document.createTextNode(item.title));
      list.appendChild(a);
    });
  }

  popup.appendChild(list);

  popup.style.left = rect.left + "px";
  popup.style.top = (rect.bottom + 4) + "px";

  document.body.appendChild(popup);

  var closeHandler = function (e) {
    if (!e || !e.target) return;
    if (popup.contains(e.target) || anchorButton.contains(e.target)) return;
    FM._fmQuicklinksPopupClose(popup, closeHandler);
  };

  closeBtn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    FM._fmQuicklinksPopupClose(popup, closeHandler);
  });

  document.addEventListener("click", closeHandler, true);
  document.addEventListener("scroll", closeHandler, true);
};

FM.setupShortcutsDelegation = function () {
  const container = FM.getOrCreateButtonsContainer();
  if (!container) return;
  if (FM._fmPointerHandler) {
    container.removeEventListener("pointerdown", FM._fmPointerHandler);
  }
  FM._fmPointerHandler = function (evt) {
    const btn = evt.target.closest && evt.target.closest(".fm-btn");
    if (!btn || !container.contains(btn)) return;
    evt.stopPropagation();
    evt.preventDefault();
    const action = btn.getAttribute("data-fm-action");
    switch (action) {
      case "openScripts":
        window.open(FM.buildScriptsUrl(), "_blank", "noopener,noreferrer");
        break;
      case "openRoles":
        window.open(FM.buildRolesUrl(), "_blank", "noopener,noreferrer");
        break;
      case "toggleItemDetailsAdmin":
        if (!FM.isOnFrontendItemDetailsPage(location.href)) return;
        var next = !FM.getItemDetailsAdminMode();
        FM.setItemDetailsAdminMode(next);
        if (next) {
          FM.applyItemDetailsAdminMode();
        } else {
          FM.unapplyItemDetailsAdminMode();
        }
        FM.updateItemDetailsAdminButtonState();
        break;
      case "openWorkspaceQuicklinks":
        if (FM.isWorkspaceContext(location.href)) {
          FM.showWorkspaceQuicklinksPopup(btn);
        } else {
          window.open(FM.buildWorkspaceAdminUrl(location.href), "_blank", "noopener,noreferrer");
        }
        break;
      default:
    }
  };
  container.addEventListener("pointerdown", FM._fmPointerHandler, { passive: false });
  if (!FM._fmCopyFieldIdBound) {
    FM._fmCopyFieldIdBound = true;
    document.addEventListener("click", function (evt) {
      var el = evt.target && evt.target.closest && evt.target.closest(".fm-item-detail-field-id");
      if (!el || !el.getAttribute("data-fm-admin-field-id")) return;
      var text = (el.textContent || "").trim();
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          el.setAttribute("title", "Copied!");
          setTimeout(function () { el.setAttribute("title", "Click to copy field ID"); }, 1500);
        }).catch(function () {});
      }
    }, true);
  }
};

FM.ensurePlacement = function () {
  const container = FM.getOrCreateButtonsContainer();
  if (FM.isAdminUi()) {
    const nav = document.getElementById("global_navigation");
    const adminLi = nav && nav.querySelector("li.drop_down.nav_item.with_separator.systemlink-admin");
    if (nav && adminLi) {
      const parent = adminLi.parentElement || nav;
      if (container.parentElement !== parent || container.previousSibling !== adminLi) {
        parent.insertBefore(container, adminLi.nextSibling);
      }
      return true;
    }
  }
  const right = document.getElementById("fusion-header-search");
  if (right) {
    const parent = right.parentElement;
    if (container.parentElement !== parent || container.nextSibling !== right) {
      parent.insertBefore(container, right);
    }
    return true;
  }
  return false;
};

FM.ensureButtonsPresent = function () {
  const container = FM.getOrCreateButtonsContainer();
  if (!container.parentElement) return;
  function ensureButton(id, props) {
    if (!document.getElementById(id)) {
      const btn = FM.createIconButton(props);
      container.appendChild(btn);
    }
  }
  var onItemDetailsPage = FM.isOnFrontendItemDetailsPage(location.href);
  if (!FM.isAdminUi()) {
    var quicklinksBtn = document.getElementById("fm-btn-ws-quicklinks");
    if (!quicklinksBtn) {
      quicklinksBtn = FM.createIconButton({ id: "fm-btn-ws-quicklinks", icon: "settings", title: "Workspace settings", action: "openWorkspaceQuicklinks" });
      container.insertBefore(quicklinksBtn, container.firstChild);
    } else if (quicklinksBtn.parentNode === container && quicklinksBtn !== container.firstChild) {
      container.insertBefore(quicklinksBtn, container.firstChild);
    }
    if (onItemDetailsPage) {
      var itemDetailsBtn = document.getElementById("fm-btn-itemdetails-admin");
      if (!itemDetailsBtn) {
        itemDetailsBtn = FM.createIconButton({ id: "fm-btn-itemdetails-admin", icon: "admin_panel_settings", title: "Item Details: show field IDs", action: "toggleItemDetailsAdmin" });
        container.insertBefore(itemDetailsBtn, container.firstChild);
      } else if (itemDetailsBtn.parentNode === container && itemDetailsBtn !== container.firstChild) {
        container.insertBefore(itemDetailsBtn, container.firstChild);
      }
    } else {
      var adminBtn = document.getElementById("fm-btn-itemdetails-admin");
      if (adminBtn) adminBtn.remove();
    }
  } else {
    var itemDetailsBtnEl = document.getElementById("fm-btn-itemdetails-admin");
    if (itemDetailsBtnEl) itemDetailsBtnEl.remove();
    var wsQlBtnEl = document.getElementById("fm-btn-ws-quicklinks");
    if (wsQlBtnEl) wsQlBtnEl.remove();
  }
  ensureButton("fm-btn-scripts", { id: "fm-btn-scripts", icon: "code", title: "Scripts", action: "openScripts" });
  ensureButton("fm-btn-roles", { id: "fm-btn-roles", icon: "group", title: "Roles", action: "openRoles" });
  if (!FM.isAdminUi()) {
    FM.updateItemDetailsAdminButtonState();
  }
};

FM.initShortcuts = function () {
  FM.getOrCreateButtonsContainer();
  FM.ensurePlacement();
  FM.ensureButtonsPresent();
  FM.setupShortcutsDelegation();
  if (FM._shortcutsObserver) {
    try { FM._shortcutsObserver.disconnect(); } catch (e) {}
  }
  FM._shortcutsObserverTimer = null;
  FM._shortcutsObserver = new MutationObserver(function () {
    if (FM._shortcutsObserverTimer) clearTimeout(FM._shortcutsObserverTimer);
    FM._shortcutsObserverTimer = setTimeout(function () {
      FM.ensurePlacement();
      FM.ensureButtonsPresent();
    }, 120);
  });
  const observeTargets = [];
  const nav = document.getElementById("global_navigation");
  if (nav) observeTargets.push(nav);
  const headerRight = document.getElementById("fusion-header-right") || (document.getElementById("fusion-header-search") && document.getElementById("fusion-header-search").parentElement);
  if (headerRight) observeTargets.push(headerRight);
  observeTargets.forEach(function (t) {
    try {
      FM._shortcutsObserver.observe(t, { childList: true, subtree: true });
    } catch (e) {}
  });
  window.addEventListener("popstate", function () { setTimeout(function () { FM.ensurePlacement(); FM.ensureButtonsPresent(); }, 80); });
  window.addEventListener("hashchange", function () { setTimeout(function () { FM.ensurePlacement(); FM.ensureButtonsPresent(); }, 80); });
};

