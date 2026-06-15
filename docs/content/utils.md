# utils.js

**World:** ISOLATED

**Purpose:** Shared, dependency-free helper library attached to the global `FM` object. It provides asset injection, tenant/URL detection predicates, theme detection and propagation, navigation helpers, and the `FM.safeRun` error wrapper used throughout the extension. Loaded early so other content scripts can rely on these helpers.

## Responsibilities

- Ensure the global `FM` namespace exists.
- Inject the Google Material Icons stylesheet (idempotently).
- Provide tenant-name / subdomain extraction from `location.hostname`.
- Provide URL/page-context predicates (workspace, item details, grid, scripts tab, field-id toggle pages).
- Provide a shared `FM.safeRun` try/catch wrapper.
- Detect the Fusion Manage chrome theme and push it onto the DOM as a data attribute for CSS.
- Provide event-aware URL opening (current tab vs new tab on middle/shift-click or forced).

## Key functions / API

- `FM.injectMaterialIcons()` — appends a `<link id="fm-material-icons">` to `document.head`; no-op if already present.
- `FM.tenantNameFromLocation()` — first label of `location.hostname`.
- `FM.tenantSubdomainForSnippetsUi()` — subdomain only when host contains `autodeskplm360.net`; returns `""` otherwise (e.g. on the extension options page); guarded by try/catch.
- `FM.isWorkspaceContext(url)` — matches `/plm/workspaces/<id>`.
- `FM.isOnFrontendItemDetailsPage(url)` — matches `.../plm/workspaces/<id>/items/itemDetails`.
- `FM.isOnFrontendGridPage(url)` — matches `.../plm/workspaces/<id>/items/grid` with a `tab=grid` query/hash.
- `FM.isOnFieldIdTogglePage(url)` — true on item details OR grid pages.
- `FM.isOnScriptsTab()` — true when `location.href` includes `tab=scripts`.
- `FM.safeRun(name, fn)` — runs `fn` in try/catch, logging `[FM] Feature failed: <name>` on error.
- `FM.getFusionManageChromeTheme()` — returns `"dark"` if `[data-testid="svg-sun"]` present, `"light"` if `[data-testid="svg-moon"]` present, else defaults to `"light"`.
- `FM.applyFusionManageThemeToDocument()` — sets `data-fm-manage-theme` on `document.documentElement` and `#fm-shortcuts`; idempotent per value; returns the theme.
- `FM.isNewTabIntentEvent(evt)` — true for middle click (`button === 1`) or `shiftKey`.
- `FM.openUrlWithEvent(url, evt, opts)` — opens in new tab if `opts.forceNewTab` or new-tab intent, else navigates current tab via `window.location.assign`.

## Interactions

- **DOM (read):** `document.querySelector('[data-testid="svg-sun"]' / 'svg-moon')` for theme; `#fm-shortcuts` element.
- **DOM (write):** `data-fm-manage-theme` attribute on `<html>` and `#fm-shortcuts`; injected `<link>` in `<head>`.
- **Browser:** `location.hostname` / `location.href`; `window.open`, `window.location.assign`.
- **Globals:** defines helpers on `FM`; `FM.safeRun` and `FM.injectMaterialIcons` are also referenced/called by `bootstrap.js`.
- No `chrome.storage`, custom events, or postMessage usage.

## Notes

- `FM.safeRun` is defined both here and (guarded) in `bootstrap.js`; load order determines which wins, but they are behaviorally identical.
- Theme detection relies on header chrome icons that may be absent inside SPA/iframe contexts — it then defaults to `"light"`.
- Page predicates are regex-based against full URLs; callers must pass the URL string (most accept `url` as a parameter rather than reading `location` themselves).
- `tenantSubdomainForSnippetsUi` returns empty string off-tenant by design (used by snippet UI to know it isn't on a PLM origin).
