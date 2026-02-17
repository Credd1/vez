// vault.js — vault panel with file tree + inline viewer

const vaultToggle = document.getElementById('vaultToggle');
const vaultPanel = document.getElementById('vaultPanel');
const vaultPanelClose = document.getElementById('vaultPanelClose');
const vaultTree = document.getElementById('vaultTree');
const vaultSearch = document.getElementById('vaultSearch');
const vaultRefreshBtn = document.getElementById('vaultRefreshBtn');
const fileViewer = document.getElementById('fileViewer');
const fileViewerTitle = document.getElementById('fileViewerTitle');
const fileViewerBody = document.getElementById('fileViewerBody');
const fileViewerClose = document.getElementById('fileViewerClose');
const fileViewerEditor = document.getElementById('fileViewerEditor');

let vaultOpen = false;
let vaultLoaded = false;
let activeVaultItem = null;
let currentFilePath = null;
let currentFileContent = null;
let currentFileName = null;
let isEditing = false;
let autosaveTimer = null;

vaultToggle.addEventListener('click', async () => {
  vaultOpen = !vaultOpen;
  vaultToggle.classList.toggle('active', vaultOpen);
  if (vaultOpen) {
    vaultPanel.classList.remove('hidden');
    if (!vaultLoaded) {
      await loadVaultDir(vaultTree, null, 0);
      vaultLoaded = true;
    }
  } else {
    vaultPanel.classList.add('hidden');
    closeFileViewer();
  }
  setTimeout(() => fitAll(), 50);
});

vaultPanelClose.addEventListener('click', () => {
  vaultOpen = false;
  vaultToggle.classList.remove('active');
  vaultPanel.classList.add('hidden');
  closeFileViewer();
  setTimeout(() => fitAll(), 50);
});

fileViewerClose.addEventListener('click', () => {
  closeFileViewer();
});

// Tree toggle when file is open
const vaultTreeToggle = document.getElementById('vaultTreeToggle');
vaultTreeToggle.addEventListener('click', () => {
  vaultTreeToggle.classList.toggle('expanded');
});

// Refresh button reloads the tree
vaultRefreshBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (activeVaultItem) {
    activeVaultItem = null;
  }
  vaultTree.innerHTML = '';
  await loadVaultDir(vaultTree, null, 0);
});

// Search/filter
vaultSearch.addEventListener('keyup', () => {
  const query = vaultSearch.value.trim().toLowerCase();
  filterVaultTree(vaultTree, query);
});

// Cmd+F focuses search when vault panel is focused/visible
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'f' && vaultOpen) {
    e.preventDefault();
    vaultSearch.focus();
  }
});

function filterVaultTree(container, query) {
  if (!query) {
    // Show everything, collapse to original state
    container.querySelectorAll('.vault-item, .vault-children').forEach(el => {
      el.style.removeProperty('display');
    });
    // Re-hide collapsed children
    container.querySelectorAll('.vault-children').forEach(ch => {
      const prevItem = ch.previousElementSibling;
      if (prevItem && prevItem.classList.contains('is-dir')) {
        const chevron = prevItem.querySelector('.vault-chevron');
        if (!chevron || !chevron.classList.contains('expanded')) {
          ch.style.display = 'none';
        }
      }
    });
    return;
  }

  // For each item, check if name matches
  const items = container.querySelectorAll('.vault-item');
  items.forEach(item => {
    const nameEl = item.querySelector('.vault-name');
    const name = nameEl ? nameEl.textContent.toLowerCase() : '';
    const matches = name.includes(query);
    if (item.classList.contains('is-dir')) {
      // Dirs: show if they have matching descendants or match themselves
      const childContainer = item.nextElementSibling;
      if (childContainer && childContainer.classList.contains('vault-children')) {
        const hasMatchingChild = Array.from(childContainer.querySelectorAll('.vault-name'))
          .some(n => n.textContent.toLowerCase().includes(query));
        if (matches || hasMatchingChild) {
          item.style.display = '';
          childContainer.style.display = 'block';
          // Expand chevron visually
          const chevron = item.querySelector('.vault-chevron');
          if (chevron) chevron.classList.add('expanded');
        } else {
          item.style.display = 'none';
          childContainer.style.display = 'none';
        }
      }
    } else {
      item.style.display = matches ? '' : 'none';
    }
  });
}

function isDirty() {
  return isEditing && fileViewerEditor.value !== currentFileContent;
}

function confirmUnsaved() {
  if (!isDirty()) return true;
  return confirm('You have unsaved changes. Discard them?');
}

