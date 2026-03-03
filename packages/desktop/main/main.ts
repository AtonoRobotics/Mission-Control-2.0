/**
 * Mission Control Desktop — Electron Main Process
 * Loads the web frontend in a native window with dark theme.
 */

import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } from 'electron';
import path from 'path';
import { registerFileAccessHandlers } from './fileAccess';
import { loadTokens, storeTokens, clearTokens } from './secureStorage';
import { setupAutoUpdater, installUpdate } from './autoUpdate';
import { getTailscaleStatus } from './tailscale';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const isDev = process.env.NODE_ENV !== 'production';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In packaged app, web files are in extraResources/web
    const webPath = app.isPackaged
      ? path.join(process.resourcesPath, 'web', 'index.html')
      : path.join(__dirname, '../../web/dist/index.html');
    mainWindow.loadFile(webPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Application menu
const template: Electron.MenuItemConstructorOptions[] = [
  {
    label: 'File',
    submenu: [
      { role: 'quit' },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
    ],
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
    ],
  },
];

Menu.setApplicationMenu(Menu.buildFromTemplate(template));

// IPC handlers for secure token storage
ipcMain.handle('auth:loadTokens', () => loadTokens());
ipcMain.handle('auth:storeTokens', (_e, access: string, refresh: string) => storeTokens(access, refresh));
ipcMain.handle('auth:clearTokens', () => clearTokens());
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('update:install', () => installUpdate());
ipcMain.handle('tailscale:status', () => getTailscaleStatus());

app.on('ready', () => {
  registerFileAccessHandlers();
  createWindow();

  // System tray
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Mission Control');
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    }
  });

  // Auto-updater (production only)
  if (!isDev && mainWindow) {
    setupAutoUpdater(mainWindow);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
