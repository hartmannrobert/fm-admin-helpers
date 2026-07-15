window.FM = window.FM || {};
window.FM.features = window.FM.features || {};

/**
 * Injects preset buttons (from data/field-defaults.json) into the admin
 * "Create/Edit Field" form (#contentformdiv), keyed by the selected Data Type.
 * Clicking a preset fills that type's attribute inputs (display length, field
 * length/precision, max length) without the user typing them manually.
 */
FM.features.fieldDefaults = (function () {
  var DATA_URL = "data/field-defaults.json";
  var BAR_ID = "fm-field-defaults-bar";
  var dataPromise = null;
  var lastTypeName = null;

  function loadData() {
    if (!dataPromise) {
      dataPromise = fetch(chrome.runtime.getURL(DATA_URL))
        .then(function (r) { return r.json(); })
        .catch(function (e) {
          console.warn("[FM] field-defaults.json load failed", e);
          return {};
        });
    }
    return dataPromise;
  }

  function getSelectedTypeName(select) {
    var opt = select.options[select.selectedIndex];
    return opt ? opt.text.trim() : "";
  }

  function setFieldValue(selector, value) {
    var el = document.querySelector(selector);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function removeBar() {
    var bar = document.getElementById(BAR_ID);
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    lastTypeName = null;
  }

  function applyPreset(typeConfig, preset) {
    Object.keys(preset.values).forEach(function (fieldKey) {
      var fieldDef = typeConfig.fields[fieldKey];
      if (fieldDef) setFieldValue(fieldDef.selector, preset.values[fieldKey]);
    });
  }

  function buildBar(typeConfig, select) {
    var bar = document.createElement("span");
    bar.id = BAR_ID;
    bar.className = "fm-field-defaults-bar";
    (typeConfig.presets || []).forEach(function (preset) {
      var btn = document.createElement("input");
      btn.type = "button";
      btn.value = preset.label;
      btn.className = "submitinput fm-field-defaults-btn";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        applyPreset(typeConfig, preset);
      });
      bar.appendChild(btn);
    });
    select.parentNode.insertBefore(bar, select.nextSibling);
    return bar;
  }

  // The page rebuilds/clears the attribute inputs asynchronously after a data
  // type change (visible flash-then-empty), so a single synchronous apply
  // gets overwritten. Retry for a short window, canceling if the type changes again.
  var RETRY_DELAYS_MS = [0, 150, 350, 600, 1000, 1500];
  var pendingTimers = [];

  function cancelPendingApplies() {
    pendingTimers.forEach(function (id) { clearTimeout(id); });
    pendingTimers = [];
  }

  function scheduleApplyForType(typeName) {
    cancelPendingApplies();
    RETRY_DELAYS_MS.forEach(function (delay) {
      pendingTimers.push(setTimeout(function () {
        loadData().then(function (data) {
          var typeConfig = data[typeName];
          if (!typeConfig) return;
          var presets = typeConfig.presets || [];
          if (!presets.length) return;
          var preset = presets.filter(function (p) {
            return p.label === typeConfig.defaultPreset;
          })[0] || presets[0];
          applyPreset(typeConfig, preset);
        });
      }, delay));
    });
  }

  function bindAutoDefault(select) {
    if (select.__fmDefaultsBound) return;
    select.__fmDefaultsBound = true;
    select.addEventListener("change", function () {
      scheduleApplyForType(getSelectedTypeName(select));
    });
  }

  // For "Pick List", the displayLength input only exists in the DOM once a
  // lookup table has been picked in #pickListSelect, so re-apply the Pick
  // List defaults on that selection too (not just on the data type change).
  function bindPickListAutoDefault(pickListSelect) {
    if (pickListSelect.__fmDefaultsBound) return;
    pickListSelect.__fmDefaultsBound = true;
    pickListSelect.addEventListener("change", function () {
      scheduleApplyForType("Pick List");
    });
  }

  function tick() {
    var select = document.getElementById("dataTypeSelect");
    if (!select) {
      removeBar();
      return;
    }

    bindAutoDefault(select);

    var pickListSelect = document.getElementById("pickListSelect");
    if (pickListSelect) bindPickListAutoDefault(pickListSelect);

    var typeName = getSelectedTypeName(select);

    loadData().then(function (data) {
      var typeConfig = data[typeName];
      if (!typeConfig) {
        removeBar();
        return;
      }

      var bar = document.getElementById(BAR_ID);
      if (bar && lastTypeName === typeName && bar.previousSibling === select) return;

      removeBar();
      lastTypeName = typeName;
      buildBar(typeConfig, select);
    });
  }

  return { tick: tick };
})();
