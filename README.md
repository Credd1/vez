# Vez

A 4-pane Electron terminal manager built for running multiple Claude Code sessions side-by-side. Includes real-time usage tracking, a built-in vault file browser with inline editing, and spatial pane navigation.

![Electron](https://img.shields.io/badge/Electron-40-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)

---

## What It Does

- **4 terminal panes per session** — each session opens a 2x2 grid of independent shell instances
- **Multiple sessions** — create, rename, switch between, and close named sessions
- **Claude usage tracking** — live session (5h) and weekly (7d) limit bars pulled from the Anthropic API, with local stats fallback
- **CPU monitoring** — real-time system CPU usage in the sidebar
- **Vault file browser** — side panel for browsing a local folder (Obsidian vault, notes, docs), with markdown rendering, code preview with line numbers, and click-to-edit with autosave
- **Spatial navigation** — `Cmd+Arrow` moves between panes, `Alt+Arrow` switches sessions
- **Quick folders** — fast directory switching per pane with recent folder memory

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **macOS** | Uses `hiddenInset` title bar and macOS keychain for credentials |
| **Node.js 18+** | Required for native module compilation |
| **Python 3** | Required by `node-gyp` to compile `node-pty` |
| **Xcode Command Line Tools** | Run `xcode-select --install` if you don't have them |
| **Claude Code** (optional) | For usage stats — install from [claude.ai](https://claude.ai) and run `claude` once to authenticate |

---

## Installation

```bash
# Clone the repo
git clone https://github.com/credd/vez.git
cd vez

# Install dependencies
npm install

# Compile node-pty for your Electron version
npm run rebuild

# Launch
npm start
```

If `npm run rebuild` fails, make sure you have Xcode Command Line Tools installed:

```bash
xcode-select --install
```

---

## Configuration

Vez reads an optional `.vez-config.json` from the project root. A sample is included:

```bash
cp .vez-config.example.json .vez-config.json
```

### Options

```json
{
  "vaultPath": "~/path/to/your/vault"
}
```

| Key | Default | Description |
|---|---|---|
| `vaultPath` | `~/Documents/ottobot-vault` | Root directory for the vault file browser. Supports `~` expansion. |

The `.vez-config.json` file is gitignored so your local paths stay out of version control.

---

## Usage

### Sessions

- Click **+ New Session** or press `Alt+N` to create a session
- Each session spawns 4 independent shell panes in a 2x2 grid
- Double-click a session name in the sidebar to rename it
- Switch sessions with `Alt+Up/Down` or by clicking in the sidebar

### Terminal Panes

- Click a pane to focus it, or use `Alt+1` through `Alt+4`
- Navigate spatially with `Cmd+Arrow` keys (left/right/up/down in the grid)
- Each pane has its own working directory — click the folder icon in the pane header to change it
- Recently used folders appear as quick-access pills in the pane header

### Vault File Browser

- Toggle with the **Vault** button in the top bar or press `Alt+V`
- Browse your vault folder tree — click folders to expand, click files to preview
- Markdown files render with full formatting (headings, lists, tables, code blocks, frontmatter, wikilinks, tags)
- Code files display with line numbers
- **Click the rendered content** to switch to edit mode — a plain textarea with the raw file content
- Edits **autosave** as you type (800ms debounce) and on blur
- Press `Cmd+S` to save immediately, `Escape` to save and return to the rendered view
- Use `Cmd+F` to filter files by name when the vault panel is open

### Usage Stats

The sidebar shows real-time stats:

- **CPU** — system-wide CPU usage percentage
- **Claude Session (5h)** — current 5-hour usage window with reset countdown
- **Claude Weekly (7d)** — weekly usage with reset countdown

Stats are fetched from the Anthropic API if you're authenticated via Claude Code. Falls back to local `~/.claude/stats-cache.json` data if the API is unavailable.

---

## Keyboard Shortcuts

### Sessions

| Shortcut | Action |
|---|---|
| `Alt+N` | New session |
| `Alt+W` | Close active session |
| `Alt+Up` | Previous session |
| `Alt+Down` | Next session |

### Panes

| Shortcut | Action |
|---|---|
| `Alt+1` – `Alt+4` | Focus pane 1–4 |
| `Cmd+Up` | Focus pane above |
| `Cmd+Down` | Focus pane below |
| `Cmd+Left` | Focus pane left |
| `Cmd+Right` | Focus pane right |

### Panels

| Shortcut | Action |
|---|---|
| `Cmd+B` | Toggle sidebar |
| `Alt+V` | Toggle vault panel |
| `Cmd+F` | Focus vault search (when vault is open) |

### Vault Editor

| Shortcut | Action |
|---|---|
| Click content | Enter edit mode |
| `Cmd+S` | Save immediately |
| `Escape` | Save and exit edit mode |

---

## Development

```bash
# Launch with DevTools auto-opened
npm run dev

# Rebuild native modules after Node or Electron upgrades
npm run rebuild
```

### Project Structure

```
vez/
  main.js              # Electron main process — PTY lifecycle, vault IPC, usage API, config
  preload.js           # Context bridge — exposes IPC methods to renderer
  renderer/
    index.html         # App shell — sidebar, topbar, grid, vault panel
    app.js             # Session/pane state, rendering, keyboard shortcuts, usage panel
    terminal.js        # xterm.js wrapper — PTY bridge, resize observer, cleanup
    sidebar.js         # Session list UI — rename, close, status indicators
    vault.js           # Vault file tree, markdown renderer, inline editor
    styles.css         # All styles
  .vez-config.example.json  # Sample config
```

### Architecture

**Main process** (`main.js`) handles:
- PTY spawning and lifecycle via `node-pty`
- Vault filesystem operations (read, write, tree listing) with path validation
- Claude usage stats via OAuth API
- CPU usage tracking
- Native dialogs (folder picker)

**Renderer process** (`renderer/`) handles:
- xterm.js terminal instances
- DOM rendering and state management
- Keyboard shortcuts
- Vault file browsing, markdown rendering, and inline editing

Communication is via Electron IPC with `contextIsolation: true` and `nodeIntegration: false`. All vault file operations are sandboxed to the configured vault root directory.

---

## Troubleshooting

### `node-pty` fails to load

If you see an error dialog on launch:

```bash
npm run rebuild
```

This recompiles `node-pty` against your current Electron version. You need to re-run this after upgrading Electron or Node.js.

### Blank terminal panes

Make sure your default shell is set:

```bash
echo $SHELL
```

Vez spawns whatever `$SHELL` points to, falling back to `/bin/zsh`. If your shell is in a non-standard location, ensure it's in the `PATH`.

### No usage stats showing

Claude usage stats require authentication:

1. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Run `claude` in a terminal and complete the auth flow
3. Restart Vez

The stats panel falls back to local cache data from `~/.claude/stats-cache.json` if the API is unreachable.

### Vault panel shows empty

Check that your vault path exists:

```bash
ls ~/Documents/ottobot-vault
```

Or configure a custom path in `.vez-config.json`:

```json
{
  "vaultPath": "~/your/notes/folder"
}
```

### Fonts not loading

Vez loads JetBrains Mono and IBM Plex Sans from Google Fonts. On first launch you need an internet connection for fonts to cache. Subsequent launches work offline.

---

## Security

- All vault file operations are restricted to the configured vault root directory — path traversal is blocked via `realpathSync` validation
- File reads are limited to 1MB to prevent memory issues
- PTY processes receive a restricted set of environment variables (allowlist) to avoid leaking secrets
- `contextIsolation` is enabled and `nodeIntegration` is disabled
- Markdown link hrefs are sanitized — only `http://`, `https://`, and `#` protocols are allowed

---

## License

[MIT](LICENSE)
