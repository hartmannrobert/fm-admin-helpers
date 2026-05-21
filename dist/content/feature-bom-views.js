(function () {
  window.FM = window.FM || {};

  const PANEL_MARKER = 'data-fm-bom-panel';
  const VIEW_MARKER  = 'data-fm-bom-view';
  const ROW_MARKER   = 'data-fm-bom-row';

  function isBomAdminPage() {
    const hash = String(location.hash || '').replace(/^#/, '');
    const params = {};
    hash.split('&').forEach(pair => {
      const i = pair.indexOf('=');
      if (i < 0) return;
      try {
        params[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
      } catch (_) {}
    });
    return params.section === 'setuphome' &&
           params.tab    === 'workspaces' &&
           params.item   === 'bom';
  }

  // ─── Field row ───────────────────────────────────────────────────────────────

  function transformFieldRow(fp) {
    if (fp.getAttribute(ROW_MARKER)) return;
    fp.setAttribute(ROW_MARKER, '1');

    // Pull the 4 functional elements out of their nested wrappers.
    // Dojo stores JS references to these DOM nodes — moving them preserves all
    // event listeners and attach-point references.
    const sourceDiv    = fp.querySelector('.fieldSourceInput');
    const displayInput = fp.querySelector('.fieldDisplayRow input[type="text"]');
    const changeBtn    = fp.querySelector('.changeSource');
    const deleteBtn    = fp.querySelector('.deleteField');

    if (!sourceDiv || !displayInput || !changeBtn || !deleteBtn) return;

    const handle = document.createElement('span');
    handle.className = 'fm-bom-drag-handle';
    handle.title = 'Drag to reorder';
    handle.textContent = '⠿';

    const row = document.createElement('div');
    row.className = 'fm-bom-row';
    row.appendChild(handle);
    row.appendChild(sourceDiv);
    row.appendChild(changeBtn);
    row.appendChild(displayInput);
    row.appendChild(deleteBtn);

    // Insert flat row at top of fieldPanel; hide the now-empty nested wrapper.
    fp.insertBefore(row, fp.firstChild);
    const wrapper = fp.querySelector('.fieldWrapper');
    if (wrapper) wrapper.hidden = true;
  }

  // ─── Drag-and-drop ───────────────────────────────────────────────────────────

  function setupDragDrop(pane) {
    if (pane.dataset.fmBomDnd) return;
    pane.dataset.fmBomDnd = '1';

    let dragged = null;

    pane.addEventListener('dragstart', e => {
      if (!e.target.closest('.fm-bom-drag-handle')) return; // only from handle
      const fp = e.target.closest('.fieldPanel');
      if (!fp) return;
      dragged = fp;
      fp.classList.add('fm-bom-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
      // Use the handle as drag ghost — compact, not full panel width
      const handle = fp.querySelector('.fm-bom-drag-handle');
      if (handle) e.dataTransfer.setDragImage(handle, 10, 10);
    });

    pane.addEventListener('dragend', () => {
      if (dragged) dragged.classList.remove('fm-bom-dragging');
      pane.querySelectorAll('.fm-bom-drop-above,.fm-bom-drop-below').forEach(el =>
        el.classList.remove('fm-bom-drop-above', 'fm-bom-drop-below'));
      dragged = null;
    });

    pane.addEventListener('dragover', e => {
      e.preventDefault();
      const fp = e.target.closest('.fieldPanel');
      if (!fp || fp === dragged) return;
      pane.querySelectorAll('.fm-bom-drop-above,.fm-bom-drop-below').forEach(el =>
        el.classList.remove('fm-bom-drop-above', 'fm-bom-drop-below'));
      const rect = fp.getBoundingClientRect();
      fp.classList.add(e.clientY < rect.top + rect.height / 2
        ? 'fm-bom-drop-above' : 'fm-bom-drop-below');
      e.dataTransfer.dropEffect = 'move';
    });

    pane.addEventListener('dragleave', e => {
      // Only clear indicator when leaving to an element outside any fieldPanel.
      // Without this, moving between children of the same row clears the indicator.
      if (!e.relatedTarget || !e.relatedTarget.closest('.fieldPanel')) {
        pane.querySelectorAll('.fm-bom-drop-above,.fm-bom-drop-below').forEach(el =>
          el.classList.remove('fm-bom-drop-above', 'fm-bom-drop-below'));
      }
    });

    pane.addEventListener('drop', e => {
      e.preventDefault();
      const target = e.target.closest('.fieldPanel');
      if (!target || target === dragged || !dragged) return;
      const rect = target.getBoundingClientRect();
      pane.insertBefore(dragged, e.clientY < rect.top + rect.height / 2
        ? target : target.nextSibling);
      target.classList.remove('fm-bom-drop-above', 'fm-bom-drop-below');
    });
  }

  // ─── View panel ──────────────────────────────────────────────────────────────

  function transformViewPanel(vp) {
    if (vp.getAttribute(VIEW_MARKER)) return;
    vp.setAttribute(VIEW_MARKER, '1');

    const viewHeader       = vp.querySelector('.viewHeader');
    const viewFieldsScroll = vp.querySelector('.viewFieldsScroll');
    const viewFieldsPane   = vp.querySelector('.viewFieldsPane');
    const addBtn           = vp.querySelector('.fieldPanelAdd .addField');

    if (!viewFieldsPane || !viewFieldsScroll) return;

    // Clear Dojo inline sizing on ALL intermediate containers
    const viewBody   = vp.querySelector('.viewBody');
    const viewFields = vp.querySelector('.viewFields');
    vp.style.width              = '';
    vp.style.maxWidth           = '';
    viewFieldsPane.style.width   = '';
    viewFieldsScroll.style.width  = '';
    viewFieldsScroll.style.height = '';
    if (viewBody)   { viewBody.style.width = '';   viewBody.style.height = ''; }
    if (viewFields) { viewFields.style.width = ''; }

    // Move addField button into the toolbar, after the Default label
    if (addBtn && viewHeader) {
      addBtn.classList.add('fm-bom-add-field-btn');
      const defaultLabel = viewHeader.querySelector('label.defaultView');
      if (defaultLabel) {
        defaultLabel.after(addBtn);
      } else {
        viewHeader.appendChild(addBtn);
      }
    }

    // Wrap viewHeader + column-header row in a single per-view sticky div.
    // This guarantees viewHeader always appears above the column headers,
    // avoiding the CSS sticky offset pushing viewHeader below the thead.
    if (!vp.querySelector('.fm-bom-view-sticky') && viewHeader) {
      const vs = document.createElement('div');
      vs.className = 'fm-bom-view-sticky';
      vp.insertBefore(vs, viewHeader);
      vs.appendChild(viewHeader);

      const thead = document.createElement('div');
      thead.className = 'fm-bom-thead';
      thead.innerHTML =
        '<span></span>' +
        '<span>Source Field</span>' +
        '<span></span>' +
        '<span>Display Name</span>' +
        '<span></span>';
      vs.appendChild(thead);
    }

    // Remove any stale thead from viewFieldsPane (from previous approach)
    const oldThead = viewFieldsPane.querySelector('.fm-bom-thead');
    if (oldThead) oldThead.remove();

    // Transform existing rows
    viewFieldsPane.querySelectorAll('.fieldPanel').forEach(fp => transformFieldRow(fp));

    // Watch for fields Dojo adds via the addField button (prepended; move to end)
    const rowObs = new MutationObserver(muts => {
      muts.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1 || !node.classList.contains('fieldPanel')) return;
          if (node.getAttribute(ROW_MARKER)) return; // drag-drop reorder, skip
          transformFieldRow(node);
          setTimeout(() => viewFieldsPane.appendChild(node), 80);
        });
      });
    });
    rowObs.observe(viewFieldsPane, { childList: true });

    setupDragDrop(viewFieldsPane);
  }

  // ─── Tab bar ─────────────────────────────────────────────────────────────────

  function getViewLabel(vp, idx) {
    return (vp.querySelector('.viewNameInput')?.value || '').trim() || ('View ' + (idx + 1));
  }

  function activateTab(bomPanel, idx) {
    const body  = bomPanel.querySelector('.bomViewsBody');
    const views = body ? Array.from(body.querySelectorAll(':scope > .viewPanel')) : [];
    views.forEach((vp, i) => {
      vp.classList.toggle('fm-bom-hidden', i !== idx);
      vp.classList.toggle('fm-bom-active', i === idx);
    });
    const tabBar = bomPanel.querySelector('.fm-bom-tab-bar');
    if (tabBar) {
      tabBar.querySelectorAll('.fm-bom-tab').forEach((t, i) =>
        t.classList.toggle('fm-bom-tab-active', i === idx));
    }
  }

  // ─── Sticky cluster (bomViewsHeader + tab bar in one sticky wrapper) ──────────

  function wrapStickyHeader(panel) {
    if (panel.querySelector('.fm-bom-sticky-header')) return;
    const bomViewsHeader = panel.querySelector('.bomViewsHeader');
    if (!bomViewsHeader) return;
    const sticky = document.createElement('div');
    sticky.className = 'fm-bom-sticky-header';
    panel.insertBefore(sticky, bomViewsHeader);
    sticky.appendChild(bomViewsHeader);
    const tabBar = panel.querySelector('.fm-bom-tab-bar');
    if (tabBar) sticky.appendChild(tabBar);
  }

  function updateStickyOffsets(panel) {
    const sticky = panel.querySelector('.fm-bom-sticky-header');
    const h = sticky ? sticky.offsetHeight : 0;
    panel.style.setProperty('--fm-bom-sticky-h', h + 'px');
  }

  function rebuildTabBar(bomPanel) {
    const body = bomPanel.querySelector('.bomViewsBody');
    if (!body) return;
    const views = Array.from(body.querySelectorAll(':scope > .viewPanel'));

    // Tab bar lives inside the sticky cluster; create or find it there
    let sticky = bomPanel.querySelector('.fm-bom-sticky-header');
    let tabBar = bomPanel.querySelector('.fm-bom-tab-bar');
    if (!tabBar) {
      tabBar = document.createElement('div');
      tabBar.className = 'fm-bom-tab-bar';
      if (sticky) {
        sticky.appendChild(tabBar);
      } else {
        bomPanel.insertBefore(tabBar, body);
      }
    }

    const existingTabs = tabBar.querySelectorAll('.fm-bom-tab');

    if (existingTabs.length === views.length) {
      existingTabs.forEach((t, i) => {
        const lbl = t.querySelector('.fm-bom-tab-label');
        if (lbl) lbl.textContent = getViewLabel(views[i], i);
      });
      return;
    }

    const prevActive = Array.from(existingTabs).findIndex(t => t.classList.contains('fm-bom-tab-active'));
    const newActive  = prevActive >= 0 && prevActive < views.length
      ? prevActive : Math.max(0, views.length - 1);

    tabBar.innerHTML = '';
    views.forEach((vp, i) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'fm-bom-tab' + (i === newActive ? ' fm-bom-tab-active' : '');

      const lbl = document.createElement('span');
      lbl.className = 'fm-bom-tab-label';
      lbl.textContent = getViewLabel(vp, i);
      tab.appendChild(lbl);
      tab.addEventListener('click', () => activateTab(bomPanel, i));
      tabBar.appendChild(tab);

      const nameInput = vp.querySelector('.viewNameInput');
      if (nameInput && !nameInput.dataset.fmBomTabSync) {
        nameInput.dataset.fmBomTabSync = '1';
        nameInput.addEventListener('input', () => {
          lbl.textContent = nameInput.value.trim() || ('View ' + (i + 1));
        });
      }
    });

    activateTab(bomPanel, newActive);
  }

  // ─── Panel ───────────────────────────────────────────────────────────────────

  function transformBomPanel(panel) {
    if (panel.getAttribute(PANEL_MARKER)) {
      rebuildTabBar(panel);
      return;
    }
    panel.setAttribute(PANEL_MARKER, '1');

    panel.style.width    = '';
    panel.style.maxWidth = '';
    panel.style.display  = '';
    panel.classList.add('fm-bom-transformed');

    const body = panel.querySelector('.bomViewsBody');
    if (!body) return;

    body.style.width     = '';
    body.style.height    = '';
    body.style.minHeight = '';
    body.style.maxHeight = '';

    body.querySelectorAll(':scope > .viewPanel').forEach(vp => transformViewPanel(vp));
    rebuildTabBar(panel);
    wrapStickyHeader(panel);
    requestAnimationFrame(() => updateStickyOffsets(panel));

    const viewObs = new MutationObserver(() => {
      const fresh = body.querySelectorAll(`:scope > .viewPanel:not([${VIEW_MARKER}])`);
      fresh.forEach(vp => transformViewPanel(vp));
      if (fresh.length > 0) {
        rebuildTabBar(panel);
        activateTab(panel, body.querySelectorAll(':scope > .viewPanel').length - 1);
      }
    });
    viewObs.observe(body, { childList: true });
  }

  // ─── Tick ────────────────────────────────────────────────────────────────────

  function runBomViewsTick() {
    if (!isBomAdminPage()) return;
    document.querySelectorAll('.bomViewsPanel').forEach(p => transformBomPanel(p));
    document.querySelectorAll(`.bomViewsPanel[${PANEL_MARKER}]`).forEach(p => updateStickyOffsets(p));
  }

  FM.runBomViewsTick = runBomViewsTick;
})();
