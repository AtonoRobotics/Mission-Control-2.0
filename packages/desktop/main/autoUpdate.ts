/**
 * Auto-Update — checks GitHub Releases for new versions via electron-updater.
 */

import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.checkForUpdates().catch(() => {
    // Silently fail if no internet or no releases configured
  });

  autoUpdater.on('checking-for-update', () => {
    console.log('[update] Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[update] Update available: v${info.version}`);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[update] Already up to date.');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[update] Download: ${progress.percent.toFixed(1)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[update] Downloaded v${info.version} — ready to install.`);
    mainWindow.webContents.send('update-ready', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    console.error('[update] Error:', err.message);
  });
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(true, true);
}
