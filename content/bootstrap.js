// bootstrap.js
window.FM = window.FM || {};

FM.config = FM.config || {
  enabledButtons: true,
  enabledOther: true
};

window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  const msg = ev.data;
  if (!msg || msg.type !== "FM_CONFIG") return;
  FM.config = { ...FM.config, ...(msg.payload || {}) };
});

FM.isEnabled = function (key) {
  return FM.config?.[key] !== false; // default true unless explicitly false
};

FM.safeRun = FM.safeRun || function (name, fn) {
  try { fn(); } catch (e) { console.warn(`[FM] Feature failed: ${name}`, e); }
};

FM.injectMaterialIcons?.();

// Main tick now uses the grouped feature API from fm-features.js
function mainTick() {
  if (FM.isEnabled("enabledButtons")) {
    FM.safeRun("buttons", () => FM.initShortcuts?.());
  }

  if (!FM.isEnabled("enabledOther")) return;

  FM.safeRun("workflowState", () => FM.updateWorkflowButtonState?.());
  FM.safeRun("fieldId", () => FM.runFieldIdFeature?.());

  // Scripts + Picklists grouped features (from fm-features.js)
  FM.safeRun("scriptsAndPicklists", () => {
    // Prefer the combined helper if present; fall back to per-feature ticks
    if (typeof FM.tickFeatures === "function") {
      FM.tickFeatures();
      return;
    }
    FM.features?.scripts?.tick?.();
    FM.features?.picklists?.tick?.();
  });

  FM.safeRun("adminUsersSearch", () => FM.runAdminUsersSearchTick?.());
  FM.safeRun("adminMover", () => FM.runSecurityRolesGroupsLayoutTick?.());

  FM.safeRun("sectionToggle", () => FM.runSectionToggleFeature?.());

  FM.safeRun("injectCollapseExpandButtons", () => FM.injectCollapseExpandButtons()?.());
  
  FM.safeRun("workspaceFilter", () => FM.runWorkspacesSearchFeature?.());
  FM.safeRun("picklistsActions", () => FM.runPicklistsTick?.());

  FM.safeRun("securityWindow", () => FM.injectAdminUsersPaneCSS?.());
  FM.safeRun("securityMoveAllButton", () => FM.ensureBulkMoveButtonsInCenter?.());

  FM.safeRun("runFieldFilterFeature", () => FM.runFieldFilterFeature?.());
  FM.safeRun("runWorkspaceManagerOpenInNewTab", () => FM.runWorkspaceManagerOpenInNewTab?.());
}

(function () {
  let dirty = true;          // run at least once
  let scheduled = false;
  let lastRun = 0;

  const MIN_GAP_MS = 350;    // lower = more responsive, higher = more stable
  const FALLBACK_INTERVAL_MS = 1200;

  function schedule() {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;

      const now = Date.now();
      if (!dirty) return;

      // throttle
      if (now - lastRun < MIN_GAP_MS) {
        // try again shortly, still coalesced
        setTimeout(schedule, MIN_GAP_MS);
        return;
      }

      dirty = false;
      lastRun = now;
      mainTick();
    });
  }

  // Fallback interval so we still recover if some DOM changes are missed
  setInterval(() => {
    dirty = true;
    schedule();
  }, FALLBACK_INTERVAL_MS);

  // MutationObserver sets dirty only, does NOT call mainTick directly
  const mo = new MutationObserver(() => {
    dirty = true;
    schedule();
  });

  mo.observe(document.documentElement, { childList: true, subtree: true });
})();