(function () {
  function normalizeCode(code) {
    if (typeof code !== "string") return "";
    return code.replace(/\\n/g, "\n");
  }

  function getStorage() {
    var storage = window.FM && window.FM.snippetStorage;
    if (!storage) return Promise.reject(new Error("FM.snippetStorage not available"));
    return storage.init().then(function () { return storage; });
  }

  function getStored(cb) {
    getStorage().then(function (storage) { return storage.getAll(); })
      .then(function (list) { cb(Array.isArray(list) ? list : []); })
      .catch(function () { cb([]); });
  }

  function setStored(list, cb) {
    getStorage().then(function (storage) { return storage.replaceAll(list || []); })
      .then(function () { if (typeof cb === "function") cb(); })
      .catch(function () { if (typeof cb === "function") cb(); });
  }

  var form = document.getElementById("snippet-form");
  var nameEl = document.getElementById("snippet-name");
  var codeEl = document.getElementById("snippet-code");
  var listEl = document.getElementById("snippet-list");
  var btnCancel = document.getElementById("btn-cancel");
  var btnImportDefault = document.getElementById("btn-import-default");
  var btnExport = document.getElementById("btn-export");
  var btnImport = document.getElementById("btn-import");
  var importFile = document.getElementById("import-file");

  var editingName = null;

  function clearForm() {
    editingName = null;
    nameEl.value = "";
    codeEl.value = "";
    nameEl.disabled = false;
  }

  function renderList(list) {
    listEl.innerHTML = "";
    if (list.length === 0) {
      var li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No custom snippets yet. Add one above.";
      listEl.appendChild(li);
      return;
    }
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var li = document.createElement("li");
      var info = document.createElement("div");
      info.className = "info";
      var nameDiv = document.createElement("div");
      nameDiv.className = "name";
      nameDiv.textContent = (s.name && String(s.name).trim()) ? s.name : "Unnamed";
      info.appendChild(nameDiv);
      var btns = document.createElement("div");
      btns.className = "btns";
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function (snip) {
        return function () {
          editingName = snip.name;
          nameEl.value = snip.name || "";
          codeEl.value = snip.code || "";
          nameEl.disabled = true;
        };
      }(s));
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function (snip) {
        return function () {
          var nameToDelete = String(snip.name || "");
          if (!nameToDelete) return;
          if (!confirm("Delete snippet \"" + nameToDelete.replace(/"/g, "\\\"") + "\"?")) return;
          getStorage().then(function (storage) { return storage.remove(nameToDelete); })
            .then(function () {
              if (editingName === nameToDelete) clearForm();
              getStored(renderList);
            })
            .catch(function () {});
        };
      }(s));
      btns.appendChild(editBtn);
      btns.appendChild(delBtn);
      li.appendChild(info);
      li.appendChild(btns);
      listEl.appendChild(li);
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = String(nameEl.value || "").trim();
    var codeRaw = codeEl.value;
    var code = normalizeCode(codeRaw).trim();
    if (!name) return;
    if (!code) return;
    getStored(function (arr) {
      var nameExists = arr.some(function (x) { return x.name === name; });
      var isEdit = editingName !== null;
      if (!isEdit && nameExists) {
        alert("A snippet with this name already exists. Choose a different name.");
        return;
      }
      if (isEdit && editingName !== name && nameExists) {
        alert("A snippet with this name already exists. Choose a different name.");
        return;
      }
      var item = { name: name, code: code };
      getStorage().then(function (storage) {
        if (isEdit && editingName !== name) {
          return storage.remove(editingName).then(function () { return storage.put(item); });
        }
        return storage.put(item);
      }).then(function () {
        getStored(function (list) {
          renderList(list);
          clearForm();
        });
      }).catch(function () {
        alert("Failed to save. Try again.");
      });
    });
  });

  btnCancel.addEventListener("click", function () {
    clearForm();
  });

  function exportSnippets() {
    getStored(function (list) {
      var json = JSON.stringify(list, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "fm-snippets.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function parseImportedList(data) {
    var parsed;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      return { error: "Invalid JSON." };
    }
    if (!Array.isArray(parsed)) return { error: "File must be a JSON array of snippets." };
    var list = [];
    for (var i = 0; i < parsed.length; i++) {
      var raw = parsed[i];
      if (!raw || typeof raw !== "object") continue;
      var name = (typeof raw.name === "string" && raw.name.trim() !== "")
        ? raw.name.trim()
        : (typeof raw.id === "string" && raw.id.trim() !== "")
          ? raw.id.trim()
          : "";
      var code = typeof raw.code === "string" ? raw.code : String(raw.code || "");
      if (!name || !code) continue;
      list.push({
        name: name,
        code: normalizeCode(code).trim()
      });
    }
    return { list: list };
  }

  function importSnippets(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var result = parseImportedList(reader.result);
      if (result.error) {
        alert(result.error);
        return;
      }
      if (result.list.length === 0) {
        alert("No valid snippets in file. Each item needs a name (or id) and code.");
        return;
      }
      getStored(function (current) {
        var byName = new Map();
        current.forEach(function (x) { byName.set(x.name, x); });
        result.list.forEach(function (item) { byName.set(item.name, item); });
        var merged = Array.from(byName.values());
        setStored(merged, function () {
          renderList(merged);
          clearForm();
        });
      });
    };
    reader.readAsText(file, "UTF-8");
  }

  function importDefaultSnippets() {
    var url = chrome.runtime.getURL("data/default-snippets.json");
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (rawList) {
        if (!Array.isArray(rawList)) return;
        var list = rawList.map(function (raw) {
          var name = (typeof raw.name === "string" && raw.name.trim() !== "")
            ? raw.name.trim()
            : (typeof raw.id === "string" && raw.id.trim() !== "")
              ? raw.id.trim()
              : "";
          var code = typeof raw.code === "string" ? raw.code : String(raw.code || "");
          return {
            name: name,
            code: normalizeCode(code).trim()
          };
        }).filter(function (x) { return x.name && x.code; });
        getStored(function (current) {
          var byName = new Map();
          current.forEach(function (x) { byName.set(x.name, x); });
          list.forEach(function (item) { byName.set(item.name, item); });
          var merged = Array.from(byName.values());
          setStored(merged, function () {
            renderList(merged);
            clearForm();
          });
        });
      })
      .catch(function () { alert("Could not load default snippets."); });
  }
  if (btnImportDefault) btnImportDefault.addEventListener("click", importDefaultSnippets);
  if (btnExport) btnExport.addEventListener("click", exportSnippets);
  if (btnImport) {
    btnImport.addEventListener("click", function () {
      if (importFile) importFile.click();
    });
  }
  if (importFile) {
    importFile.addEventListener("change", function () {
      var file = importFile.files && importFile.files[0];
      if (file) importSnippets(file);
      importFile.value = "";
    });
  }

  getStored(renderList);
})();
