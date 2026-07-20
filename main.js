const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 720,
    minHeight: 600,
    title: 'Wish I Had a DB Plan',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#f2f3ef',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('Failed to load app:', code, desc);
  });

  /* Without this, the page's "Save to file" download (a plain <a download>
     click on a blob: URL) still succeeds, but silently — Electron has no
     download shelf like a browser, so it saves with zero visible feedback
     and looks broken. Prompt with a native Save dialog instead. */
  win.webContents.session.on('will-download', (event, item) => {
    const savePath = dialog.showSaveDialogSync(win, {
      defaultPath: item.getFilename(),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (savePath) {
      item.setSavePath(savePath);
    } else {
      item.cancel();
    }
  });

  win.loadFile('retirement-planner.html');
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
