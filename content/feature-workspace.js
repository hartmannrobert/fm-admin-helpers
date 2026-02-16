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




(function () {
  window.FM = window.FM || {};

  const FEATURE_KEY = "workspaceOpenInNewTab";
  const BTN_CLASS = "fm-open-newtab-btn";
  const ICON_CLASS = "material-icons fm-open-newtab-icon";
  const WRAP_CLASS = "fm-open-newtab-wrap";

  function isOnWorkspaceManagerSettingsTable() {
    return (
      !!document.querySelector("td.workspaceEditButtons") &&
      !!document.querySelector('a[data-ds-path][data-ds-item="workspaceedit"]')
    );
  }

  function decodeHtmlEntities(s) {
    if (!s || typeof s !== "string") return s;
    const ta = document.createElement("textarea");
    ta.innerHTML = s;
    return ta.value;
  }

  function toAbsoluteUrl(maybeRelativeOrAbs) {
    const path = decodeHtmlEntities((maybeRelativeOrAbs || "").trim());
    if (!path) return null;
    try {
      return new URL(path, location.origin).toString();
    } catch (e) {
      return null;
    }
  }

  function extractWorkspaceIdFromUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url, location.origin);

      // query params
      const q =
        u.searchParams.get("workspaceID") ||
        u.searchParams.get("workspaceId") ||
        u.searchParams.get("workspaceid");
      if (q) return String(q);

      // hash params: ...&params=%7B%22workspaceID%22%3A%2264%22...
      const hash = u.hash || "";
      const m = hash.match(/[?&]params=([^&]+)/);
      if (m && m[1]) {
        const decoded = decodeURIComponent(m[1]);
        try {
          const obj = JSON.parse(decoded);
          const w = obj.workspaceID || obj.workspaceId || obj.workspaceid;
          if (w) return String(w);
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  function getWorkspaceIdFromContextFallback() {
    // Page-level fallback only
    try {
      const u = new URL(location.href);
      const wid = u.searchParams.get("workspaceID") || u.searchParams.get("workspaceId");
      if (wid) return String(wid);
    } catch (e) {}

    const any = document.querySelector('a[data-ds-path*="workspaceID="], a[data-ds-path*="workspaceId="]');
    const dsPath = any?.getAttribute("data-ds-path");
    const abs = toAbsoluteUrl(dsPath);
    const fromAny = extractWorkspaceIdFromUrl(abs);
    return fromAny || null;
  }

  function getWorkspaceIdForAnchor(anchor) {
    // 1) Best: anchor's own data-ds-path
    const dsPath = anchor.getAttribute("data-ds-path") || anchor.dataset?.dsPath;
    const abs = toAbsoluteUrl(dsPath);
    const fromDsPath = extractWorkspaceIdFromUrl(abs);
    if (fromDsPath) return fromDsPath;

    // 2) From nearby DOM attributes that often carry ws context
    const ctx =
      anchor.closest("[data-ds-workspaceid]") ||
      anchor.closest("[data-ds-workspaceID]") ||
      anchor.closest("[data-workspaceid]") ||
      anchor.closest("[data-workspaceID]") ||
      anchor.closest("[data-fm-ws-id]") ||
      anchor.closest("[data-fm-workspaceid]");

    if (ctx) {
      const v =
        ctx.getAttribute("data-ds-workspaceid") ||
        ctx.getAttribute("data-ds-workspaceID") ||
        ctx.getAttribute("data-workspaceid") ||
        ctx.getAttribute("data-workspaceID") ||
        ctx.getAttribute("data-fm-ws-id") ||
        ctx.getAttribute("data-fm-workspaceid");
      if (v) return String(v).trim();
    }

    // 3) From a nearby ws id badge, if present
    const badge = anchor.closest("tr, li, div")?.querySelector(".fm-ws-id-badge");
    if (badge) {
      const n = (badge.textContent || "").replace(/\D+/g, "").trim();
      if (n) return n;
    }

    // 4) Last resort
    return getWorkspaceIdFromContextFallback();
  }

  function buildAdminHashUrl({ item, workspaceID, metaType }) {
    const params = metaType
      ? { workspaceID: String(workspaceID), metaType: String(metaType) }
      : { workspaceID: String(workspaceID) };

    const encodedParams = encodeURIComponent(JSON.stringify(params));
    const base = `${location.origin}/admin`;

    return `${base}#section=setuphome&tab=workspaces&item=${encodeURIComponent(item)}&params=${encodedParams}`;
  }

  function resolveTargetUrl(anchor) {
    // A) Standard links: use their ds-path directly
    const dsPath = anchor.getAttribute("data-ds-path") || anchor.dataset?.dsPath;
    const abs = toAbsoluteUrl(dsPath);
    if (abs) return abs;

    // Per-anchor workspace context
    const wid = getWorkspaceIdForAnchor(anchor);
    if (!wid) return null;

    // B) workspacewarning links: build the matching /admin hash URL
    const td = anchor.closest("td");
    const dsItem = td?.getAttribute("data-ds-item") || td?.dataset?.dsItem;

    const map = {
      itemdetails: () => buildAdminHashUrl({ item: "itemdetails", workspaceID: wid, metaType: "D" }),
      descriptor: () => buildAdminHashUrl({ item: "descriptor", workspaceID: wid }),
      grid: () => buildAdminHashUrl({ item: "grid", workspaceID: wid, metaType: "G" }),
      workflowitems: () => buildAdminHashUrl({ item: "workflowitems", workspaceID: wid, metaType: "L" }),
      bom: () => buildAdminHashUrl({ item: "bom", workspaceID: wid, metaType: "B" }),
      sourcing: () => buildAdminHashUrl({ item: "sourcing", workspaceID: wid, metaType: "S" }),
      relationship: () => buildAdminHashUrl({ item: "relationship", workspaceID: wid }),
    };

    if (dsItem && typeof map[dsItem] === "function") {
      return map[dsItem]();
    }

    // C) Workflow Editor modal link: open standalone editor page with correct workspace id
    const onclick = anchor.getAttribute("onclick") || "";
    if (onclick.includes("workflowEditorActions") && onclick.includes("showWorkflowModal")) {
      return `${location.origin}/workflowEditor.form?workspaceId=${encodeURIComponent(wid)}`;
    }

    return null;
  }

  function ensureWrap(anchor) {
    // Wrap link and button in a flex container so button aligns on the right edge
    const td = anchor.closest("td");
    if (!td) return null;

    // If already wrapped, return the wrapper
    const existing = anchor.closest(`.${WRAP_CLASS}`);
    if (existing) return existing;

    const wrap = document.createElement("span");
    wrap.className = WRAP_CLASS;

    // Insert wrapper before anchor, then move anchor into it
    anchor.insertAdjacentElement("beforebegin", wrap);
    wrap.appendChild(anchor);

    return wrap;
  }

  function addOpenButtonNextTo(anchor) {
    if (!anchor || anchor.nodeType !== 1) return;
    if (anchor.dataset.fmNewtabInjected === "1") return;

    const url = resolveTargetUrl(anchor);
    const wrap = ensureWrap(anchor);
    if (!wrap) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.title = url ? "Open in new tab" : "No target URL found";

    const icon = document.createElement("span");
    icon.className = ICON_CLASS;
    icon.textContent = "open_in_new";
    btn.appendChild(icon);

    if (!url) {
      btn.disabled = true;
    } else {
      btn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          window.open(url, "_blank", "noopener,noreferrer");
        },
        true
      );
    }

    // Insert AFTER the text (after the anchor) but aligned by wrapper CSS
    wrap.appendChild(btn);

    anchor.dataset.fmNewtabInjected = "1";
  }

  function injectButtons(root) {
    // Standard ds-path links
    root.querySelectorAll('a.link[data-ds-path]').forEach(addOpenButtonNextTo);

    // workspacewarning rows
    root.querySelectorAll("a.workspacewarning").forEach(addOpenButtonNextTo);

    // Workflow editor modal link
    root
      .querySelectorAll('a[onclick*="workflowEditorActions"][onclick*="showWorkflowModal"]')
      .forEach(addOpenButtonNextTo);
  }

  function getRoot() {
    return document.getElementById("layoutContainer") || document.body;
  }

  function observeRerenders(root) {
    if (root.dataset.fmObserverNewtab === "1") return;
    root.dataset.fmObserverNewtab = "1";

    const mo = new MutationObserver(() => {
      if (!isOnWorkspaceManagerSettingsTable()) return;
      injectButtons(root);
    });

    mo.observe(root, { childList: true, subtree: true });
  }

  window.FM.runWorkspaceManagerOpenInNewTab = function () {
    try {
      if (!isOnWorkspaceManagerSettingsTable()) return;

      const root = getRoot();
      injectButtons(root);
      observeRerenders(root);

      window.FM[FEATURE_KEY] = true;
    } catch (e) {
      console.warn("[FM] workspaceOpenInNewTab failed", e);
    }
  };
})();

