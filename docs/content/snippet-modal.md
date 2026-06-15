# snippet-modal.js

**World:** ISOLATED (all three are ISOLATED world)

**Purpose:** Full-screen in-page modal UI for managing the user's custom script snippet library (the "Fusion Manage - Script Snippet Manager"). It builds a two-pane layout (left = name/code editor form, right = searchable snippet table) and operates on a session-scoped draft model: edits, new rows, and deletes are accumulated in memory and only committed to storage (via `FM.snippetStorage.replaceAll`) when the user clicks Save. It supports import/export of JSON, importing bundled default snippets, per-row and bulk delete with an inline confirm overlay, and switching the storage scope (all-tenants vs this-tenant). It can be opened blank, prefilled from the script editor's current selection, or focused for a new snippet.

## Responsibilities

- Inject scoped CSS (`#fm-snippet-modal-root`) and the Material Icons stylesheet; build the modal DOM lazily and reuse a single instance across opens.
- Maintain a session draft state (`persistedSnapshot` + `draftByKey` + `activeDraftKey` + selection/search/scroll) so edits survive modal close-and-reopen only within the same content-script lifetime; Close discards unsaved draft state.
- Merge persisted snapshot with draft edits/new rows/pending deletes into a sorted, filterable row list and render it into the table.
- Bind the left form to a draft row (`activeDraftKey`); flush form contents into the draft on every keystroke (`flushFormToDraft`).
- Provide name/code validation on Save (every row needs name + code, no duplicate names), with inline error messages.
- Per-row status badges: OK / Modified / New / Pending-delete / just-Saved (green flash for 2.6s after save).
- Inline confirm overlay for single-row delete and bulk "Remove selected"; supports undo of a pending delete before save.
- Tab/Shift-Tab indentation handling in the code textarea (tab inserts `\t`, with selection-aware multi-line indent/unindent and caret remapping).
- Dynamically size the code editor textarea to fill available height (ResizeObserver + window resize + rAF scheduling).
- Import from JSON file, export to `fm-snippets.json`, and import bundled defaults from `data/default-snippets.json` (all merge by name then write via storage).
- Storage-scope switching via dropdown menu (All tenants / This tenant), with confirm-on-unsaved-work, reload from the new backend, and ARIA radio state sync.

## Key functions / API

This module exposes nothing on `window.FM`; it is event-driven. The single internal entry point is `createModal(opts)`:

- `createModal({deferShow, editorFocusNewSnippet})` — creates or re-shows the modal; `deferShow` refreshes state without displaying (used for selection prefill), `editorFocusNewSnippet` clears the form and focuses the name field after open.

Notable internal functions:

- `refreshPersistedAndReconcile(list)` — replaces `persistedSnapshot` and prunes stale persisted drafts.
- `getMergedRowDescriptors()` / `getFilteredRows()` — compute the merged (and search-filtered) row list.
- `flushFormToDraft()` — writes the left form into the active draft entry (creating an `n:` new entry if needed).
- `openRowForEdit(row)` / `loadFormForDraftKey(key)` / `ensurePersistedDraft(name)` — bind a row to the form.
- `markDraftKeyDeleted(key)` — mark pending delete (or remove an unsaved new row).
- `buildCommitListOrError()` / `commitSaveAll()` — validate and persist all drafts via `storage.replaceAll`.
- `clearForm()` (the "New" button) — start a fresh new-snippet buffer while keeping other draft rows.
- `renderVirtualized()` / `renderAll()` — render table rows, status badges, selection, and just-saved highlights.
- `openDeleteOverlay(...)` / `closeDeleteOverlay()` — the inline delete-confirm overlay.
- `exportSnippets()` / `parseImportedList()` / `importSnippets(file)` / `importDefaultSnippets()` — JSON import/export.
- `applyStorageScopeChange(scope)` / `syncStorageMenuFromScope()` — storage-scope switching UI.

State helpers attached to the root element for cross-call reuse: `_fmSmState`, `_fmSmRenderAll`, `_fmSmApplyLoadFromEditor`, `_fmSmClearForm`, `_fmSmNameEl`, `_fmSmRefreshPersistedAndReconcile`, `_fmSmOnModalReopen`, `_fmSmResetTransientSession`, `_fmSmScheduleCodeEditorLayout`.

## Interactions

- **Storage:** all reads/writes go through `window.FM.snippetStorage` (`init`, `getAll`, `replaceAll`, `getSnippetStorageScope`, `setSnippetStorageScope`) — it does NOT touch `chrome.storage`/IndexedDB directly, so the active backend (extension `fmScriptSnippets` vs origin `FMSnippetDB`) is whatever snippet-storage selects.
- **Inbound events:**
  - `chrome.runtime.onMessage` `{type: "fm-open-snippet-modal"}` (from the popup) → opens the modal.
  - window `fm-open-snippet-modal-request` (with optional `detail.editorFocusNewSnippet`) → opens the modal.
  - window `fm-snippet-load-from-editor` (`detail.code`) → opens deferred and prefills the form from editor selection.
- **Outbound events:** dispatches window `fm-snippets-changed` after any write (`setStored`, `commitSaveAll`, scope change) so other tabs/UI re-read.
- **Other FM hooks:** calls `window.FM.tenantSubdomainForSnippetsUi()` (optional) to label the "this tenant" menu item.
- **Resources:** fetches `chrome.runtime.getURL("data/default-snippets.json")` for "Import default"; loads Material Icons font from `fonts.googleapis.com`.

## Notes

- The modal is a singleton: a second open reuses the existing `#fm-snippet-modal-root` element and its retained draft state via the `_fmSm*` properties; only Close (or the JSON import/save flows) clears drafts.
- Draft keys are `p:<originalName>` for edits to existing snippets and `n:<id>` for brand-new rows; empty `n:` rows that aren't active are auto-pruned during render.
- Save calls `storage.replaceAll(commitList)` — it overwrites the ENTIRE library with the merged draft result, so anything not represented in the current draft/snapshot is lost. Import/default flows also merge-by-name then write the full list immediately (not deferred to Save).
- Code is stored/compared after `normalizeCode` (converts literal `\n` to real newlines) and `.trim()`; the "Modified" badge and just-saved highlight compare normalized trimmed code.
- Switching storage scope with unsaved draft work prompts a confirm and then discards the draft, reloading from the new backend.
- Uses `window.confirm`/`alert` for replace-on-prefill, import errors, and scope-switch confirmation.
- z-index is `2147483647` (overlay one less) to sit above PLM UI; CSS is injected once into `document.head`.
- The header says "virtualized" but `renderVirtualized` actually renders all filtered rows (no windowing); the name is historical.
