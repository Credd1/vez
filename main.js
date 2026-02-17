const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

let pty;
try {
  pty = require('node-pty');
} catch (err) {
  app.whenReady().then(() => {
    dialog.showErrorBox(
      'Native module failed to load',
      'node-pty could not be loaded. Run `npm run rebuild` from the Vez directory and restart the app.\n\n' + err.message
    );
    app.quit();
  });
}

// ── Config ──

function loadConfig() {
  try {
    const configPath = path.join(__dirname, '.vez-config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

function getVaultPath() {
  const config = loadConfig();
  if (config.vaultPath) {
    return config.vaultPath.replace(/^~/, os.homedir());
  }
  return path.join(os.homedir(), 'Documents', 'ottobot-vault');
}

const ptys = new Map();

// ── CPU usage tracking ──
let prevCpuTimes = null;

function getCpuTimes() {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  return { user, nice, sys, idle, irq };
}

// Seed the initial reading so the first query has a delta
prevCpuTimes = getCpuTimes();

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

  if (process.env.VEZ_DEV) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

// ── PTY IPC ──

ipcMain.handle('pty:spawn', (event, { id, cwd }) => {
  console.log('[pty:spawn]', id, cwd);
  if (!pty) return { ok: false, error: 'node-pty not loaded' };
  if (ptys.has(id)) { console.log('[pty:spawn] already exists:', id); return { ok: true }; }

  try {
    const shell = process.env.SHELL || '/bin/zsh';
    // Allowlist safe env vars — avoid leaking secrets to shell sessions
    const safeKeys = ['HOME', 'PATH', 'SHELL', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE',
      'TMPDIR', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'EDITOR', 'VISUAL',
      'COLORTERM', 'TERM_PROGRAM', 'HOMEBREW_PREFIX', 'NVM_DIR', 'FNM_DIR'];
    const ptyEnv = { TERM: 'xterm-256color' };
    for (const key of safeKeys) {
      if (process.env[key]) ptyEnv[key] = process.env[key];
    }
    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.env.HOME,
      env: ptyEnv,
    });

  ptys.set(id, term);

  term.onData((data) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(`pty:data:${id}`, data);
    }
  });

  term.onExit(() => {
    console.log('[pty:exit]', id);
    ptys.delete(id);
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(`pty:exit:${id}`);
    }
  });
  return { ok: true };
  } catch (err) {
    console.error('[pty:spawn] error:', err);
    return { ok: false, error: err.message };
  }
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

function getOAuthToken() {
  // Try keychain (enterprise/OAuth login on macOS)
  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    const creds = JSON.parse(raw);
    if (creds.claudeAiOauth?.accessToken) return creds.claudeAiOauth;
  } catch {}

  // Try file-based credentials
  try {
    const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    if (creds.claudeAiOauth?.accessToken) return creds.claudeAiOauth;
  } catch {}

  return null;
}

ipcMain.handle('app:getUsageStats', async () => {
  const oauth = getOAuthToken();

  // Try OAuth API with required beta header
  if (oauth) {
    try {
      const res = await net.fetch('https://api.anthropic.com/api/oauth/usage', {
        headers: {
          'Authorization': `Bearer ${oauth.accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });
      console.log('[usage] API status:', res.status);
      if (res.ok) {
        const usage = await res.json();
        console.log('[usage] API data:', JSON.stringify(usage).slice(0, 300));
        // Also attach local stats for extra context
        let localStats = null;
        try {
          const statsPath = path.join(os.homedir(), '.claude', 'stats-cache.json');
          localStats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        } catch {}
        return { source: 'api', ...usage, local: localStats };
      }
    } catch (e) {
      console.log('[usage] API error:', e.message);
    }
  }

  // Fallback to local stats-cache
  try {
    const statsPath = path.join(os.homedir(), '.claude', 'stats-cache.json');
    const data = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    return { source: 'local', ...data };
  } catch {
    return null;
  }
});

ipcMain.handle('app:getCpuUsage', () => {
  const cur = getCpuTimes();
  const prev = prevCpuTimes;
  prevCpuTimes = cur;

  const dUser = cur.user - prev.user;
  const dNice = cur.nice - prev.nice;
  const dSys = cur.sys - prev.sys;
  const dIdle = cur.idle - prev.idle;
  const dIrq = cur.irq - prev.irq;
  const total = dUser + dNice + dSys + dIdle + dIrq;
  if (total === 0) return { percent: 0, cores: os.cpus().length };

  const busy = total - dIdle;
  return {
    percent: Math.round((busy / total) * 100),
    cores: os.cpus().length,
  };
});

// ── Vault IPC ──

function isInsideVault(targetPath) {
  const vaultRoot = getVaultPath();
  try {
    const resolved = fs.realpathSync(targetPath);
    const resolvedRoot = fs.realpathSync(vaultRoot);
    return resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot;
  } catch {
    // Target doesn't exist yet (new file) — check parent
    const parent = path.dirname(targetPath);
    try {
      const resolvedParent = fs.realpathSync(parent);
      const resolvedRoot = fs.realpathSync(vaultRoot);
      return resolvedParent.startsWith(resolvedRoot + path.sep) || resolvedParent === resolvedRoot;
    } catch {
      return false;
    }
  }
}

ipcMain.handle('vault:root', () => getVaultPath());

ipcMain.handle('vault:tree', (event, dirPath) => {
  const base = dirPath || getVaultPath();
  if (dirPath && !isInsideVault(base)) return [];
  try {
    const entries = fs.readdirSync(base, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((e) => ({
        name: e.name,
        path: path.join(base, e.name),
        isDir: e.isDirectory(),
      }));
  } catch {
    return [];
  }
});

ipcMain.handle('vault:read', (event, filePath) => {
  if (!isInsideVault(filePath)) return null;
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > 1024 * 1024) return null; // 1MB limit
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('vault:write', (event, { filePath, content }) => {
  if (!isInsideVault(filePath)) {
    return { success: false, error: 'Path outside vault' };
  }
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('vault:open', (event, filePath) => {
  if (!isInsideVault(filePath)) return;
  require('electron').shell.openPath(filePath);
});

ipcMain.handle('dialog:selectFolder', async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// ── App lifecycle ──

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  ptys.forEach((term) => term.kill());
  ptys.clear();
  app.quit();
});
