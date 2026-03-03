/**
 * Mission Control Desktop — Preload Script
 * Exposes safe APIs to the renderer process via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
});
