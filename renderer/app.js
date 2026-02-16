// app.js — session & pane state management

const sessions = [];
let activeSessionId = null;
let focusedPaneIndex = 0;
let nextSessionId = 1;

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
    if (!container) continue;

    // Spawn PTY if it doesn't exist yet
    await window.pty.spawn(pane.id, { cwd: pane.cwd });

    // Create xterm instance attached to the PTY
    createTerminal(pane.id, container);
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
    grid.innerHTML = '<div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-family:JetBrains Mono,monospace;font-size:13px;">Click "+ New Session" to get started</div>';
    return;
  }

  grid.innerHTML = session.panes
    .map(
      (p, i) => `
    <div class="pane ${i === focusedPaneIndex ? 'focused' : ''}" data-pane-index="${i}">
      <div class="pane-header">
        <div class="pane-dot" style="background:var(--green)"></div>
        <div class="pane-title">${p.cwd}</div>
        <div class="pane-badge">${i + 1}/4</div>
      </div>
      <div class="pane-body" id="pane-container-${i}"></div>
    </div>`
    )
    .join('');

  // Click to focus pane
  grid.querySelectorAll('.pane').forEach((el) => {
    el.addEventListener('click', () => {
      focusPane(parseInt(el.dataset.paneIndex));
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
    text.textContent = '0 active';
    return;
  }

  label.textContent = `${session.name} — ${session.panes.length} panes`;
  dot.style.background = 'var(--green)';
  dot.style.boxShadow = '0 0 4px var(--green)';
  text.textContent = `${session.panes.length} active`;
}

// ── Keyboard shortcuts ──

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;

  // Alt+1-4 focus panes
  if (e.altKey && e.key >= '1' && e.key <= '4') {
    e.preventDefault();
    focusPane(parseInt(e.key) - 1);
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
});

// ── Init ──

document.getElementById('newSessionBtn').addEventListener('click', addSession);

// Fit all terminals on window resize
window.addEventListener('resize', () => fitAll());

// Auto-create first session
addSession();
