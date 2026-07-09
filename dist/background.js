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

const HOST_MARKERS = ["autodesk360", "autodeskplm360"];

function isFmHost(url) {
  return !!url && HOST_MARKERS.some((marker) => url.includes(marker));
}

function updateBadgeForTab(tabId, url) {
  if (!isFmHost(url)) {
    // Not a Fusion Manage / Fusion Team tab — plain icon, no badge.
    chrome.action.setBadgeText({ tabId, text: "" });
    chrome.action.setTitle({ tabId, title: "FM" });
    return;
  }

  chrome.storage.local.get(DEFAULTS, (cfg) => {
    const anyOn = FEATURE_KEYS.some((k) => cfg[k] !== false);
    chrome.action.setBadgeBackgroundColor({ tabId, color: anyOn ? COLOR_ACTIVE : COLOR_INACTIVE });
    if (chrome.action.setBadgeTextColor) {
      chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" });
    }
    // Active: empty green box (no label). Disabled: grey "OFF" box.
    chrome.action.setBadgeText({ tabId, text: anyOn ? " " : "OFF" });
    chrome.action.setTitle({ tabId, title: anyOn ? "FM — features active" : "FM — all features disabled" });
  });
}

function updateActiveTabBadge() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.id != null) updateBadgeForTab(tab.id, tab.url);
  });
}

chrome.runtime.onInstalled.addListener(updateActiveTabBadge);
chrome.runtime.onStartup.addListener(updateActiveTabBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (FEATURE_KEYS.some((k) => k in changes)) updateActiveTabBadge();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab) updateBadgeForTab(tab.id, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    updateBadgeForTab(tabId, tab.url);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  updateActiveTabBadge();
});

// Service worker may be respawned without onInstalled/onStartup firing.
updateActiveTabBadge();
