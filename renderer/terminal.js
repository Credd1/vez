// terminal.js — xterm.js wrapper

const XTERM_THEME = {
  background: '#0c0c10',
  foreground: '#d4d7e0',
  cursor: '#6366f1',
  cursorAccent: '#0c0c10',
  selectionBackground: 'rgba(99, 102, 241, 0.25)',
  selectionForeground: '#ffffff',
  black: '#1a1a24',
  brightBlack: '#3a3a4a',
  red: '#f87171',
  brightRed: '#fca5a5',
  green: '#34d399',
  brightGreen: '#6ee7b7',
  yellow: '#fbbf24',
  brightYellow: '#fde68a',
  blue: '#60a5fa',
  brightBlue: '#93c5fd',
  magenta: '#c084fc',
  brightMagenta: '#d8b4fe',
  cyan: '#22d3ee',
  brightCyan: '#67e8f9',
  white: '#e2e4ea',
  brightWhite: '#f8fafc',
};

const XTERM_OPTS = {
  theme: XTERM_THEME,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 12,
  fontWeight: '400',
  fontWeightBold: '600',
  letterSpacing: 0.3,
  lineHeight: 1.25,
  cursorStyle: 'bar',
  cursorWidth: 2,
  cursorBlink: true,
  allowTransparency: true,
  scrollback: 10000,
  smoothScrollDuration: 100,
  minimumContrastRatio: 4.5,
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

  // Handle PTY exit — guard against disposed terminal
  window.pty.onExit(paneId, () => {
    if (terminals.has(paneId)) {
      term.write('\r\n\x1b[90m[process exited]\x1b[0m\r\n');
    }
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
