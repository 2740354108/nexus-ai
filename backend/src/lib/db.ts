import fs from 'fs'
import { env } from '../config/env'

// 数据库引擎选择：
//   DB_MODE=cloud                              -> 云端 TCB auth-proxy（沙箱环境）
//   DATABASE_URL=postgresql://...              -> 直连外部 PostgreSQL（高级/云端共用数据）
//   其它（本地部署默认）                        -> 内嵌 PGlite（纯 WASM，零安装，数据存本地文件）
const DB_MODE = (process.env.DB_MODE || env.DB_MODE || 'local').toLowerCase()
const DATABASE_URL = process.env.DATABASE_URL || env.DATABASE_URL || ''

function resolveEngine(): 'cloud' | 'pg' | 'pglite' {
  if (DB_MODE === 'cloud') return 'cloud'
  if (DATABASE_URL && /^postgres(ql)?:\/\//.test(DATABASE_URL)) return 'pg'
  return 'pglite'
}
const ENGINE = resolveEngine()

// 参数拼接：与云端 auth-proxy 行为保持一致，避免改动任何调用方
function buildSql(sql: string, params: any[]): string {
  let parameterizedSql = sql
  params.forEach((param, index) => {
    const placeholder = `$${index + 1}`
    const escaped =
      param === null || param === undefined
        ? 'NULL'
        : typeof param === 'string'
          ? `'${param.replace(/'/g, "''")}'`
          : typeof param === 'number' || typeof param === 'boolean'
            ? String(param)
            : `'${JSON.stringify(param).replace(/'/g, "''")}'`
    parameterizedSql = parameterizedSql.replace(placeholder, escaped)
  })
  return parameterizedSql
}

// ============================================================
// 外部 PostgreSQL 模式（可选）
// ============================================================
let localPool: any = null
async function getLocalPool() {
  if (!localPool) {
    const { default: pg } = await import('pg')
    if (!process.env.DATABASE_URL) {
      throw new Error('外部 PostgreSQL 模式需要设置 DATABASE_URL，例如 postgresql://user:pass@localhost:5432/nexus')
    }
    localPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  }
  return localPool
}

// ============================================================
// 内嵌 PGlite 模式（本地部署默认，零安装）
// ============================================================
let pgdb: any = null
async function getPglite() {
  if (!pgdb) {
    const { PGlite } = await import('@electric-sql/pglite')
    const dataDir = process.env.NEXUS_DATA_DIR || './nexus-data'
    pgdb = new PGlite(dataDir)
    if (pgdb.waitReady) await pgdb.waitReady
  }
  return pgdb
}

// ============================================================
// 云端 TCB auth-proxy 模式（默认沙箱）
// ============================================================
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

const { envId: ENV_ID, region: REGION } =
  DB_MODE === 'cloud' ? loadTcbEnv() : { envId: '', region: '' }
void ENV_ID
void REGION

type QueryMode = 'read' | 'write' | 'migrate'

export interface QueryResult<T = any> {
  rows: T[]
  rowCount: number
}

/**
 * 统一查询入口：
 * - pglite  -> 内嵌 PostgreSQL（本地部署默认，零安装）
 * - pg      -> 直连外部 PostgreSQL
 * - cloud   -> 经 auth-proxy 执行 TCB PostgreSQL 查询
 */
export async function query<T = any>(sql: string, params: any[] = [], mode: QueryMode = 'write'): Promise<QueryResult<T>> {
  if (ENGINE === 'pg') {
    const pool = await getLocalPool()
    const fullSql = buildSql(sql, params)
    const res = await pool.query(fullSql)
    return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length }
  }

  if (ENGINE === 'pglite') {
    const db = await getPglite()
    // PGlite 原生支持 $1 占位符与 PostgreSQL 方言（JSONB / now() / RETURNING / ON CONFLICT）
    const res: any = await db.query(sql, params)
    return { rows: (res?.rows || []) as T[], rowCount: res?.affectedRows ?? res?.rows?.length ?? 0 }
  }

  // 云端：TCB auth-proxy 的 read 模式在当前环境下不可用，统一回退到 write
  const effectiveMode: QueryMode = mode === 'read' ? 'write' : mode
  const sqlB64 = Buffer.from(buildSql(sql, params)).toString('base64')
  const response = await fetch(`http://${AUTH_PROXY_HOST}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql_b64: sqlB64, mode: effectiveMode }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`DB query failed: HTTP ${response.status} ${text}`)
  }

  const data: any = await response.json()
  if (data?.status === 'error' || data?.code) {
    throw new Error(`DB query failed: ${data.message || data.error || JSON.stringify(data)}`)
  }

  const rows = Array.isArray(data) ? data : data?.rows || data?.data || []
  return { rows: rows as T[], rowCount: rows.length }
}

export async function queryOne<T = any>(sql: string, params: any[] = [], mode: QueryMode = 'write'): Promise<T | null> {
  const { rows } = await query<T>(sql, params, mode)
  return rows[0] || null
}
