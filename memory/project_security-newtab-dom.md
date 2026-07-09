---
name: project_security-newtab-dom
description: DOM facts about the security admin table rows needed for the fmPendingItemNav row-matching logic
metadata:
  type: project
---

Users table `cells[0]` = status column: `<td class="nowrap active">ACTIVE</td>`. Text is "ACTIVE" for every active user — NOT a unique row identifier.

Edit button in roles/groups/users tables = `<a href="javascript:;">Edit</a>` — plain text "Edit", no real href.

**Why:** cells[0] non-uniqueness caused the restoration IIFE to always match the first active user row when Cmd/Ctrl+clicking "Groups".

**How to apply:** Never use `cells[0]` alone as a row fingerprint for the users table. The fix stores `rowCells` (all cell texts as array) and matches on all columns simultaneously — see `fmPendingItemNav` in `feature-security.js`.
