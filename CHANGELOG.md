# Changelog

All notable changes to Fusion Manage Admin Helpers are documented here.

---

## [Unreleased]

### Added

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
