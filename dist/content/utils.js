window.FM = window.FM || {};


 FM.injectMaterialIcons = function() {
    if (document.getElementById("fm-material-icons")) return;
  
    const link = document.createElement("link");
    link.id = "fm-material-icons";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/icon?family=Material+Icons";
    document.head.appendChild(link);
  }


FM.tenantNameFromLocation = function() {
    return location.hostname.split(".")[0];
}

FM.isWorkspaceContext = function(url) {
    return /\/plm\/workspaces\/\d+/.test(url);
};

/** True when on frontend item details page (not admin). Workspace ID may vary. */
FM.isOnFrontendItemDetailsPage = function(url) {
  return typeof url === "string" && /autodeskplm360\.net\/plm\/workspaces\/\d+\/items\/itemDetails/.test(url);
};

FM.isOnScriptsTab = function() {
    return location.href.includes("tab=scripts");
}


FM.safeRun = function (name, fn) {
  try {
    fn();
  } catch (e) {
    console.warn(`[FM] Feature failed: ${name}`, e);
  }
};

/**
 * Fusion Manage theme as reflected in the header chrome: dark mode shows the sun control
 * ([data-testid="svg-sun"]), light mode shows the moon ([data-testid="svg-moon"]).
 * Returns "dark" | "light". Defaults to "light" when indicators are missing (SPA / iframe).
 */
FM.getFusionManageChromeTheme = function () {
  if (typeof document === "undefined" || !document.querySelector) {
    return "light";
  }
  if (document.querySelector('[data-testid="svg-sun"]')) {
    return "dark";
  }
  if (document.querySelector('[data-testid="svg-moon"]')) {
    return "light";
  }
  return "light";
};

/**
 * Pushes theme to `document.documentElement` and `#fm-shortcuts` as `data-fm-manage-theme`
 * for CSS. Idempotent per value. Call from the existing shortcuts observer debounce so theme
 * switches do not add a separate MutationObserver.
 */
FM.applyFusionManageThemeToDocument = function () {
  if (typeof document === "undefined") {
    return "light";
  }
  var theme = FM.getFusionManageChromeTheme();
  var attr = "data-fm-manage-theme";
  var root = document.documentElement;
  if (root && root.getAttribute(attr) !== theme) {
    root.setAttribute(attr, theme);
  }
  var shortcuts = document.getElementById("fm-shortcuts");
  if (shortcuts && shortcuts.getAttribute(attr) !== theme) {
    shortcuts.setAttribute(attr, theme);
  }
  return theme;
};

/** Browser-like alternate open intent for non-anchor controls. */
FM.isNewTabIntentEvent = function (evt) {
  if (!evt) return false;
  // Requested behavior: middle click or Shift+click should open in a new tab.
  return evt.button === 1 || evt.shiftKey === true;
};

/**
 * Open URL with event-aware behavior:
 * - default: current tab
 * - middle/shift: new tab
 * - forceNewTab: always new tab (used by Settings/Admin shortcuts)
 */
FM.openUrlWithEvent = function (url, evt, opts) {
  if (!url) return;
  var forceNewTab = !!(opts && opts.forceNewTab);
  var openInNewTab = forceNewTab || FM.isNewTabIntentEvent(evt);
  if (openInNewTab) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(url);
};

