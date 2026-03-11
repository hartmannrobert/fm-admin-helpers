/**
 * Sets document.title on Fusion Manage admin pages so browser tabs show
 * meaningful names (e.g. "Scripts - Fusion Manage", "Audits - Relationship").
 */
(function () {
  window.FM = window.FM || {};

  const SUFFIX = " - Fusion Manage";

  /** Item key (from URL) -> short label for tab title (workspace sub-pages). */
  const ITEM_LABELS = {
    relationship: "Relationship",
    tabsedit: "Tab Names",
    itemdetails: "Item Details",
    descriptor: "Descriptor",
    grid: "Grid",
    workflowitems: "Managed Items",
    bom: "Bill of Materials",
    sourcing: "Sourcing",
    behavior: "Behaviors",
    workspaceedit: "Workspace Settings",
    printview: "Print Views",
    advancedPrintViewList: "Advanced Print Views"
  };

  function isOnAdmin() {
    const href = String(location.href || "");
    return href.includes("autodeskplm360.net") && href.includes("/admin");
  }

  function getHashParams() {
    const hash = String(location.hash || "").replace(/^#/, "");
    const out = {};
    hash.split("&").forEach((pair) => {
      const i = pair.indexOf("=");
      if (i === -1) return;
      const key = decodeURIComponent(pair.slice(0, i).trim());
      const value = decodeURIComponent(pair.slice(i + 1).trim());
      out[key] = value;
    });
    return out;
  }

  function getItemLabel(itemKey) {
    if (!itemKey) return "";
    const lower = String(itemKey).toLowerCase();
    if (ITEM_LABELS[lower] !== undefined) return ITEM_LABELS[lower];
    return itemKey.charAt(0).toUpperCase() + itemKey.slice(1);
  }

  /** Workspace name from DOM: #itemdetails.workspacerow .rowbody h4 */
  function getWorkspaceNameFromDom() {
    const el = document.querySelector("#itemdetails.workspacerow .rowbody h4");
    if (!el) return "";
    const text = (el.textContent || "").trim();
    return text;
  }

  function applyAdminTabTitle() {
    if (!isOnAdmin()) return;

    const doc = window.top && window.top.document ? window.top.document : document;
    const params = getHashParams();

    const section = params.section || "";
    const tab = params.tab || "";
    const item = params.item || "";

    // Workspace admin sub-page: section=setuphome&tab=workspaces&item=...
    if (section === "setuphome" && tab === "workspaces" && item) {
      const workspaceName = getWorkspaceNameFromDom();
      const itemLabel = getItemLabel(item);
      const part2 = itemLabel ? ` - ${itemLabel}` : "";
      const title = workspaceName ? `${workspaceName}${part2}${SUFFIX}` : `Workspace${part2}${SUFFIX}`;
      doc.title = title;
      return;
    }

    // Top-level admin tabs (no item or item not in URL)
    if (section === "setuphome" && tab === "workspaces") {
      doc.title = "Workspace Manager" + SUFFIX;
      return;
    }
    if (section === "setuphome" && tab === "scripts") {
      doc.title = "Scripts" + SUFFIX;
      return;
    }
    if (section === "adminusers" && tab === "roles") {
      doc.title = "Roles" + SUFFIX;
      return;
    }
    if (section === "adminusers" && tab === "users") {
      doc.title = "Users" + SUFFIX;
      return;
    }
    if (section === "adminusers" && tab === "groups") {
      doc.title = "Groups" + SUFFIX;
      return;
    }
  }

  FM.applyAdminTabTitle = applyAdminTabTitle;
})();
