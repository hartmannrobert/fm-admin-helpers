const DEFAULTS = {
    enabledButtons: true,
    enabledOther: true
  };
  
  function postConfig(cfg) {
    window.postMessage({ type: "FM_CONFIG", payload: cfg }, "*");
  }
  
  chrome.storage.sync.get(DEFAULTS, (cfg) => postConfig(cfg));
  
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const patch = {};
    for (const [k, v] of Object.entries(changes)) patch[k] = v.newValue;
    postConfig(patch);
  });
  