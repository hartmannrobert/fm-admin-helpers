(function () {
  // Ensure global namespace
  window.FM = window.FM || {};

  // ------------------ small helpers ------------------
  const safeQueryAll = (sel, root = document) => Array.from((root || document).querySelectorAll(sel || ""));
  const safeQuery = (sel, root = document) => {
    try { return (root || document).querySelector(sel); }
    catch (e) { return null; }
  };

  // ------------------ page gates ------------------
  function isAutodeskPlmHost() {
    return /(^|\.)autodeskplm360\.net$/i.test(location.hostname || "");
  }

  function isOnWorkspaceGridTab() {
    return location.href.includes("section=setuphome") &&
           location.href.includes("tab=workspaces") &&
           location.href.includes("item=grid");
  }

  function isOnWorkspaceItemDetailsTab() {
    if (!isAutodeskPlmHost()) return false;
    return location.href.includes("admin#section=setuphome&tab=workspaces&item=itemdetails");
  }

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

  // ------------------ Section expand / collapse + button injection ------------------
  (function () {
    const ROOT_ID = "layoutContainer";

    const BTN_COLLAPSE_ID = "fm-collapse-sections-btn";
    const BTN_EXPAND_ID = "fm-expand-sections-btn";
    const FILTER_INPUT_ID = "fm-field-filter-input";

    function getRoot() {
      return document.getElementById(ROOT_ID);
    }

    function clickNativeToggleFromSection(section) {
      if (!section) return false;

      const sectionId = String(section.id || "");
      const m = sectionId.match(/^(\d+)divSection$/);

      const headerSpan =
        (m && document.getElementById(`${m[1]}null`)) ||
        section.querySelector("div.header span.sectionIdentifier");

      if (!headerSpan) return false;

      const toggleTarget = headerSpan.closest(
        "a,button,[role='button'],.toggle,.sectionIdentifier"
      );

      if (!toggleTarget) return false;

      toggleTarget.click();
      return true;
    }

    function collapseAllSectionsNative() {
      const root = getRoot();
      if (!root) return;

      const opened = root.querySelectorAll("div.sectionIdentifier.sectionIdentifier_opened");
      opened.forEach(section => clickNativeToggleFromSection(section));
    }

    function expandAllSectionsNative() {
      const root = getRoot();
      if (!root) return;

      const collapsedSections = root.querySelectorAll(
        'div.sectionIdentifier[id$="divSection"]:not(.sectionIdentifier_opened)'
      );

      collapsedSections.forEach((section, idx) => {
        setTimeout(() => {
          clickNativeToggleFromSection(section);
        }, idx * 30);
      });
    }

    function buildIconButton({ id, iconName, title, onClick }) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = id;
      btn.title = title;

      const icon = document.createElement("span");
      icon.className = "material-icons";
      icon.textContent = iconName;
      btn.appendChild(icon);

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });

      return btn;
    }

    function ensureButtonsAfterFilter() {
      // Security: do not inject anywhere else
      if (!isOnWorkspaceItemDetailsTab()) return;

      // Need the section DOM
      if (!getRoot()) return;

      const filterInput = document.getElementById(FILTER_INPUT_ID);
      if (!filterInput) return;

      // Place inside the same wrapper span as Cancel + Filter
      const wrapperSpan = filterInput.closest("span");
      if (!wrapperSpan) return;

      // Avoid duplicates
      if (document.getElementById(BTN_COLLAPSE_ID) || document.getElementById(BTN_EXPAND_ID)) return;

      const collapseBtn = buildIconButton({
        id: BTN_COLLAPSE_ID,
        iconName: "unfold_less",
        title: "Collapse all sections",
        onClick: collapseAllSectionsNative
      });

      const expandBtn = buildIconButton({
        id: BTN_EXPAND_ID,
        iconName: "unfold_more",
        title: "Expand all sections",
        onClick: expandAllSectionsNative
      });

      // Insert after the filter input: [Cancel][Filter][Collapse][Expand]
      filterInput.insertAdjacentElement("afterend", collapseBtn);
      collapseBtn.insertAdjacentElement("afterend", expandBtn);

      // Small spacing (keeps your content.css as the main styling source)
      collapseBtn.style.marginLeft = "6px";
      expandBtn.style.marginLeft = "6px";
    }

    window.FM.collapseAllSectionsNative = collapseAllSectionsNative;
    window.FM.expandAllSectionsNative = expandAllSectionsNative;

    // Call this from mainTick
    window.FM.injectCollapseExpandButtons = function () {
      ensureButtonsAfterFilter();
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