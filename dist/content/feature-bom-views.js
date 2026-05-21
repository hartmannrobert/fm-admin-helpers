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

    let dragged = null, ghost = null, placeholder = null, offsetY = 0;

    function getRows() { return Array.from(pane.querySelectorAll('.fieldPanel')); }

    function movePlaceholder(clientY) {
      const rows = getRows().filter(r => r !== dragged);
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          pane.insertBefore(placeholder, row);
          return;
        }
      }
      pane.appendChild(placeholder);
    }

    function endDrag() {
      if (ghost) { ghost.remove(); ghost = null; }
      if (placeholder) { placeholder.remove(); placeholder = null; }
      if (dragged) { dragged.classList.remove('fm-bom-dragging'); dragged = null; }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    function onMove(e) {
      if (!dragged) return;
      ghost.style.top = (e.clientY - offsetY) + 'px';
      movePlaceholder(e.clientY);
    }

    function onUp() {
      if (placeholder && placeholder.parentNode === pane && dragged) {
        pane.insertBefore(dragged, placeholder);
      }
      endDrag();
    }

    pane.addEventListener('mousedown', e => {
      if (e.target.closest('.changeSource, .deleteField, input')) return;
      const fp = e.target.closest('.fieldPanel');
      if (!fp) return;
      e.preventDefault();

      dragged = fp;
      fp.classList.add('fm-bom-dragging');

      const rect = fp.getBoundingClientRect();
      offsetY = e.clientY - rect.top;

      placeholder = document.createElement('div');
      placeholder.className = 'fm-bom-row-placeholder';
      pane.insertBefore(placeholder, fp.nextSibling);

      ghost = document.createElement('div');
      ghost.className = 'fm-bom-drag-ghost';
      ghost.textContent = fp.querySelector('.fieldSourceInput')?.textContent?.trim() || '…';
      ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;pointer-events:none;z-index:9999`;
      document.body.appendChild(ghost);

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
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
    viewFieldsPane.style.width  = '';
    viewFieldsScroll.style.width = '';
    if (viewBody)   { viewBody.style.width = ''; }
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
          setTimeout(() => {
            viewFieldsPane.appendChild(node);
            viewFieldsScroll.scrollTop = viewFieldsScroll.scrollHeight;
          }, 80);
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

  function rebuildTabBar(bomPanel) {
    const body = bomPanel.querySelector('.bomViewsBody');
    if (!body) return;
    const views = Array.from(body.querySelectorAll(':scope > .viewPanel'));

    // Tab bar sits between bomViewsHeader and bomViewsBody — outside the scroll area
    let tabBar = bomPanel.querySelector('.fm-bom-tab-bar');
    if (!tabBar) {
      tabBar = document.createElement('div');
      tabBar.className = 'fm-bom-tab-bar';
      bomPanel.insertBefore(tabBar, body);
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
    const newActive  = prevActive >= 0 && prevActive < views.length ? prevActive : 0;

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
    body.style.position  = '';
    body.style.top       = '';
    body.style.left      = '';

    body.querySelectorAll(':scope > .viewPanel').forEach(vp => transformViewPanel(vp));
    rebuildTabBar(panel);

    const viewObs = new MutationObserver(() => {
      const fresh = body.querySelectorAll(`:scope > .viewPanel:not([${VIEW_MARKER}])`);
      fresh.forEach(vp => transformViewPanel(vp));
      if (fresh.length > 0) {
        rebuildTabBar(panel);
      }
    });
    viewObs.observe(body, { childList: true });
  }

  // ─── Tick ────────────────────────────────────────────────────────────────────

  function syncScrollHeights(panel) {
    const bomBody  = panel.querySelector('.bomViewsBody');
    const header   = panel.querySelector('.bomViewsHeader');
    const tabBar   = panel.querySelector('.fm-bom-tab-bar');
    if (!bomBody) return;

    const bodyH = panel.clientHeight
      - (header  ? header.offsetHeight  : 0)
      - (tabBar  ? tabBar.offsetHeight  : 0);
    if (bodyH > 50 && bomBody.style.height !== bodyH + 'px')
      bomBody.style.height = bodyH + 'px';

    const bodyBottom = bomBody.getBoundingClientRect().bottom;
    panel.querySelectorAll('.viewPanel.fm-bom-active').forEach(vp => {
      const sticky = vp.querySelector('.fm-bom-view-sticky');
      const scroll = vp.querySelector('.viewFieldsScroll');
      if (!scroll) return;
      const top = sticky
        ? sticky.getBoundingClientRect().bottom
        : vp.getBoundingClientRect().top;
      const h = Math.max(50, Math.floor(bodyBottom - top));
      if (scroll.style.height !== h + 'px') scroll.style.height = h + 'px';
    });
  }

  function runBomViewsTick() {
    if (!isBomAdminPage()) return;
    document.querySelectorAll('.bomViewsPanel').forEach(p => transformBomPanel(p));
    document.querySelectorAll(`.bomViewsPanel[${PANEL_MARKER}]`).forEach(p => syncScrollHeights(p));
    const ufc = document.getElementById('unassignedFieldsContainer');
    if (ufc) ufc.style.height = 'calc(100% - 30px)';
  }

  FM.runBomViewsTick = runBomViewsTick;
})();
