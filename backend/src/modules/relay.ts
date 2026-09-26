import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { query, queryOne } from '../lib/db'
import { generateToken, verifyToken } from './auth'
import { env } from '../config/env'

export const relayRouter = Router()

const DAILY_LIMIT = Number(process.env.RELAY_DAILY_LIMIT || env.RELAY_DAILY_LIMIT || 20)
const TRIAL_PER_IP = Number(process.env.RELAY_TRIAL_PER_IP || env.RELAY_TRIAL_PER_IP || 5)
/** 对外暴露，供 ai.ts 等复用 */
export const RELAY_DAILY_LIMIT = DAILY_LIMIT

/** 是否处于"公开中继"模式：站长设置了 AI_BOT_TOKEN 即视为开放公网中继 */
export function isRelayMode(): boolean {
  return !!process.env.AI_BOT_TOKEN
}

/** 站长自有网关令牌（AI_BOT_TOKEN）放行，不走配额 */
export function isOwnerToken(token: string): boolean {
  return !!process.env.AI_BOT_TOKEN && token === process.env.AI_BOT_TOKEN
}

export function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  const ip =
    (typeof fwd === 'string' ? fwd.split(',')[0].trim() : (fwd as string[] | undefined)?.[0]) ||
    req.socket.remoteAddress ||
    'unknown'
  return ip
}

/**
 * 累加并返回某 key 今日的用量；超额返回 ok:false。
 * key 为注册用户 uid，或为匿名试用 'anon:<ip>'。
 */
export async function bumpRelayUsage(
  key: string,
  limit: number
): Promise<{ ok: boolean; used: number; limit: number }> {
  const day = new Date().toISOString().slice(0, 10)
  const row = await queryOne<{ count: number }>(
    'SELECT count FROM relay_daily_usage WHERE user_id = $1 AND day = $2',
    [key, day]
  )
  if (row && row.count >= limit) {
    return { ok: false, used: row.count, limit }
  }
  await query(
    `INSERT INTO relay_daily_usage (user_id, day, count) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET count = relay_daily_usage.count + 1`,
    [key, day],
    'write'
  )
  return { ok: true, used: (row?.count || 0) + 1, limit }
}

/**
 * 中继准入：校验请求并累加每日配额。
 * 返回 uid（已登录）或 'anon:<ip>'（匿名试用），null 表示已被拒（响应已写出）。
 */
export async function enforceRelayQuota(req: Request, res: Response): Promise<string | null> {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token) {
    const payload = verifyToken(token)
    if (payload) {
      const r = await bumpRelayUsage(payload.uid, DAILY_LIMIT)
      if (!r.ok) {
        res.status(429).json({
          success: false,
          error: `今日免费额度已用完（${r.limit} 次），明天自动重置，或填写自己的 AI Key 解锁无限`,
        })
        return null
      }
      return payload.uid
    }
  }
  // 匿名访客：按 IP 给少量试用，避免裸奔被刷
  const ip = clientIp(req)
  const r = await bumpRelayUsage('anon:' + ip, TRIAL_PER_IP)
  if (!r.ok) {
    res.status(401).json({
      success: false,
      error: '免费试用次数已用完，请注册领取每日额度（nexusai register）后再继续',
    })
    return null
  }
  return 'anon:' + ip
}

// ============================================================
// 注册 / 登录（免邮件验证，专为公开中继试用设计）
// 与 /api/auth/* 共用 users 表与同一套 JWT，登录后 token 在网页端同样有效。
// ============================================================
relayRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password } = req.body || {}
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: '邮箱和密码必填，密码至少 6 位' })
  }
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()]
  )
  if (existing) {
    return res.status(409).json({ error: '该邮箱已注册，请直接登录' })
  }
  const passwordHash = await bcrypt.hash(password, 10)
  const userId = crypto.randomUUID()
  await query(
    `INSERT INTO users (id, email, password_hash, email_verified) VALUES ($1, $2, $3, true)`,
    [userId, email.toLowerCase(), passwordHash],
    'write'
  )
  const token = generateToken(userId, email.toLowerCase())
  res.json({
    success: true,
    token,
    user: { uid: userId, email: email.toLowerCase(), emailVerified: true },
  })
})

relayRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: '邮箱和密码必填' })
  }
  const user = await queryOne<{ id: string; email: string; password_hash: string }>(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email.toLowerCase()]
  )
  if (!user) {
    return res.status(401).json({ error: '该邮箱未注册，请先注册' })
  }
  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    return res.status(401).json({ error: '邮箱或密码错误' })
  }
  const token = generateToken(user.id, user.email)
  res.json({
    success: true,
    token,
    user: { uid: user.id, email: user.email, emailVerified: true },
  })
})

relayRouter.get('/me', (req: Request, res: Response) => {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const payload = verifyToken(token)
  if (!payload) {
    return res.status(401).json({ error: '未登录' })
  }
  res.json({
    success: true,
    uid: payload.uid,
    email: payload.email,
    dailyLimit: DAILY_LIMIT,
    trialPerIp: TRIAL_PER_IP,
  })
})

/** 前端用来判断是否处于公开中继模式（决定是否展示注册/登录入口） */
relayRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ relay: isRelayMode(), dailyLimit: DAILY_LIMIT, trialPerIp: TRIAL_PER_IP })
})

/** 确保本地/中继所需的表存在（幂等）；云端 TCB 通常已具备，这里以 migrate 模式兼容。 */
export async function ensureRelaySchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT,
      name TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      email_verified BOOLEAN DEFAULT false,
      phone_verified BOOLEAN DEFAULT false,
      verify_code TEXT,
      verify_code_expires TIMESTAMPTZ,
      sms_code TEXT,
      sms_code_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`,
    [],
    'migrate'
  )
  await query(
    `CREATE TABLE IF NOT EXISTS pending_registrations (
      email TEXT PRIMARY KEY,
      password_hash TEXT,
      code TEXT,
      expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
    [],
    'migrate'
  )
  await query(
    `CREATE TABLE IF NOT EXISTS relay_daily_usage (
      user_id TEXT,
      day DATE,
      count INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, day)
    )`,
    [],
    'migrate'
  )
}
