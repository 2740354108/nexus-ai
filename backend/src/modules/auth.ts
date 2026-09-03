import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { env } from '../config/env'
import { query, queryOne } from '../lib/db'
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/mailer'
import { sendSmsCode } from '../lib/sms'
import { OAuth2Client } from 'google-auth-library'

export const authRouter = Router()

const JWT_EXPIRES_IN = '7d'
const CODE_TTL_MIN = 10
const PHONE_RE = /^1[3-9]\d{9}$/

export interface AuthenticatedRequest extends Express.Request {
  user?: { uid: string; email: string }
}

export function generateToken(userId: string, email: string): string {
  return jwt.sign({ uid: userId, email }, env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token: string): { uid: string; email: string } | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as { uid: string; email: string }
  } catch {
    return null
  }
}

export async function authMiddleware(req: AuthenticatedRequest, res: any, next: any) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.cookies?.token as string)
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const payload = verifyToken(token)
  if (!payload) {
    return res.status(401).json({ error: 'Invalid token' })
  }
  req.user = payload
  next()
}

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function profile(id: string, email: string, name: string, avatar_url: string, emailVerified: boolean, phoneVerified = false) {
  return { uid: id, email, name: name || '', avatar_url: avatar_url || '', emailVerified, phoneVerified }
}

authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: '邮箱和密码必填，密码至少 6 位' })
  }

  // 已验证账号：直接拒绝，引导登录（不提前建号，避免被占位）
  const existing = await queryOne<{ id: string; email_verified: boolean }>(
    'SELECT id, email_verified FROM users WHERE email = $1',
    [email],
    'write'
  )
  if (existing?.email_verified) {
    return res.status(409).json({ error: '该邮箱已注册，请直接登录' })
  }

  // 写入待验证表（验证通过才真正建号），先删后插以覆盖旧的待验证记录
  const passwordHash = await bcrypt.hash(password, 10)
  const code = genCode()
  const expires = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString()
  await query('DELETE FROM pending_registrations WHERE email = $1', [email], 'write')
  await query(
    `INSERT INTO pending_registrations (email, password_hash, code, expires, created_at)
     VALUES ($1, $2, $3, $4, now())`,
    [email, passwordHash, code, expires],
    'write'
  )
  const mail = await sendVerificationEmail(email, code)
  res.json({
    success: true,
    email,
    emailVerified: false,
    devCode: mail.devCode,
    message: '验证码已发送，请查收邮箱完成验证',
  })
})

authRouter.post('/verify-email', async (req, res) => {
  const { email, code } = req.body
  if (!email || !code) {
    return res.status(400).json({ error: '邮箱和验证码必填' })
  }
  // 校验来自待验证表，而非已建号用户
  const pending = await queryOne<{ password_hash: string; code: string; expires: string }>(
    'SELECT password_hash, code, expires FROM pending_registrations WHERE email = $1',
    [email],
    'write'
  )
  if (!pending) {
    return res.status(401).json({ error: '请先获取验证码' })
  }
  if (!pending.code || pending.code !== code) {
    return res.status(400).json({ error: '验证码错误' })
  }
  if (new Date(pending.expires).getTime() < Date.now()) {
    return res.status(400).json({ error: '验证码已过期，请重新获取' })
  }

  // 验证通过，此时才真正建号或激活（兼容历史未验证占位账号）
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email],
    'write'
  )
  let userId: string
  if (existing) {
    await query(
      'UPDATE users SET password_hash = $2, email_verified = true, verify_code = NULL, verify_code_expires = NULL, updated_at = now() WHERE id = $1',
      [existing.id, pending.password_hash],
      'write'
    )
    userId = existing.id
  } else {
    userId = crypto.randomUUID()
    await query(
      `INSERT INTO users (id, email, password_hash, email_verified, verify_code, verify_code_expires)
       VALUES ($1, $2, $3, true, NULL, NULL)`,
      [userId, email, pending.password_hash],
      'write'
    )
  }
  await query('DELETE FROM pending_registrations WHERE email = $1', [email], 'write')

  const user = await queryOne<{ name: string; avatar_url: string }>(
    'SELECT name, avatar_url FROM users WHERE id = $1',
    [userId],
    'write'
  )
  const token = generateToken(userId, email)
  res.json({
    success: true,
    token,
    user: profile(userId, email, user?.name || '', user?.avatar_url || '', true),
  })
})

