import {createRoot} from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadSettings } from './lib/settings'
import { installApiFetchBridge, resolveApiBase, setApiBaseUrl } from './lib/apiBase'

/**
 * 原生应用（APK）的界面从本地加载，必须在渲染前把接口地址指向后端，
 * 否则登录、对话等请求会发到手机本地而失败。网页端地址为空，行为不变。
 */
async function bootstrap() {
  let serverBase = ''
  try {
    const s = await loadSettings()
    serverBase = s.serverBase
  } catch {
    /* 读取失败则退回内置地址 */
  }
  setApiBaseUrl(resolveApiBase(serverBase))
  installApiFetchBridge()
  createRoot(document.getElementById('root')!).render(<App />)
}

void bootstrap()
