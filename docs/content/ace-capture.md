# ace-capture.js

**World:** MAIN (page context)

**Purpose:** Runs in the page's MAIN world (where `window.ace` and the Ace editor's DOM internals are reachable) and acts as the bridge between the isolated content scripts and the live Ace code editor on Fusion Manage script pages. It captures the Ace editor instance, then services a set of custom DOM events and `postMessage` requests to read content/state/selection, insert and replace text, jump to function definitions, and restore cursor/scroll state. Self-guards: the whole IIFE returns immediately unless the URL matches `script.form` or `system-configuration/scripting`.

## Responsibilities

- Capture the Ace editor instance by wrapping `ace.edit()` (so any future `ace.edit` call is intercepted) and by hooking a getter/setter on `window.ace` so a late-assigned ace lib is also wrapped.
- Provide a robust `getEditor()` with a DOM fallback (`#codeEditor`/`.ace_editor` → `el.env.editor`) for when the wrapped capture misses (e.g. Ace lives in an iframe / page assigned it directly).
- Expose full editor content, cursor/scroll state, current selection, and selected text to the ISOLATED world via response events.
- Insert text/snippets at the cursor or replace the active selection; track the last inserted range to support snippet chaining.
- Replace an arbitrary range and report the resulting range back.
- Restore cursor + scroll state after a save/reload.
- Jump to a function definition row with top-aligned scrolling, cursor placement, optional focus, and a transient full-line highlight (flash marker).

## Key functions / API

- `wrapEdit(aceLib)` — monkey-patches `aceLib.edit` to remember the returned editor in `capturedEditor` (idempotent via `__fmWrapped`).
- `tryWrapAce()` — wraps `window.ace` if defined; also scheduled at 200ms and 1000ms.
- `getEditor()` — returns the captured editor or falls back to DOM (`#codeEditor`/`.ace_editor` `.env.editor`).
- `getContent()` — full text via `editor.getValue()` / `session.getValue()`.
- `getState()` / `setState(state)` — read/apply `{ cursor:{row,column}, firstVisibleRow, scrollTop }`.
- `getAceRange(editor)` — resolves the Ace `Range` constructor via `ace.require("ace/range")` or from a live selection range's constructor.
- `doInsertSnippet(code)` — replaces active selection (chaining) else inserts at cursor or `savedSnippetCursor`; selects inserted text; tracks `lastInsertedRange`.
- `snippetDropdownOpened()` / `snippetDropdownClosed()` — capture/clear `savedSnippetCursor` and clear `lastInsertedRange`.
- `getSelection()` / `getSelectedText()` — selection range / non-empty selected text (a bare caret returns `""`).
- `scrollEditorRowNearTop(editor, docRow)` — multi-strategy top-aligned scroll (`scrollToLine`, `documentToScreenRow * lineHeight`, rAF re-apply, unfold, resize).
- Event handlers (listed under Interactions) dispatch responses for each incoming request.

## Interactions

Incoming (handled) events on `document`:
- `fm-ace-get-content` → responds `fm-ace-content` (detail = content string).
- `fm-ace-get-state` → responds `fm-ace-state` (detail = state object).
- `fm-ace-set-state` → applies state, responds `fm-ace-state-restored`.
- `fm-ace-insert-text` (detail = string) → inserts at cursor.
- `fm-ace-insert-snippet` (detail.code) → `doInsertSnippet`.
- `fm-ace-set-content` (detail.content/cursor/selection) → `session.setValue` + cursor/selection.
- `fm-ace-get-selection` → responds `fm-ace-selection`.
- `fm-ace-get-selected-text` → responds `fm-ace-selected-text`.
- `fm-ace-set-selection` (detail.start/end) → sets selection range.
- `fm-ace-jump-to-definition` (detail.row, flash, scrollAlign, focusEditor) → scroll/cursor/flash.
- `fm-ace-replace-range` (detail.start/end/text) → `session.replace`, responds `fm-ace-range-replaced`.

Incoming `window.postMessage` (must be `ev.source === window`):
- `fm-ace-snippet-dropdown-opened` → `snippetDropdownOpened()`.
- `fm-ace-insert-snippet` (data.code) → `doInsertSnippet`.
- `fm-ace-snippet-dropdown-closed` → `snippetDropdownClosed()`.

Other: reads `window.ace` / `ace.require("ace/range")`; injects a `<style id="fm-ace-jump-flash-style">` into the page head. No `chrome.storage`/`sessionStorage` access (that lives in the ISOLATED side). Counterpart file: `feature-scripts.js`.

## Notes

- Returns early unless on a script editor URL; nothing runs on other pages.
- The Ace editor often lives in an iframe, so `window.ace` may be `undefined` in the top frame — the DOM fallback (`#codeEditor.env.editor`) is the real path in many cases.
- `Range` resolution is best-effort; when no `Range` constructor is available, snippet/replace ops fall back to plain `editor.insert` and skip selection setting.
- Selected-text check treats a zero-width range (caret) as no selection, which is what enables the insert-vs-replace branching in `doInsertSnippet`.
- `lastInsertedRange` is cleared on dropdown open to avoid stale ranges leaking across sessions.
- Jump-to-definition does its scroll work multiple times (immediate, after cursor move, and inside `requestAnimationFrame`) because Ace layout/scroll metrics may not be ready on the first call; the flash marker auto-removes after 650ms.
- Almost all editor operations are wrapped in try/catch and fail silently.
