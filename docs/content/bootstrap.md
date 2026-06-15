# bootstrap.js

**World:** ISOLATED

**Purpose:** The orchestration core of the extension. It receives feature config from the config bridge, defines the global enablement/error-handling helpers (`FM.isEnabled`, `FM.safeRun`), and drives every feature through a single coalesced tick loop (`mainTick`) powered by a MutationObserver + requestAnimationFrame scheduler with a periodic fallback interval. Each feature's tick function is invoked idempotently so it can self-detect its page context and apply changes safely.

## Responsibilities

- Initialize `FM.config` to `null` (treated as "not yet known"; nothing is assumed enabled until config arrives).
- Listen for `FM_CONFIG` `postMessage` events (from `config-bridge.js`), merge payload over `CONFIG_DEFAULTS`, store on `FM.config`, then fire `FM_CONFIG_APPLIED`.
- Expose `FM.isEnabled(key)` and `FM.safeRun(name, fn)`.
- Inject Material Icons stylesheet on startup via `FM.injectMaterialIcons?.()`.
- Define `mainTick()`, which gates and runs each feature tick under `FM.safeRun`.
- Run a coalesced scheduler: MutationObserver and the fallback interval set a `dirty` flag and call `schedule()`; the actual `mainTick` runs inside a `requestAnimationFrame` callback, throttled to `MIN_GAP_MS`.
- Re-tick when `FM_CONFIG_APPLIED` fires so config changes take effect immediately.

## Key functions / API

- `FM.isEnabled(key)` — returns `false` while config is `null`; otherwise `true` unless the flag is explicitly `false`.
- `FM.safeRun(name, fn)` — try/catch wrapper that logs `[FM] Feature failed: <name>` on error (also defined in `utils.js`; here guarded with `||` so it only sets if not already present).
- `mainTick()` — single pass that dispatches all feature ticks. `enabledButtons` gates `FM.initShortcuts`. If `enabledOther` is disabled it returns early (skipping all "other" features). Otherwise runs: item details admin mode, field ID, scripts/picklists (prefers `FM.tickFeatures()`, falls back to `FM.features.scripts.tick()` / `FM.features.picklists.tick()`), admin users search, security roles/groups layout (admin mover), admin tab titles, section toggle, collapse/expand buttons, picklist actions, security bulk-move button, field filter, workspace manager open-in-new-tab, workspace manager shortcuts, and BOM views.
- IIFE scheduler — manages `dirty`/`scheduled`/`lastRun`, `MIN_GAP_MS = 350`, `FALLBACK_INTERVAL_MS = 1200`, and the `MutationObserver` on `document.documentElement` (`childList: true, subtree: true`).

## Interactions

- **postMessage (in):** `window` message of `type: "FM_CONFIG"` from `config-bridge.js`; ignores messages where `ev.source !== window`.
- **Custom events (out/in):** dispatches `FM_CONFIG_APPLIED` on `window` after applying config; also listens for it to trigger a re-tick.
- **Globals (out):** sets `FM.config`, `FM.isEnabled`, `FM.safeRun`.
- **Globals (in / calls):** `FM.injectMaterialIcons`, `FM.initShortcuts`, `FM.applyItemDetailsAdminModeIfActive`, `FM.runFieldIdFeature`, `FM.tickFeatures`, `FM.features.scripts/picklists.tick`, `FM.runAdminUsersSearchTick`, `FM.runSecurityRolesGroupsLayoutTick`, `FM.applyAdminTabTitle`, `FM.runSectionToggleFeature`, `FM.injectCollapseExpandButtons`, `FM.runPicklistsTick`, `FM.ensureBulkMoveButtonsInCenter`, `FM.runFieldFilterFeature`, `FM.runWorkspaceManagerOpenInNewTab`, `FM.runWorkspaceManagerShortcutsTick`, `FM.runBomViewsTick`.
- **DOM:** observes `document.documentElement` for mutations.

## Notes

- `FM.config === null` is a deliberate "unknown" state: `isEnabled` returns `false` so a freshly loaded tab never flashes features as active before the real config (which may have toggles unchecked) arrives.
- The workspace shortcut flag (`enabledWorkspaceShortcuts`) is a top-level config key but is not directly checked in `mainTick`; gating for workspace shortcuts is handled inside `FM.runWorkspaceManagerShortcutsTick`.
- The MutationObserver never calls `mainTick` directly — it only sets `dirty` and schedules, to keep work coalesced and throttled.
- `FM.injectCollapseExpandButtons()?.()` invokes the function and then optional-chain-calls its return value — only effective if `injectCollapseExpandButtons` returns a callable; otherwise the second call is a no-op (likely an intentional double-call pattern or a latent quirk).
- `mainTick` runs many features every tick (up to ~once per 350ms); each feature tick must be cheap and idempotent.
