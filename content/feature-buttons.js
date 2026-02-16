window.FM = window.FM || {};

FM.isAdminUi = function () {
  return location.href.includes("autodeskplm360.net/admin");
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

FM._fmPointerHandler = null;

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
      case "openWorkspace":
        window.open(FM.buildWorkspaceAdminUrl(location.href), "_blank", "noopener,noreferrer");
        break;
      case "openScripts":
        window.open(FM.buildScriptsUrl(), "_blank", "noopener,noreferrer");
        break;
      case "openRoles":
        window.open(FM.buildRolesUrl(), "_blank", "noopener,noreferrer");
        break;
      case "openWorkflow":
        if (!FM.isWorkspaceContext(location.href)) return;
        window.open(FM.buildWorkflowUrl(location.href), "_blank", "noopener,noreferrer");
        break;
      default:
    }
  };
  container.addEventListener("pointerdown", FM._fmPointerHandler, { passive: false });
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
  ensureButton("fm-btn-ws", { id: "fm-btn-ws", icon: "settings", title: "Workspace Settings", action: "openWorkspace" });
  ensureButton("fm-btn-scripts", { id: "fm-btn-scripts", icon: "code", title: "Scripts", action: "openScripts" });
  ensureButton("fm-btn-roles", { id: "fm-btn-roles", icon: "group", title: "Roles", action: "openRoles" });
  if (!FM.isAdminUi()) {
    ensureButton("fm-btn-workflow", { id: "fm-btn-workflow", icon: "schema", title: "Workflow Editor", action: "openWorkflow" });
    FM.updateWorkflowButtonState();
  } else {
    const wf = document.getElementById("fm-btn-workflow");
    if (wf) wf.remove();
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

