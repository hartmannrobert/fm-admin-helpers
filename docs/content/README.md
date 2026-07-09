# `dist/content/` — Feature Docs

Per-file docs for the content scripts. See [CLAUDE.md](../../CLAUDE.md) for architecture overview.

## Infrastructure
- [bootstrap.md](bootstrap.md) — central tick loop, feature orchestration, config
- [utils.md](utils.md) — `FM.safeRun`, shared helpers, logging, theme detection
- [config-bridge.md](config-bridge.md) — `chrome.storage` → MAIN world via `postMessage`
- [ace-capture.md](ace-capture.md) — Ace editor bridge (**MAIN world**)

## Features
- [feature-scripts.md](feature-scripts.md) — script editor enhancements + picklists
- [feature-buttons.md](feature-buttons.md) — shortcut buttons injection (Fusion Manage + Fusion Team settings-shortcut button)
- [feature-workspace.md](feature-workspace.md) — workspace manager improvements
- [feature-security.md](feature-security.md) — security admin filter/reorder/bulk-move
- [feature-fieldid.md](feature-fieldid.md) — field identifier display on item details
- [feature-admin-titles.md](feature-admin-titles.md) — admin page title tweaks
- [feature-bom-views.md](feature-bom-views.md) — BOM Views tabbed UI + drag/drop

## Snippets
- [snippet-storage.md](snippet-storage.md) — dual-backend persistence (chrome.storage + IndexedDB)
- [snippet-modal.md](snippet-modal.md) — snippet manager UI
- [script-snippet.md](script-snippet.md) — snippet dropdown placeholder
- [go-to-function.md](go-to-function.md) — regex-based function definition parser
