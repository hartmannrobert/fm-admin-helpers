// background.js — drives the toolbar-icon status badge.
// Green box = at least one feature group enabled. Grey box = everything disabled.
const FEATURE_KEYS = [
  "enabledButtons",
  "enabledWorkspace",
  "enabledScripting",
  "enabledSecurity",
  "enabledFieldIds",
  "enabledBomViews",
  "enabledAdminUi",
];

const DEFAULTS = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true]));

const COLOR_ACTIVE = "#16a34a";   // green
const COLOR_INACTIVE = "#9ca3af"; // grey

function updateBadge() {
  chrome.storage.local.get(DEFAULTS, (cfg) => {
    const anyOn = FEATURE_KEYS.some((k) => cfg[k] !== false);
    chrome.action.setBadgeBackgroundColor({ color: anyOn ? COLOR_ACTIVE : COLOR_INACTIVE });
    if (chrome.action.setBadgeTextColor) {
      chrome.action.setBadgeTextColor({ color: "#ffffff" });
    }
    // Active: empty green box (no label). Disabled: grey "OFF" box.
    chrome.action.setBadgeText({ text: anyOn ? " " : "OFF" });
    chrome.action.setTitle({ title: anyOn ? "FM — features active" : "FM — all features disabled" });
  });
}

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (FEATURE_KEYS.some((k) => k in changes)) updateBadge();
});

// Service worker may be respawned without onInstalled/onStartup firing.
updateBadge();
