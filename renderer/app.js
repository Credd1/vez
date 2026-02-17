// app.js — session & pane state management

function escHtmlApp(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const sessions = [];
let activeSessionId = null;
let focusedPaneIndex = 0;
let nextSessionId = 1;
const recentFolders = [];

function generateId() {
  return `session-${nextSessionId++}`;
}

function generatePaneIds(sessionId) {
  return [0, 1, 2, 3].map((i) => `${sessionId}:pane-${i}`);
}

// ── Session CRUD ──

function addSession() {
  const id = generateId();
  const paneIds = generatePaneIds(id);
  const session = {
    id,
    name: `session ${nextSessionId - 1}`,
    status: 'live',
    panes: paneIds.map((paneId) => ({
      id: paneId,
      ptyId: paneId,
      cwd: '~',
    })),
  };
  sessions.push(session);
  selectSession(id);
  return session;
}

function removeSession(id) {
  const session = sessions.find((s) => s.id === id);
  if (!session) return;

  // Kill all PTYs for this session
  session.panes.forEach((p) => {
    destroyTerminal(p.id);
    window.pty.kill(p.id);
  });

  const idx = sessions.indexOf(session);
  sessions.splice(idx, 1);

  if (activeSessionId === id) {
    activeSessionId = sessions.length ? sessions[0].id : null;
  }

  render();

  if (activeSessionId) {
    attachSession(activeSessionId);
  }
}

function renameSession(id, newName) {
  const session = sessions.find((s) => s.id === id);
  if (session) session.name = newName;
  render();
}

// ── Session switching ──

function selectSession(id) {
  if (activeSessionId === id) return;
  // Detach current terminals (but keep PTYs alive)
  detachCurrentTerminals();

  activeSessionId = id;
  focusedPaneIndex = 0;
  render();
  attachSession(id);
}

function detachCurrentTerminals() {
  const session = sessions.find((s) => s.id === activeSessionId);
  if (!session) return;
  session.panes.forEach((p) => destroyTerminal(p.id));
}

async function attachSession(id) {
  const session = sessions.find((s) => s.id === id);
  if (!session) return;

  const paneEls = document.querySelectorAll('.pane-body');

  for (let i = 0; i < session.panes.length; i++) {
    const pane = session.panes[i];
    const container = paneEls[i];
    console.log('[attach]', i, pane.id, 'container:', !!container);
    if (!container) continue;

    // Spawn PTY if it doesn't exist yet
    await window.pty.spawn(pane.id, {});
    console.log('[attach] spawned', pane.id);

    // Create xterm instance attached to the PTY
    createTerminal(pane.id, container);
    console.log('[attach] terminal created', pane.id);
  }

  // Focus the first pane
  focusPane(focusedPaneIndex);
}

// ── Pane focus ──

function focusPane(index) {
  focusedPaneIndex = index;

  document.querySelectorAll('.pane').forEach((el, i) => {
    el.classList.toggle('focused', i === index);
  });

  const session = sessions.find((s) => s.id === activeSessionId);
  if (session && session.panes[index]) {
    focusTerminal(session.panes[index].id);
  }
}

// ── Rendering ──

function render() {
  renderSidebar();
  renderGrid();
  updateTopbar();
}

function renderSidebar() {
  renderSessions(sessions, activeSessionId, {
    onSelect: selectSession,
    onRemove: removeSession,
    onRename: renameSession,
  });
}

function renderGrid() {
  const grid = document.getElementById('grid');
  const session = sessions.find((s) => s.id === activeSessionId);

  if (!session) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--text-muted);font-family:JetBrains Mono,monospace;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        <span style="font-size:13px;opacity:0.7;">No active session</span>
        <span style="font-size:11px;opacity:0.4;">Press <kbd style="padding:1px 5px;border:1px solid rgba(255,255,255,0.15);border-radius:3px;font-size:10px;">&#x2325;N</kbd> or click <strong>+ New Session</strong></span>
      </div>`;
    return;
  }

  grid.innerHTML = session.panes
    .map(
      (p, i) => {
        const quickFolders = recentFolders.slice(0, 3).map((f) => {
          const name = escHtmlApp(f.split('/').pop() || f);
          return `<button class="pane-quick-folder" data-pane-index="${i}" data-folder="${escHtmlApp(f)}" title="${escHtmlApp(f)}">${name}</button>`;
        }).join('');
        return `
    <div class="pane ${i === focusedPaneIndex ? 'focused' : ''}" data-pane-index="${i}">
      <div class="pane-header">
        <div class="pane-dot" style="background:${i === focusedPaneIndex ? 'var(--green)' : 'var(--text-muted)'};${i === focusedPaneIndex ? 'box-shadow:0 0 6px var(--green);' : 'opacity:0.5;'}"></div>
        <div class="pane-title">${escHtmlApp(p.cwd)}</div>
        <div class="pane-quick-folders">${quickFolders}</div>
        <button class="pane-folder-btn" data-pane-index="${i}" title="Select folder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></button>
        <div class="pane-badge">\u2325${i + 1}</div>
      </div>
      <div class="pane-body" id="pane-container-${i}"></div>
    </div>`;
      }
    )
    .join('');

  // Click to focus pane
  grid.querySelectorAll('.pane').forEach((el) => {
    el.addEventListener('click', () => {
      focusPane(parseInt(el.dataset.paneIndex));
    });
  });

  // Folder select buttons
  grid.querySelectorAll('.pane-folder-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.paneIndex);
      showFolderDropdown(btn, session, idx);
    });
  });

  // Quick folder buttons
  grid.querySelectorAll('.pane-quick-folder').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.paneIndex);
      const folder = btn.dataset.folder;
      applyFolder(session, idx, folder);
    });
  });
}

function updateTopbar() {
  const session = sessions.find((s) => s.id === activeSessionId);
  const label = document.getElementById('activeSessionLabel');
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');

  if (!session) {
    label.textContent = 'No session';
    dot.style.background = 'var(--text-muted)';
    dot.style.boxShadow = 'none';
    text.textContent = 'idle';
    return;
  }

  label.textContent = `${session.name} \u2014 ${session.panes.length} panes`;
  dot.style.background = 'var(--green)';
  dot.style.boxShadow = '0 0 6px var(--green)';
  text.textContent = `${session.panes.length} active`;
}

// ── Usage stats ──

function formatNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatResetTime(isoString) {
  if (!isoString) return '';
  const diff = new Date(isoString) - new Date();
  if (diff <= 0) return 'now';
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function usageBarColor(pct) {
  if (pct >= 80) return 'var(--red)';
  if (pct >= 50) return 'var(--amber)';
  return 'var(--green)';
}

function cpuBarColor(pct) {
  if (pct >= 90) return 'var(--red)';
  if (pct >= 60) return 'var(--amber)';
  return 'var(--green)';
}

async function renderUsagePanel() {
  const panel = document.getElementById('usagePanel');

  // Fetch CPU and Claude stats in parallel
  const [stats, cpu] = await Promise.all([
    window.pty.getUsageStats().catch((e) => { console.error('usage stats error:', e); return null; }),
    window.pty.getCpuUsage().catch(() => null),
  ]);

  let html = '';

  // CPU section
  if (cpu) {
    const pct = cpu.percent;
    html += `
      <div class="usage-panel-label">System</div>
      <div class="usage-stats">
        <div class="usage-stat">
          <span class="usage-stat-label">CPU (${cpu.cores} cores)</span>
          <span class="usage-stat-value">${pct}%</span>
        </div>
        <div class="usage-bar-track"><div class="usage-bar-fill" style="width:${pct}%;background:${cpuBarColor(pct)}"></div></div>
      </div>
    `;
  }

  // Claude section
  if (stats) {
    if (stats.source === 'api') {
      const session = stats.five_hour || {};
      const weekly = stats.seven_day || {};
      const sessionPct = Math.round(session.utilization || 0);
      const weeklyPct = Math.round(weekly.utilization || 0);
      const sessionReset = formatResetTime(session.resets_at);
      const weeklyReset = formatResetTime(weekly.resets_at);

      html += `
        <div class="usage-panel-label" ${cpu ? 'style="margin-top:10px"' : ''}>Claude Limits</div>
        <div class="usage-stats">
          <div class="usage-stat">
            <span class="usage-stat-label">Session (5h)</span>
            <span class="usage-stat-value">${sessionPct}%</span>
          </div>
          <div class="usage-bar-track"><div class="usage-bar-fill" style="width:${sessionPct}%;background:${usageBarColor(sessionPct)}"></div></div>
          <div class="usage-stat-sub">resets in ${sessionReset}</div>
          <div class="usage-stat" style="margin-top:6px">
            <span class="usage-stat-label">Weekly (7d)</span>
            <span class="usage-stat-value">${weeklyPct}%</span>
          </div>
          <div class="usage-bar-track"><div class="usage-bar-fill" style="width:${weeklyPct}%;background:${usageBarColor(weeklyPct)}"></div></div>
          <div class="usage-stat-sub">resets in ${weeklyReset}</div>
        </div>
      `;
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const todayActivity = stats.dailyActivity?.find((d) => d.date === today);
      const todayMsgs = todayActivity?.messageCount || 0;
      const todayTools = todayActivity?.toolCallCount || 0;

      html += `
        <div class="usage-panel-label" ${cpu ? 'style="margin-top:10px"' : ''}>Claude Usage</div>
        <div class="usage-stats">
          <div class="usage-stat">
            <span class="usage-stat-label">Today msgs</span>
            <span class="usage-stat-value">${formatNum(todayMsgs)}</span>
          </div>
          <div class="usage-stat">
            <span class="usage-stat-label">Today tools</span>
            <span class="usage-stat-value">${formatNum(todayTools)}</span>
          </div>
          <div class="usage-stat">
            <span class="usage-stat-label">All sessions</span>
            <span class="usage-stat-value">${stats.totalSessions || 0}</span>
          </div>
        </div>
      `;
    }
  }

  panel.innerHTML = html;
}

// Refresh usage panel every 5s (CPU needs frequent updates; Claude stats are cheap to re-fetch)
renderUsagePanel();
setInterval(renderUsagePanel, 5000);


// ── Folder dropdown ──

function addRecentFolder(folder) {
  const idx = recentFolders.indexOf(folder);
  if (idx !== -1) recentFolders.splice(idx, 1);
  recentFolders.unshift(folder);
  if (recentFolders.length > 8) recentFolders.pop();
}

function applyFolder(session, paneIdx, folder) {
  addRecentFolder(folder);
  const pane = session.panes[paneIdx];
  pane.cwd = folder;
  window.pty.write(pane.id, `cd ${JSON.stringify(folder)}\n`);
  // Update pane title in DOM
  const paneEl = document.querySelectorAll('.pane')[paneIdx];
  if (paneEl) {
    paneEl.querySelector('.pane-title').textContent = folder;
  }
}

function showFolderDropdown(anchorEl, session, paneIdx) {
  // Remove any existing dropdown
  closeFolderDropdown();

  const menu = document.createElement('div');
  menu.className = 'folder-dropdown';
  menu.id = 'folderDropdown';

  // Recent folders
  if (recentFolders.length) {
    const label = document.createElement('div');
    label.className = 'folder-dropdown-label';
    label.textContent = 'RECENT';
    menu.appendChild(label);

    recentFolders.forEach((f) => {
      const item = document.createElement('div');
      item.className = 'folder-dropdown-item';
      const name = escHtmlApp(f.split('/').pop() || f);
      item.innerHTML = `<span class="folder-dropdown-name">${name}</span><span class="folder-dropdown-path">${escHtmlApp(f)}</span>`;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        applyFolder(session, paneIdx, f);
        closeFolderDropdown();
      });
      menu.appendChild(item);
    });

    const sep = document.createElement('div');
    sep.className = 'folder-dropdown-sep';
    menu.appendChild(sep);
  }

  // Browse option
  const browse = document.createElement('div');
  browse.className = 'folder-dropdown-item folder-dropdown-browse';
  browse.textContent = 'Browse\u2026';
  browse.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeFolderDropdown();
    const folder = await window.pty.selectFolder();
    if (folder) applyFolder(session, paneIdx, folder);
  });
  menu.appendChild(browse);

  // Position below the anchor
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;

  document.body.appendChild(menu);

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', closeFolderDropdown, { once: true });
  }, 0);
}

function closeFolderDropdown() {
  const existing = document.getElementById('folderDropdown');
  if (existing) existing.remove();
}

// ── Keyboard shortcuts ──

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;

  // Alt+1-4 focus panes
  if (e.altKey && e.key >= '1' && e.key <= '4') {
    e.preventDefault();
    focusPane(parseInt(e.key) - 1);
  }

  // Cmd+Arrow spatial pane navigation (2x2 grid: 0=TL, 1=TR, 2=BL, 3=BR)
  if (e.metaKey && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const col = focusedPaneIndex % 2;
    const row = Math.floor(focusedPaneIndex / 2);
    let nc = col, nr = row;
    if (e.key === 'ArrowLeft')  nc = Math.max(0, col - 1);
    if (e.key === 'ArrowRight') nc = Math.min(1, col + 1);
    if (e.key === 'ArrowUp')    nr = Math.max(0, row - 1);
    if (e.key === 'ArrowDown')  nr = Math.min(1, row + 1);
    const next = nr * 2 + nc;
    if (next !== focusedPaneIndex) focusPane(next);
  }

  // Alt+N new session
  if (e.altKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    addSession();
  }

  // Alt+Up/Down navigate sessions
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const idx = sessions.findIndex((s) => s.id === activeSessionId);
    if (idx < 0) return;
    const next =
      e.key === 'ArrowDown'
        ? Math.min(idx + 1, sessions.length - 1)
        : Math.max(idx - 1, 0);
    selectSession(sessions[next].id);
  }

  // Alt+W close session
  if (e.altKey && (e.key === 'w' || e.key === 'W')) {
    e.preventDefault();
    if (activeSessionId) removeSession(activeSessionId);
  }

  // Cmd+B toggle sidebar
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault();
    toggleSidebar();
  }
});

// ── Sidebar collapse ──
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('collapsed');
  setTimeout(() => fitAll(), 250);
}

document.getElementById('sidebarToggle').addEventListener('click', () => {
  toggleSidebar();
});

// ── Init ──

document.getElementById('newSessionBtn').addEventListener('click', addSession);

// Fit all terminals on window resize
window.addEventListener('resize', () => fitAll());

// Auto-create first session
addSession();
