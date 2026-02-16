// Ensure global namespace exists
window.FM = window.FM || {};

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

/**
 * Moves delete/clone/edit icons into an inline-flex wrapper placed
 * directly in front of the Field ID span. This makes the visual order
 * reliable (DOM order alone can still render "odd" due to FM styling).
 */
function moveButtonsInFrontOfFieldId(itemSpan, fieldIdSpan) {
  if (!itemSpan || !fieldIdSpan) return;

  const container = itemSpan.closest("div.fieldIdentifier");
  if (!container) return;

  // Native FM icons live here (and must stay here to keep wiring)
  const nativeDelete = container.querySelector(":scope > img.deleteButton");
  const nativeClone  = container.querySelector(":scope > img.cloneIcon");
  const nativeEdit   = container.querySelector(":scope > img.editIcon");

  // If there are no native icons to proxy, do nothing
  if (!nativeEdit && !nativeClone && !nativeDelete) return;

  // Create or reuse proxy wrapper inside the span (before fieldIdSpan)
  let proxy = itemSpan.querySelector(":scope > .fm-field-icons");
  if (!proxy) {
    proxy = document.createElement("span");
    proxy.className = "fm-field-icons";
    proxy.setAttribute("data-fm-proxy-icons", "1");
    itemSpan.insertBefore(proxy, fieldIdSpan);
  } else {
    // If this wrapper was created by other logic and contains moved native imgs, stop.
    // We only support proxy mode now.
    proxy.setAttribute("data-fm-proxy-icons", "1");
  }

  // Hide native icons in place (do not remove / do not move)
  // Use visibility hidden so layout stays stable if FM expects it.
  if (nativeEdit) nativeEdit.classList.add("fm-native-icon-hidden");
  if (nativeClone) nativeClone.classList.add("fm-native-icon-hidden");
  if (nativeDelete) nativeDelete.classList.add("fm-native-icon-hidden");

  // Helper to build a proxy <img> that triggers the native icon
  function ensureProxyButton(key, nativeEl, src, className) {
    if (!nativeEl) return;

    let btn = proxy.querySelector(`:scope > img[data-fm-proxy="${key}"]`);
    if (!btn) {
      btn = document.createElement("img");
      btn.setAttribute("data-fm-proxy", key);
      btn.src = src;
      btn.className = className;
      btn.draggable = false;

      // Critical: stop row click and trigger native behavior
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Dispatch a real click on the native control
        nativeEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }, true);

      proxy.appendChild(btn);
    } else {
      // Keep src/class in sync
      if (btn.src !== src) btn.src = src;
      if (btn.className !== className) btn.className = className;
    }
  }

  // Clear proxies and rebuild in deterministic order
  // This avoids duplicates when FM re-renders.
  const desired = [
    { key: "edit",   el: nativeEdit,   src: "images/icons/edit_16.png",      cls: "editIcon" },
    { key: "clone",  el: nativeClone,  src: "images/icons/copy_file_16.png", cls: "cloneIcon" },
    { key: "delete", el: nativeDelete, src: "images/buttons/delete_16.png",  cls: "deleteButton" },
  ];

  // Remove any old proxies not in desired
  Array.from(proxy.querySelectorAll(":scope > img[data-fm-proxy]")).forEach((img) => {
    const k = img.getAttribute("data-fm-proxy");
    if (!desired.some(d => d.key === k)) img.remove();
  });

  // Rebuild in order
  desired.forEach(d => ensureProxyButton(d.key, d.el, d.src, d.cls));

  itemSpan.dataset.fmButtonsMoved = "1";
}



