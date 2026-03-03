/**
 * Mission Control Desktop — Preload Script
 * Exposes safe APIs to the renderer process via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,

  // File dialogs
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  saveFileDialog: () => ipcRenderer.invoke('dialog:saveFile'),

  // Auth — secure token storage
  loadTokens: () => ipcRenderer.invoke('auth:loadTokens'),
  storeTokens: (access: string, refresh: string) => ipcRenderer.invoke('auth:storeTokens', access, refresh),
  clearTokens: () => ipcRenderer.invoke('auth:clearTokens'),

  // App info
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Auto-update
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateReady: (callback: (version: string) => void) => {
    ipcRenderer.on('update-ready', (_e, data) => callback(data.version));
  },
});
