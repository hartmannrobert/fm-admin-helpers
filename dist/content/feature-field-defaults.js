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
        Object.keys(preset.values).forEach(function (fieldKey) {
          var fieldDef = typeConfig.fields[fieldKey];
          if (fieldDef) setFieldValue(fieldDef.selector, preset.values[fieldKey]);
        });
      });
      bar.appendChild(btn);
    });
    select.parentNode.insertBefore(bar, select.nextSibling);
    return bar;
  }

  function tick() {
    var select = document.getElementById("dataTypeSelect");
    if (!select) {
      removeBar();
      return;
    }

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
