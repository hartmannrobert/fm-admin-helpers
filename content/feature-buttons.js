window.FM = window.FM || {};

FM.isAdminUi = function () {
  var href = location.href || "";
  return href.includes("autodeskplm360.net/admin") || href.includes("autodeskplm360.net/script.form?ID");
};

/** Extract workspace ID from current URL when on workspace items (e.g. /plm/workspaces/57/items). Returns null if not on that pattern. */
FM.getWorkspaceIdFromItemsUrl = function (url) {
  if (typeof url !== "string") return null;
  var m = url.match(/\/plm\/workspaces\/(\d+)\/items/);
  return m ? m[1] : null;
};

FM.getOrCreateButtonsContainer = function () {
  if (FM.isAdminUi()) {
    var nav = document.getElementById("global_navigation");
    var adminLi = nav && nav.querySelector("li.drop_down.nav_item.with_separator.systemlink-admin");
    return adminLi ? adminLi.parentElement : null;
  }
  var container = document.getElementById("fm-shortcuts");
  if (container) {
    if (!document.getElementById("fm-shortcuts-admin-slot")) {
      var slot = document.createElement("div");
      slot.id = "fm-shortcuts-admin-slot";
      slot.className = "fm-shortcuts-admin-slot";
      container.insertBefore(slot, container.firstChild);
    }
    return container;
  }
  container = document.createElement("div");
  container.id = "fm-shortcuts";
  container.setAttribute("data-fm-managed", "1");
  var adminSlot = document.createElement("div");
  adminSlot.id = "fm-shortcuts-admin-slot";
  adminSlot.className = "fm-shortcuts-admin-slot";
  container.appendChild(adminSlot);
  return container;
};

