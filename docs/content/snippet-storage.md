# snippet-storage.js

**World:** ISOLATED (all three are ISOLATED world)

**Purpose:** Persistence layer for user script snippets with a user-selectable backend. Snippets are stored either extension-wide in `chrome.storage.local` (key `fmScriptSnippets`, shared across all Fusion Manage tenants) or per-origin in IndexedDB (`FMSnippetDB`, one library per site origin/tenant). The active backend is chosen by the `fmSnippetStorageScope` setting in `chrome.storage.local`. The module normalizes records to `{name, code}` (name is the unique key), handles legacy data migrations, and exposes a single uniform async API (`window.FM.snippetStorage`) that transparently routes to whichever backend is active.

## Responsibilities

- Read the active scope (`extension` vs `origin`) from `chrome.storage.local` key `fmSnippetStorageScope` and route all reads/writes accordingly.
- Normalize snippet records: trim/coerce `name` (falling back to legacy `id`), coerce `code` to string, de-duplicate by name, and sort case-insensitively by name.
- Maintain the extension backend in `chrome.storage.local` under `fmScriptSnippets`.
- Maintain the origin backend in IndexedDB database `FMSnippetDB` v2, object store `scriptSnippets_name` (keyPath `name`).
- Run one-time legacy migrations:
  - Extension scope: migrate legacy `userSnippets` array into `fmScriptSnippets` (only if `fmScriptSnippets` not yet present), then clear `userSnippets`.
  - Origin scope: on `onupgradeneeded` (oldVersion < 2) migrate the old `scriptSnippets` object store into `scriptSnippets_name`; separately migrate legacy `userSnippets` from chrome storage into IDB once per origin, gated by the `fm-snippets-migrated-to-idb` flag.
- Attach a cross-tab change listener: when `fmScriptSnippets` or `fmSnippetStorageScope` change in `chrome.storage.local`, dispatch a window `fm-snippets-changed` event (top frame only).
- Provide CRUD + bulk + replace-all operations against the active backend.

## Key functions / API

Exposed on `window.FM.snippetStorage`:

- `init()` — attaches the cross-tab listener and initializes the active backend (IDB init or legacy chrome migration). Idempotent; should be called/awaited before use.
- `openDB()` — alias for `init()`.
- `getAll()` — resolves to a normalized array of `{name, code}` from the active backend.
- `get(name)` — resolves to a single record by name (or `undefined`).
- `put(snippet)` — upsert one snippet by name (rejects if name is empty).
- `putMany(snippets)` — upsert multiple snippets, merging with existing by name.
- `remove(name)` — delete one snippet by name.
- `removeMany(names)` — delete multiple snippets by name.
- `replaceAll(snippets)` — clear and replace the entire library with the normalized input.
- `getSnippetStorageScope()` — resolves to current scope string (`"extension"` or `"origin"`).
- `setSnippetStorageScope(scope)` — persists the new scope and re-runs `init()` for that backend.
- `SNIPPET_STORAGE_SCOPE_EXTENSION` / `SNIPPET_STORAGE_SCOPE_ORIGIN` — scope constant strings.

Internal helpers (not exported): `toRecord`, `normalizeSnippetArray`, `readSnippetScope`, `withBackend` (scope-dispatch wrapper), and parallel `chrome*` / `idb*` implementation pairs for each operation.

## Interactions

- `chrome.storage.local` keys: `fmSnippetStorageScope` (scope setting), `fmScriptSnippets` (extension backend data), legacy `userSnippets` (migration source), `fm-snippets-migrated-to-idb` (IDB migration flag).
- IndexedDB: database `FMSnippetDB` (v2), store `scriptSnippets_name` (keyPath `name`); migrates from legacy store `scriptSnippets`.
- `chrome.storage.onChanged` listener → dispatches window `fm-snippets-changed` event for cross-tab sync.
- Consumed by `snippet-modal.js` (snippet manager UI) and other features that read/write the snippet library via `window.FM.snippetStorage`.

## Notes

- `name` is the unique identifier across both backends. Records with empty/blank names are dropped during normalization.
- The IDB connection is memoized in `idbPromise` — opened once per page.
- `normalizeSnippetArray` always returns a sorted, de-duped list; last-write-wins on duplicate names within a single input array.
- The cross-tab `fm-snippets-changed` listener only attaches in the top frame (`window.self === window.top`) and only fires for `chrome.storage` changes — IDB writes do NOT trigger it, so origin-scope changes from another tab will not auto-sync via this listener.
- Extension-backend writes (`put`, `putMany`, `remove`, `removeMany`) are implemented as read-merge-`replaceAll` round trips, not atomic partial updates.
- `setSnippetStorageScope` rejects on invalid scope values and when `chrome.storage.local` is unavailable; switching scope does NOT migrate data between backends — it just points reads/writes at the other store.
- If `chrome.storage.local` is unavailable, the module defaults to `extension` scope but most operations will resolve empty or reject.
