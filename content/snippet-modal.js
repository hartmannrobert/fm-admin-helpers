/**
 * In-page modal for managing custom script snippets. Opens when the popup sends "fm-open-snippet-modal".
 * Uses IndexedDB via FM.snippetStorage (no localStorage).
 */
(function () {
  const MODAL_ID = "fm-snippet-modal-root";
  const SNIPPETS_CHANGED_EVENT = "fm-snippets-changed";

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
      .then(function () {
        try { window.dispatchEvent(new CustomEvent(SNIPPETS_CHANGED_EVENT)); } catch (e) { /* ignore */ }
        if (typeof cb === "function") cb();
      })
      .catch(function (err) {
        if (typeof cb === "function") cb();
      });
  }

  function injectStyles() {
    if (document.getElementById("fm-snippet-modal-styles")) return;
    const style = document.createElement("style");
    style.id = "fm-snippet-modal-styles";
    style.textContent = [
      "#" + MODAL_ID + " { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; font-size: 14px; }",
      "#" + MODAL_ID + " .fm-sm-panel { background: var(--fm-sm-bg, #fff); color: var(--fm-sm-fg, #1a1a1a); width: 100%; max-width: 720px; max-height: 90vh; overflow: auto; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }",
      "#" + MODAL_ID + " .fm-sm-hd { padding: 16px 20px; border-bottom: 1px solid rgba(120,120,120,0.35); display: flex; align-items: center; justify-content: space-between; gap: 12px; }",
      "#" + MODAL_ID + " .fm-sm-title { margin: 0; font-size: 18px; font-weight: 700; }",
      "#" + MODAL_ID + " .fm-sm-close { padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 13px; }",
      "#" + MODAL_ID + " .fm-sm-body { padding: 20px; }",
      "#" + MODAL_ID + " .fm-sm-section { margin-bottom: 24px; }",
      "#" + MODAL_ID + " .fm-sm-section h2 { margin: 0 0 12px 0; font-size: 15px; font-weight: 600; }",
      "#" + MODAL_ID + " .fm-sm-hint { margin: 0 0 12px 0; font-size: 12px; opacity: 0.85; }",
      "#" + MODAL_ID + " .fm-sm-field { display: block; margin-bottom: 12px; }",
      "#" + MODAL_ID + " .fm-sm-field span { display: block; margin-bottom: 4px; font-weight: 500; }",
      "#" + MODAL_ID + " .fm-sm-field span em { font-weight: normal; opacity: 0.8; }",
      "#" + MODAL_ID + " .fm-sm-field input, #" + MODAL_ID + " .fm-sm-field textarea { width: 100%; max-width: 560px; padding: 8px 10px; border: 1px solid rgba(120,120,120,0.45); border-radius: 6px; font-family: inherit; font-size: 13px; box-sizing: border-box; }",
      "#" + MODAL_ID + " .fm-sm-field textarea { font-family: ui-monospace,monospace; resize: vertical; min-height: 100px; }",
      "#" + MODAL_ID + " .fm-sm-actions { display: flex; gap: 10px; margin-top: 16px; }",
      "#" + MODAL_ID + " .fm-sm-actions button { padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 13px; }",
      "#" + MODAL_ID + " .fm-sm-ie { display: flex; gap: 10px; margin-bottom: 12px; }",
      "#" + MODAL_ID + " .fm-sm-ie button { padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 13px; }",
      "#" + MODAL_ID + " .fm-sm-list { list-style: none; margin: 0; padding: 0; }",
      "#" + MODAL_ID + " .fm-sm-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; margin-bottom: 6px; border: 1px solid rgba(120,120,120,0.35); border-radius: 6px; background: rgba(120,120,120,0.06); }",
      "#" + MODAL_ID + " .fm-sm-list li .info { flex: 1; min-width: 0; }",
      "#" + MODAL_ID + " .fm-sm-list li .name { font-weight: 600; }",
      "#" + MODAL_ID + " .fm-sm-list li .id { font-size: 12px; opacity: 0.75; font-family: ui-monospace,monospace; }",
      "#" + MODAL_ID + " .fm-sm-list li .desc { font-size: 12px; opacity: 0.85; margin-top: 2px; }",
      "#" + MODAL_ID + " .fm-sm-list li .btns { display: flex; gap: 6px; flex-shrink: 0; }",
      "#" + MODAL_ID + " .fm-sm-list li button { padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(120,120,120,0.45); background: transparent; cursor: pointer; font-size: 12px; }",
      "#" + MODAL_ID + " .fm-sm-list .empty { padding: 16px; text-align: center; opacity: 0.8; font-size: 13px; }"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function createModal() {
    injectStyles();
    let root = document.getElementById(MODAL_ID);
    if (root) {
      root.style.display = "flex";
      getStored(renderList);
      return root;
    }
    root = document.createElement("div");
    root.id = MODAL_ID;

    const panel = document.createElement("div");
    panel.className = "fm-sm-panel";

    const hd = document.createElement("div");
    hd.className = "fm-sm-hd";
    const title = document.createElement("h1");
    title.className = "fm-sm-title";
    title.textContent = "My script snippets";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "fm-sm-close";
    closeBtn.textContent = "Close";
    hd.appendChild(title);
    hd.appendChild(closeBtn);
    panel.appendChild(hd);

    const body = document.createElement("div");
    body.className = "fm-sm-body";

    const formSec = document.createElement("section");
    formSec.className = "fm-sm-section";
    formSec.innerHTML = "<h2>Add or edit snippet</h2><p class=\"fm-sm-hint\">Pasted code: literal backslash-n (<code>\\n</code>) is converted to newlines.</p>";
    const form = document.createElement("form");
    form.id = "fm-sm-form";
    const fields = [
      { id: "fm-sm-id", label: "Id <em>(required, unique)</em>", type: "text", required: true },
      { id: "fm-sm-name", label: "Name", type: "text", required: false },
      { id: "fm-sm-desc", label: "Description", type: "text", required: false }
    ];
    fields.forEach(function (f) {
      const label = document.createElement("label");
      label.className = "fm-sm-field";
      label.innerHTML = "<span>" + f.label + "</span>";
      const input = document.createElement("input");
      input.id = f.id;
      input.type = f.type;
      input.autocomplete = "off";
      if (f.required) input.required = true;
      label.appendChild(input);
      form.appendChild(label);
    });
    const codeLabel = document.createElement("label");
    codeLabel.className = "fm-sm-field";
    codeLabel.innerHTML = "<span>Code <em>(required)</em></span>";
    const codeEl = document.createElement("textarea");
    codeEl.id = "fm-sm-code";
    codeEl.rows = 8;
    codeEl.required = true;
    codeLabel.appendChild(codeEl);
    form.appendChild(codeLabel);
    const actions = document.createElement("div");
    actions.className = "fm-sm-actions";
    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.textContent = "Save";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);
    formSec.appendChild(form);
    body.appendChild(formSec);

    const listSec = document.createElement("section");
    listSec.className = "fm-sm-section";
    listSec.innerHTML = "<h2>Your snippets</h2>";
    const ieDiv = document.createElement("div");
    ieDiv.className = "fm-sm-ie";
    const importDefaultBtn = document.createElement("button");
    importDefaultBtn.type = "button";
    importDefaultBtn.textContent = "Import default";
    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.textContent = "Export as JSON";
    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.textContent = "Import from JSON";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.style.display = "none";
    ieDiv.appendChild(importDefaultBtn);
    ieDiv.appendChild(exportBtn);
    ieDiv.appendChild(importBtn);
    ieDiv.appendChild(fileInput);
    listSec.appendChild(ieDiv);
    const listEl = document.createElement("ul");
    listEl.className = "fm-sm-list";
    listEl.id = "fm-sm-list";
    listSec.appendChild(listEl);
    body.appendChild(listSec);
    panel.appendChild(body);
    root.appendChild(panel);

    document.body.appendChild(root);

    let editingId = null;
    const idEl = document.getElementById("fm-sm-id");
    const nameEl = document.getElementById("fm-sm-name");
    const descEl = document.getElementById("fm-sm-desc");
    const codeElRef = document.getElementById("fm-sm-code");

    function clearForm() {
      editingId = null;
      idEl.value = "";
      nameEl.value = "";
      descEl.value = "";
      codeElRef.value = "";
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
        name.textContent = (s.name && String(s.name).trim()) ? s.name : (s.id || "Unnamed");
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
          codeElRef.value = s.code || "";
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
      const codeRaw = codeElRef.value;
      const code = normalizeCode(codeRaw).trim();
      if (!id || !code) return;
      getStored(function (arr) {
        const existing = arr.findIndex(function (x) { return String(x.id || "") === id; });
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
    cancelBtn.addEventListener("click", clearForm);

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
          result.list.forEach(function (item) { byId.set(String(item.id || ""), item); });
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
    importDefaultBtn.addEventListener("click", importDefaultSnippets);
    exportBtn.addEventListener("click", exportSnippets);
    importBtn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      const file = fileInput.files && fileInput.files[0];
      if (file) importSnippets(file);
      fileInput.value = "";
    });

    function closeModal() {
      root.style.display = "none";
    }
    closeBtn.addEventListener("click", closeModal);
    root.addEventListener("click", function (ev) {
      if (ev.target === root) closeModal();
    });
    panel.addEventListener("click", function (ev) { ev.stopPropagation(); });

    getStored(renderList);
    return root;
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg && msg.type === "fm-open-snippet-modal") {
      createModal();
      sendResponse({ ok: true });
    }
    return false;
  });
})();
