# feature-bom-views.md

**World:** ISOLATED

**Purpose:** Restyles the legacy Dojo "Bill of Materials" admin page (`#section=setuphome&tab=workspaces&item=bom`) into a modern tabbed UI. It flattens each BOM view's field rows into draggable single-line rows, replaces stacked Dojo view panels with a horizontally-scrollable tab bar (one tab per BOM view), and continuously neutralizes Dojo's inline absolute positioning/sizing so the layout fits and scrolls correctly. Implemented as a single IIFE exposing only `FM.runBomViewsTick`.

## Responsibilities

- Detect the BOM admin page by parsing `location.hash` params (`section=setuphome`, `tab=workspaces`, `item=bom`).
- Transform each `.fieldPanel` into a flat `.fm-bom-row` (drag handle + source input + change button + display input + delete button) by relocating the existing Dojo DOM nodes (preserving listeners) and hiding the original `.fieldWrapper`.
- Provide mouse-based drag-and-drop reordering of field rows within a view pane, using a ghost element and a placeholder.
- Transform each `.viewPanel`: clear Dojo inline sizing, move the Add Field button into the toolbar, build a per-view sticky header (`viewHeader` + synthetic column-header row), and observe for Dojo-added field rows (moving newly-added rows to the end and scrolling to them).
- Build/rebuild a tab bar (with left/right scroll arrows) above the views body; switching tabs shows/hides the corresponding view panel.
- Keep tab labels in sync with each view's `.viewNameInput` value.
- Recompute and apply explicit heights every tick (`syncScrollHeights`) because Dojo re-applies `position:absolute`/`top` after each clear.

## Key functions / API

- `FM.runBomViewsTick()` — the only exported function; the per-tick entry point.
- `isBomAdminPage()` — hash-param check for the BOM admin page.
- `transformFieldRow(fp)` — flattens one `.fieldPanel` into a `.fm-bom-row`.
- `setupDragDrop(pane)` — installs mousedown/move/up drag reordering on a view's field pane.
- `transformViewPanel(vp)` — normalizes one view panel, builds its sticky header, and observes for added field rows.
- `getViewLabel(vp, idx)` / `activateTab(panel, idx)` / `updateTabArrows(panel)` / `rebuildTabBar(panel)` — tab-bar construction and state.
- `transformBomPanel(panel)` — top-level per-panel transform; transforms all views, builds tabs, and observes the views body for newly-added view panels.
- `syncScrollHeights(panel)` — re-clears Dojo positioning and sets body/scroll heights each tick.

## Interactions

- **Tick loop:** `bootstrap.js` `mainTick()` calls `FM.runBomViewsTick?.()` via `FM.safeRun("bomViews", ...)`, gated on `FM.isEnabled("enabledOther")`.
- **No FM flag of its own** beyond the `enabledOther` group gate; it does not read any storage.
- **DOM:** operates on legacy Dojo BOM markup — `.bomViewsPanel`, `.bomViewsBody`, `.bomViewsHeader`, `.viewPanel`, `.viewHeader`, `.viewBody`, `.viewFields`, `.viewFieldsPane`, `.viewFieldsScroll`, `.fieldPanel`, `.fieldSourceInput`, `.fieldDisplayRow input`, `.changeSource`, `.deleteField`, `.fieldPanelAdd .addField`, `.viewNameInput`, and `#unassignedFieldsContainer`.
- **Markers / dataset flags:** `data-fm-bom-panel`, `data-fm-bom-view`, `data-fm-bom-row`, `dataset.fmBomDnd`, `dataset.fmBomReady`, `dataset.fmBomTabSync`.
- **Events:** `mousedown`/`mousemove`/`mouseup` for drag-and-drop; `click` on tabs/arrows; `input` on view name inputs; internal `MutationObserver`s on the views body and each field pane.

## Notes

- Idempotency is via attribute/dataset markers — each element is transformed once. `transformBomPanel` still calls `rebuildTabBar` on already-marked panels so tabs track added/removed views.
- A 600ms `dataset.fmBomReady` delay distinguishes Dojo's initial lazy-load of view panels (do not auto-activate) from genuinely user-added views (auto-activate and scroll into view).
- Dojo re-applies inline `position:absolute`/`top`/`left` and sizing after the one-time clear, so `syncScrollHeights` re-clears them on every tick — this is intentional, not redundant.
- Dojo prepends newly-added field rows; the row observer moves them to the end after an 80ms timeout so they appear in user-expected order.
- Drag-and-drop ignores mousedown on `.changeSource`, `.deleteField`, or any `input` so those controls keep working.
- The synthetic sticky header wraps `viewHeader` plus a fake `thead` to guarantee the view header sits above the column headers (CSS sticky offset would otherwise push it below).
