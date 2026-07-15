# Changelog

All notable changes to Fusion Manage Admin Helpers are documented here.

---

## [Unreleased]

### Added

#### Field Editor Presets & Auto-fill
On the admin "Create/Edit Field" form (`#contentformdiv`), a row of preset buttons (e.g. `20` / `50` / `200` for Single Line Text, `Standard` / `Wide` for Integer) appears next to the **Data Type** select, filling display length / field length / precision / max length with common values from `dist/data/field-defaults.json`.

Each type also has a `defaultPreset`, which is auto-applied when Data Type changes (or, for **Pick List**, when a lookup table is picked in `#pickListSelect` — its `displayLength` input only exists in the DOM after that selection) — so most fields need no manual clicking at all. Auto-fill retries for ~1.5s after the change since the page asynchronously rebuilds/clears the attribute inputs and a single synchronous write gets overwritten.

Also widened `pickListSelect`, `fieldName`, `fieldID`, and `fieldDesc` to 300px (capped to available space) for readability.

**New setting** — "Auto-fill Presets" in the popup Control Center (`enabledFieldDefaultsAutoApply`, default on) lets you keep the preset buttons but turn off the automatic fill-on-change if you'd rather choose manually.

**Why this matters** — most fields of a given data type use the same length/precision values every time; this removes the repetitive manual entry while still allowing a manual override via the buttons.

---

#### Filter Already-Assigned Workspaces on Fusion Team Groups
On Fusion Team's Manage Groups page, the "add workspace" dropdown for a group's workspace access no longer lists workspaces the group already has access to — only unassigned workspaces show up.

**Why this matters** — the dropdown previously always listed every workspace in the tenant, including ones already added, making it easy to lose track of what's left to assign, especially in tenants with many workspaces.

---

#### Settings Shortcut on Fusion Team
The Settings Shortcut gear button now also appears on Fusion Team (`autodesk360.com`) pages, placed in the top nav bar right after the Help icon. Clicking it opens the same shortcuts popup as on Fusion Manage (General Settings, Workspace Manager, Scripts, Users/Members, Groups, Roles), with links built against the matching Fusion Manage tenant (e.g. `acme.autodesk360.com` → `acme.autodeskplm360.net`).

**Why this matters** — Fusion Team users who need to jump into Fusion Manage administration previously had to know or guess the tenant's PLM360 URL. This surfaces the same one-click shortcuts already available on the Fusion Manage side.

---

#### Cmd/Ctrl+Click to Open Roles & Groups Items in New Tab
On the Security Admin **Roles** and **Groups** tabs, Cmd+click (Mac) or Ctrl+click (Windows) on any row opens that item in a new tab without navigating away from the list. Filters and scroll position on the current tab are fully preserved.

**How it works** — the new tab loads the roles/groups list, automatically scrolls to the clicked row, highlights it in amber, and attempts to open the item automatically. If the automatic click succeeds (FM accepts it), the item opens immediately. If not, the highlighted row is a single click away.

**Why this matters** — FM's item URLs (`admin#section=adminusers&tab=roles&item=...`) are not deep-linkable; they only work as in-session navigation. Opening them in a new tab via a standard URL copy always shows the list instead of the item. This feature works around that limitation by replaying the navigation in the new tab context.

---

#### Link Behavior Setting
A global "Link Behavior" toggle in the popup Control Center controls how shortcut and navigation links open across the extension. Two modes:

- **Same Tab** — navigate current tab (default, matches prior behavior)
- **New Tab** — always open in a new background tab

The setting persists in `chrome.storage.local` under `fmLinkOpenMode` and is broadcast to all active PLM tabs via the existing config bridge, so changes take effect without a page reload.

**Scope** — applies to:
- Admin & Settings shortcuts popup (General Settings, Workspace Manager, Scripts, Users, Groups, Roles)
- Workspace quicklinks popup
- Admin Shortcuts popup (Open Workspace, Create New Item, workspace quicklinks)
- Workspace Manager row "open" buttons
- Library script links in the Script Editor (#section-includes)

**Modifier keys** — middle-click and Shift+click always open a new tab regardless of the setting (standard browser convention preserved). Ctrl/Cmd/Alt clicks pass through to the browser natively.

---

## Prior changes

Prior changes were not tracked in this file. See git log for history.
