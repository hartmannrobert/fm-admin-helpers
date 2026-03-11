/**
 * Runs in page context (world: MAIN) so we can capture the Ace editor when the page calls ace.edit().
 * The editor is not visible to content scripts; we expose full content via custom events.
 */
(function () {
  if (!/script\.form/i.test(location.href)) return;

  var capturedEditor = null;

  function wrapEdit(aceLib) {
    if (!aceLib || typeof aceLib.edit !== "function" || aceLib.edit.__fmWrapped) return;
    var realEdit = aceLib.edit;
    aceLib.edit = function (idOrEl) {
      var editor = realEdit.apply(this, arguments);
      if (editor) capturedEditor = editor;
      return editor;
    };
    aceLib.edit.__fmWrapped = true;
  }

  function tryWrapAce() {
    try {
      if (typeof window.ace !== "undefined") wrapEdit(window.ace);
    } catch (e) {}
  }

  try {
    tryWrapAce();
    var _ace = window.ace;
    if (Object.getOwnPropertyDescriptor(window, "ace") === undefined || (Object.getOwnPropertyDescriptor(window, "ace") && Object.getOwnPropertyDescriptor(window, "ace").configurable)) {
      Object.defineProperty(window, "ace", {
        get: function () { return _ace; },
        set: function (v) {
          _ace = v;
          wrapEdit(v);
          return v;
        },
        configurable: true,
        enumerable: true
      });
    }
  } catch (e) {}

  function getEditor() {
    var editor = capturedEditor;
    if (!editor) {
      try {
        var el = document.getElementById("codeEditor") || document.querySelector(".ace_editor");
        if (el && el.env && el.env.editor) editor = el.env.editor;
      } catch (e) {}
    }
    return editor;
  }

  function getContent() {
    var editor = getEditor();
    try {
      if (editor && typeof editor.getValue === "function") return editor.getValue();
      if (editor && editor.session && typeof editor.session.getValue === "function") return editor.session.getValue();
    } catch (e) {}
    return "";
  }

  function getState() {
    var editor = getEditor();
    if (!editor) return null;
    try {
      var cursor = null;
      if (typeof editor.getCursorPosition === "function") {
        var pos = editor.getCursorPosition();
        if (pos && typeof pos.row === "number" && typeof pos.column === "number") cursor = { row: pos.row, column: pos.column };
      } else if (editor.selection && typeof editor.selection.getCursor === "function") {
        var pos = editor.selection.getCursor();
        if (pos && typeof pos.row === "number" && typeof pos.column === "number") cursor = { row: pos.row, column: pos.column };
      }
      var firstVisibleRow = typeof editor.getFirstVisibleRow === "function" ? editor.getFirstVisibleRow() : 0;
      var scrollTop = typeof editor.getScrollTop === "function" ? editor.getScrollTop() : 0;
      return { cursor: cursor, firstVisibleRow: firstVisibleRow, scrollTop: scrollTop };
    } catch (e) {}
    return null;
  }

  function setState(state) {
    if (!state || typeof state !== "object") return;
    var editor = getEditor();
    if (!editor) return;
    try {
      if (typeof state.firstVisibleRow === "number" && state.firstVisibleRow >= 0 && typeof editor.scrollToRow === "function") {
        editor.scrollToRow(state.firstVisibleRow);
      }
      if (typeof state.scrollTop === "number" && state.scrollTop >= 0 && typeof editor.setScrollTop === "function") {
        editor.setScrollTop(state.scrollTop);
      }
      if (state.cursor && typeof state.cursor.row === "number" && state.cursor.row >= 0) {
        var col = typeof state.cursor.column === "number" && state.cursor.column >= 0 ? state.cursor.column : 0;
        if (typeof editor.moveCursorTo === "function") {
          editor.moveCursorTo(state.cursor.row, col);
        } else if (editor.selection && typeof editor.selection.moveCursorTo === "function") {
          editor.selection.moveCursorTo(state.cursor.row, col);
        }
      }
    } catch (e) {}
  }

  document.addEventListener("fm-ace-get-content", function () {
    document.dispatchEvent(new CustomEvent("fm-ace-content", { detail: getContent() }));
  });

  document.addEventListener("fm-ace-get-state", function () {
    document.dispatchEvent(new CustomEvent("fm-ace-state", { detail: getState() }));
  });

  document.addEventListener("fm-ace-set-state", function (ev) {
    setState(ev.detail);
    document.dispatchEvent(new CustomEvent("fm-ace-state-restored"));
  });

  document.addEventListener("fm-ace-insert-text", function (ev) {
    var text = ev.detail;
    if (typeof text !== "string") return;
    var editor = getEditor();
    if (!editor) return;
    try {
      if (typeof editor.insert === "function") {
        editor.insert(text);
      } else if (editor.session && typeof editor.session.insert === "function") {
        var pos = editor.getCursorPosition && editor.getCursorPosition();
        if (pos) editor.session.insert({ row: pos.row, column: pos.column }, text);
      }
      /* Update scroll so Copy & Save captures correct position (programmatic insert may not scroll when editor lacks focus). */
      if (editor.renderer && typeof editor.renderer.scrollCursorIntoView === "function") {
        editor.renderer.scrollCursorIntoView();
      }
    } catch (e) {}
  });

  setTimeout(tryWrapAce, 200);
  setTimeout(tryWrapAce, 1000);
})();