/** Insert container after fusion-header-search and before fusion-header-alerts. */
FM.insertContainerAfterHeaderSearch = function (container) {
  const searchEl = document.getElementById("fusion-header-search");
  if (!searchEl) return false;
  const parent = searchEl.parentElement;
  if (!parent) return false;
  if (container.parentElement !== parent) {
    parent.insertBefore(container, searchEl.nextSibling);
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
  if (icon) {
    const iconEl = document.createElement("span");
    iconEl.className = "material-icons";
    iconEl.textContent = icon;
    btn.appendChild(iconEl);
  }
  if (label) {
    const labelEl = document.createElement("span");
    labelEl.className = "fm-btn-label";
    labelEl.textContent = label;
    btn.appendChild(labelEl);
  }
  return btn;
};

/** Create an li > a shortcut link for admin nav (one li per shortcut, with separator). */
FM.createShortcutLi = function ({ id, label, title, action }) {
  var li = document.createElement("li");
  li.className = "nav_item with_separator fm-shortcut-item";
  var a = document.createElement("a");
  a.id = id;
  a.className = "fm-shortcut-link";
  a.href = "#";
  a.setAttribute("data-fm-action", action || "");
  a.title = title || "";
  a.textContent = label || "";
  li.appendChild(a);
  return li;
};

FM.createAdminModeToggle = function () {
  var btn = document.createElement("button");
  btn.id = "fm-btn-itemdetails-admin";
  btn.className = "fm-btn fm-admin-toggle";
  btn.type = "button";
  btn.title = "Toggle FieldID";
  btn.tabIndex = 0;
  btn.setAttribute("data-fm-action", "toggleItemDetailsAdmin");
  var labelEl = document.createElement("span");
  labelEl.className = "fm-admin-toggle-label";
  labelEl.textContent = "Toggle FieldID";
  btn.appendChild(labelEl);
  var pillEl = document.createElement("span");
  pillEl.className = "fm-admin-toggle-pill";
  var trackEl = document.createElement("span");
  trackEl.className = "fm-admin-toggle-track";
  var checkEl = document.createElement("span");
  checkEl.className = "fm-admin-toggle-check material-icons";
  checkEl.setAttribute("aria-hidden", "true");
  checkEl.textContent = "check";
  trackEl.appendChild(checkEl);
  pillEl.appendChild(trackEl);
  var thumbEl = document.createElement("span");
  thumbEl.className = "fm-admin-toggle-thumb";
  pillEl.appendChild(thumbEl);
  btn.appendChild(pillEl);
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

FM.buildUsersUrl = function () {
  const tenant = FM.tenantNameFromLocation();
  return "https://" + tenant + ".autodeskplm360.net/admin#section=adminusers&tab=users";
};

FM.buildGroupsUrl = function () {
  const tenant = FM.tenantNameFromLocation();
  return "https://" + tenant + ".autodeskplm360.net/admin#section=adminusers&tab=groups";
};

FM.buildGeneralSettingsUrl = function () {
  const tenant = FM.tenantNameFromLocation();
  return "https://" + tenant + ".autodeskplm360.net/plm/admin/system-configuration/general-settings";
};

/** Always returns the generic Workspace Manager URL (no context-based deep link). */
FM.buildWorkspaceManagerUrl = function () {
  const tenant = FM.tenantNameFromLocation();
  return "https://" + tenant + ".autodeskplm360.net/admin#section=setuphome&tab=workspaces";
};

/**
 * Extract workspace ID from current URL when on admin workspace settings
 * (e.g. admin#section=setuphome&tab=workspaces&item=grid&params={"workspaceID":"81",...}).
 * Returns null if not on that pattern or params lack workspaceID.
 */
FM.getWorkspaceIdFromAdminUrl = function (url) {
  if (typeof url !== "string") return null;
  const hash = url.indexOf("#") >= 0 ? url.slice(url.indexOf("#") + 1) : "";
  if (!hash.includes("section=setuphome") || !hash.includes("tab=workspaces") || !hash.includes("params=")) return null;
  const paramsMatch = hash.match(/params=([^&]+)/);
  if (!paramsMatch || !paramsMatch[1]) return null;
  try {
    const decoded = decodeURIComponent(paramsMatch[1]);
    const obj = JSON.parse(decoded);
    const id = obj && (obj.workspaceID !== undefined) ? String(obj.workspaceID) : null;
    return id || null;
  } catch (e) {
    return null;
  }
};

/** Build URL to workspace items (e.g. /plm/workspaces/81/items). workspaceId must be a string. */
FM.buildWorkspaceItemsUrl = function (workspaceId) {
  const tenant = FM.tenantNameFromLocation();
  return "https://" + tenant + ".autodeskplm360.net/plm/workspaces/" + encodeURIComponent(String(workspaceId)) + "/items";
};

/** Build URL to add a new dataset in a workspace (/plm/workspaces/{id}/items/addItem?view=full). */
FM.buildWorkspaceAddItemUrl = function (workspaceId) {
  const tenant = FM.tenantNameFromLocation();
  return "https://" + tenant + ".autodeskplm360.net/plm/workspaces/" + encodeURIComponent(String(workspaceId)) + "/items/addItem?view=full";
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
  } catch (e) { }
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
  var adminOn = onPage && FM.getItemDetailsAdminMode();
  btn.classList.toggle("disabled", !onPage);
  btn.classList.toggle("fm-admin-mode-on", adminOn);
  btn.title = onPage ? "Toggle FieldID" : "Only on Item Details page";
};

FM._fmPointerHandler = null;

FM._fmQuicklinksPopupClose = function (popup, onClose) {
  if (!popup || !popup.parentNode) return;
  popup.parentNode.removeChild(popup);
  document.removeEventListener("click", onClose, true);
  document.removeEventListener("scroll", onClose, true);
};

/** Returns which settings shortcut is current based on location (e.g. "general-settings", "workspaces", "scripts", "users", "groups", "roles"). */
FM.getCurrentSettingsShortcut = function () {
  var href = location.href;
  if (href.indexOf("/plm/admin/system-configuration/general-settings") >= 0) return "general-settings";
  if (!href.includes("autodeskplm360.net/admin")) return null;
  var hash = href.indexOf("#") >= 0 ? href.slice(href.indexOf("#") + 1) : "";
  if (hash.indexOf("section=setuphome") >= 0 && hash.indexOf("tab=workspaces") >= 0) return "workspaces";
  if (hash.indexOf("section=setuphome") >= 0 && hash.indexOf("tab=scripts") >= 0) return "scripts";
  if (hash.indexOf("section=adminusers") >= 0 && hash.indexOf("tab=users") >= 0) return "users";
  if (hash.indexOf("section=adminusers") >= 0 && hash.indexOf("tab=groups") >= 0) return "groups";
  if (hash.indexOf("section=adminusers") >= 0 && hash.indexOf("tab=roles") >= 0) return "roles";
  return null;
};

/** Shows the settings shortcuts popup below the anchor (two columns: left = General Settings, Workspace Manager, Scripts; right = Users, Groups, Roles). */
FM.showSettingsShortcutsPopup = function (anchorButton) {
  var current = FM.getCurrentSettingsShortcut();
  function addIconLink(parent, url, iconName, title, description, linkKey) {
    var a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "fm-ws-quicklinks-popup-link";
    if (linkKey && linkKey === current) a.classList.add("fm-quicklinks-popup-link-active");
    a.title = title;
    var icon = document.createElement("span");
    icon.className = "material-icons fm-ws-quicklinks-popup-icon";
    icon.textContent = iconName;
    icon.setAttribute("aria-hidden", "true");
    a.appendChild(icon);
    a.appendChild(document.createTextNode(description || title));
    parent.appendChild(a);
  }
  var existing = document.getElementById("fm-settings-shortcuts-popup");
  if (existing && existing.parentNode) {
    var handler = existing._fmCloseHandler;
    if (handler) {
      document.removeEventListener("click", handler, true);
      document.removeEventListener("scroll", handler, true);
    }
    existing.parentNode.removeChild(existing);
    return;
  }

  var rect = anchorButton.getBoundingClientRect();

  var popup = document.createElement("div");
  popup.id = "fm-settings-shortcuts-popup";
  popup.className = "fm-ws-quicklinks-popup";

  var wrapper = document.createElement("div");
  wrapper.className = "fm-settings-shortcuts-popup-columns";

  var listLeft = document.createElement("div");
  listLeft.className = "fm-ws-quicklinks-popup-list fm-settings-shortcuts-popup-col";
  addIconLink(listLeft, FM.buildGeneralSettingsUrl(), "build", "General Settings", "General Settings", "general-settings");
  addIconLink(listLeft, FM.buildWorkspaceManagerUrl(), "workspaces", "Workspace Manager", "Workspace Manager", "workspaces");
  addIconLink(listLeft, FM.buildScriptsUrl(), "code", "Scripts", "Scripts", "scripts");

  var listRight = document.createElement("div");
  listRight.className = "fm-ws-quicklinks-popup-list fm-settings-shortcuts-popup-col";
  addIconLink(listRight, FM.buildUsersUrl(), "account_circle", "Users", "Users", "users");
  addIconLink(listRight, FM.buildGroupsUrl(), "groups", "Groups", "Groups", "groups");
  addIconLink(listRight, FM.buildRolesUrl(), "lock_person", "Roles", "Roles", "roles");

  wrapper.appendChild(listLeft);
  wrapper.appendChild(listRight);
  popup.appendChild(wrapper);

  document.body.appendChild(popup);

  var popupRect = popup.getBoundingClientRect();
  var gap = 8;
  popup.style.left = Math.max(gap, rect.left + rect.width - popupRect.width + 10) + "px";
  popup.style.top = (rect.bottom + gap) + "px";

  var closeHandler = function (e) {
    if (!e || !e.target) return;
    if (popup.contains(e.target) || anchorButton.contains(e.target)) return;
    FM._fmQuicklinksPopupClose(popup, closeHandler);
  };
  popup._fmCloseHandler = closeHandler;

  document.addEventListener("click", closeHandler, true);
  document.addEventListener("scroll", closeHandler, true);
};

/** Shows the workspace quicklinks popup (only workspace-specific links). Clicking the button again closes it. */
FM.showWorkspaceQuicklinksPopup = function (anchorButton) {
  var existing = document.getElementById("fm-ws-quicklinks-popup");
  if (existing && existing.parentNode) {
    var handler = existing._fmCloseHandler;
    if (handler) {
      document.removeEventListener("click", handler, true);
      document.removeEventListener("scroll", handler, true);
    }
    existing.parentNode.removeChild(existing);
    return;
  }

  var workspaceId = FM.getWorkspaceIdFromItemsUrl(location.href);
  var inWorkspace = !!workspaceId;
  var workspaceLinks = inWorkspace && typeof FM.getWorkspaceQuicklinks === "function" ? FM.getWorkspaceQuicklinks(workspaceId) : [];
  var rect = anchorButton.getBoundingClientRect();

  var popup = document.createElement("div");
  popup.id = "fm-ws-quicklinks-popup";
  popup.className = "fm-ws-quicklinks-popup";

  var list = document.createElement("div");
  list.className = "fm-ws-quicklinks-popup-list";

  if (workspaceLinks.length > 0) {
    workspaceLinks.forEach(function (item) {
      var a = document.createElement("a");
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "fm-ws-quicklinks-popup-link";
      var icon = document.createElement("span");
      icon.className = "material-icons fm-ws-quicklinks-popup-icon";
      icon.textContent = item.icon;
      a.appendChild(icon);
      a.appendChild(document.createTextNode(item.title));
      list.appendChild(a);
    });
  } else {
    var emptyEl = document.createElement("p");
    emptyEl.className = "fm-ws-quicklinks-popup-empty";
    emptyEl.textContent = inWorkspace ? "No quicklinks for this workspace" : "Open a workspace to see quicklinks";
    list.appendChild(emptyEl);
  }

  popup.appendChild(list);

  document.body.appendChild(popup);

  var popupRect = popup.getBoundingClientRect();
  popup.style.left = (rect.right - popupRect.width + 16) + "px";
  popup.style.top = (rect.bottom + 8) + "px";

  var closeHandler = function (e) {
    if (!e || !e.target) return;
    if (popup.contains(e.target) || anchorButton.contains(e.target)) return;
    FM._fmQuicklinksPopupClose(popup, closeHandler);
  };
  popup._fmCloseHandler = closeHandler;

  document.addEventListener("click", closeHandler, true);
  document.addEventListener("scroll", closeHandler, true);
};

/** Ensures the Admin Shortcuts dropdown when in a workspace; fills menu immediately so it's ready when opened. Rebuilds menu only when workspace changes. */
FM.ensureAdminShortcutsDropdown = function (container, insertAfterLi) {
  var workspaceId = FM.getWorkspaceIdFromAdminUrl(location.href);
  if (!workspaceId || !container || !insertAfterLi) return null;

  var existing = document.getElementById("fm-admin-shortcuts-dropdown");
  var li = existing ? existing.closest("li") : null;

  if (!li) {
    li = document.createElement("li");
    li.className = "drop_down nav_item with_separator fm-shortcut-item";
    li.setAttribute("tabindex", "0");
    var span = document.createElement("span");
    span.id = "fm-admin-shortcuts-dropdown";
    span.className = "menu_title";
    span.textContent = "Admin Shortcuts";
    li.appendChild(span);
    var ul = document.createElement("ul");
    li.appendChild(ul);
    container.insertBefore(li, insertAfterLi.nextSibling);

    span.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var parent = li.parentElement;
      var prev = li.previousElementSibling;
      if (parent && prev) FM.ensureAdminShortcutsDropdown(parent, prev);
      li.classList.toggle("fm-dropdown-open");
    });
    if (!FM._fmAdminShortcutsCloseBound) {
      FM._fmAdminShortcutsCloseBound = true;
      document.addEventListener("click", function (e) {
        var openLi = document.querySelector("li.fm-shortcut-item.fm-dropdown-open");
        if (openLi && !openLi.contains(e.target)) openLi.classList.remove("fm-dropdown-open");
      });
    }
  }

  var ul = li.querySelector("ul");
  if (!ul) return li;

  /* Only rebuild menu when workspace changed; otherwise the dropdown is re-rendered every tick and disappears on hover/click */
  var lastWorkspaceId = li.getAttribute("data-fm-workspace-id");
  if (lastWorkspaceId === (workspaceId || "")) return li;
  li.setAttribute("data-fm-workspace-id", workspaceId || "");

  ul.innerHTML = "";

  function addMenuItem(href, label, title) {
    var itemLi = document.createElement("li");
    itemLi.className = "menuitem";
    var a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = label;
    if (title) a.title = title;
    itemLi.appendChild(a);
    ul.appendChild(itemLi);
  }

  addMenuItem(FM.buildWorkspaceItemsUrl(workspaceId), "Open Workspace", "Go to workspace");
  addMenuItem(FM.buildWorkspaceAddItemUrl(workspaceId), "Create New Item", "Create new dataset");

  var dividerLi = document.createElement("li");
  dividerLi.className = "fm-admin-shortcuts-divider";
  dividerLi.setAttribute("role", "separator");
  ul.appendChild(dividerLi);

  var workspaceLinks = typeof FM.getWorkspaceQuicklinks === "function" ? FM.getWorkspaceQuicklinks(workspaceId) : [];
  workspaceLinks.forEach(function (item) {
    addMenuItem(item.url, item.title, item.title);
  });

  return li;
};

