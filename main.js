const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pty = require('node-pty');

const ptys = new Map();

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// ── PTY IPC ──

ipcMain.handle('pty:spawn', (event, { id, cwd }) => {
  if (ptys.has(id)) return;

  const shell = process.env.SHELL || '/bin/zsh';
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd || process.env.HOME,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  ptys.set(id, term);

  term.onData((data) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(`pty:data:${id}`, data);
    }
  });

  term.onExit(() => {
    ptys.delete(id);
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(`pty:exit:${id}`);
    }
  });
});

ipcMain.on('pty:write', (event, { id, data }) => {
  const term = ptys.get(id);
  if (term) term.write(data);
});

ipcMain.on('pty:resize', (event, { id, cols, rows }) => {
  const term = ptys.get(id);
  if (term) term.resize(cols, rows);
});

ipcMain.on('pty:kill', (event, { id }) => {
  const term = ptys.get(id);
  if (term) {
    term.kill();
    ptys.delete(id);
  }
});

// ── App lifecycle ──

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  ptys.forEach((term) => term.kill());
  ptys.clear();
  app.quit();
});
