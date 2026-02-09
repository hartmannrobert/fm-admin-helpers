const DEFAULTS = { enabledButtons: true, enabledOther: true };
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS, (cfg) => {
  $("opt-buttons").checked = cfg.enabledButtons !== false;
  $("opt-other").checked = cfg.enabledOther !== false;
});

$("opt-buttons").addEventListener("change", (e) => {
  chrome.storage.sync.set({ enabledButtons: e.target.checked });
});

$("opt-other").addEventListener("change", (e) => {
  chrome.storage.sync.set({ enabledOther: e.target.checked });
});

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn-close");
    if (!btn) return;
  
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.close();
    });
  });
  