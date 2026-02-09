window.FM = window.FM || {};


 FM.injectMaterialIcons = function() {
    if (document.getElementById("fm-material-icons")) return;
  
    const link = document.createElement("link");
    link.id = "fm-material-icons";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/icon?family=Material+Icons";
    document.head.appendChild(link);
  }


FM.tenantNameFromLocation = function() {
    return location.hostname.split(".")[0];
}

FM.isWorkspaceContext = function(url) {
    return /\/plm\/workspaces\/\d+/.test(url);
}

FM.isOnScriptsTab = function() {
    return location.href.includes("tab=scripts");
}


FM.safeRun = function (name, fn) {
  try {
    fn();
  } catch (e) {
    console.warn(`[FM] Feature failed: ${name}`, e);
  }
};

