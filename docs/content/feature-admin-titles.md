# feature-admin-titles.js

**World:** ISOLATED

**Purpose:** Sets a meaningful `document.title` on Fusion Manage admin pages so browser tabs show useful names (e.g. "Scripts - Fusion Manage", "<Workspace> - Item Details - Fusion Manage", "Roles - Fusion Manage") instead of a generic title. It parses the URL hash to determine section/tab/item and, for workspace sub-pages, reads the workspace name from the DOM.

## Responsibilities

- Detect admin pages (`autodeskplm360.net` host with `/admin` in the URL).
- Parse the location hash into key/value params (`section`, `tab`, `item`).
- For workspace admin sub-pages (`section=setuphome&tab=workspaces&item=...`), build `"<Workspace>[ - <Item Label>] - Fusion Manage"` using a label lookup and the DOM-derived workspace name (falls back to "Workspace" if name not found).
- For top-level admin tabs, set fixed titles: Workspace Manager, Scripts, Roles, Users, Groups.
- Write the computed title to the top document (`window.top.document` when accessible, else current document).

## Key functions / API

- `FM.applyAdminTabTitle()` — main entry; computes and sets the tab title based on URL + DOM. No-op when not on an admin page.
- `FM.getWorkspaceNameFromDom()` — returns the workspace name from `#itemdetails.workspacerow .rowbody h4` (empty string if absent).
- `getHashParams()` (internal) — decodes the hash into a `{key: value}` object.
- `getItemLabel(itemKey)` (internal) — maps an item key to a friendly label via `ITEM_LABELS`, otherwise capitalizes the raw key.
- `isOnAdmin()` (internal) — host + `/admin` URL gate.

## Interactions

- **Tick loop:** `bootstrap.js` calls `FM.applyAdminTabTitle` each tick (under the `enabledOther` gate).
- **Flags:** no dedicated `FM.isEnabled` key; only the top-level `enabledOther` gate applies.
- **DOM:** reads `#itemdetails.workspacerow .rowbody h4` for the workspace name; writes `document.title` (preferring `window.top.document`).
- **Storage:** none.
- **URL:** reads `location.href` (host/admin check) and `location.hash` (section/tab/item params).

## Notes

- `SUFFIX` (" - Fusion Manage") is appended to all titles. The `ITEM_LABELS` map covers known workspace sub-pages (relationship, tabsedit, itemdetails, descriptor, grid, workflowitems, bom, sourcing, behavior, workspaceedit, printview, advancedPrintViewList); unknown items fall back to a capitalized key.
- Writing to `window.top.document.title` may be needed because content scripts run in `all_frames`; a cross-origin top frame would make `window.top.document` inaccessible, in which case it falls back to the current frame's document.
- The workspace title depends on the DOM h4 being present; on a slow load it may briefly fall back to "Workspace" until the next tick re-runs.
- This is the simplest of the three features: read-only except for `document.title`; idempotent and safe to call repeatedly.
