# feature-scripts.js

**World:** ISOLATED (extension context)

**Purpose:** The main script-editor and admin-list enhancement module, running in the isolated content-script world. It defines two features under `FM.features` — `scripts` (script editor + Scripts tab list) and `picklists` (Picklists admin list) — plus shared `utils`. On the script form page it injects a "Copy to Clipboard and Save" button, an "Insert Snippet" accordion with a snippet manager menu, and a "Go to Function" navigator; it restores Ace cursor/scroll after save and sets the page title. On list pages it adds filter inputs, a grid-view toggle, an errors-only filter, column reordering, and clickable script names. All editor access goes through the MAIN-world bridge (`ace-capture.js`) via custom events.

## Responsibilities

Scripts feature — script form page:
- Set the (top) document title from the script's unique name.
- Inject "Copy to Clipboard and Save": grabs live editor content (preferring the MAIN-world Ace), copies to clipboard, saves Ace cursor/scroll state to `sessionStorage`, then triggers save.
- Restore the script-form URL (`?ID=`) and Ace cursor/scroll state after a save-induced reload.
- Build the "Insert Snippet" accordion (search + list, inserts at cursor / replaces selection) and a `⋮` settings menu (Snippet Manager, New Snippet, New Snippet with Marked Code).
- Build the "Go to Function" accordion (filterable function list, auto-jump on single match, seeds query from current selection).
- Merge built-in (`FM.scriptSnippets`) + user snippets (`FM.snippetStorage`); rebuild on `fm-snippets-changed`.
- Make included library-script names in `#section-includes` clickable links opening `script.form?ID=`.
- Size the tools stack relative to `#codeEditor` height (`ResizeObserver` + window resize).

Scripts feature — Scripts tab list:
- Inject a "Filter Scripts" input; grid-view toggle (persisted in `localStorage`); "Show Errors" pill that filters rows with the warn-triangle icon.
- Reorder table columns/body to Name / Action / Description and rebuild the header; move the ACTION column.
- Make script-name cells clickable (left-click navigate, middle-click/shift new tab via `FM.openUrlWithEvent`).

Picklists feature:
- Inject a "Filter picklists" input.
- Reorder action columns to the front, rebuild header, adjust `<colgroup>` widths.

## Key functions / API

Exposed:
- `FM.features.scripts` → `{ tick, tickSimpleGridView, tickEnhancements, tickSearchField }` — `tick()` runs all script/scripts-tab work each cycle.
- `FM.features.picklists` → `{ tick, runReorder, applyPicklistsFilter }`.
- `FM.tickFeatures()` — convenience that calls `scripts.tick()` and `picklists.tick()`.
- `FM.getAceEditorSelectedText()` — Promise of selected text from the MAIN-world editor.

Notable internals (scripts):
- `isOnScriptFormPage()` / `isOnScriptsTab()` — page detection (old `script.form?ID=` and new `system-configuration/scripting`).
- `getScriptEditorContent()` — Promise; tries MAIN-world Ace (`fm-ace-get-content`) first, then DOM Ace instances, known globals, `_plm.callFunc("scriptEditor","getValue")`, and the hidden `<textarea id="code">`.
- `getAceEditorState()` / `restoreAceEditorState()` — read/restore `{cursor, firstVisibleRow, scrollTop}` via the bridge + `sessionStorage`.
- `ensureCopySaveButton()`, `ensureSnippetsButton(snippets, forceRefresh)`, `refreshSnippetsDropdown(forceRefresh)`, `ensureLibraryScriptLinksOpenInNewTab()`.
- `restoreScriptFormUrlAfterSave()` — re-appends `?ID=` using `fmScriptFormIdAfterSave`.
- Go-to-function helpers: `refreshGotoCandidates`, `renderGotoFnResults`, `dispatchAceJumpToDefinition` (uses `FM.parseScriptFunctionDefinitions` / `filterRankFunctionCandidates` / `sortFunctionDefinitionsByLine`).
- List helpers: `ensureToggleOnce`, `applyScriptsFilter`, `reorderScriptsBody`, `rebuildScriptsHeader`, `ensureScriptNameOpensInNewTab`, `rowHasScriptsTabErrorIcon`.

## Interactions

Custom events dispatched to MAIN world (`ace-capture.js`): `fm-ace-get-content`, `fm-ace-get-state`, `fm-ace-set-state`, `fm-ace-get-selected-text`, `fm-ace-jump-to-definition`. Listens for responses: `fm-ace-content`, `fm-ace-state`, `fm-ace-state-restored`, `fm-ace-selected-text`.

`window.postMessage` to MAIN world: `fm-ace-snippet-dropdown-opened`, `fm-ace-snippet-dropdown-closed`, `fm-ace-insert-snippet` (with `code`).

Window CustomEvents (to other ISOLATED modules / snippet modal): dispatches `fm-open-snippet-modal-request` (optional `detail.editorFocusNewSnippet`), `fm-snippet-load-from-editor` (`detail.code`); listens for `fm-snippets-changed` to rebuild the snippet list.

Globals/storage:
- `FM.scriptSnippets` (built-in snippets), `FM.snippetStorage` (user snippets backend), `FM.injectMaterialIcons`, `FM.openUrlWithEvent`, `FM.parseScriptFunctionDefinitions` & rank/sort (from `go-to-function.js`), `_plm.callFunc` (page host API).
- `localStorage`: `fmScriptsSimpleGridView` (grid toggle, per-origin).
- `sessionStorage`: `fmScriptFormIdAfterSave`, `fmAceRestoreState_<id>` (id falls back to `__scripting__` for the new SPA URL with no script ID).
- `navigator.clipboard.writeText` for Copy & Save.
- `FM.state.scriptsErrorsOnlyFilter`, `FM.state.scriptsFilterLastInputAt` (in-memory).
- Driven by the central tick loop in `bootstrap.js`.

## Notes

- All injectors are idempotent (guards via element IDs / `dataset.fm*` flags); ticks recreate UI only when missing, except `forceRefresh` (used after snippet storage changes) which tears down and rebuilds the snippet wrap, carefully detaching its listeners/observers/rAF first.
- `getScriptEditorContent` is async and layered: the MAIN-world Ace path is preferred because it reflects unsaved edits; everything else is a fallback chain ending at the hidden textarea.
- The "active typing" guard (`isActivelyFilteringScripts`, 350ms window) suppresses table DOM churn while the user types in the native filter so grid view doesn't fight the user.
- The errors-only filter relies on detecting `warntriangle_16.png` in row images; rows are filtered by combining text search AND error pass.
- New SPA scripting URL has no script ID, so cursor-restore and the post-save ID handling use `__scripting__` as the key fallback (and skip storing an ID for re-navigation).
- The Go-to-Function single-match auto-jump intentionally passes `focusEditor:false` so focus stays in the filter input; pressing Enter jumps too.
- The settings (`⋮`) menu is positioned with fixed-coordinate clamping and re-anchors on scroll/resize; it closes on outside click (ignoring clicks inside `#codeEditor`) and Escape.
- The file is ~1775 lines; the snippet/goto accordion builder (`ensureSnippetsButton`) is by far the largest function.
