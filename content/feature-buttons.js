window.FM = window.FM || {};

// --- Local helpers (private to this file) ---
FM.getOrCreateButtonsContainer = function () {
  const existing = document.getElementById("fm-shortcuts");
  if (existing) return existing;

  const container = document.createElement("div");
  container.id = "fm-shortcuts";
  container.style.display = "inline-flex";
  container.style.alignItems = "center";
  container.style.gap = "6px";
  container.style.marginRight = "10px";
  return container;
};

FM.insertContainerBeforeHeaderRight = function (container) {
  const right = document.getElementById("fusion-header-search"); // your anchor
  if (!right) return false;

  const parent = right.parentElement;
  if (!parent) return false;

  if (container.parentElement !== parent) {
    parent.insertBefore(container, right);
  }
  return true;
};

FM.createIconButton = function ({ id, icon, label, title, onClick }) {
  const btn = document.createElement("button");
  btn.id = id;
  btn.className = "fm-btn";
  btn.title = title || "";

  const iconEl = document.createElement("span");
  iconEl.className = "material-icons";
  iconEl.textContent = icon;
  btn.appendChild(iconEl);

  if (label) {
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    btn.appendChild(labelEl);
  }

  btn.addEventListener("click", onClick);
  return btn;
};

// --- URL builders (depend on FM.tenantNameFromLocation from utils.js) ---
FM.buildWorkspaceAdminUrl = function (currentUrl) {
  const tenant = FM.tenantNameFromLocation();
  let workspaceURL = `https://${tenant}.autodeskplm360.net/admin#section=setuphome&tab=workspaces`;

  const gridMatch = currentUrl.match(/\/plm\/workspaces\/(\d+)\/items\/grid/);
  const bomMatch = currentUrl.match(/\/plm\/workspaces\/(\d+)\/items\/bom/);
  const wsMatch = currentUrl.match(/\/plm\/workspaces\/(\d+)\/items/);

  if (gridMatch) {
    const workspaceID = gridMatch[1];
    workspaceURL = `https://${tenant}.autodeskplm360.net/admin#section=setuphome&tab=workspaces&item=grid&params=${encodeURIComponent(
      JSON.stringify({ workspaceID: String(workspaceID), metaType: "G" })
    )}`;
  } else if (bomMatch) {
    const workspaceID = bomMatch[1];
    workspaceURL = `https://${tenant}.autodeskplm360.net/admin#section=setuphome&tab=workspaces&item=bom&params=${encodeURIComponent(
      JSON.stringify({ workspaceID: String(workspaceID), metaType: "B" })
    )}`;
  } else if (wsMatch) {
    const workspaceID = wsMatch[1];
    workspaceURL = `https://${tenant}.autodeskplm360.net/admin#section=setuphome&tab=workspaces&item=itemdetails&params=${encodeURIComponent(
      JSON.stringify({ metaType: "D", workspaceID: String(workspaceID) })
    )}`;
  }

  return workspaceURL;
};

FM.buildScriptsUrl = function () {
  const tenant = FM.tenantNameFromLocation();
  return `https://${tenant}.autodeskplm360.net/admin#section=setuphome&tab=scripts`;
};

FM.buildRolesUrl = function () {
  const tenant = FM.tenantNameFromLocation();
  return `https://${tenant}.autodeskplm360.net/admin#section=adminusers&tab=roles`;
};

FM.buildWorkflowUrl = function (currentUrl) {
  const tenant = FM.tenantNameFromLocation();
  let url = `https://${tenant}.autodeskplm360.net/admin#section=setuphome&tab=workspaces`;

  const wsMatch = currentUrl.match(/\/plm\/workspaces\/(\d+)\/items/);
  if (wsMatch) {
    url = `https://${tenant}.autodeskplm360.net/workflowEditor.form?workspaceId=${wsMatch[1]}`;
  }
  return url;
};

// --- Exported feature entry points (called from bootstrap.js) ---
FM.updateWorkflowButtonState = function () {
  const btn = document.getElementById("fm-btn-workflow");
  if (!btn) return;

  const hasWorkspaceContext = FM.isWorkspaceContext(location.href);
  btn.classList.toggle("disabled", !hasWorkspaceContext);
  btn.title = hasWorkspaceContext ? "Workflow Editor" : "Workspace Context Needed";
};

FM.injectButtons = function () {
  // Make sure icons are available (your injectMaterialIcons should be in utils/bootstrap)
  const container = FM.getOrCreateButtonsContainer();
  const placed = FM.insertContainerBeforeHeaderRight(container);
  if (!placed) return;

  // avoid duplicates
  if (document.getElementById("fm-btn-ws")) {
    FM.updateWorkflowButtonState();
    return;
  }

  const btnWorkflow = FM.createIconButton({
    id: "fm-btn-workflow",
    icon: "schema",
    title: "Workflow Editor",
    onClick: () => {
      if (!FM.isWorkspaceContext(location.href)) return;
      window.open(FM.buildWorkflowUrl(location.href), "_blank", "noopener,noreferrer");
    }
  });

  const btnWS = FM.createIconButton({
    id: "fm-btn-ws",
    icon: "settings",
    title: "Workspace Settings",
    onClick: () => window.open(FM.buildWorkspaceAdminUrl(location.href), "_blank", "noopener,noreferrer")
  });

  const btnScripts = FM.createIconButton({
    id: "fm-btn-scripts",
    icon: "code",
    title: "Scripts",
    onClick: () => window.open(FM.buildScriptsUrl(), "_blank", "noopener,noreferrer")
  });

  const btnRoles = FM.createIconButton({
    id: "fm-btn-roles",
    icon: "group",
    title: "Roles",
    onClick: () => window.open(FM.buildRolesUrl(), "_blank", "noopener,noreferrer")
  });

  // Append ONCE in desired order
  container.appendChild(btnWS);
  container.appendChild(btnScripts);
  container.appendChild(btnRoles);
  container.appendChild(btnWorkflow);

  FM.updateWorkflowButtonState();
};
