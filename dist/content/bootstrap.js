// bootstrap.js
window.FM = window.FM || {};

// Do not assume enabled before we receive config from storage (avoids new-tab
// showing "active" when user had unchecked the control center).
const CONFIG_DEFAULTS = {
  enabledButtons: true,    // Shortcut Buttons
  enabledWorkspace: true,  // Workspace Manager (shortcuts + open-in-new-tab)
  enabledScripting: true,  // Scripting Tools (editor + picklists)
  enabledSecurity: true,   // Security Admin (user search + roles/groups + move-all)
  enabledFieldIds: true,   // Field Identifiers (field IDs + filter + admin grid)
  enabledBomViews: true,   // BOM Views
  enabledAdminUi: true,    // Admin UI Tweaks (titles + section/collapse toggles)
  enabledFieldDefaults: true, // Field Editor Presets (display length / max length buttons)
  enabledFieldDefaultsAutoApply: true, // Auto-fill the default preset when Data Type / Pick List changes
  enabledRevisionSort: true // Revision/state dropdown sort-order toggle
};
FM.config = FM.config ?? null;

window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  const msg = ev.data;
  if (!msg || msg.type !== "FM_CONFIG") return;
  FM.config = { ...CONFIG_DEFAULTS, ...(FM.config || {}), ...(msg.payload || {}) };
  window.dispatchEvent(new CustomEvent("FM_CONFIG_APPLIED"));
});

FM.isEnabled = function (key) {
  if (FM.config === null) return false;
  return FM.config[key] !== false;
};

FM.safeRun = FM.safeRun || function (name, fn) {
  try { fn(); } catch (e) { console.warn(`[FM] Feature failed: ${name}`, e); }
};

FM.injectMaterialIcons?.();

// Main tick now uses the grouped feature API from fm-features.js
function mainTick() {
  if (FM.config === null) return; // wait for config before touching the page

  // ── Shortcut Buttons ────────────────────────────────────────────────────────
  if (FM.isEnabled("enabledButtons")) {
    FM.safeRun("buttons", () => FM.initShortcuts?.());
    FM.safeRun("fusionTeamSettingsButton", () => FM.ensureFusionTeamSettingsButton?.());
  }

  // ── Field Identifiers ───────────────────────────────────────────────────────
  if (FM.isEnabled("enabledFieldIds")) {
    FM.safeRun("itemDetailsAdminMode", () => FM.applyItemDetailsAdminModeIfActive?.());
    FM.safeRun("fieldId", () => FM.runFieldIdFeature?.());
    FM.safeRun("runFieldFilterFeature", () => FM.runFieldFilterFeature?.());
  }

  // ── Scripting Tools ─────────────────────────────────────────────────────────
  if (FM.isEnabled("enabledScripting")) {
    FM.safeRun("scriptsAndPicklists", () => {
      // Prefer the combined helper if present; fall back to per-feature ticks
      if (typeof FM.tickFeatures === "function") {
        FM.tickFeatures();
        return;
      }
      FM.features?.scripts?.tick?.();
      FM.features?.picklists?.tick?.();
    });
    FM.safeRun("picklistsActions", () => FM.runPicklistsTick?.());
  }

  // ── Security Admin ──────────────────────────────────────────────────────────
  if (FM.isEnabled("enabledSecurity")) {
    FM.safeRun("adminUsersSearch", () => FM.runAdminUsersSearchTick?.());
    FM.safeRun("adminMover", () => FM.runSecurityRolesGroupsLayoutTick?.());
    FM.safeRun("securityMoveAllButton", () => FM.ensureBulkMoveButtonsInCenter?.());
    FM.safeRun("securityItemNewTab", () => FM.initSecurityItemNewTab?.());
  }

  // ── Admin UI Tweaks ─────────────────────────────────────────────────────────
  if (FM.isEnabled("enabledAdminUi")) {
    FM.safeRun("adminTabTitles", () => FM.applyAdminTabTitle?.());
    FM.safeRun("sectionToggle", () => FM.runSectionToggleFeature?.());
    FM.safeRun("injectCollapseExpandButtons", () => FM.injectCollapseExpandButtons?.()?.());
  }

  // ── Workspace Manager ───────────────────────────────────────────────────────
  if (FM.isEnabled("enabledWorkspace")) {
    FM.safeRun("runWorkspaceManagerOpenInNewTab", () => FM.runWorkspaceManagerOpenInNewTab?.());
    FM.safeRun("workspaceManagerShortcuts", () => FM.runWorkspaceManagerShortcutsTick?.());
    FM.safeRun("workspaceAccessFilter", () => FM.runWorkspaceAccessFilterTick?.());
  }

  // ── BOM Views ───────────────────────────────────────────────────────────────
  if (FM.isEnabled("enabledBomViews")) {
    FM.safeRun("bomViews", () => FM.runBomViewsTick?.());
  }

  // ── Field Editor Presets ─────────────────────────────────────────────────────
  // Toggled unconditionally (not inside the isEnabled block below) so CSS scoped
  // to this class in content.css reacts live, without needing a page reload.
  FM.safeRun("fieldDefaultsWidthClass", () => {
    document.documentElement.classList.toggle("fm-field-defaults-enabled", FM.isEnabled("enabledFieldDefaults"));
  });
  if (FM.isEnabled("enabledFieldDefaults")) {
    FM.safeRun("fieldDefaults", () => FM.features?.fieldDefaults?.tick?.());
  }

  // ── Revision Sort ────────────────────────────────────────────────────────────
  if (FM.isEnabled("enabledRevisionSort")) {
    FM.safeRun("revisionSort", () => FM.runRevisionSortTick?.());
  }
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

  window.addEventListener("FM_CONFIG_APPLIED", () => {
    dirty = true;
    schedule();
  });
})();