authRouter.post('/resend-code', async (req, res) => {
  const { email } = req.body
  if (!email) {
    return res.status(400).json({ error: '邮箱必填' })
  }
  // 重发针对待验证记录
  const pending = await queryOne<{ email: string }>(
    'SELECT email FROM pending_registrations WHERE email = $1',
    [email],
    'write'
  )
  if (!pending) {
    return res.status(401).json({ error: '请先注册获取验证码' })
  }
  const code = genCode()
  const expires = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString()
  await query(
    'UPDATE pending_registrations SET code = $1, expires = $2, created_at = now() WHERE email = $3',
    [code, expires, email],
    'write'
  )
  const mail = await sendVerificationEmail(email, code)
  res.json({ success: true, devCode: mail.devCode, message: '验证码已重新发送' })
})

authRouter.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email) {
    return res.status(400).json({ error: '邮箱必填' })
  }
  const user = await queryOne<{ id: string; email_verified: boolean }>(
    'SELECT id, email_verified FROM users WHERE email = $1',
    [email],
    'write'
  )
  // 防邮箱探测：无论是否存在，统一返回成功提示，仅真实已验证账号才发送
  if (!user || !user.email_verified) {
    return res.json({ success: true, message: '若该邮箱已注册，验证码将发送至你的邮箱' })
  }
  const code = genCode()
  const expires = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString()
  await query(
    'UPDATE users SET verify_code = $1, verify_code_expires = $2, updated_at = now() WHERE id = $3',
    [code, expires, user.id],
    'write'
  )
  const mail = await sendPasswordResetEmail(email, code)
  res.json({ success: true, devCode: mail.devCode, message: '验证码已发送，请查收邮箱' })
})

authRouter.post('/reset-password', async (req, res) => {
  const { email, code, password } = req.body
  if (!email || !code || !password || password.length < 6) {
    return res.status(400).json({ error: '邮箱、验证码和新密码（至少 6 位）必填' })
  }
  const user = await queryOne<{ id: string; verify_code: string; verify_code_expires: string }>(
    'SELECT id, verify_code, verify_code_expires FROM users WHERE email = $1',
    [email],
    'write'
  )
  if (!user) {
    return res.status(401).json({ error: '该邮箱未注册' })
  }
  if (!user.verify_code || user.verify_code !== code) {
    return res.status(400).json({ error: '验证码错误' })
  }
  if (new Date(user.verify_code_expires).getTime() < Date.now()) {
    return res.status(400).json({ error: '验证码已过期，请重新获取' })
  }
  const passwordHash = await bcrypt.hash(password, 10)
  await query(
    'UPDATE users SET password_hash = $2, verify_code = NULL, verify_code_expires = NULL, updated_at = now() WHERE id = $1',
    [user.id, passwordHash],
    'write'
  )
  res.json({ success: true, message: '密码已重置，请登录' })
})

// Google 一键登录：校验 Google 返回的 id_token，按邮箱合并账号，签发本站 JWT
authRouter.post('/google', async (req, res) => {
  const { idToken } = req.body
  const clientId = env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return res.status(500).json({ error: '服务器未配置 Google 登录，请稍后再试' })
  }
  if (!idToken) {
    return res.status(400).json({ error: '缺少 Google 凭据' })
  }
  try {
    const client = new OAuth2Client(clientId)
    const ticket = await client.verifyIdToken({ idToken, audience: clientId })
    const payload = ticket.getPayload()
    if (!payload || !payload.email) {
      return res.status(401).json({ error: 'Google 账号信息无效' })
    }

    const email = payload.email.toLowerCase()
    const name = payload.name || ''
    const avatar = payload.picture || ''

    // 按邮箱合并：已存在则信任 Google 的邮箱验证并补全资料，保留原密码
    const existing = await queryOne<{
      id: string
      name: string
      avatar_url: string
    }>(
      'SELECT id, name, avatar_url FROM users WHERE email = $1',
      [email],
      'write'
    )

    let userId: string
    if (existing) {
      userId = existing.id
      await query(
        'UPDATE users SET email_verified = true, name = COALESCE(NULLIF(name, $1), $2), avatar_url = COALESCE(NULLIF(avatar_url, $3), $4), updated_at = now() WHERE id = $5',
        ['', name, '', avatar, existing.id],
        'write'
      )
    } else {
      userId = crypto.randomUUID()
      await query(
        'INSERT INTO users (id, email, email_verified, name, avatar_url) VALUES ($1, $2, true, $3, $4)',
        [userId, email, name, avatar],
        'write'
      )
    }

    const user = await queryOne<{ name: string; avatar_url: string }>(
      'SELECT name, avatar_url FROM users WHERE id = $1',
      [userId],
      'write'
    )
    const token = generateToken(userId, email)
    res.json({
      success: true,
      token,
      user: { ...profile(userId, email, user?.name || '', user?.avatar_url || '', true), provider: 'google' },
    })
  } catch (e: any) {
    return res.status(401).json({ error: 'Google 登录验证失败，请重试' })
  }
})

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: '邮箱和密码必填' })
  }

  const user = await queryOne<{ id: string; email: string; password_hash: string; name: string; avatar_url: string; email_verified: boolean; phone_verified: boolean }>(
    'SELECT id, email, password_hash, name, avatar_url, email_verified, phone_verified FROM users WHERE email = $1',
    [email],
    'write'
  )
  if (!user) {
    return res.status(401).json({ error: '该邮箱未注册，请切换到「注册」创建账号' })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    return res.status(401).json({ error: '邮箱或密码错误' })
  }

  const token = generateToken(user.id, user.email)
  const verified = !!user.email_verified || !!user.phone_verified
  res.json({
    success: true,
    token,
    emailVerified: verified,
    user: profile(user.id, user.email, user.name, user.avatar_url, verified, !!user.phone_verified),
  })
})

