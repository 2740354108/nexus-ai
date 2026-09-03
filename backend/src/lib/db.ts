import fs from 'fs'
import { env } from '../config/env'

const AUTH_PROXY_HOST = 'tcb-env.auth-proxy.local'

function loadTcbEnv(): { envId: string; region: string } {
  const path = '/workspace/.env.tcb'
  if (!fs.existsSync(path)) {
    throw new Error('TCB env file not found: /workspace/.env.tcb')
  }
  const vars: Record<string, string> = {}
  fs.readFileSync(path, 'utf-8').split('\n').forEach((line) => {
    const idx = line.indexOf('=')
    if (idx > 0) {
      vars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
  })
  const envId = vars.CLOUDBASE_ENV_ID
  if (!envId) {
    throw new Error('CLOUDBASE_ENV_ID is not set in /workspace/.env.tcb')
  }
  return { envId, region: vars.CLOUDBASE_REGION || 'ap-shanghai' }
}

const { envId: ENV_ID, region: REGION } = loadTcbEnv()

type QueryMode = 'read' | 'write' | 'migrate'

export interface QueryResult<T = any> {
  rows: T[]
  rowCount: number
}

/**
 * 通过 auth-proxy 执行 TCB PostgreSQL 查询。
 * 后端使用超级角色，不依赖前端 RLS，因此调用方必须自行校验用户权限。
 */
export async function query<T = any>(sql: string, params: any[] = [], mode: QueryMode = 'read'): Promise<QueryResult<T>> {
  // 简单参数化：用 $1, $2 ... 占位，这里做字符串替换（仅用于内部可信参数）
  let parameterizedSql = sql
  params.forEach((param, index) => {
    const placeholder = `$${index + 1}`
    const escaped = param === null || param === undefined
      ? 'NULL'
      : typeof param === 'string'
        ? `'${param.replace(/'/g, "''")}'`
        : typeof param === 'number' || typeof param === 'boolean'
          ? String(param)
          : `'${JSON.stringify(param).replace(/'/g, "''")}'`
    parameterizedSql = parameterizedSql.replace(placeholder, escaped)
  })

  const sqlB64 = Buffer.from(parameterizedSql).toString('base64')
  const response = await fetch(`http://${AUTH_PROXY_HOST}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql_b64: sqlB64, mode }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`DB query failed: HTTP ${response.status} ${text}`)
  }

  const data = await response.json()
  if (data?.status === 'error' || data?.code) {
    throw new Error(`DB query failed: ${data.message || data.error || JSON.stringify(data)}`)
  }

  const rows = Array.isArray(data) ? data : data?.rows || data?.data || []
  return { rows: rows as T[], rowCount: rows.length }
}

export async function queryOne<T = any>(sql: string, params: any[] = [], mode: QueryMode = 'read'): Promise<T | null> {
  const { rows } = await query<T>(sql, params, mode)
  return rows[0] || null
}
