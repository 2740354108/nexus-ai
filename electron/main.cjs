const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

const ROOT = path.resolve(__dirname, '..')
let backend, frontend

// 轮询等待某个本地端口就绪
function waitFor(url, cb) {
  const tryOnce = () => {
    http
      .get(url, (res) => {
        res.destroy()
        cb()
      })
      .on('error', () => setTimeout(tryOnce, 1000))
  }
  tryOnce()
}

// 启动后端（本地 PostgreSQL）与前端（Vite）
function startServices() {
  backend = spawn(
    'pnpm',
    ['dev'],
    {
      cwd: path.join(ROOT, 'backend'),
      env: { ...process.env, DB_MODE: process.env.DB_MODE || 'local', DATABASE_URL: process.env.DATABASE_URL || '' },
      shell: true,
      detached: true,
    }
  )
  frontend = spawn(
    'pnpm',
    ['dev'],
    {
      cwd: path.join(ROOT, 'frontend'),
      env: { ...process.env, VITE_DEPLOY_MODE: 'local' },
      shell: true,
      detached: true,
    }
  )
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: 'NEXUS AI',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  win.loadURL('http://localhost:5173')
}

app.whenReady().then(() => {
  startServices()
  waitFor('http://localhost:5173', createWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  try {
    process.kill(-backend.pid)
  } catch {}
  try {
    process.kill(-frontend.pid)
  } catch {}
  if (process.platform !== 'darwin') app.quit()
})
