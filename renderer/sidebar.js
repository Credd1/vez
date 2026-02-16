// sidebar.js — session list UI

function renderSessions(sessions, activeSessionId, callbacks) {
  const list = document.getElementById('sessionList');
  const groups = { live: [], idle: [], dead: [] };
  sessions.forEach((s) => groups[s.status].push(s));

  const labels = { live: 'Active', idle: 'Idle', dead: 'Archived' };
  let html = '';

  for (const [status, items] of Object.entries(groups)) {
    if (!items.length) continue;
    html += `<div class="session-group-label">${labels[status]}</div>`;
    items.forEach((s) => {
      const active = s.id === activeSessionId ? 'active' : '';
      html += `
        <div class="session-item ${active}" data-id="${s.id}">
          <div class="session-dot ${s.status}"></div>
          <div class="session-info">
            <div class="session-name" data-name-id="${s.id}">${esc(s.name)}</div>
            <div class="session-meta">${s.panes.length} panes</div>
          </div>
          <div class="session-actions">
            <button class="rename-btn" data-id="${s.id}" title="Rename">&#9998;</button>
            <button class="close-btn" data-id="${s.id}" title="Close">&times;</button>
          </div>
        </div>`;
    });
  }

  list.innerHTML = html;

  // Event delegation
  list.querySelectorAll('.session-item').forEach((el) => {
    const id = el.dataset.id;
    el.addEventListener('click', () => callbacks.onSelect(id));
    el.addEventListener('dblclick', () => startRename(id, sessions, callbacks));
  });

  list.querySelectorAll('.rename-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(btn.dataset.id, sessions, callbacks);
    });
  });

  list.querySelectorAll('.close-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onRemove(btn.dataset.id);
    });
  });
}

function startRename(id, sessions, callbacks) {
  const el = document.querySelector(`[data-name-id="${id}"]`);
  const session = sessions.find((s) => s.id === id);
  if (!el || !session) return;

  const input = document.createElement('input');
  input.className = 'session-name-input';
  input.value = session.name;
  el.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim() || session.name;
    callbacks.onRename(id, newName);
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') {
      input.value = session.name;
      commit();
    }
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
