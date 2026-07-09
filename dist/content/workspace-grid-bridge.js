// MAIN-world bridge for the Workspace Manager MUI DataGrid.
//
// feature-workspace.js (ISOLATED world) needs to resize real grid columns
// through the grid's own apiRef.setColumnWidth() so the grid's internal
// auto-fit math stays consistent (see feature-workspace.js for why). But
// React's fiber tree (and the apiRef hanging off it) is attached to DOM
// nodes as page-context expando properties, which isolated-world content
// scripts cannot see. This MAIN-world script can, so it does the actual
// resizing on request and reports back the original (pre-resize) width via
// a custom event.
(function () {
  function findReactFiber(dom) {
    var key = dom && Object.keys(dom).find(function (k) {
      return k.indexOf("__reactFiber$") === 0;
    });
    return key ? dom[key] : null;
  }

  function findGridApiRef(dom) {
    var fiber = findReactFiber(dom);
    var depth = 0;
    while (fiber && depth < 60) {
      var props = fiber.memoizedProps || {};
      if (props.apiRef && props.apiRef.current) return props.apiRef;
      if (fiber.stateNode && fiber.stateNode.apiRef && fiber.stateNode.apiRef.current) return fiber.stateNode.apiRef;
      fiber = fiber.return;
      depth++;
    }
    return null;
  }

  function getGridApiRef() {
    var grid = document.querySelector(".MuiDataGrid-root") || document.querySelector(".MuiDataGrid-main");
    if (!grid) return null;
    return findGridApiRef(grid);
  }

  var baselines = {};

  function ensureColumnResized(field, extraWidth) {
    var apiRef = getGridApiRef();
    if (!apiRef || typeof apiRef.current.setColumnWidth !== "function" || typeof apiRef.current.getColumn !== "function") {
      return null;
    }

    var col = apiRef.current.getColumn(field);
    if (!col) return null;

    // Capture the natural (un-widened) width only once — the grid may later
    // hydrate/reset col.width on its own (data reload, saved column state,
    // auto-fit re-balance), so we can't rely on col.width still being the
    // baseline on later ticks.
    if (!Object.prototype.hasOwnProperty.call(baselines, field)) {
      baselines[field] = col.width;
    }

    var baseline = baselines[field];
    var target = baseline + extraWidth;

    if (col.width !== target) {
      try {
        apiRef.current.setColumnWidth(field, target);
      } catch (e) {
        console.warn("[FM] workspace grid column resize failed", field, e);
      }
    }
    return baseline;
  }

  document.addEventListener("fm-ws-grid-resize-columns", function (ev) {
    var fields = (ev.detail && ev.detail.fields) || [];
    var result = {};
    var any = false;

    for (var i = 0; i < fields.length; i++) {
      var baseline = ensureColumnResized(fields[i].field, fields[i].extraWidth);
      if (baseline != null) {
        result[fields[i].field] = baseline;
        any = true;
      }
    }

    if (any) {
      document.dispatchEvent(new CustomEvent("fm-ws-grid-columns-resized", { detail: result }));
    }
  });
})();