function exitEditMode() {
  isEditing = false;
  fileViewerBody.classList.remove('hidden');
  fileViewerEditor.classList.add('hidden');
  fileViewer.querySelector('.file-viewer-header').classList.remove('editing');
}

function enterEditMode() {
  if (!currentFilePath) return;
  isEditing = true;
  fileViewerEditor.value = currentFileContent;
  fileViewerBody.classList.add('hidden');
  fileViewerEditor.classList.remove('hidden');
  fileViewer.querySelector('.file-viewer-header').classList.add('editing');
  fileViewerEditor.focus();
}

async function saveFile() {
  if (!currentFilePath || !isDirty()) return;
  const content = fileViewerEditor.value;
  const result = await window.pty.vaultWrite(currentFilePath, content);
  if (result.success) {
    currentFileContent = content;
  } else {
    console.error('Failed to save:', result.error);
  }
}

async function saveAndExitEdit() {
  clearTimeout(autosaveTimer);
  if (isDirty()) await saveFile();
  exitEditMode();
  openFileInViewer(currentFilePath, currentFileName);
}

// Autosave: debounce 800ms after each keystroke
fileViewerEditor.addEventListener('input', () => {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => saveFile(), 800);
});

// Save on blur (clicking away from textarea)
fileViewerEditor.addEventListener('blur', () => {
  clearTimeout(autosaveTimer);
  if (isDirty()) saveFile();
});

// Click rendered content to enter edit mode
fileViewerBody.addEventListener('click', () => {
  if (!isEditing && currentFilePath) enterEditMode();
});

function closeFileViewer() {
  clearTimeout(autosaveTimer);
  if (isEditing && isDirty()) saveFile();
  if (isEditing) exitEditMode();
  currentFilePath = null;
  currentFileContent = null;
  currentFileName = null;
  fileViewer.classList.add('hidden');
  fileViewerBody.textContent = '';
  fileViewerTitle.innerHTML = '';
  const emptyState = document.getElementById('vaultEmptyState');
  if (emptyState) emptyState.classList.remove('hidden');
}

async function openFileInViewer(filePath, fileName) {
  // Autosave when switching files
  if (isEditing && currentFilePath !== filePath) {
    clearTimeout(autosaveTimer);
    if (isDirty()) await saveFile();
    exitEditMode();
  }

  const content = await window.pty.vaultRead(filePath);
  if (content === null) return;

  currentFilePath = filePath;
  currentFileContent = content;
  currentFileName = fileName;

  const emptyState = document.getElementById('vaultEmptyState');
  if (emptyState) emptyState.classList.add('hidden');

  // Build header: relative path, extension badge, char count
  const ext = fileName.split('.').pop().toLowerCase();
  let relPath = fileName;
  try {
    const vaultRoot = await window.pty.vaultRoot?.();
    if (vaultRoot && filePath.startsWith(vaultRoot)) {
      relPath = filePath.slice(vaultRoot.length).replace(/^[/\\]/, '');
    }
  } catch (_) { /* vaultRoot may not exist */ }
  fileViewerTitle.innerHTML =
    `<span class="fv-path">${escHtml(relPath)}</span>` +
    `<span class="fv-ext-badge">.${escHtml(ext)}</span>` +
    `<span class="fv-charcount">${content.length.toLocaleString()} chars</span>`;

  fileViewerBody.innerHTML = '';

  if (ext === 'md') {
    fileViewerBody.innerHTML = renderMarkdown(content);
  } else {
    // Code file with line numbers
    const lines = content.split('\n');
    const pre = document.createElement('pre');
    pre.className = 'code-file-numbered';
    pre.innerHTML = lines.map((l, i) =>
      `<span class="code-line"><span class="code-line-num">${i + 1}</span><span class="code-line-content">${escHtml(l)}</span></span>`
    ).join('\n');
    fileViewerBody.appendChild(pre);
  }

  fileViewer.classList.remove('hidden');
}

