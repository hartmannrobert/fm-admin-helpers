# feature-fieldid.js

**World:** ISOLATED

**Purpose:** Surfaces Field IDs on Fusion Manage workspace admin pages and item grids. On the workspace Item Details / admin Grid pages it injects a click-to-copy Field ID label in front of each `span.fieldIdentifier` and proxies the native edit/clone/delete icons into a consistent, reordered icon group. On the Handsontable items grid it paints a fixed-position overlay of Field IDs above each column header. It also adds collapse/expand-all-sections buttons and a live field filter/highlight box to the Item Details page.

## Responsibilities

- Detect the relevant pages (workspace Item Details, admin workspace Grid, and the front-end Handsontable items grid).
- Inject a `.fm-field-id` span (the Field ID text) at the start of each `span.fieldIdentifier`, click-to-copy to clipboard, gated on `fieldIdShowFieldId`.
- Hide the native edit/clone/delete `<img>` icons and rebuild equivalent proxy icons in a deterministic order (edit, clone, delete) inside a `.fm-field-icons` span, gated on `fieldIdShowIcons`. Proxy clicks forward synthetic clicks to the native icons.
- On the items grid, maintain a fixed-position `#fm-grid-fieldid-overlay` whose cells track each `.header[field-id]` column header position via a requestAnimationFrame loop; click-to-copy each Field ID. Pushes the grid spreadsheet down with a top margin so the overlay has space.
- Inject Collapse-all / Expand-all section buttons next to the field filter input on the Item Details page.
- Inject a "Filter Fields" input that filters field rows by ID or name, hides empty sections, highlights matches, and cycles through matches with Enter / Shift+Enter.

## Key functions / API

- `FM.runFieldIdFeature()` — entry point: runs `enhanceFieldIdentifiersOnce`, and starts/stops the grid overlay RAF loop depending on page.
- `FM.runFieldFilterFeature()` — ensures the field filter input exists on Item Details (skips workspace grid tab).
- `FM.injectCollapseExpandButtons()` — inserts the collapse/expand-all buttons after the filter input.
- `FM.collapseAllSectionsNative()` / `FM.expandAllSectionsNative()` — click native section toggles to collapse/expand all sections (expand is staggered 30ms per section).
- `enhanceFieldIdentifiersOnce(root)` — idempotently adds Field ID spans + proxy icons to all `span.fieldIdentifier`.
- `moveButtonsInFrontOfFieldId(itemSpan, fieldIdSpan)` — builds/refreshes the proxy icon group; only operates inside `#layoutContainer`.
- `syncGridOverlay()` — recomputes overlay cell positions each frame; clears overlay when off-page, flag off, or admin mode off.
- `isOnItemsGridTab()` / `isOnWorkspaceItemDetailsTab()` / `isOnFieldIdTargetPage()` — page gates.
- `copyToClipboard(text)` — clipboard write with `execCommand` fallback.

## Interactions

- **Tick loop:** `bootstrap.js` calls `FM.runFieldIdFeature`, `FM.injectCollapseExpandButtons`, and `FM.runFieldFilterFeature` each tick (all under the `enabledOther` gate).
- **Flags:** `FM.isEnabled("fieldIdShowFieldId")` and `FM.isEnabled("fieldIdShowIcons")` control the label and icon-proxy behavior; both also gate the grid overlay.
- **Cross-feature:** the grid overlay also requires `FM.getItemDetailsAdminMode()` (defined in `feature-buttons.js`) to be true.
- **DOM:** keys off `span.fieldIdentifier`, `div.fieldIdentifier`, `#layoutContainer`, `div.sectionIdentifier`, `table.htCore thead .header[field-id]`, `#gridCtrl.spreadsheetId`, and the native `img.editIcon/.cloneIcon/.deleteButton`. Reads element `id` attributes for Field ID values (grid uses the `field-id` attribute, stripped of leading/trailing underscores).
- **Storage:** none directly; only the clipboard.
- **Styling:** relies on `content.css` for `.fm-field-id`, `.fm-field-icons`, `.fm-native-icon-hidden`, `.fm-field-match`, `.fm-field-match-active`, `.fm-search-input`, and Material Icons; the grid overlay cells are inline-styled to mimic `.fm-field-id` colors.

## Notes

- Proxy icons are only created/moved inside `#layoutContainer` to avoid proxying icons elsewhere on the page.
- The grid overlay is `position: fixed` and re-synced every animation frame, so column resize/scroll keeps it aligned; it is removed entirely (`stopGridOverlayLoop`) when leaving the grid tab.
- Field ID text strips a literal `"null"` from element ids; rows with no resolvable id are skipped.
- The filter hides sections with zero visible fields and restores them (via `data-fm-filter-hidden`) when the query is cleared.
- `cycleToNextMatch` rebuilds the match list when the query changes and scrolls the nearest scrollable ancestor (falls back to `scrollIntoView`).
- New-SPA pages are not targeted here; detection relies on the legacy `admin#...` hash URLs plus the front-end `/plm/workspaces/<id>/items/grid` URL.
