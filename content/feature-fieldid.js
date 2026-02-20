(function () {
  // Ensure global namespace
  window.FM = window.FM || {};

  // ------------------ small helpers ------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const safeQueryAll = (sel, root = document) => Array.from((root || document).querySelectorAll(sel || ""));
  const safeQuery = (sel, root = document) => { try { return (root || document).querySelector(sel); } catch (e) { return null; } };

  // ------------------ clipboard util ------------------
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.top = "-1000px";
        textarea.style.left = "-1000px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
      } catch (e) {
        console.warn("[FM FieldID] Copy failed", e);
        return false;
      }
    }
  }

  // ------------------ Field ID + proxy buttons ------------------
  function moveButtonsInFrontOfFieldId(itemSpan, fieldIdSpan) {
    if (!itemSpan || !fieldIdSpan) return;
    const lc = document.getElementById("layoutContainer");
    if (!lc || !lc.contains(itemSpan)) return; // prevent proxying outside layoutContainer

    const container = itemSpan.closest("div.fieldIdentifier");
    if (!container) return;

    const nativeDelete = container.querySelector(":scope > img.deleteButton");
    const nativeClone  = container.querySelector(":scope > img.cloneIcon");
    const nativeEdit   = container.querySelector(":scope > img.editIcon");

    if (!nativeEdit && !nativeClone && !nativeDelete) return;

    let proxy = itemSpan.querySelector(":scope > .fm-field-icons");
    if (!proxy) {
      proxy = document.createElement("span");
      proxy.className = "fm-field-icons";
      proxy.setAttribute("data-fm-proxy-icons", "1");
      itemSpan.insertBefore(proxy, fieldIdSpan);
    } else {
      proxy.setAttribute("data-fm-proxy-icons", "1");
    }

    if (nativeEdit) nativeEdit.classList.add("fm-native-icon-hidden");
    if (nativeClone) nativeClone.classList.add("fm-native-icon-hidden");
    if (nativeDelete) nativeDelete.classList.add("fm-native-icon-hidden");

    function ensureProxyButton(key, nativeEl, src, className) {
      if (!nativeEl) return;
      let btn = proxy.querySelector(`:scope > img[data-fm-proxy="${key}"]`);
      if (!btn) {
        btn = document.createElement("img");
        btn.setAttribute("data-fm-proxy", key);
        btn.src = src;
        btn.className = className;
        btn.draggable = false;
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          nativeEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        }, true);
        proxy.appendChild(btn);
      } else {
        if (btn.src !== src) btn.src = src;
        if (btn.className !== className) btn.className = className;
      }
    }

    const desired = [
      { key: "edit",   el: nativeEdit,   src: "images/icons/edit_16.png",      cls: "editIcon" },
      { key: "clone",  el: nativeClone,  src: "images/icons/copy_file_16.png", cls: "cloneIcon" },
      { key: "delete", el: nativeDelete, src: "images/buttons/delete_16.png",  cls: "deleteButton" },
    ];

    // remove old proxies not desired
    Array.from(proxy.querySelectorAll(":scope > img[data-fm-proxy]")).forEach((img) => {
      const k = img.getAttribute("data-fm-proxy");
      if (!desired.some(d => d.key === k)) img.remove();
    });

    // rebuild in deterministic order
    desired.forEach(d => ensureProxyButton(d.key, d.el, d.src, d.cls));

    itemSpan.dataset.fmButtonsMoved = "1";
  }

  function enhanceFieldIdentifiersOnce(root = document) {
    if (!isOnFieldIdTargetPage()) return;
    const items = safeQueryAll("span.fieldIdentifier", root);
    for (const item of items) {
      let fieldIdSpan = item.querySelector(":scope > .fm-field-id");
      if (!fieldIdSpan) {
        const currentID = (item.id || "").replace("null", "");
        if (!currentID) continue;
        fieldIdSpan = document.createElement("span");
        fieldIdSpan.className = "fm-field-id";
        fieldIdSpan.textContent = currentID;
        fieldIdSpan.title = "Click to copy Field ID";
        fieldIdSpan.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = await copyToClipboard(currentID);
          fieldIdSpan.title = ok ? `Copied: ${currentID}` : "Copy failed";
          setTimeout(() => { fieldIdSpan.title = "Click to copy Field ID"; }, 1200);
        });
        item.insertBefore(fieldIdSpan, item.firstChild);
      }
      moveButtonsInFrontOfFieldId(item, fieldIdSpan);
    }
  }

  const FM_FIELDID_TARGETS = [
    "admin#section=setuphome&tab=workspaces&item=itemdetails",
    "admin#section=setuphome&tab=workspaces&item=grid",
  ];
  function isOnFieldIdTargetPage() {
    const href = location.href || "";
    return FM_FIELDID_TARGETS.some((t) => href.includes(t));
  }

  // inject CSS once
  (function injectFieldIdCssOnce() {
    if (document.getElementById("fm-fieldid-css")) return;
    const style = document.createElement("style");
    style.id = "fm-fieldid-css";
    style.textContent = `
      .fm-field-icons { display: inline-flex; gap: 4px; margin-right: 4px; vertical-align: middle; }
      .fm-field-icons img { vertical-align: middle; cursor: pointer; }
      .fm-field-id { margin-right: 6px; cursor: pointer; }
      .fm-native-icon-hidden { visibility: hidden !important; }
    `;
    document.documentElement.appendChild(style);
  })();

  window.FM.runFieldIdFeature = function () {
    enhanceFieldIdentifiersOnce(document);
  };

  // ------------------ Section expand / collapse ------------------
  (function sectionToggleFeature() {
    const BTN_COLLAPSE_ID = "fm-collapse-sections-btn";
    const BTN_EXPAND_ID = "fm-expand-sections-btn";
    const COLLAPSED_HEIGHT_PX = 24;
    const EPS = 4; // visual epsilon

    function isOnWorkspaceGridTab() {
      return location.href.includes("section=setuphome") &&
             location.href.includes("tab=workspaces") &&
             location.href.includes("item=grid");
    }

    function getRoot() { return document.getElementById("layoutContainer"); }
    function getSections() {
      const r = getRoot();
      if (!r) return [];
      return safeQueryAll("div.sectionIdentifier", r).filter(s => r.contains(s));
    }

    // Prefer real toggle anchor if present (a.toggle or header link). Fallback to span.
    function findToggleTarget(section) {
      // header may be child or parent depending on template
      const toggleSelectors = [
        'a.toggle',
        '.header a.toggle',
        '.header a',
        'span.sectionIdentifier a',
        'span.sectionIdentifier',
      ];
      for (const sel of toggleSelectors) {
        const el = section.querySelector(sel);
        if (el) return el;
      }
      // last resort: look up the section's header element in case toggle sits outside
      const header = section.querySelector(".header");
      if (header) {
        const a = header.querySelector("a.toggle, a");
        if (a) return a;
      }
      return section;
    }

    function clickToggle(section) {
      const target = findToggleTarget(section);
      if (!target) return false;
      // If it's an anchor with href="javascript:...", dispatch a MouseEvent to trigger handlers
      try {
        target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
      } catch (e) {
        try { target.click(); return true; } catch (_) { return false; }
      }
    }

    function getVisualHeightPx(el) {
      try { return el?.getBoundingClientRect?.().height || 0; } catch (_) { return 0; }
    }

    function isHeight24(section) {
      const h = (section?.style?.height || "").trim();
      return h === "24px" || h === `${COLLAPSED_HEIGHT_PX}px`;
    }

    function isVisuallyCollapsed(section) {
      // Prefer measured height; fallback to inline style check
      const vh = getVisualHeightPx(section);
      if (vh > 0) return vh <= (COLLAPSED_HEIGHT_PX + EPS);
      return isHeight24(section);
    }

    async function ensureState(section, wantCollapsed) {
      // multiple attempts to tolerate async re-renders
      for (let attempt = 0; attempt < 5; attempt++) {
        const collapsedNow = isVisuallyCollapsed(section);
        if (wantCollapsed ? collapsedNow : !collapsedNow) return true;

        // if expanded but height pinned to 24 inline, clear it to allow expand
        if (!wantCollapsed && isHeight24(section)) section.style.height = "";

        if (!clickToggle(section)) return false;

        // small backoff to allow UI to settle
        await sleep(70 + attempt * 30);
      }
      // final check
      return wantCollapsed ? isVisuallyCollapsed(section) : !isVisuallyCollapsed(section);
    }

    function enforceCollapsedStyle(section) {
      section.style.cursor = "pointer";
      section.style.height = `${COLLAPSED_HEIGHT_PX}px`;
    }

    async function expandAll() {
      const sections = getSections();
      if (!sections.length) return;

      // First pass: remove inline collapsed heights so FM can expand properly
      for (const s of sections) {
        if (isHeight24(s)) s.style.height = "";
      }

      // Second pass: ensure each expanded
      for (const s of sections) {
        if (!isVisuallyCollapsed(s)) continue;
        await ensureState(s, false);
        // clear any inline collapsed height left behind
        if (isHeight24(s)) s.style.height = "";
        await sleep(20);
      }
    }

    async function collapseAll() {
      const sections = getSections();
      if (!sections.length) return;

      for (const s of sections) {
        if (isVisuallyCollapsed(s)) {
          enforceCollapsedStyle(s);
          continue;
        }
        await ensureState(s, true);
        enforceCollapsedStyle(s);
        await sleep(20);
      }
    }

    function findCancelButton() {
      return safeQuery('#setuptoolsbuttons input.submitinput.cancel[name="cancelbutton"]') ||
             safeQuery("#setuptoolsbuttons input.submitinput.cancel") ||
             safeQuery('input.submitinput.cancel[value="Cancel"]');
    }

    function injectCssOnce() {
      if (document.getElementById("fm-sectiontoggle-css")) return;
      const style = document.createElement("style");
      style.id = "fm-sectiontoggle-css";
      style.textContent = `.fm-icon-btn { margin-left: 6px; } .fm-icon-btn[disabled] { opacity: 0.5; }`;
      document.documentElement.appendChild(style);
    }

    function setBusy(btn, busy) {
      if (!btn) return;
      btn.dataset.fmBusy = busy ? "1" : "0";
      btn.disabled = !!busy;
    }

    // create or reuse icon button via FM helper if available
    function createIconButtonSpec({ id, icon, title, onClick }) {
      if (typeof FM.createIconButton === "function") {
        return FM.createIconButton({ id, icon, title, onClick });
      }
      // fallback simple button with material icon span
      const btn = document.createElement("button");
      btn.id = id;
      btn.type = "button";
      btn.title = title;
      btn.className = "fm-icon-btn";
      const span = document.createElement("span");
      span.className = "material-icons";
      span.textContent = icon;
      btn.appendChild(span);
      btn.addEventListener("click", onClick);
      return btn;
    }

    function ensureButtonsOnce() {
      const cancelBtn = findCancelButton();
      if (!cancelBtn) return null;

      injectCssOnce();

      let collapseBtn = document.getElementById(BTN_COLLAPSE_ID);
      if (!collapseBtn) {
        collapseBtn = createIconButtonSpec({
          id: BTN_COLLAPSE_ID,
          icon: "unfold_less",
          title: "Collapse sections",
          onClick: () => {
            const liveCollapse = document.getElementById(BTN_COLLAPSE_ID);
            const liveExpand = document.getElementById(BTN_EXPAND_ID);
            if (!liveCollapse || !liveExpand) return;
            if (liveCollapse.dataset.fmBusy === "1" || liveExpand.dataset.fmBusy === "1") return;
            setBusy(liveCollapse, true); setBusy(liveExpand, true);
            collapseAll().finally(() => { setBusy(liveCollapse, false); setBusy(liveExpand, false); });
          }
        });
        cancelBtn.insertAdjacentElement("afterend", collapseBtn);
      }

      let expandBtn = document.getElementById(BTN_EXPAND_ID);
      if (!expandBtn) {
        expandBtn = createIconButtonSpec({
          id: BTN_EXPAND_ID,
          icon: "unfold_more",
          title: "Expand sections",
          onClick: () => {
            const liveCollapse = document.getElementById(BTN_COLLAPSE_ID);
            const liveExpand = document.getElementById(BTN_EXPAND_ID);
            if (!liveCollapse || !liveExpand) return;
            if (liveCollapse.dataset.fmBusy === "1" || liveExpand.dataset.fmBusy === "1") return;
            setBusy(liveCollapse, true); setBusy(liveExpand, true);
            expandAll().finally(() => { setBusy(liveCollapse, false); setBusy(liveExpand, false); });
          }
        });
        collapseBtn.insertAdjacentElement("afterend", expandBtn);
      }

      // Re-insert if FM moved them
      if (collapseBtn.previousElementSibling !== cancelBtn) cancelBtn.insertAdjacentElement("afterend", collapseBtn);
      if (expandBtn.previousElementSibling !== collapseBtn) collapseBtn.insertAdjacentElement("afterend", expandBtn);

      return { collapseBtn, expandBtn };
    }

    window.FM.runSectionToggleFeature = function () {
      if (isOnWorkspaceGridTab()) return;
      if (!getRoot()) return;
      if (!getSections().length) return;
      injectCssOnce();
      ensureButtonsOnce();
    };
  })();

  // ------------------ Field filter + highlight ------------------
  (function fieldFilterFeature() {
    const FILTER_INPUT_ID = "fm-field-filter-input";
    const HILITE_CLASS = "fm-field-match";
    const ACTIVE_CLASS = "fm-field-match-active";

    let lastQuery = "";
    let matchIds = [];
    let matchIndex = -1;

    function isOnWorkspaceGridTab() {
      return location.href.includes("section=setuphome") &&
             location.href.includes("tab=workspaces") &&
             location.href.includes("item=grid");
    }

    function getRoot() { return document.getElementById("layoutContainer"); }
    function findCancelButton() {
      return safeQuery('#setuptoolsbuttons input.submitinput.cancel[name="cancelbutton"]') ||
             safeQuery("#setuptoolsbuttons input.submitinput.cancel") ||
             safeQuery('input.submitinput.cancel[value="Cancel"]');
    }

    function getAllFieldDivs() {
      const root = getRoot();
      if (!root) return [];
      return Array.from(root.querySelectorAll("div.fieldIdentifier[id$='divField']"));
    }

    function getFieldIdAndName(fieldDiv) {
      const rowSpan = fieldDiv.querySelector(":scope > span.fieldIdentifier") || fieldDiv.querySelector("span.fieldIdentifier");
      if (!rowSpan) return { id: "", name: "" };

      const idEl = rowSpan.querySelector(":scope > span.fm-field-id") || rowSpan.querySelector("span.fm-field-id");
      const id = (idEl?.textContent || "").trim();
      let name = "";

      if (idEl) {
        let n = idEl.nextSibling;
        while (n) {
          if (n.nodeType === Node.ELEMENT_NODE) {
            if (n.classList?.contains("fieldDataType")) break;
          }
          if (n.nodeType === Node.TEXT_NODE) name += n.textContent;
          n = n.nextSibling;
        }
      }
      name = name.replace(/\s+/g, " ").trim();
      return { id, name };
    }

    function clearHighlights() {
      const root = getRoot(); if (!root) return;
      root.querySelectorAll("." + HILITE_CLASS).forEach((el) => el.classList.remove(HILITE_CLASS));
      root.querySelectorAll("." + ACTIVE_CLASS).forEach((el) => el.classList.remove(ACTIVE_CLASS));
    }

    function highlightMatches(queryRaw) {
      const q = (queryRaw || "").trim().toLowerCase();
      if (!q) return;
      for (const f of getAllFieldDivs()) {
        if (f.style.display === "none") continue;
        const { id, name } = getFieldIdAndName(f);
        const hay = `${id} ${name}`.toLowerCase();
        if (hay.includes(q)) f.classList.add(HILITE_CLASS);
      }
    }

    function rebuildMatchList(queryRaw) {
      const root = getRoot();
      if (!root) { matchIds = []; matchIndex = -1; return; }
      matchIds = Array.from(root.querySelectorAll("div.fieldIdentifier." + HILITE_CLASS + "[id$='divField']"))
        .filter((el) => el.style.display !== "none")
        .map((el) => el.id);
      matchIndex = -1;
    }

    function findScrollableAncestor(el) {
      let cur = el?.parentElement;
      while (cur && cur !== document.body) {
        const cs = getComputedStyle(cur);
        const overflowY = cs.overflowY;
        const canScroll = (overflowY === "auto" || overflowY === "scroll") && cur.scrollHeight > cur.clientHeight + 2;
        if (canScroll) return cur;
        cur = cur.parentElement;
      }
      return null;
    }

    function scrollIntoContainer(container, target) {
      const cRect = container.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      const deltaTop = (tRect.top - cRect.top) + container.scrollTop;
      const top = Math.max(0, deltaTop - (container.clientHeight / 2) + (tRect.height / 2));
      container.scrollTo({ top, behavior: "smooth" });
    }

    function setActiveMatch(el) {
      const root = getRoot(); if (!root) return;
      root.querySelectorAll("." + ACTIVE_CLASS).forEach((n) => n.classList.remove(ACTIVE_CLASS));
      if (el) el.classList.add(ACTIVE_CLASS);
    }

    function cycleToNextMatch(queryRaw, direction) {
      const q = (queryRaw || "").trim();
      const root = getRoot(); if (!root) return;
      if (!q) return;

      if (q !== lastQuery) { lastQuery = q; rebuildMatchList(q); }
      if (!matchIds.length) { rebuildMatchList(q); if (!matchIds.length) return; }

      const step = direction === "prev" ? -1 : 1;
      matchIndex = (matchIndex + step + matchIds.length) % matchIds.length;
      const id = matchIds[matchIndex];
      const el = id ? document.getElementById(id) : null;
      if (!el) return;

      setActiveMatch(el);
      const scrollable = findScrollableAncestor(el);
      if (scrollable) scrollIntoContainer(scrollable, el);
      else el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function applyFieldFilter(queryRaw) {
      const q = (queryRaw || "").trim().toLowerCase();
      const fields = getAllFieldDivs();
      for (const f of fields) {
        const { id, name } = getFieldIdAndName(f);
        const hay = `${id} ${name}`.toLowerCase();
        const match = !q || hay.includes(q);
        f.style.display = match ? "" : "none";
      }
      clearHighlights();
      highlightMatches(queryRaw);
      lastQuery = (queryRaw || "").trim();
      rebuildMatchList(lastQuery);
    }

    function ensureFilterOnce() {
      const cancelBtn = findCancelButton();
      if (!cancelBtn) return null;

      let input = document.getElementById(FILTER_INPUT_ID);
      if (!input) {
        input = document.createElement("input");
        input.id = FILTER_INPUT_ID;
        input.type = "text";
        input.title = "Type to filter by Field ID or Name. Press Enter to jump to next match. Shift+Enter goes back.";
        input.className = "fm-search-input";
        input.placeholder = "Filter Fields";
        input.autocomplete = "off";
        input.spellcheck = false;

        input.addEventListener("input", () => applyFieldFilter(input.value));
        input.addEventListener("search", () => applyFieldFilter(input.value));
        input.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          cycleToNextMatch(input.value, e.shiftKey ? "prev" : "next");
        });

        cancelBtn.insertAdjacentElement("afterend", input);
      }
      return input;
    }

    window.FM.runFieldFilterFeature = function () {
      if (isOnWorkspaceGridTab()) return;
      if (!getRoot()) return;
      const fields = getAllFieldDivs();
      if (!fields.length) return;
      ensureFilterOnce();
    };
  })();

  // expose small API for bootstrap tick to call
  // (bootstrap already calls FM.runFieldIdFeature and FM.runFieldFilterFeature)
})();