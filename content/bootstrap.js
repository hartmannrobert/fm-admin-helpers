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

function mainTick() {
  if (FM.isEnabled("enabledButtons")) {
    FM.safeRun("buttons", () => FM.initShortcuts?.());
  }

  if (FM.isEnabled("enabledOther")) {
    FM.safeRun("workflowState", () => FM.updateWorkflowButtonState?.());
    FM.safeRun("fieldId", () => FM.runFieldIdFeature?.());
    FM.safeRun("runScriptsTabEnhancements", () => FM.runScriptsTabEnhancements?.());
    FM.safeRun("scriptsSearch", () => FM.runScriptsSearchFeature?.());
    FM.safeRun("adminUsersSearch", () => FM.runAdminUsersSearchTick?.());
    FM.safeRun("adminMover", () => FM.runSecurityRolesGroupsLayoutTick?.());


    FM.safeRun("sectionToggle", () => FM.runSectionToggleFeature?.());
    FM.safeRun("workspaceFilter", () => FM.runWorkspacesSearchFeature?.());
    FM.safeRun("picklistsActions", () => FM.runPicklistsTick?.());


    FM.safeRun("securityWindow", () => FM.injectAdminUsersPaneCSS?.());
    FM.safeRun("securityMoveAllButton", () => FM.ensureBulkMoveButtonsInCenter?.());


    FM.safeRun("runFieldFilterFeature", () => FM.runFieldFilterFeature?.());

    FM.safeRun("runWorkspaceManagerOpenInNewTab", () => FM.runWorkspaceManagerOpenInNewTab?.());
  }
}

mainTick();
setInterval(mainTick, 800);

let pending = false;
const mo = new MutationObserver(() => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    mainTick();
  }, 200);
});
mo.observe(document.documentElement, { childList: true, subtree: true });
