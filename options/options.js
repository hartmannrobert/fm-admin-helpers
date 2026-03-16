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

  const form = document.getElementById("snippet-form");
  const idEl = document.getElementById("snippet-id");
  const nameEl = document.getElementById("snippet-name");
  const descEl = document.getElementById("snippet-desc");
  const codeEl = document.getElementById("snippet-code");
  const listEl = document.getElementById("snippet-list");
  const btnCancel = document.getElementById("btn-cancel");
  const btnImportDefault = document.getElementById("btn-import-default");
  const btnExport = document.getElementById("btn-export");
  const btnImport = document.getElementById("btn-import");
  const importFile = document.getElementById("import-file");

  let editingId = null;

  function clearForm() {
    editingId = null;
    idEl.value = "";
    nameEl.value = "";
    descEl.value = "";
    codeEl.value = "";
    idEl.disabled = false;
  }

  function renderList(list) {
    listEl.innerHTML = "";
    if (list.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No custom snippets yet. Add one above.";
      listEl.appendChild(li);
      return;
    }
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const li = document.createElement("li");
      const info = document.createElement("div");
      info.className = "info";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = s.name && String(s.name).trim() ? s.name : s.id || "Unnamed";
      const idLine = document.createElement("div");
      idLine.className = "id";
      idLine.textContent = s.id || "";
      const desc = document.createElement("div");
      desc.className = "desc";
      desc.textContent = (s.description && String(s.description).trim()) || "";
      info.appendChild(name);
      info.appendChild(idLine);
      info.appendChild(desc);
      const btns = document.createElement("div");
      btns.className = "btns";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () {
        editingId = s.id;
        idEl.value = s.id || "";
        nameEl.value = s.name || "";
        descEl.value = s.description || "";
        codeEl.value = s.code || "";
        idEl.disabled = true;
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () {
        const idToDelete = String(s.id || "");
        if (!idToDelete) return;
        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.textContent = "Confirm";
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = "Cancel";
        confirmBtn.addEventListener("click", function () {
          getStored(function (arr) {
            const next = arr.filter(function (x) { return String(x.id || "") !== idToDelete; });
            setStored(next, function () {
              if (editingId === idToDelete) clearForm();
              renderList(next);
            });
          });
        });
        cancelBtn.addEventListener("click", function () {
          btns.removeChild(confirmBtn);
          btns.removeChild(cancelBtn);
          btns.appendChild(editBtn);
          btns.appendChild(delBtn);
        });
        btns.removeChild(editBtn);
        btns.removeChild(delBtn);
        btns.appendChild(confirmBtn);
        btns.appendChild(cancelBtn);
      });
      btns.appendChild(editBtn);
      btns.appendChild(delBtn);
      li.appendChild(info);
      li.appendChild(btns);
      listEl.appendChild(li);
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const id = String(idEl.value || "").trim();
    const name = String(nameEl.value || "").trim();
    const description = String(descEl.value || "").trim();
    const codeRaw = codeEl.value;
    const code = normalizeCode(codeRaw).trim();
    if (!id) return;
    if (!code) return;
    getStored(function (arr) {
      const existing = arr.findIndex(function (x) { return x.id === id; });
      const item = { id: id, name: name || id, description: description, code: code };
      let next;
      if (existing >= 0) {
        next = arr.slice();
        next[existing] = item;
      } else {
        next = arr.concat(item);
      }
      setStored(next, function () {
        renderList(next);
        clearForm();
      });
    });
  });

  btnCancel.addEventListener("click", function () {
    clearForm();
  });

  function exportSnippets() {
    getStored(function (list) {
      const json = JSON.stringify(list, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fm-snippets.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function parseImportedList(data) {
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      return { error: "Invalid JSON." };
    }
    if (!Array.isArray(parsed)) return { error: "File must be a JSON array of snippets." };
    const list = [];
    for (let i = 0; i < parsed.length; i++) {
      const raw = parsed[i];
      if (!raw || typeof raw !== "object") continue;
      const id = typeof raw.id === "string" ? raw.id.trim() : String(raw.id || "").trim();
      const code = typeof raw.code === "string" ? raw.code : String(raw.code || "");
      if (!id || !code) continue;
      list.push({
        id: id,
        name: typeof raw.name === "string" ? raw.name.trim() : (raw.name ? String(raw.name).trim() : id),
        description: typeof raw.description === "string" ? raw.description.trim() : (raw.description ? String(raw.description).trim() : ""),
        code: normalizeCode(code).trim()
      });
    }
    return { list: list };
  }

  function importSnippets(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const result = parseImportedList(reader.result);
      if (result.error) {
        alert(result.error);
        return;
      }
      if (result.list.length === 0) {
        alert("No valid snippets in file. Each item needs id and code.");
        return;
      }
      getStored(function (current) {
        const byId = new Map();
        current.forEach(function (x) { byId.set(String(x.id || ""), x); });
        result.list.forEach(function (item) {
          byId.set(String(item.id || ""), item);
        });
        const merged = Array.from(byId.values());
        setStored(merged, function () {
          renderList(merged);
          clearForm();
        });
      });
    };
    reader.readAsText(file, "UTF-8");
  }

  function importDefaultSnippets() {
    const url = chrome.runtime.getURL("data/default-snippets.json");
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (rawList) {
        if (!Array.isArray(rawList)) return;
        const list = rawList.map(function (raw) {
          const id = typeof raw.id === "string" ? raw.id.trim() : String(raw.id || "").trim();
          const code = typeof raw.code === "string" ? raw.code : String(raw.code || "");
          return {
            id: id,
            name: typeof raw.name === "string" ? raw.name.trim() : (raw.name ? String(raw.name).trim() : id),
            description: typeof raw.description === "string" ? raw.description.trim() : (raw.description ? String(raw.description).trim() : ""),
            code: normalizeCode(code).trim()
          };
        }).filter(function (x) { return x.id && x.code; });
        getStored(function (current) {
          const byId = new Map();
          current.forEach(function (x) { byId.set(String(x.id || ""), x); });
          list.forEach(function (item) { byId.set(String(item.id || ""), item); });
          const merged = Array.from(byId.values());
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
      const file = importFile.files && importFile.files[0];
      if (file) importSnippets(file);
      importFile.value = "";
    });
  }

  getStored(renderList);
})();
