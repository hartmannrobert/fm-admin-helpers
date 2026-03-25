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
});
  