// 发送手机短信验证码（注册 / 登录共用）
authRouter.post('/send-sms', async (req, res) => {
  const { phone } = req.body
  if (!PHONE_RE.test(phone || '')) {
    return res.status(400).json({ error: '请输入有效的手机号' })
  }

  let user = await queryOne<{ id: string }>('SELECT id FROM users WHERE phone = $1', [phone], 'write')
  if (!user) {
    await query(
      `INSERT INTO users (id, phone, phone_verified, email_verified) VALUES ($1, $2, false, false)`,
      [crypto.randomUUID(), phone],
      'write'
    )
  }
  const code = genCode()
  const expires = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString()
  await query(
    'UPDATE users SET sms_code = $1, sms_code_expires = $2, updated_at = now() WHERE phone = $3',
    [code, expires, phone],
    'write'
  )
  const sms = await sendSmsCode(phone, code)
  res.json({ success: true, devCode: sms.devCode, message: '验证码已发送，请查收手机短信' })
})

// 手机号验证码登录 / 注册（免密码：有则登录，无则创建）
authRouter.post('/phone-login', async (req, res) => {
  const { phone, code } = req.body
  if (!PHONE_RE.test(phone || '')) {
    return res.status(400).json({ error: '请输入有效的手机号' })
  }
  if (!code) {
    return res.status(400).json({ error: '验证码必填' })
  }

  const user = await queryOne<{ id: string; email: string; name: string; avatar_url: string; phone_verified: boolean; sms_code: string; sms_code_expires: string }>(
    'SELECT id, email, name, avatar_url, phone_verified, sms_code, sms_code_expires FROM users WHERE phone = $1',
    [phone],
    'write'
  )
  if (!user) {
    return res.status(401).json({ error: '请先获取验证码' })
  }
  if (!user.sms_code || user.sms_code !== code) {
    return res.status(400).json({ error: '验证码错误' })
  }
  if (new Date(user.sms_code_expires).getTime() < Date.now()) {
    return res.status(400).json({ error: '验证码已过期，请重新获取' })
  }
  await query(
    "UPDATE users SET phone_verified = true, sms_code = NULL, sms_code_expires = NULL, updated_at = now() WHERE id = $1",
    [user.id],
    'write'
  )
  const token = generateToken(user.id, user.email || user.phone)
  res.json({
    success: true,
    token,
    user: profile(user.id, user.email || user.phone, user.name, user.avatar_url, true, true),
  })
})

authRouter.get('/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const user = await queryOne<{ id: string; email: string; name: string; avatar_url: string; email_verified: boolean; phone_verified: boolean }>(
    'SELECT id, email, name, avatar_url, email_verified, phone_verified FROM users WHERE id = $1',
    [req.user!.uid],
    'write'
  )
  if (!user) {
    return res.status(404).json({ error: 'User not found' })
  }
  const verified = !!user.email_verified || !!user.phone_verified
  res.json(profile(user.id, user.email, user.name, user.avatar_url, verified, !!user.phone_verified))
})

authRouter.post('/logout', authMiddleware, async (_req: AuthenticatedRequest, res) => {
  res.json({ success: true })
})

// 注销账号：删除用户本人及其全部关联数据（生成历史等），满足应用商店的账号删除合规要求
authRouter.post('/delete-account', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const uid = req.user!.uid
  // 先清关联数据，再删账号
  await query('DELETE FROM histories WHERE user_id = $1', [uid], 'write')
  await query('DELETE FROM users WHERE id = $1', [uid], 'write')
  res.json({ success: true })
})

authRouter.post('/password', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { password } = req.body
  if (!password || password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' })
  }
  const passwordHash = await bcrypt.hash(password, 10)
  await query(
    'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
    [passwordHash, req.user!.uid],
    'write'
  )
  res.json({ success: true })
})
