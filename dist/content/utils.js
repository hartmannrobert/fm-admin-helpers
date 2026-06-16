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
};

/**
 * Subdomain used in Fusion Manage URLs (e.g. "acme" from acme.autodeskplm360.net).
 * Empty when not on an *.autodeskplm360.net page (e.g. extension options).
 */
FM.tenantSubdomainForSnippetsUi = function () {
  try {
    var h = typeof location !== "undefined" && location.hostname ? String(location.hostname) : "";
    if (!h || h.indexOf("autodeskplm360.net") < 0) return "";
    var part = h.split(".")[0];
    return part ? part : "";
  } catch (e) {
    return "";
  }
};

FM.isWorkspaceContext = function(url) {
    return /\/plm\/workspaces\/\d+/.test(url);
};

/** True when on frontend item details page (not admin). Workspace ID may vary. */
FM.isOnFrontendItemDetailsPage = function(url) {
  return typeof url === "string" && /autodeskplm360\.net\/plm\/workspaces\/\d+\/items\/itemDetails/.test(url);
};

/** True when on frontend workspace items grid page (e.g. /plm/workspaces/57/items/grid?tab=grid). */
FM.isOnFrontendGridPage = function(url) {
  if (typeof url !== "string") return false;
  return /autodeskplm360\.net\/plm\/workspaces\/\d+\/items\/grid(\?|$|#)/i.test(url) &&
         /[?&]tab=grid(&|$|#)/i.test(url);
};

/** True when the current page should host the FieldID toggle (item details or grid). */
FM.isOnFieldIdTogglePage = function(url) {
  return FM.isOnFrontendItemDetailsPage(url) || FM.isOnFrontendGridPage(url);
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
 * Open URL respecting the global fmLinkOpenMode setting (same / new / split).
 * Middle/shift-click modifiers always win and force a new tab.
 * Split mode messages the background service worker to use Chrome's native split-tab API.
 */
FM.openUrl = function (url) {
  if (!url) return;
  var mode = (FM.config && FM.config.fmLinkOpenMode) || "same";
  if (mode === "new") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
window.location.assign(url);
};

/**
 * Open URL with event-aware behavior:
 * - middle/shift: always new tab (browser modifier convention)
 * - otherwise: delegates to FM.openUrl which respects fmLinkOpenMode
 * - forceNewTab opt: always new tab regardless of mode
 */
FM.openUrlWithEvent = function (url, evt, opts) {
  if (!url) return;
  var forceNewTab = !!(opts && opts.forceNewTab);
  if (forceNewTab || FM.isNewTabIntentEvent(evt)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  FM.openUrl(url);
};