function enhanceFieldIdentifiersOnce(root = document) {
  if (!isOnFieldIdTargetPage()) return;

  const items = root.querySelectorAll?.("span.fieldIdentifier") || [];
  for (const item of items) {
    // 1) Ensure Field ID span exists
    let fieldIdSpan = item.querySelector(":scope > .fm-field-id");

    if (!fieldIdSpan) {
      const currentID = (item.id || "").replace("null", "");
      if (!currentID) continue;

      fieldIdSpan = document.createElement("span");
      fieldIdSpan.className = "fm-field-id";
      fieldIdSpan.textContent = currentID;
      fieldIdSpan.title = "Click to copy Field ID";

      fieldIdSpan.addEventListener("click", async (e) => {
        // Avoid triggering FM row click behavior
        e.stopPropagation();

        const ok = await copyToClipboard(currentID);
        fieldIdSpan.title = ok ? `Copied: ${currentID}` : "Copy failed";
        setTimeout(() => {
          fieldIdSpan.title = "Click to copy Field ID";
        }, 1200);
      });

      // Insert at the beginning of the fieldIdentifier span
      item.insertBefore(fieldIdSpan, item.firstChild);
    }

    // 2) Always attempt moving buttons (even on later ticks)
    moveButtonsInFrontOfFieldId(item, fieldIdSpan);
  }
}

const FM_FIELDID_TARGETS = [
  "admin#section=setuphome&tab=workspaces&item=itemdetails",
  "admin#section=setuphome&tab=workspaces&item=grid",
];

function isOnFieldIdTargetPage() {
  const href = location.href;
  return FM_FIELDID_TARGETS.some((t) => href.includes(t));
}

// CSS: wrapper forces visual order and grouping
(function injectFieldIdCssOnce() {
  if (document.getElementById("fm-fieldid-css")) return;

  const style = document.createElement("style");
  style.id = "fm-fieldid-css";
  style.textContent = `
    /* Keep the three icons visually grouped before the Field ID */
    .fm-field-icons {
      display: inline-flex;
      gap: 2px;
      margin-right: 2px;
      vertical-align: middle;
    }
    .fm-field-icons img {
      vertical-align: middle;
    }

    /* Optional: keep Field ID readable */
    .fm-field-id {
      margin-right: 2px;
    }
  `;
  document.documentElement.appendChild(style);
})();

window.FM.runFieldIdFeature = function () {
  enhanceFieldIdentifiersOnce(document);
};


