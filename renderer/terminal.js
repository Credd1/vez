// terminal.js — xterm.js wrapper

const XTERM_THEME = {
  background: '#0d0d10',
  foreground: '#c8ccd4',
  cursor: '#4a6fa5',
  selectionBackground: '#4a6fa520',
  black: '#0d0d10',
  red: '#b05050',
  green: '#5faa6e',
  yellow: '#c49a3c',
  blue: '#4a6fa5',
  magenta: '#8a5aa5',
  cyan: '#4a8a8a',
  white: '#c8ccd4',
};

const XTERM_OPTS = {
  theme: XTERM_THEME,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 12,
  cursorStyle: 'block',
  cursorBlink: true,
  allowTransparency: true,
  scrollback: 5000,
};

// Active terminals: Map<paneId, { term, fitAddon, cleanup }>
const terminals = new Map();

function createTerminal(paneId, containerEl) {
  // Clean up existing terminal in this container if any
  destroyTerminal(paneId);

  const term = new Terminal(XTERM_OPTS);
  const fitAddon = new FitAddon.FitAddon();

  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());

  term.open(containerEl);

  // Small delay to let DOM settle before first fit
  requestAnimationFrame(() => {
    fitAddon.fit();
    // Sync PTY size
    window.pty.resize(paneId, term.cols, term.rows);
  });

  // PTY → xterm
  const cleanupData = window.pty.onData(paneId, (data) => {
    term.write(data);
  });

  // xterm → PTY
  const disposable = term.onData((data) => {
    window.pty.write(paneId, data);
  });

  // Handle PTY exit
  window.pty.onExit(paneId, () => {
    term.write('\r\n\x1b[90m[process exited]\x1b[0m\r\n');
  });

  // Resize observer
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
    window.pty.resize(paneId, term.cols, term.rows);
  });
  resizeObserver.observe(containerEl);

  terminals.set(paneId, {
    term,
    fitAddon,
    cleanup() {
      cleanupData();
      disposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
    },
  });

  return term;
}

function destroyTerminal(paneId) {
  const entry = terminals.get(paneId);
  if (entry) {
    entry.cleanup();
    terminals.delete(paneId);
  }
}

function focusTerminal(paneId) {
  const entry = terminals.get(paneId);
  if (entry) {
    entry.term.focus();
    entry.fitAddon.fit();
  }
}

function fitAll() {
  terminals.forEach((entry) => {
    entry.fitAddon.fit();
  });
}
