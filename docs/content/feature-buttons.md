# feature-buttons.md

**World:** ISOLATED

**Purpose:** Injects the extension's shortcut UI into both the new Fusion header (after `#fusion-header-search`) and the legacy admin global navigation. It builds tenant-aware deep links (Workspace Manager, Scripts, Roles, Users, Groups, General Settings, Workflow Editor, workspace items/add-item), renders settings/quicklinks/admin-shortcut popups, and provides the "Toggle FieldID" admin-mode toggle that hides item-detail value cells and reveals their field identifiers. All functions are attached directly to the global `FM` object (no IIFE wrapper).

## Responsibilities

- Create and place a managed shortcuts container (`#fm-shortcuts`) in the Fusion header, or use the admin global nav `<ul>` when on the legacy admin UI.
- Build tenant-specific URLs for admin destinations, branching on whether the environment is "Fusion" (presence of `#fusion-header-fuison-link`) vs legacy.
- Render the Settings shortcuts popup (two columns: General Settings / Workspace Manager / Scripts and Users|Members / Groups / Roles), highlighting the current page.
- Render the Workspace quicklinks popup (apps icon) from `FM.getWorkspaceQuicklinks` when inside a workspace items view.
- Render the Admin Shortcuts dropdown/popup in the legacy nav when on an admin workspace-manager page, labeled "<workspace name> Shortcuts".
- Implement the "Toggle FieldID" admin-mode button: hide each item-detail value cell and inject a clickable field-ID span (click copies the field ID to clipboard); also works on `.plm-matrix` cells.
- Persist FieldID admin-mode in `sessionStorage` and re-apply it idempotently on each tick.
- Keep buttons present/placed across SPA navigation via a dedicated MutationObserver plus `popstate`/`hashchange` listeners.

## Key functions / API

- `FM.isAdminUi()` — true when URL contains `/admin` or `script.form?ID` (legacy admin).
- `FM.getOrCreateButtonsContainer()` — returns admin nav `<ul>` or the `#fm-shortcuts` container (creating it if needed).
- `FM.insertContainerAfterHeaderSearch(c)` / `FM.insertContainerIntoGlobalNavAfterAdminMenu(c)` — placement helpers.
- `FM.createIconButton({id,icon,label,title,action})` — builds a `.fm-btn` with a `data-fm-action`.
- `FM.createShortcutLi(...)` / `FM.createAdminModeToggle()` — legacy nav `<li>` link and the pill-style FieldID toggle button.
- `FM.buildWorkspaceManagerUrl/buildScriptsUrl/buildRolesUrl/buildUsersUrl/buildGroupsUrl/buildGeneralSettingsUrl/buildWorkspaceAdminUrl/buildWorkspaceItemsUrl/buildWorkspaceAddItemUrl/buildWorkflowUrl` — tenant-aware URL builders.
- `FM.isFusionEnvironment()` — detects Fusion vs legacy environment (drives Users/Groups/Roles URL shape).
- `FM.getWorkspaceIdFromItemsUrl(url)` / `FM.getWorkspaceIdFromAdminUrl(url)` — extract workspace ID from front-end items URLs and admin workspace-manager URLs.
- `FM.getItemDetailsAdminMode()` / `FM.setItemDetailsAdminMode(on)` — read/write the FieldID toggle in `sessionStorage`.
- `FM.fieldIdFromRowKey(rowKey)` — extracts trailing field ID from a `row-key`/`cell-key`.
- `FM.applyItemDetailsAdminMode()` / `FM.unapplyItemDetailsAdminMode()` / `FM.applyItemDetailsAdminModeIfActive()` — apply/restore field-ID overlay on item-detail rows and matrix cells.
- `FM.updateItemDetailsAdminButtonState()` / `FM.updateWorkflowButtonState()` — sync button enabled/active state with current page.
- `FM.getCurrentSettingsShortcut()` — which settings page is active (for popup highlight).
- `FM.showSettingsShortcutsPopup(anchor)` / `FM.showWorkspaceQuicklinksPopup(anchor)` / `FM.showAdminShortcutsPopup(anchor)` — body-level toggle popups (click again / outside / on navigation closes).
- `FM.ensureAdminShortcutsDropdown(container, insertAfterLi)` — builds/updates the legacy-nav admin shortcuts dropdown.
- `FM.setupShortcutsDelegation()` — single capturing `pointerdown` handler dispatching on `data-fm-action`; plus a one-time click handler for copy-field-ID.
- `FM.ensurePlacement()` / `FM.ensureButtonsPresent()` — idempotently place container and ensure correct buttons exist for the current page.
- `FM.initShortcuts()` — entry point called from the tick; wires placement, buttons, theme, delegation, observer, and history listeners.

## Interactions

- **Tick loop:** `bootstrap.js` `mainTick()` calls `FM.initShortcuts?.()` via `FM.safeRun("buttons", ...)` gated on `FM.isEnabled("enabledButtons")`. The FieldID overlay is also re-applied each tick via `FM.applyItemDetailsAdminModeIfActive` (gated on `enabledOther`).
- **External FM helpers (other files):** `FM.tenantNameFromLocation`, `FM.openUrlWithEvent`, `FM.isWorkspaceContext`, `FM.isOnFieldIdTogglePage`, `FM.isOnFrontendItemDetailsPage`, `FM.getWorkspaceNameFromDom`, `FM.getWorkspaceQuicklinks` (from feature-workspace.js), `FM.applyFusionManageThemeToDocument`, `FM.ensurePlacement` (self).
- **DOM anchors:** `#fusion-header-search`, `#fusion-header-right`, `#global_navigation` (`li.systemlink-admin`), `#command-bar-react`, `#itemviewer-wrapper-buttons`, `.item-details-render` rows, `.plm-matrix td[cell-key]`.
- **Storage:** `sessionStorage` key `fm-item-details-admin-mode`. Clipboard via `navigator.clipboard.writeText`.
- **Events:** capturing `pointerdown` for action dispatch; capturing `click` for field-ID copy; `popstate`/`hashchange` for re-placement; a `MutationObserver` (`FM._shortcutsObserver`) watching nav/header/body.

## Notes

- The action delegation only fires when the clicked `[data-fm-action]` element is inside the shortcuts container, `#command-bar-react`, or `#itemviewer-wrapper-buttons`; right-clicks (`button === 2`) are ignored.
- Grid-overlay FieldID mode is handled per-frame elsewhere (each frame reads `getItemDetailsAdminMode()`), so the toggle handler does not call apply/unapply for grid pages — only for front-end item-details pages.
- `applyItemDetailsAdminMode` stashes the original inline `style` in `data-fm-admin-original-style` and hides cells off-screen rather than removing them, preserving Dojo/Angular references; `unapply` restores from that attribute.
- The admin shortcuts dropdown label depends on the workspace name being present in the DOM; if missing it hides the `<li>` once (`data-fm-shortcuts-label-retried`) and re-triggers `ensurePlacement` after 80ms to retry, falling back to "Admin Shortcuts".
- Popups self-close on URL change via a 150ms `setInterval` (`_fmUrlInterval`) — a polling fallback because SPA navigation does not always fire close events.
- `ensureButtonsPresent` differs heavily between admin UI and front-end: it removes stale per-page buttons and only shows the FieldID toggle when `#itemviewer-wrapper-buttons` exists and the page passes `isOnFieldIdTogglePage`.
