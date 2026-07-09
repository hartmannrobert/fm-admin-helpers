---
name: feedback_security-newtab-edit
description: The Edit button in security admin tables must use the same fmPendingItemNav flow as all other row actions — not a special hashchange-capture branch
metadata:
  type: feedback
---

Treat "Edit" row links identically to "Permissions", "Groups", and other row action links. Use `e.preventDefault()` + `e.stopImmediatePropagation()`, open list URL in new tab, store `fmPendingItemNav`, let the restoration IIFE find the row and click Edit.

**Why:** The hashchange-capture approach (let FM navigate, capture hash, restore URL, open in new tab) failed because: (1) Cmd/Ctrl+click on `<a href="javascript:;">` causes Chrome to natively open a new tab with the current page before our listener fires, and (2) `location.href` may not have updated yet when the intermediate hashchange fires. The fmPendingItemNav approach avoids both issues and already works for every other button.

**How to apply:** In `FM.initSecurityItemNewTab` (`feature-security.js`), there is NO special branch for `anchorText === 'edit'`. All row clicks fall through to the general branch.