// Section expand/collapse buttons for Workspace Item Details (non-grid tab)
(function () {
  window.FM = window.FM || {};

  const BTN_COLLAPSE_ID = "fm-collapse-sections-btn";
  const BTN_EXPAND_ID = "fm-expand-sections-btn";
  const COLLAPSED_HEIGHT_PX = 24;
  const COLLAPSED_EPS_PX = 2;

  function isOnWorkspaceGridTab() {
    return (
      location.href.includes("section=setuphome") &&
      location.href.includes("tab=workspaces") &&
      location.href.includes("item=grid")
    );
  }

  function getRoot() {
    return document.getElementById("layoutContainer");
  }

  function getSections() {
    const root = getRoot();
    if (!root) return [];
    return Array.from(root.querySelectorAll("div.sectionIdentifier"));
  }

  function getToggleSpan(section) {
    return (
      section.querySelector(".header span.sectionIdentifier") ||
      section.querySelector("span.sectionIdentifier")
    );
  }

  function isHeight24(section) {
    const h = (section?.style?.height || "").trim();
    return h === "24px" || h === `${COLLAPSED_HEIGHT_PX}px`;
  }

  function getVisualHeightPx(el) {
    const h = el?.getBoundingClientRect?.().height || 0;
    return Number.isFinite(h) ? h : 0;
  }

  function isVisuallyCollapsed(section) {
    if (isHeight24(section)) return true;
    const vh = getVisualHeightPx(section);
    return vh > 0 && vh <= (COLLAPSED_HEIGHT_PX + COLLAPSED_EPS_PX);
  }

  function clickToggle(section) {
    const span = getToggleSpan(section);
    if (!span) return false;
    span.click();
    return true;
  }

  async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function ensureState(section, wantCollapsed) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const collapsedNow = isVisuallyCollapsed(section);
      if (wantCollapsed ? collapsedNow : !collapsedNow) return true;

      // For expand, unpin first
      if (!wantCollapsed && isHeight24(section)) section.style.height = "";

      if (!clickToggle(section)) return false;

      await sleep(30);
      // await sleep(180);
    }
    return wantCollapsed ? isVisuallyCollapsed(section) : !isVisuallyCollapsed(section);
  }

  function enforceCollapsedStyle(section) {
    section.style.cursor = "pointer";
    section.style.height = `${COLLAPSED_HEIGHT_PX}px`;
  }

  async function expandAll() {
    const sections = getSections();
    for (const s of sections) {
      s.style.cursor = "pointer";
      if (isHeight24(s)) s.style.height = "";
    }
    for (const s of sections) {
      if (!isVisuallyCollapsed(s)) continue;
      await ensureState(s, false);
      if (isHeight24(s)) s.style.height = "";
      await sleep(10);
    }
  }

  async function collapseAll() {
    const sections = getSections();
    for (const s of sections) {
      if (isVisuallyCollapsed(s)) {
        enforceCollapsedStyle(s);
        continue;
      }
      await ensureState(s, true);
      enforceCollapsedStyle(s);
      await sleep(10);
    }
  }

  function findCancelButton() {
    return (
      document.querySelector('#setuptoolsbuttons input.submitinput.cancel[name="cancelbutton"]') ||
      document.querySelector("#setuptoolsbuttons input.submitinput.cancel") ||
      document.querySelector('input.submitinput.cancel[value="Cancel"]')
    );
  }

  function injectCssOnce() {
    if (document.getElementById("fm-sectiontoggle-css")) return;
    const style = document.createElement("style");
    style.id = "fm-sectiontoggle-css";
    style.textContent = `
      .fm-icon-btn { margin-left: 6px; }
    `;
    document.documentElement.appendChild(style);
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    btn.dataset.fmBusy = busy ? "1" : "0";
    btn.disabled = !!busy;
  }

  function ensureButtonsOnce() {
    const cancelBtn = findCancelButton();
    if (!cancelBtn) return null;

    // Make sure Material Icons stylesheet is present
    if (typeof FM.injectMaterialIcons === "function") FM.injectMaterialIcons();

    let collapseBtn = document.getElementById(BTN_COLLAPSE_ID);
    if (!collapseBtn) {
      collapseBtn = FM.createIconButton({
        id: BTN_COLLAPSE_ID,
        icon: "unfold_less",
        title: "Collapse sections",
        onClick: () => {
          const liveCollapse = document.getElementById(BTN_COLLAPSE_ID);
          const liveExpand = document.getElementById(BTN_EXPAND_ID);
          if (!liveCollapse || !liveExpand) return;
          if (liveCollapse.dataset.fmBusy === "1" || liveExpand.dataset.fmBusy === "1") return;

          setBusy(liveCollapse, true);
          setBusy(liveExpand, true);

          collapseAll().finally(() => {
            setBusy(liveCollapse, false);
            setBusy(liveExpand, false);
          });
        }
      });

      collapseBtn.classList.add("fm-icon-btn");
      cancelBtn.insertAdjacentElement("afterend", collapseBtn);
    }

    let expandBtn = document.getElementById(BTN_EXPAND_ID);
    if (!expandBtn) {
      expandBtn = FM.createIconButton({
        id: BTN_EXPAND_ID,
        icon: "unfold_more",
        title: "Expand sections",
        onClick: () => {
          const liveCollapse = document.getElementById(BTN_COLLAPSE_ID);
          const liveExpand = document.getElementById(BTN_EXPAND_ID);
          if (!liveCollapse || !liveExpand) return;
          if (liveCollapse.dataset.fmBusy === "1" || liveExpand.dataset.fmBusy === "1") return;

          setBusy(liveCollapse, true);
          setBusy(liveExpand, true);

          expandAll().finally(() => {
            setBusy(liveCollapse, false);
            setBusy(liveExpand, false);
          });
        }
      });

      expandBtn.classList.add("fm-icon-btn");
      collapseBtn.insertAdjacentElement("afterend", expandBtn);
    }

    // Enforce order again (FM re-render safety)
    if (collapseBtn.previousElementSibling !== cancelBtn) {
      cancelBtn.insertAdjacentElement("afterend", collapseBtn);
    }
    if (expandBtn.previousElementSibling !== collapseBtn) {
      collapseBtn.insertAdjacentElement("afterend", expandBtn);
    }

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

// ########################## Filter Start

// [FM] Field filter + highlight + scroll-to-match on Enter (admin layout)
(function () {
  window.FM = window.FM || {};

  const FILTER_INPUT_ID = "fm-field-filter-input";
  const HILITE_CLASS = "fm-field-match";
  const ACTIVE_CLASS = "fm-field-match-active";

  // ---- cycling state ----
  let lastQuery = "";
  let matchIds = [];
  let matchIndex = -1;

  function isOnWorkspaceGridTab() {
    return (
      location.href.includes("section=setuphome") &&
      location.href.includes("tab=workspaces") &&
      location.href.includes("item=grid")
    );
  }

  function getRoot() {
    return document.getElementById("layoutContainer");
  }

  function findCancelButton() {
    return (
      document.querySelector('#setuptoolsbuttons input.submitinput.cancel[name="cancelbutton"]') ||
      document.querySelector("#setuptoolsbuttons input.submitinput.cancel") ||
      document.querySelector('input.submitinput.cancel[value="Cancel"]')
    );
  }

  function getAllFieldDivs() {
    const root = getRoot();
    if (!root) return [];
    return Array.from(root.querySelectorAll("div.fieldIdentifier[id$='divField']"));
  }

  function getFieldIdAndName(fieldDiv) {
    const rowSpan =
      fieldDiv.querySelector(":scope > span.fieldIdentifier") ||
      fieldDiv.querySelector("span.fieldIdentifier");

    if (!rowSpan) return { id: "", name: "" };

    const idEl =
      rowSpan.querySelector(":scope > span.fm-field-id") ||
      rowSpan.querySelector("span.fm-field-id");

    const id = (idEl?.textContent || "").trim();

    let name = "";
    if (idEl) {
      let n = idEl.nextSibling;
      while (n) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const el = n;
          if (el.classList?.contains("fieldDataType")) break;
        }
        if (n.nodeType === Node.TEXT_NODE) name += n.textContent;
        n = n.nextSibling;
      }
    }
    name = name.replace(/\s+/g, " ").trim();

    return { id, name };
  }

  function clearHighlights() {
    const root = getRoot();
    if (!root) return;
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
    if (!root) {
      matchIds = [];
      matchIndex = -1;
      return;
    }

    matchIds = Array.from(
      root.querySelectorAll("div.fieldIdentifier." + HILITE_CLASS + "[id$='divField']")
    )
      .filter((el) => el.style.display !== "none")
      .map((el) => el.id);

    matchIndex = -1;
  }

  // Find the nearest scrollable ancestor (FM often uses internal scroll divs)
  function findScrollableAncestor(el) {
    let cur = el?.parentElement;
    while (cur && cur !== document.body) {
      const cs = getComputedStyle(cur);
      const overflowY = cs.overflowY;
      const canScroll =
        (overflowY === "auto" || overflowY === "scroll") &&
        cur.scrollHeight > cur.clientHeight + 2;
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
    const root = getRoot();
    if (!root) return;

    root.querySelectorAll("." + ACTIVE_CLASS).forEach((n) => n.classList.remove(ACTIVE_CLASS));
    if (el) el.classList.add(ACTIVE_CLASS);
  }

  function cycleToNextMatch(queryRaw, direction) {
    const q = (queryRaw || "").trim();
    const root = getRoot();
    if (!root) return;

    if (!q) return;

    // If query changed since last Enter, rebuild the list and reset index
    if (q !== lastQuery) {
      lastQuery = q;
      rebuildMatchList(q);
    }

    // If list is empty (or stale), rebuild once
    if (!matchIds.length) {
      rebuildMatchList(q);
      if (!matchIds.length) return;
    }

    // Advance index with wrap-around
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

    // Reset cycling when filter content changes
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

      // Enter cycles forward, Shift+Enter cycles backward
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







