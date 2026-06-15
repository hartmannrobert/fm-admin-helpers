# script-snippet.js

**World:** ISOLATED (all three are ISOLATED world)

**Purpose:** Declares the built-in/default Fusion Manage script snippet library used by the script editor's "Insert snippet" feature. It is a minimal data module that defines `window.FM.scriptSnippets` as an array of snippet objects (`{id, name, code}`). In its current state the array is empty (only a placeholder comment), so it exposes the global for other features to read/populate but ships no snippets itself.

## Responsibilities

- Ensure the `window.FM` namespace exists.
- Define `window.FM.scriptSnippets` as an array intended to hold built-in snippet definitions, each with `id`, `name`, and `code` fields (code strings are expected to end with a newline so inserts are followed by a line break).

## Key functions / API

- `window.FM.scriptSnippets` — array of snippet objects (`{id, name, code}`). Currently empty.

No functions are defined or exported; the module is a plain IIFE that assigns the array.

## Interactions

- Populates `window.FM.scriptSnippets`, read by the script editor "Insert snippet" feature (e.g. snippet dropdown / `feature-scripts.js` / `ace-capture.js` insertion flow).
- Does not touch `chrome.storage`, IndexedDB, custom events, or `FM.snippetStorage` — it is the static built-in list, distinct from the user-managed library handled by `snippet-storage.js`/`snippet-modal.js`.

## Notes

- The array is currently empty (just a comment placeholder), so no built-in snippets are provided at the moment; the structure is in place for future additions.
- Snippet shape here is `{id, name, code}` (id-based), whereas the user-managed storage layer normalizes to `{name, code}` and treats `name` as the unique key (falling back to `id` for legacy records).
- Each `code` value should terminate with a trailing newline per the file's own convention.
