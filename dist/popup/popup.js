// popup.js — Control Center
// Each feature group maps a checkbox id to a chrome.storage.local flag.
const FEATURES = [
  { id: "opt-buttons",   key: "enabledButtons" },
  { id: "opt-workspace", key: "enabledWorkspace" },
  { id: "opt-scripting", key: "enabledScripting" },
  { id: "opt-security",  key: "enabledSecurity" },
  { id: "opt-fieldids",  key: "enabledFieldIds" },
  { id: "opt-bomviews",  key: "enabledBomViews" },
  { id: "opt-adminui",   key: "enabledAdminUi" },
];

const DEFAULTS = Object.fromEntries(FEATURES.map((f) => [f.key, true]));
const $ = (id) => document.getElementById(id);

// Link behavior toggle ("same" | "new" | "split")
function initLinkMode() {
  chrome.storage.local.get({ fmLinkOpenMode: "same" }, (cfg) => {
    var radios = document.querySelectorAll('input[name="link-mode"]');
    radios.forEach((r) => { r.checked = r.value === cfg.fmLinkOpenMode; });
  });
  document.querySelectorAll('input[name="link-mode"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) chrome.storage.local.set({ fmLinkOpenMode: r.value });
    });
  });
}
document.addEventListener("DOMContentLoaded", initLinkMode);

// Reload only the active PLM tab so disabled features stop injecting (they only
// add DOM on tick; turning a feature OFF needs a reload to remove already-injected
// markup). Only current active tab reload, not all matching tabs.
function reloadPlmTabs() {
  if (!chrome.tabs || !chrome.tabs.query) return;
  chrome.tabs.query({ active: true, currentWindow: true, url: "https://*.autodeskplm360.net/*" }, (tabs) => {
    const t = tabs && tabs[0];
    if (t && t.id != null) chrome.tabs.reload(t.id);
  });
}

// Reflect current state: master button label + header status pill (mirrors the
// toolbar-icon badge — green/Active when any feature on, grey/Disabled when all off).
function updateMasterLabel() {
  const anyOn = FEATURES.some((f) => $(f.id).checked);

  const btn = $("btn-toggle-all");
  btn.textContent = anyOn ? "Disable All" : "Enable All";
  btn.dataset.action = anyOn ? "disable" : "enable";

  const pill = $("status-pill");
  const text = $("status-text");
  if (pill && text) {
    pill.classList.toggle("fmg-popup__status--off", !anyOn);
    text.textContent = anyOn ? "Active" : "Disabled";
  }
}

// Initial paint from storage.
chrome.storage.local.get(DEFAULTS, (cfg) => {
  FEATURES.forEach((f) => { $(f.id).checked = cfg[f.key] !== false; });
  updateMasterLabel();
});

// Per-feature toggle: persist, reload on disable, refresh master label.
FEATURES.forEach((f) => {
  $(f.id).addEventListener("change", (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.set({ [f.key]: enabled });
    if (!enabled) reloadPlmTabs();
    updateMasterLabel();
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const masterBtn = $("btn-toggle-all");
  if (masterBtn) {
    masterBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const disabling = masterBtn.dataset.action === "disable";
      const value = !disabling; // disable → false, enable → true
      const patch = {};
      FEATURES.forEach((f) => { $(f.id).checked = value; patch[f.key] = value; });
      chrome.storage.local.set(patch);
      if (disabling) reloadPlmTabs(); // only reload when removing features
      updateMasterLabel();
    });
  }

  const disclosure = $("features-disclosure");
  const featuresList = $("features-list");
  if (disclosure && featuresList) {
    disclosure.addEventListener("click", (e) => {
      e.preventDefault();
      const expanded = disclosure.getAttribute("aria-expanded") === "true";
      disclosure.setAttribute("aria-expanded", String(!expanded));
      featuresList.classList.toggle("fmg-popup__workflow-list--collapsed", expanded);
    });
  }

  const closeBtn = $("btn-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.close();
    });
  }
});
