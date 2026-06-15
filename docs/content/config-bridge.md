# config-bridge.js

**World:** ISOLATED

**Purpose:** A thin bridge that relays the extension's feature-toggle configuration from `chrome.storage.local` (only accessible in the extension/isolated context) into the page via `window.postMessage`, where `bootstrap.js` consumes it. It pushes the current config on load and re-pushes a patch whenever the relevant storage keys change.

## Responsibilities

- On load, read the three feature flags from `chrome.storage.local` (with defaults) and post them to the page.
- Subscribe to `chrome.storage.onChanged` and forward any `local`-area changes as a partial config patch.

## Key functions / API

- `DEFAULTS` — `{ enabledButtons: true, enabledOther: true, enabledWorkspaceShortcuts: true }` used as the read defaults.
- `postConfig(cfg)` — `window.postMessage({ type: "FM_CONFIG", payload: cfg }, "*")`.
- `chrome.storage.local.get(DEFAULTS, ...)` — initial config push.
- `chrome.storage.onChanged` listener — builds a `patch` of `{ key: newValue }` for changed keys in the `local` area and posts it.

## Interactions

- **chrome.storage (read):** `chrome.storage.local.get(DEFAULTS)`.
- **chrome.storage (subscribe):** `chrome.storage.onChanged` (filters to `area === "local"`).
- **postMessage (out):** `FM_CONFIG` messages to `window` (target origin `"*"`), consumed by `bootstrap.js`.
- **Upstream writer:** `popup.js` / options page write the toggle keys into `chrome.storage.local`, triggering the change listener here.

## Notes

- The change listener forwards a *patch* (only changed keys), not the full config; `bootstrap.js` merges it over `CONFIG_DEFAULTS` plus existing state via `{ ...CONFIG_DEFAULTS, ...payload }` — so a single-key change posts only that key, and `bootstrap` re-applies defaults for any keys absent from the payload.
- It forwards every changed `local` key (including non-config keys like snippet storage), but `bootstrap.js` ignores keys it doesn't recognize.
- Uses target origin `"*"` for `postMessage`; `bootstrap.js` guards by checking `ev.source === window`.
- This script is the only piece that touches `chrome.storage` for config — page-context (MAIN world) code cannot, which is why the bridge exists.
