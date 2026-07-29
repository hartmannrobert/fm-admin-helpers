// Enlarges the "Choose BOM Field Source" popup (#adminBomSourcePopup) on the
// workspace manager BOM tab and adds a name filter to its header.
//
// The popup markup is:
//   #adminBomSourcePopup > .fieldSourcePanel
//     .fieldSourceHeader  (span.title + button.closePanel)
//     ul.fieldSourceUl1 > li#source_*            top-level group, opens via class "expanded"
//       ul.fieldSourceUl2 > li#workspace_<id>
//         ul.fieldSourceUl3 > li#section_<id>    (Item Details only)
//           ul.fieldSourceUl4 > li.sourceField
//         ul.fieldSourceUl4 > li.sourceField     (all other groups)
//     .fieldSourceFooter  (Ok / Cancel)
//
// Filtering never touches the page's "expanded" classes — while a query is
// active a popup-level class force-opens every nested ul from CSS, and matches
// are driven purely by a hide attribute. Clearing the query restores the
// popup's native collapse state untouched.

(function () {
  window.FM = window.FM || {};

  const POPUP_ID       = "adminBomSourcePopup";
  const INPUT_ID       = "fm-bom-source-filter";
  const HIDE_ATTR      = "data-fm-src-hide";
  const FILTER_CLASS   = "fm-src-filtering";
  const CURSOR_CLASS   = "fm-src-cursor";

  const WANT_W = 700;
  const WANT_H = 600;
  const MARGIN = 20;   // min gap to the viewport edges

  let wasVisible = false;

  function getPopup() {
    return document.getElementById(POPUP_ID);
  }

  function isVisible(p) {
    return !!p && p.classList.contains("visible") && p.offsetParent !== null;
  }

  // Field label = the li's own text nodes; the trailing span holds the data type.
  function fieldName(li) {
    let s = "";
    li.childNodes.forEach(n => { if (n.nodeType === Node.TEXT_NODE) s += n.nodeValue; });
    return s.trim();
  }

  // ─── Geometry ────────────────────────────────────────────────────────────────
  // The page writes width/height/top/left inline on open (anchored next to the
  // clicked button), so we override inline too and center the popup in the
  // viewport instead. Positioning is derived from getBoundingClientRect deltas
  // rather than assuming the offsetParent is the document.

  let lastW = 0, lastH = 0;

  function applyGeometry(p, force) {
    const w = Math.min(WANT_W, window.innerWidth  - 2 * MARGIN);
    const h = Math.min(WANT_H, window.innerHeight - 2 * MARGIN);
    if (p.style.width  !== w + "px") p.style.width  = w + "px";
    if (p.style.height !== h + "px") p.style.height = h + "px";

    // Recenter on open and on viewport resize only — not every tick, so the
    // popup doesn't chase the viewport if the page behind it scrolls.
    if (!force && w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;

    const rect = p.getBoundingClientRect();
    const dx = Math.round((window.innerWidth  - rect.width)  / 2) - rect.left;
    const dy = Math.round((window.innerHeight - rect.height) / 2) - rect.top;
    if (dx) p.style.left = ((parseFloat(p.style.left) || 0) + dx) + "px";
    if (dy) p.style.top  = ((parseFloat(p.style.top)  || 0) + dy) + "px";
  }

  // ─── Filter ──────────────────────────────────────────────────────────────────

  function applyFilter(p) {
    const input = p.querySelector("#" + INPUT_ID);
    const q = String(input ? input.value : "").trim().toLowerCase();

    if (!q) {
      p.classList.remove(FILTER_CLASS);
      p.querySelectorAll("[" + HIDE_ATTR + "]").forEach(el => el.removeAttribute(HIDE_ATTR));
      clearCursor(p);
      return;
    }

    const tokens = q.split(/\s+/);
    p.classList.add(FILTER_CLASS);

    p.querySelectorAll("li.sourceField").forEach(li => {
      const name = fieldName(li).toLowerCase();
      const hit = tokens.every(t => name.includes(t));
      if (hit) li.removeAttribute(HIDE_ATTR);
      else li.setAttribute(HIDE_ATTR, "1");
    });

    // Collapse away group/section/workspace wrappers left with no visible field.
    p.querySelectorAll(".fieldSourceUl1 > li, .fieldSourceUl2 > li, .fieldSourceUl3 > li").forEach(li => {
      if (li.classList.contains("sourceField")) return;
      if (li.querySelector("li.sourceField:not([" + HIDE_ATTR + "])")) li.removeAttribute(HIDE_ATTR);
      else li.setAttribute(HIDE_ATTR, "1");
    });

    // Park the cursor on the first match so ↓/Enter is immediately useful, and
    // drop it if the previously-cursored field got filtered out.
    const cur = p.querySelector("li.sourceField." + CURSOR_CLASS);
    if (!cur || cur.hasAttribute(HIDE_ATTR)) {
      clearCursor(p);
      const first = visibleFields(p)[0];
      if (first) first.classList.add(CURSOR_CLASS);
    }
  }

  // ─── Keyboard selection ──────────────────────────────────────────────────────

  // Fields that are actually on screen: not filtered out, and not inside a
  // collapsed group (offsetParent is null for those).
  function visibleFields(p) {
    return Array.prototype.filter.call(
      p.querySelectorAll("li.sourceField:not([" + HIDE_ATTR + "])"),
      li => li.offsetParent !== null
    );
  }

  // Dojo item widgets listen on the press/release pair rather than plain click,
  // so a bare el.click() can be a no-op. Fire the whole sequence.
  function fireClick(el) {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
    const rect = el.getBoundingClientRect();
    const pos = {
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.top + rect.height / 2)
    };
    const seq = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
    seq.forEach(type => {
      const Ctor = type.startsWith("pointer") && window.PointerEvent ? window.PointerEvent : MouseEvent;
      if (type.startsWith("pointer") && !window.PointerEvent) return;
      el.dispatchEvent(new Ctor(type, Object.assign({}, opts, pos,
        type.startsWith("pointer") ? { pointerType: "mouse", isPrimary: true } : {})));
    });
  }

  function clearCursor(p) {
    p.querySelectorAll("." + CURSOR_CLASS).forEach(el => el.classList.remove(CURSOR_CLASS));
  }

  // Arrow keys move our own cursor class only — no synthetic clicks, no touching
  // the page's "active" class or model. Nothing is selected until Enter, so
  // cycling can never leave the page's state half-updated.
  function moveCursor(p, dir) {
    const items = visibleFields(p);
    if (!items.length) return;

    const cur = items.findIndex(li => li.classList.contains(CURSOR_CLASS));
    const next = cur < 0
      ? (dir > 0 ? 0 : items.length - 1)
      : (cur + dir + items.length) % items.length;

    clearCursor(p);
    const li = items[next];
    li.classList.add(CURSOR_CLASS);
    if (li.scrollIntoView) li.scrollIntoView({ block: "nearest" });
  }

  // Commit: click the cursored li so the page's own handler updates its model and
  // "active" class (we never set active ourselves), then click Ok on the next
  // task so the handler has run before the panel accepts.
  function commit(p) {
    const li = p.querySelector("li.sourceField." + CURSOR_CLASS + ":not([" + HIDE_ATTR + "])");
    const ok = p.querySelector(".fieldSourceFooter .accept, .accept.primary");
    if (li) {
      fireClick(li);
      if (ok) setTimeout(() => fireClick(ok), 0);
      return;
    }
    if (ok) fireClick(ok);
  }

  function onKeyDown(evt) {
    const p = getPopup();
    if (!isVisible(p)) return;
    // Document-level capture listener. Act on keys aimed anywhere inside the
    // popup, not only at our input: the page focuses the currently-active li
    // (it carries tabindex="0") right after open, so gating on the input alone
    // meant the very first keypress was never seen.
    if (!p.contains(evt.target)) return;

    const input = p.querySelector("#" + INPUT_ID);
    const isInput = evt.target === input;

    if (evt.key === "ArrowDown" || evt.key === "ArrowUp") {
      moveCursor(p, evt.key === "ArrowDown" ? 1 : -1);
      evt.preventDefault();
      evt.stopPropagation();
      // Keep typing going to the filter box rather than the list.
      if (input && !isInput) { try { input.focus(); } catch (_) {} }
      return;
    }

    if (evt.key === "Enter") {
      evt.preventDefault();
      evt.stopPropagation();
      commit(p);
      return;
    }

    if (evt.key === "Escape") {
      // First Esc clears the query; a second one falls through to close the popup.
      if (input && input.value) {
        input.value = "";
        applyFilter(p);
        evt.preventDefault();
        evt.stopPropagation();
      }
      return;
    }

    // Printable keys typed while the list has focus belong in the filter box.
    if (!isInput && evt.key.length === 1 && !evt.ctrlKey && !evt.metaKey && !evt.altKey) {
      if (input) {
        try { input.focus(); } catch (_) {}
        input.value += evt.key;
        applyFilter(p);
        evt.preventDefault();
      }
    }
    // Keep typing away from the list's own key navigation (li carry tabindex).
    evt.stopPropagation();
  }

  let keyHooked = false;
  function ensureKeyHook() {
    if (keyHooked) return;
    keyHooked = true;
    document.addEventListener("keydown", onKeyDown, true);
  }

  function ensureFilterInput(p) {
    const header = p.querySelector(".fieldSourceHeader");
    if (!header) return null;

    let input = header.querySelector("#" + INPUT_ID);
    if (input) return input;

    input = document.createElement("input");
    input.type = "search";
    input.id = INPUT_ID;
    input.className = "fm-search-input";
    input.placeholder = "Filter fields…";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.addEventListener("input", () => applyFilter(p));
    input.addEventListener("click", e => e.stopPropagation());
    // keydown is handled by a document capture listener (see ensureKeyHook) so a
    // page-level capture handler can't swallow the keys before we see them.
    ensureKeyHook();

    const closeBtn = header.querySelector(".closePanel");
    if (closeBtn) header.insertBefore(input, closeBtn);
    else header.appendChild(input);
    return input;
  }

  // ─── Tick ────────────────────────────────────────────────────────────────────

  function tick() {
    const p = getPopup();
    if (!isVisible(p)) {
      wasVisible = false;
      return;
    }

    const justOpened = !wasVisible;
    applyGeometry(p, justOpened);
    const input = ensureFilterInput(p);

    if (justOpened) {
      wasVisible = true;
      if (input) {
        input.value = "";
        applyFilter(p);
        try { input.focus(); } catch (_) {}
      }
    }
  }

  FM.runBomSourcePopupTick = tick;
})();
