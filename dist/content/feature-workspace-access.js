window.FM = window.FM || {};

// ===== Feature: Filter "already added" workspaces out of the Add-Workspace autocomplete =====
// The FCE autocomplete popper (data-testid="fce-autocomplete-popper") that opens when adding a
// workspace to a role/group always lists every workspace in the tenant, even ones already present
// in the DataGrid above it (data-testid="fce-data-grid"). This hides those already-added rows from
// the dropdown so only unassigned workspaces remain selectable.
//
// The grid virtualizes rows (only the scrolled-into-view slice exists in the DOM at any moment), so
// a single read of the DOM would miss anything currently scrolled out of view. We walk the grid's
// own scroller from top to bottom to force every row to render at least once, collect names along
// the way, then put the scroll position back. Only runs once per row-count change, and only while
// the dropdown is actually open (so the brief scroll happens while the user's attention is on the
// popper, not on the grid behind it).

(function () {
  const HIDDEN_ATTR = "data-fm-ws-access-hidden";
  const SCAN_STEP_DELAY_MS = 35;

  // Widen the focus panel so workspace names have room instead of truncating.
  if (!document.getElementById("fm-ws-access-style")) {
    const style = document.createElement("style");
    style.id = "fm-ws-access-style";
    style.textContent = [
      // width/max-width locked (no flex-basis!) — .fce-focus-panel also wraps the assigned-
      // workspaces DataGrid below the search box. A "flex: 0 0 450px" shorthand previously set
      // the panel's main-axis size, and since its parent is a flex *column*, that meant HEIGHT,
      // not width — collapsing the DataGrid's available space to 0 (the "useResizeContainer ...
      // empty height" MUI error). Pure width/min-width/max-width avoids touching the main axis.
      // Popper height is intentionally left at its default — forcing it broke the same DataGrid.
      ".fce-focus-panel { width: 450px !important; min-width: 450px !important; max-width: 450px !important; resize: none !important; }",
    ].join("\n");
    document.documentElement.appendChild(style);
  }

  let _cachedNames = new Set();
  let _lastRowCount = null;
  let _scanInFlight = false;

  function normalize(text) {
    return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isWorkspaceAccessPage() {
    return (
      location.hostname.endsWith(".autodesk360.com") &&
      location.pathname.startsWith("/g/admin/manage/groups")
    );
  }

  // data-testid="fce-data-grid" is reused by every MUI DataGrid on this page (e.g. the groups list
  // grid also matches), so we can't just grab the first one. The workspace-access grid is the only
  // one with an "assignedRoles" column — use that to disambiguate.
  function getGrid() {
    const grids = document.querySelectorAll('[data-testid="fce-data-grid"]');
    for (const grid of grids) {
      if (grid.querySelector('[data-field="assignedRoles"]')) return grid;
    }
    return null;
  }

  // aria-rowcount reflects the grid's total row model, not just the rendered slice, so it changes
  // when switching groups or when a workspace is added/removed from this one — use it to know when
  // the cached name set has gone stale.
  function getRowCount(grid) {
    const main = grid.querySelector(".MuiDataGrid-main[aria-rowcount]");
    const raw = main?.getAttribute("aria-rowcount");
    const n = raw ? parseInt(raw, 10) : null;
    return Number.isFinite(n) ? n : null;
  }

  function collectVisibleNames(grid, into) {
    grid.querySelectorAll('[data-testid="fce-truncated-text-tooltip"]').forEach((el) => {
      const name = normalize(el.textContent);
      if (name) into.add(name);
    });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function scanAllRows(grid) {
    const scroller = grid.querySelector(".MuiDataGrid-virtualScroller");
    const names = new Set();
    collectVisibleNames(grid, names);

    if (!scroller) return names;

    const originalScrollTop = scroller.scrollTop;
    const step = scroller.clientHeight || 400;
    const total = scroller.scrollHeight;

    // Nothing virtualized away if it all already fits in the viewport — skip the scroll walk.
    if (total <= step) return names;

    for (let pos = 0; pos <= total; pos += step) {
      scroller.scrollTop = pos;
      scroller.dispatchEvent(new Event("scroll"));
      await wait(SCAN_STEP_DELAY_MS);
      collectVisibleNames(grid, names);
    }

    scroller.scrollTop = originalScrollTop;
    scroller.dispatchEvent(new Event("scroll"));
    await wait(SCAN_STEP_DELAY_MS);

    return names;
  }

  function getStagedChipNames() {
    const names = new Set();
    document
      .querySelectorAll('[data-testid^="fce-autocomplete-chip-"] .MuiChip-label')
      .forEach((el) => {
        const name = normalize(el.textContent);
        if (name) names.add(name);
      });
    return names;
  }

  function filterPopper(popper, addedNames) {
    popper.querySelectorAll('li[role="menuitem"]').forEach((li) => {
      const name = normalize(li.textContent);
      const shouldHide = name && addedNames.has(name);

      if (shouldHide) {
        if (li.getAttribute(HIDDEN_ATTR) !== "1") {
          li.setAttribute(HIDDEN_ATTR, "1");
          li.style.display = "none";
        }
      } else if (li.getAttribute(HIDDEN_ATTR) === "1") {
        li.removeAttribute(HIDDEN_ATTR);
        li.style.display = "";
      }
    });
  }

  function applyFilterNow() {
    const poppers = getPoppers();
    if (!poppers.length) return;

    const addedNames = new Set(_cachedNames);
    getStagedChipNames().forEach((name) => addedNames.add(name));
    poppers.forEach((popper) => filterPopper(popper, addedNames));
    updateAddAllButtonVisibility(poppers);
  }

  // When every workspace is already assigned, the popper collapses to just its header row, but
  // its actual bounding box still reserves extra (invisible) space below that for a would-be
  // empty-state — anchoring the button to that box's bottom edge lands it way past the visible
  // border. Simplest fix: there's nothing to add, so don't show it at all.
  function hasUnhiddenItems(popper) {
    return Array.from(popper.querySelectorAll('li[role="menuitem"]')).some(
      (li) => li.getAttribute(HIDDEN_ATTR) !== "1"
    );
  }

  function updateAddAllButtonVisibility(poppers) {
    const target = Array.from(poppers).find(hasUnhiddenItems);
    if (target) {
      positionAddAllButton(target);
    } else {
      removeAddAllButton();
    }
  }

  // ===== Multi-select: keep the popper open across picks, plus an "Add all" button =====
  // This widget closes its popper on every single selection (it's not a native multi-select
  // Autocomplete). We can't reach into its React state, so we fake multi-select purely from the
  // DOM: remember whatever element had focus right before the popper opened (the search input
  // that triggers it), and when the popper unmounts right after a pick, re-click/focus that same
  // element to reopen it. An "Add all remaining" button drives the same click-then-reopen cycle
  // in a loop over every still-unassigned item.

  const ADD_ALL_MARKER = "data-fm-ws-access-add-all";
  const REOPEN_DELAY_MS = 30;
  const REOPEN_POLL_MS = 20;
  const REOPEN_TIMEOUT_MS = 2000;

  const GHOST_FALLBACK_MS = 500;
  const GHOST_MIN_DWELL_MS = 260;

  let _openerEl = null;
  let _pendingReopen = false;
  let _bulkAddInFlight = false;
  let _ghostEl = null;
  let _ghostFallbackTimer = null;

  function getPoppers() {
    // Exclude our own ghost clone — it carries the same testid so it stays visually identical,
    // but it must never be treated as a real, interactive popper.
    return document.querySelectorAll(
      '[data-testid="fce-autocomplete-popper"]:not([data-fm-ws-access-ghost])'
    );
  }

  function reopenOpener() {
    const opener = _openerEl;
    if (!opener || !opener.isConnected) return;
    opener.focus();
    ["pointerdown", "mousedown", "mouseup", "click"].forEach((type) => {
      opener.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
  }

  // The real popper's open/close is a JS-timed transition (react-transition-group style), not a
  // CSS one, so we can't just zero out a transition-duration to make it instant. Instead, the
  // moment a pick is made we freeze a pixel-perfect clone in place over the real popper's spot —
  // it sits there covering the close+reopen cycle underneath, then gets swapped out once the real
  // popper is back, so the user never sees an empty gap or the widget actually disappear.
  function clearGhost() {
    if (_ghostFallbackTimer) {
      clearTimeout(_ghostFallbackTimer);
      _ghostFallbackTimer = null;
    }
    if (_ghostEl) {
      _ghostEl.remove();
      _ghostEl = null;
    }
  }

  function spawnGhost(popper) {
    clearGhost();
    const rect = popper.getBoundingClientRect();
    const ghost = popper.cloneNode(true);
    ghost.removeAttribute(ADD_ALL_MARKER);
    ghost.removeAttribute("data-fm-ws-access-listener");
    ghost.setAttribute("data-fm-ws-access-ghost", "1");
    ghost.style.position = "fixed";
    ghost.style.margin = "0";
    ghost.style.top = `${rect.top}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.transform = "none";
    ghost.style.transition = "none";
    ghost.style.animation = "none";
    ghost.style.opacity = "1";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "2147483647";
    document.body.appendChild(ghost);
    _ghostEl = ghost;
    // If the real popper never comes back (e.g. that was the last unassigned workspace and it
    // genuinely closed for good), don't leave a stale clone on screen forever.
    _ghostFallbackTimer = setTimeout(clearGhost, GHOST_FALLBACK_MS);
  }

  function markSelectionMade(popper) {
    _openerEl = _openerEl && _openerEl.isConnected ? _openerEl : document.activeElement;
    _pendingReopen = true;
    spawnGhost(popper);
  }

  function waitForPopperCycle() {
    // Waits for the current popper to disappear (selection closed it), then reappear
    // (our reopen kicked in), so the caller can safely pick the next item.
    return new Promise((resolve) => {
      const start = Date.now();
      let sawClosed = false;
      const tick = () => {
        const stillOpen = getPoppers().length > 0;
        if (!sawClosed && !stillOpen) sawClosed = true;
        if (sawClosed && stillOpen) return resolve(true);
        if (Date.now() - start > REOPEN_TIMEOUT_MS) return resolve(false);
        setTimeout(tick, REOPEN_POLL_MS);
      };
      tick();
    });
  }

  const ADD_ALL_BTN_ID = "fm-ws-access-add-all-btn";

  // Appending the button as a DOM child of the popper landed it inside whatever internal layout
  // the popper already has (it ended up inline next to the "PLM WORKSPACES IN HUB" section label,
  // which is the popper's own header row, not a plain block). Instead of fighting that unknown
  // internal structure, keep the button as a standalone element positioned from the popper's
  // bounding rect — it sits just below it regardless of what's inside.
  function positionAddAllButton(popper) {
    let btn = document.getElementById(ADD_ALL_BTN_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = ADD_ALL_BTN_ID;
      btn.type = "button";
      btn.textContent = "Add all remaining";
      btn.style.cssText =
        "position:fixed;z-index:2147483647;font-size:12px;line-height:1.4;padding:4px 12px;" +
        "border:1px solid #999;border-radius:4px;background:#f5f5f5;color:#222;cursor:pointer;" +
        "box-shadow:0 1px 4px rgba(0,0,0,0.25);";
      btn.addEventListener("mouseenter", () => (btn.style.background = "#e8e8e8"));
      btn.addEventListener("mouseleave", () => (btn.style.background = "#f5f5f5"));
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        addAllRemaining();
      });
      document.body.appendChild(btn);
    }
    const rect = popper.getBoundingClientRect();
    btn.style.top = `${rect.bottom + 6}px`;
    btn.style.left = `${rect.left}px`;
  }

  function removeAddAllButton() {
    document.getElementById(ADD_ALL_BTN_ID)?.remove();
  }

  async function addAllRemaining() {
    if (_bulkAddInFlight) return;
    _bulkAddInFlight = true;
    try {
      // Guard against ever re-clicking the same visible name twice if a reopen is briefly slow.
      const clicked = new Set();
      for (let i = 0; i < 500; i++) {
        const poppers = getPoppers();
        if (!poppers.length) break;
        applyFilterNow();

        let target = null;
        for (const popper of poppers) {
          target = Array.from(popper.querySelectorAll('li[role="menuitem"]')).find((li) => {
            if (li.getAttribute(HIDDEN_ATTR) === "1") return false;
            const name = normalize(li.textContent);
            return name && !clicked.has(name);
          });
          if (target) break;
        }
        if (!target) break;

        clicked.add(normalize(target.textContent));
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        target.click();

        await waitForPopperCycle();
      }
    } finally {
      _bulkAddInFlight = false;
      applyFilterNow();
    }
  }

  // A dedicated observer (rather than the shared poll-driven tick) is needed here because the
  // reopen has to fire within the same DOM turn the popper unmounts in, or the user sees it flash
  // closed. Scoped to isWorkspaceAccessPage() so it's a no-op everywhere else.
  let _popperWasOpen = false;
  // Pulled out of the tick so the observer can call it the instant the popper mounts, instead of
  // waiting for bootstrap's shared poll loop (350ms-1200ms cadence) to get around to it — that lag
  // was the "slow to load" complaint on first open.
  function refreshAccessFilter() {
    const grid = getGrid();
    if (!grid) return;

    const rowCount = getRowCount(grid);
    if (!_scanInFlight && (rowCount !== _lastRowCount || _cachedNames.size === 0)) {
      _scanInFlight = true;
      _lastRowCount = rowCount;
      scanAllRows(grid)
        .then((names) => {
          _cachedNames = names;
        })
        .catch((e) => console.warn("[FM] workspace access scan failed", e))
        .finally(() => {
          _scanInFlight = false;
          applyFilterNow();
        });
      return;
    }

    applyFilterNow();
  }

  function handlePopperPresenceChange() {
    if (!isWorkspaceAccessPage()) return;
    const poppers = getPoppers();
    const isOpen = poppers.length > 0;

    if (isOpen && !_popperWasOpen) {
      if (!_pendingReopen) _openerEl = document.activeElement;
      poppers.forEach((popper) => {
        if (!popper.hasAttribute("data-fm-ws-access-listener")) {
          popper.setAttribute("data-fm-ws-access-listener", "1");
          popper.addEventListener(
            "click",
            (ev) => {
              if (ev.target.closest('li[role="menuitem"]')) markSelectionMade(popper);
            },
            true
          );
        }
      });
      refreshAccessFilter();
      // The real popper's own entrance transition (~200ms fade/grow) is still running right when
      // it remounts, so pulling the ghost away immediately just swaps one blank moment for
      // another. Hold it a bit longer so the real popper is visually settled before it's revealed.
      if (_ghostEl) {
        setTimeout(clearGhost, GHOST_MIN_DWELL_MS);
      }
    } else if (!isOpen && _popperWasOpen) {
      if (_pendingReopen) {
        _pendingReopen = false;
        setTimeout(reopenOpener, REOPEN_DELAY_MS);
      } else {
        removeAddAllButton();
      }
    }

    _popperWasOpen = isOpen;
  }

  new MutationObserver(handlePopperPresenceChange).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.FM.runWorkspaceAccessFilterTick = function () {
    if (!isWorkspaceAccessPage()) {
      _cachedNames = new Set();
      _lastRowCount = null;
      return;
    }
    if (!getPoppers().length) return;
    refreshAccessFilter();
  };
})();
