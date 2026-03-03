/**
 * File Access IPC Handlers — native file dialogs for MCAP/config files.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';

export function registerFileAccessHandlers(): void {
  ipcMain.handle('dialog:openFile', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'MCAP Files', extensions: ['mcap'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const fileName = filePath.split('/').pop() ?? filePath;
    return { filePath, fileName };
  });

  ipcMain.handle('dialog:openDirectory', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });

    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:saveFile', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showSaveDialog(win, {
      filters: [
        { name: 'MCAP Files', extensions: ['mcap'] },
        { name: 'JSON Files', extensions: ['json'] },
      ],
    });

    if (result.canceled) return null;
    return result.filePath;
  });
}
