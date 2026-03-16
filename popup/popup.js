const DEFAULTS = { enabledButtons: true, enabledOther: true };
const $ = (id) => document.getElementById(id);

chrome.storage.local.get(DEFAULTS, (cfg) => {
  $("opt-buttons").checked = cfg.enabledButtons !== false;
  $("opt-other").checked = cfg.enabledOther !== false;
});

$("opt-buttons").addEventListener("change", (e) => {
  chrome.storage.local.set({ enabledButtons: e.target.checked });
});

$("opt-other").addEventListener("change", (e) => {
  chrome.storage.local.set({ enabledOther: e.target.checked });
});

document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("btn-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.close();
    });
  }
  const snippetsBtn = document.getElementById("btn-snippets");
  if (snippetsBtn) {
    snippetsBtn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id !== undefined) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "fm-open-snippet-modal" }, (err) => {
            if (chrome.runtime.lastError) {
              chrome.runtime.openOptionsPage();
            }
          });
        } else {
          chrome.runtime.openOptionsPage();
        }
        window.close();
      });
    });
  }
});
  