FM.setupShortcutsDelegation = function () {
  const container = FM.getOrCreateButtonsContainer();
  if (FM._fmPointerHandler) {
    document.removeEventListener("pointerdown", FM._fmPointerHandler, true);
  }
  FM._fmPointerHandler = function (evt) {
    var actionEl = (evt.target.closest && evt.target.closest(".fm-btn")) || (evt.target.closest && evt.target.closest("[data-fm-action]"));
    if (!actionEl || !actionEl.getAttribute("data-fm-action")) return;
    var inShortcuts = container && container.contains(actionEl);
    var inCommandBar = document.getElementById("command-bar-react") && document.getElementById("command-bar-react").contains(actionEl);
    var wrapperBtnsEl = document.getElementById("itemviewer-wrapper-buttons");
    var inItemviewerBar = wrapperBtnsEl && wrapperBtnsEl.contains(actionEl);
    if (!inShortcuts && !inCommandBar && !inItemviewerBar) return;
    evt.stopPropagation();
    evt.preventDefault();
    const action = actionEl.getAttribute("data-fm-action");
    switch (action) {
      case "openWorkspaceManager":
        window.open(FM.buildWorkspaceManagerUrl(), "_blank", "noopener,noreferrer");
        break;
      case "openScripts":
        window.open(FM.buildScriptsUrl(), "_blank", "noopener,noreferrer");
        break;
      case "openRoles":
        window.open(FM.buildRolesUrl(), "_blank", "noopener,noreferrer");
        break;
      case "openWorkspaceItems":
        var wsId = FM.getWorkspaceIdFromAdminUrl(location.href);
        if (wsId) window.open(FM.buildWorkspaceItemsUrl(wsId), "_blank", "noopener,noreferrer");
        break;
      case "openWorkspaceAddItem":
        var wsIdAdd = FM.getWorkspaceIdFromAdminUrl(location.href);
        if (wsIdAdd) window.open(FM.buildWorkspaceAddItemUrl(wsIdAdd), "_blank", "noopener,noreferrer");
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
      case "openSettingsShortcuts":
        FM.showSettingsShortcutsPopup(actionEl);
        break;
      case "openWorkspaceQuicklinks":
        FM.showWorkspaceQuicklinksPopup(actionEl);
        break;
      default:
    }
  };
  document.addEventListener("pointerdown", FM._fmPointerHandler, { capture: true, passive: false });
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
        }).catch(function () { });
      }
    }, true);
  }
};