// Markdown renderer — two-pass: extract fenced code blocks first, then process lines
function renderMarkdown(md) {
  // Detect and strip YAML frontmatter
  let frontmatter = '';
  let body = md;
  if (body.startsWith('---\n')) {
    const endIdx = body.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const fmContent = body.slice(4, endIdx);
      frontmatter = `<div class="md-frontmatter"><pre>${escHtml(fmContent)}</pre></div>`;
      body = body.slice(endIdx + 4);
    }
  }

  // First pass: extract fenced code blocks
  const codeBlocks = [];
  const placeholder = '\x00CODEBLOCK_';
  body = body.replace(/^```(\w*)\n([\s\S]*?)^```$/gm, (_match, lang, code) => {
    const idx = codeBlocks.length;
    const langAttr = lang ? ` data-lang="${escHtml(lang)}"` : '';
    codeBlocks.push(`<pre class="code-block"${langAttr}><code>${escHtml(code.replace(/\n$/, ''))}</code></pre>`);
    return `${placeholder}${idx}\x00`;
  });

  // Second pass: process remaining lines
  const lines = body.split('\n');
  const output = [];
  let listType = null; // 'ul' | 'ol' | null
  let inTable = false;
  let tableRows = [];

  function flushTable() {
    if (!tableRows.length) return;
    let html = '<table class="md-table"><thead><tr>';
    const headers = tableRows[0];
    headers.forEach(h => { html += `<th>${inlineFormat(h.trim())}</th>`; });
    html += '</tr></thead><tbody>';
    for (let i = 1; i < tableRows.length; i++) {
      html += '<tr>';
      tableRows[i].forEach(c => { html += `<td>${inlineFormat(c.trim())}</td>`; });
      html += '</tr>';
    }
    html += '</tbody></table>';
    output.push(html);
    tableRows = [];
    inTable = false;
  }

  function closeList() {
    if (listType) { output.push(`</${listType}>`); listType = null; }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block placeholder
    if (line.startsWith(placeholder)) {
      closeList(); flushTable();
      const idx = parseInt(line.slice(placeholder.length), 10);
      output.push(codeBlocks[idx]);
      continue;
    }

    // Table detection: lines with | delimiters
    if (/^\|(.+)\|$/.test(line.trim())) {
      closeList();
      const cells = line.trim().slice(1, -1).split('|');
      // Skip separator rows like |---|---|
      if (/^[\s|:-]+$/.test(line.trim().slice(1, -1))) {
        inTable = true;
        continue;
      }
      tableRows.push(cells);
      inTable = true;
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      output.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      closeList();
      output.push('<hr>');
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      closeList();
      output.push(`<blockquote>${inlineFormat(line.slice(2))}</blockquote>`);
      continue;
    }

    // Task list items
    if (/^[-*]\s\[[ x]\]\s/.test(line)) {
      if (listType !== 'ul') {
        closeList();
        output.push('<ul class="md-tasklist">');
        listType = 'ul';
      }
      const checked = line.charAt(3) === 'x';
      const text = line.slice(6);
      output.push(`<li class="md-task-item"><input type="checkbox" disabled${checked ? ' checked' : ''}> ${inlineFormat(text)}</li>`);
      continue;
    }

    // Unordered list items
    if (/^[-*]\s/.test(line)) {
      if (listType !== 'ul') {
        closeList();
        output.push('<ul>');
        listType = 'ul';
      }
      output.push(`<li>${inlineFormat(line.slice(2))}</li>`);
      continue;
    }

    // Ordered list items
    if (/^\d+\.\s/.test(line)) {
      if (listType !== 'ol') {
        closeList();
        output.push('<ol>');
        listType = 'ol';
      }
      output.push(`<li>${inlineFormat(line.replace(/^\d+\.\s/, ''))}</li>`);
      continue;
    }

    // Close open list if not a list item
    closeList();

    // Empty lines
    if (line.trim() === '') {
      output.push('');
      continue;
    }

    // Regular paragraph
    output.push(`<p>${inlineFormat(line)}</p>`);
  }

  closeList();
  flushTable();

  return frontmatter + output.join('\n');
}

function inlineFormat(text) {
  let s = escHtml(text);
  // Code (must come first to avoid processing inside code spans)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Strikethrough
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Links (sanitize href — only allow http/https/#)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    if (/^(https?:|#)/i.test(url)) return `<a href="${url}">${text}</a>`;
    return text;
  });
  // Wikilinks with display text [[link|display]]
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<a class="wikilink" href="#" data-target="$1">$2</a>');
  // Wikilinks [[link]]
  s = s.replace(/\[\[([^\]]+)\]\]/g, '<a class="wikilink" href="#" data-target="$1">$1</a>');
  // Tags #tagname (not inside HTML attributes, not hex colors)
  s = s.replace(/(?<![&\w/])#([a-zA-Z][\w-/]*)/g, '<span class="md-tag">#$1</span>');
  return s;
}

