# feature-workspace.md

**World:** ISOLATED

**Purpose:** Enhances the Workspace Manager admin UI in two distinct contexts, implemented as two separate IIFEs sharing a module-level `FM.ADMIN_ITEM_PATH_MAP` (maps Dojo `data-ds-item` keys to admin URL path suffixes). The first IIFE adds "Open" (open_in_new) buttons next to links in the legacy Dojo workspace settings table. The second injects a bar of admin quicklink "pill" icons (and a workspace-ID badge) into each row of the new MUI DataGrid workspace list, and exposes `FM.getWorkspaceQuicklinks` consumed by feature-buttons popups.

## Responsibilities

**Open-in-new-tab (legacy Dojo table):**
- Detect the legacy workspace settings table (`td.workspaceEditButtons` + `a[data-ds-item="workspaceedit"]`).
- Resolve a target URL for each eligible link by deriving the workspace ID and `data-ds-item`, then building an admin hash URL (or falling back to `data-ds-path`, or a workflow editor URL for `showWorkflowModal` onclicks).
- Wrap each anchor and append an "Open" button that opens via `FM.openUrlWithEvent` (honoring middle-click / shift for new tab); disabled when no URL resolves.
- Re-inject on Dojo re-renders via a MutationObserver.

**MUI DataGrid shortcuts:**
- For each `.workspace-row[data-id^="workspace-"]`, inject a slot of pill links (Workspace Settings, Item Details, Descriptor, Grid, Managed Items, BOM, Sourcing, Relationships, Tab Names, Behaviors, Workflow Editor) before the row's actions cell.
- Inject a workspace-ID badge before the workspace title.
- Set the name column width once (900px) so it does not fight user resizing.

## Key functions / API

- `FM.ADMIN_ITEM_PATH_MAP` — shared map of `data-ds-item` → admin path suffix.
- `FM.runWorkspaceManagerOpenInNewTab()` — tick entry for the legacy-table Open buttons.
- `FM.runWorkspaceManagerShortcutsTick()` — tick entry for DataGrid pills + ID badges + name-column width.
- `FM.getWorkspaceQuicklinks(workspaceId)` — returns `[{url, icon, title}]` for a workspace; used by feature-buttons popups.
- `FM.workspaceOpenInNewTab` — boolean set true once the legacy feature runs.
- (Internal) `extractWorkspaceIdFromUrl`, `getWorkspaceIdForAnchor`, `getWorkspaceIdFromContextFallback`, `resolveTargetUrl`, `buildAdminHashUrl`, `ensureWrap`, `addOpenButtonNextTo`, `injectButtons`, `observeRerenders` (IIFE 1); `getAllCompactTargets`, `extractWorkspaceIdFromRow`, `buildShortcutBar`, `ensureWorkspaceIdBadge`, `injectShortcutsIntoRow`, `injectAll`, `injectIdBadgesAll`, `applyNameColumnWidthOnce`, `isFeatureEnabled` (IIFE 2).

## Interactions

- **Tick loop:** `bootstrap.js` `mainTick()` calls `FM.runWorkspaceManagerOpenInNewTab?.()` (`safeRun "runWorkspaceManagerOpenInNewTab"`) and `FM.runWorkspaceManagerShortcutsTick?.()` (`safeRun "workspaceManagerShortcuts"`), both gated on `FM.isEnabled("enabledOther")`.
- **Feature flag:** the DataGrid shortcuts (pills + width) additionally check `FM.isEnabled("enabledWorkspaceShortcuts")`; if disabled, only the ID badges are still injected. The legacy Open-button feature has no per-feature flag (only the `enabledOther` group gate).
- **Consumed by:** feature-buttons.js calls `FM.getWorkspaceQuicklinks` for its workspace and admin shortcut popups.
- **External FM helpers:** `FM.openUrlWithEvent` (falls back to `window.open`/`location.assign` if absent), `FM.isEnabled`.
- **DOM:** legacy — `#layoutContainer` (root, falls back to body), `td.workspaceEditButtons`, `a.link[data-ds-path]`, `a.workspacewarning`, `a[onclick*="workflowEditorActions"]`; MUI — `.workspace-row[data-id^="workspace-"]`, `.workspace-name-cell`, `.workspace-title`, `.MuiDataGrid-actionsCell`, `.MuiDataGrid-columnHeader[data-field="name"]`, `.MuiDataGrid-cell[data-field="name"]`.
- **Markers / dataset flags:** `data-fm-newtab-injected` (`anchor.dataset.fmNewtabInjected`), `data-fm-observer-newtab`, `data-fm-ws-quicklinks`, `data-fm-ws-links-slot`, `data-fm-ws-width-applied`.

## Notes

- Workspace ID resolution is multi-strategy and order-sensitive: `data-ds-path` query/`params` JSON → ancestor `data-*workspaceid*` attributes → a `.fm-ws-id-badge` sibling → page URL / any matching anchor fallback. The badge injected by the DataGrid feature can thus feed the legacy resolver.
- `applyNameColumnWidthOnce` deliberately sets width only once per fresh DOM node (guarded by `data-fm-ws-width-applied`) so users can resize without the tick reverting it; header uses `style.width`, cells use the `--width` CSS variable.
- ID badges are injected unconditionally (even when `enabledWorkspaceShortcuts` is off) because other features rely on them.
- The Open-button feature skips anchors in `.workspaceEditButtons` cells and image-only/icon links; `print` and `advprint` quicklinks are intentionally commented out of `LINK_DEFS`.
- Both IIFEs define their own local `buildAdminHashUrl`; some callers pass extra args (`metaType`, etc.) that the builder ignores — only `item` and `workspaceID` affect the result.
- Errors are caught and logged via `console.warn("[FM] ...")` inside each tick entry, independent of `FM.safeRun`.
