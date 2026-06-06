const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs').promises;
const os   = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 820,
    minWidth:  900,
    minHeight: 600,
    title: 'RE Workflow Reference',
    backgroundColor: '#0C0D0F',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src', 'preload.js')
    },
    // Remove default menu bar
    autoHideMenuBar: true,
    // Use custom titlebar on Windows
    frame: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Open external links in OS browser, not Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC: Save log to file ─────────────────────────────────────────────────────
ipcMain.handle('save-log', async (_event, logText) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title:       'Export diagnostic log',
    defaultPath: `re-ref-diagnostic-${Date.now()}.txt`,
    filters: [
      { name: 'Text files', extensions: ['txt'] },
      { name: 'All files',  extensions: ['*']   }
    ]
  });
  if (canceled || !filePath) return { ok: false };
  try {
    await fs.writeFile(filePath, logText, 'utf8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── IPC: Get app version ──────────────────────────────────────────────────────
ipcMain.handle('get-version', () => app.getVersion());

// ── Claude Flow: store memory via file ───────────────────────────────────────
ipcMain.handle('cf-memory-store', async (_event, { key, namespace = 'default', data }) => {
  const dir = path.join(os.homedir(), '.claude-flow', 're-workflow', namespace);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${key}.json`);
  await fs.writeFile(filePath, JSON.stringify({ key, namespace, data, timestamp: new Date().toISOString() }, null, 2), 'utf8');
  return { ok: true, path: filePath };
});

// ── Claude Flow: retrieve memory from file ────────────────────────────────────
ipcMain.handle('cf-memory-retrieve', async (_event, { key, namespace = 'default' }) => {
  const filePath = path.join(os.homedir(), '.claude-flow', 're-workflow', namespace, `${key}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return { ok: false, error: 'not found' };
  }
});

// ── Claude Flow: fire hook (pre/post analysis) ────────────────────────────────
ipcMain.handle('cf-hook', async (_event, { type, payload }) => {
  // Log hook event; in production this would call npx claude-flow@v3alpha hooks [type]
  const logPath = path.join(os.homedir(), '.claude-flow', 're-workflow', 'hooks.log');
  const entry = JSON.stringify({ ts: new Date().toISOString(), type, payload }) + '\n';
  try { await fs.appendFile(logPath, entry, 'utf8'); } catch {}
  return { ok: true, type };
});

// ── Claude Flow: list memory entries ─────────────────────────────────────────
ipcMain.handle('cf-memory-list', async (_event, { namespace = 'default' }) => {
  const dir = path.join(os.homedir(), '.claude-flow', 're-workflow', namespace);
  try {
    const files = await fs.readdir(dir);
    return { ok: true, keys: files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')) };
  } catch {
    return { ok: true, keys: [] };
  }
});
