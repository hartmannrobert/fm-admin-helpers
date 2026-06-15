# feature-security.js

**World:** ISOLATED

**Purpose:** Enhances the Fusion Manage admin Security area (Users / Roles / Groups tabs and the permission move dialog). It promotes the first data row to a real table header, adds per-column filter rows with a live count, "Clear Filters", and CSV export (Users tab), reorders the Modify/Manage columns to sit after Name on Roles/Groups, and adds bulk "Add All / Remove All" buttons to the dual-pane permission picker.

## Responsibilities

- **Users tab:** promote the first `<tbody>` row to a `<thead>` header; inject a filter row of inputs/selects under the header (Status, Auth Status, User Name, First/Last Name, Email, Organization, 2FA); maintain a visible/total count badge, a Clear Filters button, and an Export List (CSV) button in the item menu.
- **Roles / Groups tabs:** move the Modify and Manage columns to immediately after Name, enforce `<colgroup>` percentage widths, and inject a simpler per-column text filter (Name/Description, plus Workspace on Roles) with count + Clear Filters.
- **Permission picker dialog:** inject "Add All" / "Remove All" bulk-move buttons into the dual-pane (left/right) option list, driving the native single-move arrows repeatedly until a pane is empty.

## Key functions / API

- `FM.runAdminUsersSearchTick()` — Users-tab entry: runs `promoteFirstBodyRowToHeader()` then `FM._secFilter.tick()`.
- `FM.runSecurityRolesGroupsLayoutTick()` — Roles/Groups entry: moves columns, applies colgroup widths, runs `FM._rgFilter.tick()`.
- `FM.ensureBulkMoveButtonsInCenter()` — injects the Add All / Remove All buttons into `.roundButtonsWrapperWithDescription`.
- `FM._secFilter` (IIFE, exposes `{ tick }`) — full Users-tab filter engine: column resolution by header aliases, row indexing, two-stage filter (compute matches → RAF-batched DOM writes), MutationObserver-driven reindex (120ms debounce), select-option refresh, CSV export.
- `FM._rgFilter` (IIFE, exposes `{ tick }`) — Roles/Groups text-only filter engine, column defs switch on the active tab.
- `FM.ensureNoJavascriptHrefNav()` — suppresses `javascript:` navigation on the `moveRight`/`moveLeft` anchors while a bulk move is running.
- `FM.clearOptionSelection()` — blurs focus, dispatches Escape, and clicks a neutral area to clear faux-select highlight after bulk ops.
- `getAdminUsersTab()` — parses the hash to return `"users" | "roles" | "groups" | null`.
- `promoteFirstBodyRowToHeader()` — converts the first body row of `#itembody-2 table` into a `<thead>` (stamped via `data-fm-header-fixed`).
- `moveModifyManageAfterName(table, tab)` / `applySecurityColgroupWidths` / `ensureColgroupWithCount` / `setColWidths` — column-reorder + width helpers.
- `runBulkMove(...)` — recursive single-item mover that selects the next option, clicks the native move button, and continues on DOM mutation (with a 150ms failsafe).

## Interactions

- **Tick loop:** `bootstrap.js` (under `enabledOther`) calls `FM.runAdminUsersSearchTick`, `FM.runSecurityRolesGroupsLayoutTick`, and `FM.ensureBulkMoveButtonsInCenter` each tick.
- **Flags:** no per-feature `FM.isEnabled` keys; only gated by the top-level `enabledOther` check in bootstrap. Page applicability is decided internally via `getAdminUsersTab()` / hash inspection.
- **DOM:** `#itembody-2 table`, `.itembody-users table`, `.itemdisplay`, `#itemmenu-2` / `.itemmenu`, header alias matching; permission dialog uses `#leftPane`, `#rightPane`, `#moveLeft`, `#moveRight`, `.roundButtonsWrapperWithDescription`, and option divs with `_ds_fauxselect_value`.
- **Storage:** none. CSV export builds an in-memory Blob and triggers a download (`fm-users-<date>.csv`, UTF-8 BOM, CRLF).
- **Observers:** each filter engine runs a MutationObserver on the table `tbody` to reindex on data changes; writes are guarded by a `_suppressObs` flag to avoid feedback loops.
- **Styling:** each engine injects its own `<style>` block (`#fm-sec-filter-style`, `#fm-rg-filter-style`); shares the `fm-sec-row-hidden` class to hide non-matching rows.

## Notes

- Two near-duplicate filter engines exist (`_secFilter` for Users with select+text columns and CSV export; `_rgFilter` for Roles/Groups, text-only). They share the `fm-sec-row-hidden` hide class but use separate id/class namespaces (`fm-sec-*` vs `fm-rg-*`).
- 2FA column values are derived from cell text or, failing that, the icon `src`/`title` (mapping to `sso`/`on`/`off`/`ext`/`n/a`).
- Column ordering for Roles/Groups assumes the native header order Name, Description, [Workspace,] Modify, Manage; the move is stamped per-table-per-tab via `data-fm-security-moved` and guarded by a `data-fm-owner` lock to avoid clashing with other scripts.
- Tab changes trigger `_detach()` (observer stop, debounce clear, filter-row + menu-control removal) so state does not leak across Users/Roles/Groups.
- `runBulkMove` is automation that synthesizes mousedown/click events and relies on native FM handlers mutating the pane; the 150ms timeout failsafe handles cases where FM does not mutate the DOM. `FM._bulkMoveActive` blocks the `javascript:` anchor navigation during this window.
- The 2FA `_norm2fa` and select-option logic title-cases values for display (`SSO` and `n/a` special-cased).
