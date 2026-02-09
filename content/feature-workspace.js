window.FM = window.FM || {};

(function () {
  function isOnWorkspacesSetupHome() {
    return (
      location.href.includes("/admin") &&
      location.href.includes("section=setuphome") &&
      location.href.includes("tab=workspaces")
    );
  }

  function normalize(s) {
    return (s || "").toLowerCase().trim();
  }

  function getWorkspaceBlocks() {
    const scope = document.getElementById("layoutContainer") || document;
    return Array.from(scope.querySelectorAll('div[id^="bookmarked-"][data-ds-workspaceid]'));
  }

  function getWorkspaceNameAnchor(blockEl) {
    return blockEl.querySelector("a.toggle");
  }

  function getWorkspaceName(blockEl) {
    const a = getWorkspaceNameAnchor(blockEl);
    return a ? a.textContent : "";
  }

  function ensureWorkspaceIdBadge(blockEl) {
    const menu = blockEl.querySelector(".itemmenu");
    if (!menu) return;
  
    // Guard: only once per workspace instance
    if (menu.dataset.fmWsIdInjected === "1") return;
  
    const wsId = (blockEl.getAttribute("data-ds-workspaceid") || "").trim();
    if (!wsId) return;
  
    const badge = document.createElement("span");
    badge.className = "fm-ws-id-badge";
    badge.textContent = ` ${wsId}`;
  
    // Preferred target: the grey subtitle span (e.g. "Basic Workspace")
    const subtitleSpan = menu.querySelector('span[style*="font-size:11px"]');
  
    if (subtitleSpan) {
      subtitleSpan.insertAdjacentElement("afterend", badge);
    } else {
      // Fallback: append after the workspace name link
      const a = menu.querySelector("a.toggle");
      if (a) a.insertAdjacentElement("afterend", badge);
    }
  
    menu.dataset.fmWsIdInjected = "1";
  }
  

  function setExpandedState(blockEl, expanded) {
    // expanded true -> itemdisplay, false -> itemhide
    if (expanded) {
      blockEl.classList.remove("itemhide");
      blockEl.classList.add("itemdisplay");
    } else {
      blockEl.classList.remove("itemdisplay");
      blockEl.classList.add("itemhide");
    }
  }

  function applyWorkspacesFilter(query) {
    const q = normalize(query);
    const blocks = getWorkspaceBlocks();
    if (blocks.length === 0) return;

    // Always ensure ID badge exists
    for (const b of blocks) ensureWorkspaceIdBadge(b);

    // Apply visibility filter
    let visibleBlocks = [];
    for (const block of blocks) {
      const name = normalize(getWorkspaceName(block));
      const match = q === "" || name.includes(q);
      block.style.display = match ? "" : "none";
      if (match) visibleBlocks.push(block);
    }

    // If exactly one remains, expand it
    if (visibleBlocks.length > 0 && visibleBlocks.length <= 3) {
      for (const block of visibleBlocks) {
        setExpandedState(block, true);
        block.dataset.fmAutoExpanded = "1";
      }
    } else {
      // Revert only blocks we previously auto-expanded
      for (const block of blocks) {
        if (block.dataset.fmAutoExpanded === "1") {
          setExpandedState(block, false);
          delete block.dataset.fmAutoExpanded;
        }
      }
    }
  }

  function ensureWorkspacesSearchField() {
    if (!isOnWorkspacesSetupHome()) return;

    const newWorkspaceBtn = document.getElementById("new_workspace");
    if (!newWorkspaceBtn) return;

    if (document.getElementById("fm-search-workspaces")) return;

    const input = document.createElement("input");
    input.id = "fm-search-workspaces";
    input.type = "text";
    input.placeholder = "Filter Workspaces";
    input.autocomplete = "off";
    input.spellcheck = false;

    input.classList.add("fm-search-input");

    let t = null;
    input.addEventListener("input", () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => applyWorkspacesFilter(input.value), 150);
    });

    newWorkspaceBtn.insertAdjacentElement("afterend", input);

    applyWorkspacesFilter(input.value);
  }

  function keepWorkspacesSearchFilterInSync() {
    const input = document.getElementById("fm-search-workspaces");
    if (!input) return;
    applyWorkspacesFilter(input.value);
  }

  FM.runWorkspacesSearchFeature = function () {
    ensureWorkspacesSearchField();
    keepWorkspacesSearchFilterInSync();
  };
})();
