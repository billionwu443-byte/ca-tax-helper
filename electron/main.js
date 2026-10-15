// Electron 主进程：把 index.html 装进桌面窗口。所有计算都在本地完成，不联网也能用。
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 420,
    minHeight: 600,
    title: 'California 加州报税助手',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#f3f5f7',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));

  // 页面里的外部链接（FTB、IRS 官网）用系统默认浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
}

const menuTemplate = [
  {
    label: '文件',
    submenu: [
      { role: 'reload', label: '重新载入' },
      { type: 'separator' },
      { role: 'quit', label: '退出' },
    ],
  },
  {
    label: '视图',
    submenu: [
      { role: 'resetZoom', label: '实际大小' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全屏' },
    ],
  },
  {
    label: '帮助',
    submenu: [
      { label: 'FTB 加州税务局官网', click: () => shell.openExternal('https://www.ftb.ca.gov/') },
      { label: 'IRS 联邦税务局官网', click: () => shell.openExternal('https://www.irs.gov/') },
    ],
  },
];

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
