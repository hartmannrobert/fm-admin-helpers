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

  var savedSnippetCursor = null;
  var lastInsertedRange = null;

  function getAceRange(editor) {
    try {
      if (typeof window.ace !== "undefined" && window.ace.require) return window.ace.require("ace/range").Range;
    } catch (err) {}
    try {
      var ed = editor || getEditor();
      if (ed && ed.selection && typeof ed.selection.getRange === "function") {
        var r = ed.selection.getRange();
        if (r && r.constructor && r.start != null && r.end != null) return r.constructor;
      }
    } catch (err) {}
    return null;
  }

  function doInsertSnippet(code) {
    if (typeof code !== "string") return;
    var editor = getEditor();
    if (!editor || !editor.session) return;
    var Range = getAceRange(editor);
    var startRow, startCol;
    try {
      var selRange = editor.selection && typeof editor.selection.getRange === "function" ? editor.selection.getRange() : null;
      var hasSelection = selRange && selRange.start && selRange.end && (selRange.start.row !== selRange.end.row || selRange.start.column !== selRange.end.column);

      if (Range && hasSelection) {
        startRow = selRange.start.row;
        startCol = selRange.start.column;
        var r = new Range(selRange.start.row, selRange.start.column, selRange.end.row, selRange.end.column);
        editor.session.replace(r, code);
      } else if (Range && lastInsertedRange) {
        startRow = lastInsertedRange.startRow;
        startCol = lastInsertedRange.startCol;
        var r = new Range(lastInsertedRange.startRow, lastInsertedRange.startCol, lastInsertedRange.endRow, lastInsertedRange.endCol);
        editor.session.replace(r, code);
      } else if (savedSnippetCursor) {
        startRow = savedSnippetCursor.row;
        startCol = savedSnippetCursor.column;
        if (Range) {
          var r = new Range(startRow, startCol, startRow, startCol);
          editor.session.replace(r, code);
        } else {
          if (typeof editor.insert === "function") editor.insert(code);
          else if (typeof editor.session.insert === "function") editor.session.insert({ row: startRow, column: startCol }, code);
        }
      } else {
        var pos = editor.getCursorPosition && editor.getCursorPosition();
        if (!pos) return;
        startRow = pos.row;
        startCol = pos.column;
        if (typeof editor.insert === "function") editor.insert(code);
        else if (typeof editor.session.insert === "function") editor.session.insert({ row: pos.row, column: pos.column }, code);
      }

      var lines = code.split("\n");
      var endRow = startRow + lines.length - 1;
      var endCol = lines.length === 1 ? startCol + code.length : lines[lines.length - 1].length;
      lastInsertedRange = { startRow: startRow, startCol: startCol, endRow: endRow, endCol: endCol };
      savedSnippetCursor = null;

      if (Range && editor.selection) {
        var sel = new Range(startRow, startCol, endRow, endCol);
        if (typeof editor.selection.setRange === "function") editor.selection.setRange(sel);
        else if (typeof editor.selection.setSelectionRange === "function") editor.selection.setSelectionRange(sel);
      }
      if (editor.renderer && typeof editor.renderer.scrollCursorIntoView === "function") editor.renderer.scrollCursorIntoView();
    } catch (e) {}
  }

  function snippetDropdownOpened() {
    var editor = getEditor();
    if (!editor) return;
    var pos = editor.getCursorPosition && editor.getCursorPosition();
    if (pos && typeof pos.row === "number") savedSnippetCursor = { row: pos.row, column: typeof pos.column === "number" ? pos.column : 0 };
    else savedSnippetCursor = null;
  }

  function snippetDropdownClosed() {
    savedSnippetCursor = null;
    lastInsertedRange = null;
  }

  document.addEventListener("fm-ace-insert-snippet", function (ev) {
    doInsertSnippet(ev.detail && ev.detail.code);
  });

  window.addEventListener("message", function (ev) {
    if (ev.source !== window || !ev.data) return;
    var t = ev.data.type;
    if (t === "fm-ace-snippet-dropdown-opened") snippetDropdownOpened();
    else if (t === "fm-ace-insert-snippet" && typeof ev.data.code === "string") doInsertSnippet(ev.data.code);
    else if (t === "fm-ace-snippet-dropdown-closed") snippetDropdownClosed();
  });

  document.addEventListener("fm-ace-set-content", function (ev) {
    var detail = ev.detail;
    if (!detail || typeof detail.content !== "string") return;
    var editor = getEditor();
    if (!editor || !editor.session) return;
    try {
      if (typeof editor.session.setValue === "function") {
        editor.session.setValue(detail.content);
      }
      if (detail.cursor && typeof detail.cursor.row === "number") {
        var col = typeof detail.cursor.column === "number" && detail.cursor.column >= 0 ? detail.cursor.column : 0;
        if (typeof editor.moveCursorTo === "function") {
          editor.moveCursorTo(detail.cursor.row, col);
        } else if (editor.selection && typeof editor.selection.moveCursorTo === "function") {
          editor.selection.moveCursorTo(detail.cursor.row, col);
        }
      }
      if (detail.selection && detail.selection.start && detail.selection.end) {
        var sel = detail.selection;
        var Range = typeof window.ace !== "undefined" && window.ace.require ? window.ace.require("ace/range").Range : null;
        if (Range && editor.selection && typeof editor.selection.setSelectionRange === "function") {
          var r = new Range(
            sel.start.row, sel.start.column,
            sel.end.row, sel.end.column
          );
          editor.selection.setSelectionRange(r);
        }
      }
      if (editor.renderer && typeof editor.renderer.scrollCursorIntoView === "function") {
        editor.renderer.scrollCursorIntoView();
      }
    } catch (e) {}
  });

  function getSelection() {
    var editor = getEditor();
    if (!editor || !editor.selection) return null;
    try {
      var range = typeof editor.selection.getRange === "function" ? editor.selection.getRange() : null;
      if (!range || !range.start || !range.end) return null;
      return {
        start: { row: range.start.row, column: range.start.column },
        end: { row: range.end.row, column: range.end.column }
      };
    } catch (e) {}
    return null;
  }

  document.addEventListener("fm-ace-get-selection", function () {
    document.dispatchEvent(new CustomEvent("fm-ace-selection", { detail: getSelection() }));
  });

  document.addEventListener("fm-ace-set-selection", function (ev) {
    var detail = ev.detail;
    if (!detail || !detail.start || !detail.end) return;
    var editor = getEditor();
    if (!editor || !editor.selection) return;
    try {
      var Range = typeof window.ace !== "undefined" && window.ace.require ? window.ace.require("ace/range").Range : null;
      if (!Range || typeof editor.selection.setSelectionRange !== "function") return;
      var r = new Range(
        detail.start.row, detail.start.column,
        detail.end.row, detail.end.column
      );
      editor.selection.setSelectionRange(r);
      if (editor.renderer && typeof editor.renderer.scrollCursorIntoView === "function") {
        editor.renderer.scrollCursorIntoView();
      }
    } catch (e) {}
  });

  document.addEventListener("fm-ace-replace-range", function (ev) {
    var detail = ev.detail;
    if (!detail || !detail.start || !detail.end || typeof detail.text !== "string") return;
    var editor = getEditor();
    if (!editor || !editor.session || !editor.selection) return;
    try {
      var Range = typeof window.ace !== "undefined" && window.ace.require ? window.ace.require("ace/range").Range : null;
      if (!Range || typeof editor.session.replace !== "function") return;
      var r = new Range(
        detail.start.row, detail.start.column,
        detail.end.row, detail.end.column
      );
      editor.session.replace(r, detail.text);
      var lines = detail.text.split("\n");
      var endRow = detail.start.row + lines.length - 1;
      var endCol = lines.length === 1 ? detail.start.column + detail.text.length : lines[lines.length - 1].length;
      var r2 = new Range(detail.start.row, detail.start.column, endRow, endCol);
      if (typeof editor.selection.setSelectionRange === "function") {
        editor.selection.setSelectionRange(r2);
      }
      if (editor.renderer && typeof editor.renderer.scrollCursorIntoView === "function") {
        editor.renderer.scrollCursorIntoView();
      }
      document.dispatchEvent(new CustomEvent("fm-ace-range-replaced", { detail: { start: detail.start, end: { row: endRow, column: endCol } } }));
    } catch (e) {}
  });

  setTimeout(tryWrapAce, 200);
  setTimeout(tryWrapAce, 1000);
})();
