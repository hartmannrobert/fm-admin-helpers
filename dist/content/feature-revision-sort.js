// feature-revision-sort.js
// Adds a sort-order toggle to the item-viewer "revision"/state dropdown
// (the MUI popover menu opened from <plm-dropdown-widget> showing
// Working / Production X (Latest) / Production Y (Superseded) / ...).
window.FM = window.FM || {};

(function () {
  FM._revisionSortReversed = FM._revisionSortReversed || false;

  function isRevisionMenuList(ul) {
    var lis = ul.querySelectorAll("li[role='menuitem']");
    if (!lis.length) return null;
    for (var i = 0; i < lis.length; i++) {
      var text = (lis[i].textContent || "").trim();
      if (/\((Latest|Superseded)\)/i.test(text) || text === "Working") return lis;
    }
    return null;
  }

  function applyOrder(ul, lis) {
    var reversed = FM._revisionSortReversed;
    ul.classList.toggle("fm-revision-sort-flex", reversed);
    for (var i = 0; i < lis.length; i++) {
      lis[i].style.order = reversed ? String(lis.length - i) : "";
    }
  }

  function updateButton(btn) {
    btn.classList.toggle("fm-revision-sort-active", FM._revisionSortReversed);
    btn.title = FM._revisionSortReversed
      ? "Revision sort: reversed (click to restore default order)"
      : "Revision sort: default order (click to reverse)";
  }

  function ensureButton(paper, ul) {
    paper.classList.add("fm-revision-sort-paper");
    var btn = paper.querySelector(".fm-revision-sort-toggle");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fm-revision-sort-toggle";
      var icon = document.createElement("span");
      icon.className = "material-icons";
      icon.textContent = "swap_vert";
      btn.appendChild(icon);
      btn.addEventListener("pointerdown", function (evt) {
        evt.stopPropagation();
      });
      btn.addEventListener("click", function (evt) {
        evt.preventDefault();
        evt.stopPropagation();
        FM._revisionSortReversed = !FM._revisionSortReversed;
        applyOrder(ul, ul.querySelectorAll("li[role='menuitem']"));
        updateButton(btn);
      });
      paper.appendChild(btn);
    }
    updateButton(btn);
    return btn;
  }

  FM.runRevisionSortTick = function () {
    var papers = document.querySelectorAll(".MuiMenu-paper.MuiPopover-paper");
    for (var i = 0; i < papers.length; i++) {
      var paper = papers[i];
      var ul = paper.querySelector("ul[role='menu']");
      if (!ul) continue;
      var lis = isRevisionMenuList(ul);
      if (!lis) continue;
      ensureButton(paper, ul);
      applyOrder(ul, lis);
    }
  };
})();
