import cloudbase from '@cloudbase/js-sdk'

// VITE_DEPLOY_MODE=local 时跳过云端 TCB 初始化（本地部署无需云端）
const DEPLOY_MODE = (import.meta as any).env?.VITE_DEPLOY_MODE || 'cloud'

const ENV_ID = (import.meta as any).env?.VITE_CLOUDBASE_ENV_ID || ''
const REGION = (import.meta as any).env?.VITE_CLOUDBASE_REGION || 'ap-shanghai'
const PUBLISH_KEY = (import.meta as any).env?.VITE_CLOUDBASE_PUBLISH_KEY || ''

let app: any = null
let auth: any = null
let db: any = null

if (DEPLOY_MODE !== 'local') {
  app = cloudbase.init({
    env: ENV_ID,
    region: REGION,
    accessKey: PUBLISH_KEY,
    auth: { detectSessionInUrl: true },
  })
  auth = app.auth
  // 重要：TCB 托管 PostgreSQL 使用 public schema，必须显式传入 { database: 'public' }
  db = app.rdb({ database: 'public' })
} else {
  // 本地模式：不连接云端 TCB，提供安全占位，避免模块加载报错
  auth = {
    getSession: async () => ({ data: null, error: new Error('local mode: cloud TCB disabled') }),
  }
  db = {
    collection: () => ({
      get: async () => ({ data: [] }),
      add: async () => ({ id: '' }),
      where: () => ({ get: async () => ({ data: [] }) }),
    }),
  }
}

export { auth, db, app }
export default app

/**
 * 获取当前用户的 access_token。
 * 未登录或匿名会话时返回空字符串。
 */
export async function getAccessToken(): Promise<string> {
  try {
    const { data, error } = await (auth as any).getSession()
    if (error || !data?.session?.access_token) return ''
    // 过滤掉 accessKey 作用域的匿名会话 token
    if (data.session.scope === 'accessKey') return ''
    return data.session.access_token
  } catch {
    return ''
  }
}