FM.ensurePlacement = function () {
  const container = FM.getOrCreateButtonsContainer();
  if (FM.isAdminUi()) {
    if (container) return true;
    return false;
  }
  if (!container) return false;
  const searchEl = document.getElementById("fusion-header-search");
  if (searchEl) {
    const parent = searchEl.parentElement;
    var nextSib = searchEl.nextSibling;
    if (container.parentElement !== parent || container.previousSibling !== searchEl) {
      parent.insertBefore(container, nextSib);
    }
    if (!container.classList.contains("fm-shortcuts-in-header")) {
      container.classList.add("fm-shortcuts-in-header");
    }
    return true;
  }
  container.classList.remove("fm-shortcuts-in-header");
  return false;
};

FM.ensureButtonsPresent = function () {
  const container = FM.getOrCreateButtonsContainer();
  if (!container || !container.parentElement) return;
  function ensureButton(id, props) {
    if (!document.getElementById(id)) {
      const btn = FM.createIconButton(props);
      container.appendChild(btn);
    }
  }
  var onItemDetailsPage = FM.isOnFrontendItemDetailsPage(location.href);
  if (!FM.isAdminUi()) {
    var adminSlot = document.getElementById("fm-shortcuts-admin-slot");
    if (!adminSlot) {
      adminSlot = document.createElement("div");
      adminSlot.id = "fm-shortcuts-admin-slot";
      adminSlot.className = "fm-shortcuts-admin-slot";
      container.insertBefore(adminSlot, container.firstChild);
    }
    var wrapperBtns = document.getElementById("itemviewer-wrapper-buttons");
    var inWorkspaceView = !!FM.getWorkspaceIdFromItemsUrl(location.href);
    var showAdminShortcut = wrapperBtns || inWorkspaceView;
    var activityBtn = document.getElementById("fm-btn-activity-quicklinks");
    if (showAdminShortcut) {
      if (!activityBtn) {
        activityBtn = FM.createIconButton({ id: "fm-btn-activity-quicklinks", icon: "apps", title: "Admin shortcuts", action: "openWorkspaceQuicklinks" });
      }
      if (activityBtn.parentNode !== adminSlot) {
        adminSlot.appendChild(activityBtn);
      }
    } else {
      if (activityBtn && activityBtn.parentNode) activityBtn.parentNode.removeChild(activityBtn);
    }
    var settingsBtn = document.getElementById("fm-btn-ws-quicklinks");
    var insertAfterSlot = adminSlot.nextSibling;
    if (!settingsBtn) {
      settingsBtn = FM.createIconButton({ id: "fm-btn-ws-quicklinks", icon: "settings", title: "Settings shortcuts", action: "openSettingsShortcuts" });
      container.insertBefore(settingsBtn, insertAfterSlot);
    } else if (settingsBtn.parentNode !== container || settingsBtn.previousSibling !== adminSlot) {
      container.insertBefore(settingsBtn, insertAfterSlot);
    }
    var wrapper = document.getElementById("fm-itemviewer-actions");
    var activityWrapper = document.getElementById("fm-itemviewer-activity-quicklinks");
    if (wrapperBtns) {
      if (onItemDetailsPage) {
        if (!wrapper) {
          wrapper = document.createElement("div");
          wrapper.id = "fm-itemviewer-actions";
          wrapper.className = "fm-itemviewer-actions";
          var partToggle = document.createElement("div");
          partToggle.className = "fm-itemviewer-actions-part fm-itemviewer-actions-toggle";
          wrapper.appendChild(partToggle);
        }
        var partToggleEl = wrapper.querySelector(".fm-itemviewer-actions-toggle");
        var itemDetailsBtn = document.getElementById("fm-btn-itemdetails-admin");
        if (!itemDetailsBtn) {
          itemDetailsBtn = FM.createAdminModeToggle();
        }
        if (itemDetailsBtn.parentNode !== partToggleEl) {
          partToggleEl.appendChild(itemDetailsBtn);
        }
        if (wrapper.parentNode !== wrapperBtns || wrapper !== wrapperBtns.firstChild) {
          wrapperBtns.insertBefore(wrapper, wrapperBtns.firstChild);
        }
      } else {
        var adminBtn = document.getElementById("fm-btn-itemdetails-admin");
        if (adminBtn) adminBtn.remove();
        if (wrapper && wrapper.parentNode) wrapper.remove();
      }
    } else {
      var adminBtn = document.getElementById("fm-btn-itemdetails-admin");
      if (adminBtn) adminBtn.remove();
      if (wrapper && wrapper.parentNode) wrapper.remove();
      if (activityWrapper && activityWrapper.parentNode) activityWrapper.remove();
    }
  } else {
    var itemDetailsBtnEl = document.getElementById("fm-btn-itemdetails-admin");
    if (itemDetailsBtnEl) itemDetailsBtnEl.remove();
    var wsQlBtnEl = document.getElementById("fm-btn-ws-quicklinks");
    if (wsQlBtnEl) wsQlBtnEl.remove();
    var activityBtnEl = document.getElementById("fm-btn-activity-quicklinks");
    if (activityBtnEl && activityBtnEl.parentNode) activityBtnEl.parentNode.remove();
  }
  if (FM.isAdminUi()) {
    var adminLi = container.querySelector("li.drop_down.nav_item.with_separator.systemlink-admin");
    if (!adminLi) return;
    function ensureShortcutLi(id, props, insertAfter) {
      var existing = document.getElementById(id);
      if (existing) return existing.closest("li") || null;
      var li = FM.createShortcutLi({ id: id, label: props.label, title: props.title, action: props.action });
      container.insertBefore(li, insertAfter ? insertAfter.nextSibling : null);
      return li;
    }
    var after = adminLi;
    after = ensureShortcutLi("fm-btn-workspace-manager", { label: "Workspace Manager", title: "Workspace Manager", action: "openWorkspaceManager" }, after) || document.getElementById("fm-btn-workspace-manager").closest("li");
    after = ensureShortcutLi("fm-btn-scripts", { label: "Scripts", title: "Scripts", action: "openScripts" }, after) || document.getElementById("fm-btn-scripts").closest("li");
    after = ensureShortcutLi("fm-btn-roles", { label: "Roles", title: "Roles", action: "openRoles" }, after) || document.getElementById("fm-btn-roles").closest("li");
    var inWorkspaceAdmin = !!FM.getWorkspaceIdFromAdminUrl(location.href);
    if (inWorkspaceAdmin) {
      after = FM.ensureAdminShortcutsDropdown(container, after) || (document.getElementById("fm-admin-shortcuts-dropdown") && document.getElementById("fm-admin-shortcuts-dropdown").closest("li"));
    } else {
      var adminShortcutsLi = document.getElementById("fm-admin-shortcuts-dropdown") && document.getElementById("fm-admin-shortcuts-dropdown").closest("li");
      if (adminShortcutsLi && adminShortcutsLi.parentNode) adminShortcutsLi.remove();
    }
  } else {
    var nav = document.getElementById("global_navigation");
    if (nav) {
      nav.querySelectorAll("li.fm-shortcut-item").forEach(function (li) { li.remove(); });
    }
    FM.updateItemDetailsAdminButtonState();
  }
};

FM.initShortcuts = function () {
  FM.getOrCreateButtonsContainer();
  FM.ensurePlacement();
  FM.ensureButtonsPresent();
  FM.setupShortcutsDelegation();
  if (FM._shortcutsObserver) {
    try { FM._shortcutsObserver.disconnect(); } catch (e) { }
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
  if (document.body) observeTargets.push(document.body);
  observeTargets.forEach(function (t) {
    try {
      FM._shortcutsObserver.observe(t, { childList: true, subtree: true });
    } catch (e) { }
  });
  window.addEventListener("popstate", function () { setTimeout(function () { FM.ensurePlacement(); FM.ensureButtonsPresent(); }, 80); });
  window.addEventListener("hashchange", function () { setTimeout(function () { FM.ensurePlacement(); FM.ensureButtonsPresent(); }, 80); });
};