// SVG paths for folder icons
const FOLDER_CLOSED_PATH = 'M2 3.5C2 2.67 2.67 2 3.5 2H6L7.5 3.5H10.5C11.33 3.5 12 4.17 12 5V10.5C12 11.33 11.33 12 10.5 12H3.5C2.67 12 2 11.33 2 10.5V3.5Z';
const FOLDER_OPEN_PATH = 'M2 3.5C2 2.67 2.67 2 3.5 2H6L7.5 3.5H10.5C11.33 3.5 12 4.17 12 5V6H3L1 11V3.5C1 2.67 1.67 2 2 2Z M3 6H12.5L11 11.5H1.5L3 6Z';

async function loadVaultDir(container, dirPath, depth) {
  // Show loading state
  const loadingEl = document.createElement('div');
  loadingEl.className = 'vault-loading';
  loadingEl.style.paddingLeft = `${14 + depth * 20}px`;
  loadingEl.textContent = 'Loading\u2026';
  container.appendChild(loadingEl);

  const entries = await window.pty.vaultTree(dirPath);
  container.innerHTML = '';

  if (entries.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'vault-empty';
    emptyEl.style.paddingLeft = `${14 + depth * 20}px`;
    emptyEl.textContent = 'Empty folder';
    container.appendChild(emptyEl);
    return;
  }

  for (const entry of entries) {
    const el = document.createElement('div');
    el.className = 'vault-item';
    el.style.paddingLeft = `${14 + depth * 20}px`;

    if (entry.isDir) {
      el.classList.add('is-dir');
      el.innerHTML = `
        <svg class="vault-chevron" width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="3,2 7,5 3,8"/></svg>
        <svg class="vault-icon vault-folder-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="${FOLDER_CLOSED_PATH}"/></svg>
        <span class="vault-name" title="${escAttr(entry.name)}">${escHtml(entry.name)}</span>`;

      let expanded = false;
      const childContainer = document.createElement('div');
      childContainer.className = 'vault-children';
      childContainer.style.setProperty('--depth', depth + 1);
      childContainer.style.display = 'none';

      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        expanded = !expanded;
        el.querySelector('.vault-chevron').classList.toggle('expanded', expanded);

        // Swap folder icon
        const folderIcon = el.querySelector('.vault-folder-icon path');
        folderIcon.setAttribute('d', expanded ? FOLDER_OPEN_PATH : FOLDER_CLOSED_PATH);

        if (expanded) {
          childContainer.style.display = 'block';
          if (!childContainer.hasChildNodes()) {
            await loadVaultDir(childContainer, entry.path, depth + 1);
            // Add file count badge
            const count = childContainer.querySelectorAll(':scope > .vault-item').length;
            let badge = el.querySelector('.vault-badge');
            if (!badge) {
              badge = document.createElement('span');
              badge.className = 'vault-badge';
              el.appendChild(badge);
            }
            badge.textContent = count;
          }
        } else {
          childContainer.style.display = 'none';
        }
      });

      container.appendChild(el);
      container.appendChild(childContainer);
    } else {
      const ext = entry.name.split('.').pop().toLowerCase();
      el.setAttribute('data-ext', ext);
      const icon = getFileIcon(ext);
      el.innerHTML = `
        <span class="vault-spacer"></span>
        <svg class="vault-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
        <span class="vault-name" title="${escAttr(entry.name)}">${escHtml(entry.name)}</span>`;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        // Active file highlighting
        if (activeVaultItem) {
          activeVaultItem.classList.remove('active');
        }
        el.classList.add('active');
        activeVaultItem = el;
        openFileInViewer(entry.path, entry.name);
      });

      container.appendChild(el);
    }
  }
}

function getFileIcon(ext) {
  if (ext === 'md') return '<path d="M2 2h10v10H2z"/><line x1="5" y1="5" x2="9" y2="5"/><line x1="5" y1="7" x2="9" y2="7"/><line x1="5" y1="9" x2="7" y2="9"/>';
  if (ext === 'json') return '<path d="M3 2h6l3 3v7H3z"/><polyline points="9,2 9,5 12,5"/>';
  return '<path d="M3 2h6l3 3v7H3z"/><polyline points="9,2 9,5 12,5"/>';
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Alt+V to toggle vault panel
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'v') {
    e.preventDefault();
    vaultToggle.click();
  }
});

// Cmd+S to save, Escape to discard and return to view
document.addEventListener('keydown', (e) => {
  if (!vaultOpen || fileViewer.classList.contains('hidden')) return;

  if ((e.metaKey || e.ctrlKey) && e.key === 's' && isEditing) {
    e.preventDefault();
    saveFile();
  }

  if (e.key === 'Escape' && isEditing) {
    e.preventDefault();
    saveAndExitEdit();
  }
});
