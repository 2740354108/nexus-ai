import cloudbase from '@cloudbase/js-sdk'

const ENV_ID = import.meta.env.VITE_CLOUDBASE_ENV_ID || ''
const REGION = import.meta.env.VITE_CLOUDBASE_REGION || 'ap-shanghai'
const PUBLISH_KEY = import.meta.env.VITE_CLOUDBASE_PUBLISH_KEY || ''

const app = cloudbase.init({
  env: ENV_ID,
  region: REGION,
  accessKey: PUBLISH_KEY,
  auth: { detectSessionInUrl: true },
})

export const auth = app.auth
// 重要：TCB 托管 PostgreSQL 使用 public schema，必须显式传入 { database: 'public' }
export const db = app.rdb({ database: 'public' })
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
