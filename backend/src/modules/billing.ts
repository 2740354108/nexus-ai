import { Router } from 'express'
import crypto from 'crypto'
import { query, queryOne } from '../lib/db'
import { authMiddleware, AuthenticatedRequest } from './auth'
import { createPayment, verifyPaymentCallback, getPublicBaseUrl, PayChannel } from '../lib/payments'

export const billingRouter = Router()

// ============================================================
// 1. 数据表与套餐种子
// ============================================================

const DEFAULT_PLANS = [
  {
    id: 'free',
    name: '免费版',
    price_cents: 0,
    interval: 'month',
    sort_order: 0,
    limits: { chat: 50, image: 10, video: 2, music: 2 },
    features: ['基础 AI 对话', '每日免费额度', '本地技术栈接入', '云端配置同步'],
  },
  {
    id: 'pro',
    name: '专业版',
    price_cents: 3900,
    interval: 'month',
    sort_order: 1,
    limits: { chat: 2000, image: 200, video: 50, music: 50 },
    features: ['全部生成能力', '高额月度额度', '云端配置同步', '飞书回传', '优先支持'],
  },
  {
    id: 'biz',
    name: '企业版',
    price_cents: 19900,
    interval: 'month',
    sort_order: 2,
    limits: { chat: 20000, image: 2000, video: 500, music: 500 },
    features: ['团队多席位', '私有 MCP', '专属模型路由', '数据隔离', '定制集成'],
  },
]

/** 启动时确保表存在并写入默认套餐（幂等） */
export async function ensureBillingSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      interval TEXT NOT NULL DEFAULT 'month',
      limits JSONB NOT NULL DEFAULT '{}'::jsonb,
      features JSONB NOT NULL DEFAULT '[]'::jsonb,
      sort_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true
    )`,
    [],
    'migrate'
  )
  await query(
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TIMESTAMPTZ DEFAULT now(),
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(user_id)
    )`,
    [],
    'migrate'
  )
  await query(
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      channel TEXT NOT NULL DEFAULT 'wechat',
      status TEXT NOT NULL DEFAULT 'pending',
      out_trade_no TEXT,
      qr_code TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
    [],
    'migrate'
  )
  await query(
    `CREATE TABLE IF NOT EXISTS usage_counters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      feature TEXT NOT NULL,
      period TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(user_id, feature, period)
    )`,
    [],
    'migrate'
  )

  for (const p of DEFAULT_PLANS) {
    await query(
      `INSERT INTO plans (id, name, price_cents, interval, limits, features, sort_order, active)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, true)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         price_cents = EXCLUDED.price_cents,
         interval = EXCLUDED.interval,
         limits = EXCLUDED.limits,
         features = EXCLUDED.features,
         sort_order = EXCLUDED.sort_order`,
      [
        p.id,
        p.name,
        p.price_cents,
        p.interval,
        JSON.stringify(p.limits),
        JSON.stringify(p.features),
        p.sort_order,
      ],
      'write'
    )
  }
}

// ============================================================
// 2. 订阅 / 额度 / 用量 工具函数（供其他模块调用）
// ============================================================

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function getPlan(planId: string) {
  return queryOne<{ id: string; name: string; price_cents: number; interval: string; limits: any; features: any }>(
    'SELECT id, name, price_cents, interval, limits, features FROM plans WHERE id = $1',
    [planId],
    'read'
  )
}

export async function listPlans() {
  const { rows } = await query<{ id: string; name: string; price_cents: number; interval: string; limits: any; features: any }>(
    'SELECT id, name, price_cents, interval, limits, features FROM plans WHERE active = true ORDER BY sort_order ASC',
    [],
    'read'
  )
  return rows
}

/** 当前生效订阅（无则回退免费版） */
export async function getSubscription(userId: string) {
  const sub = await queryOne<{ id: string; plan_id: string; status: string; started_at: string; expires_at: string | null }>(
    `SELECT id, plan_id, status, started_at, expires_at
     FROM subscriptions WHERE user_id = $1 AND status = 'active'
     AND (expires_at IS NULL OR expires_at > now())`,
    [userId],
    'read'
  )
  const planId = sub?.plan_id || 'free'
  const plan = await getPlan(planId)
  return {
    subscribed: !!sub,
    subscription: sub || null,
    plan: plan || DEFAULT_PLANS[0],
    limits: (plan?.limits as any) || DEFAULT_PLANS[0].limits,
  }
}

export async function getLimits(userId: string): Promise<Record<string, number>> {
  const { limits } = await getSubscription(userId)
  return limits || {}
}

/** 检查某功能额度，返回剩余情况 */
export async function checkQuota(
  userId: string,
  feature: string
): Promise<{ ok: boolean; limit: number; used: number; remaining: number }> {
  const limits = await getLimits(userId)
  const limit = Number(limits[feature] ?? 0)
  if (limit <= 0) return { ok: true, limit: 0, used: 0, remaining: 0 } // 0 表示不限
  const period = currentPeriod()
  const row = await queryOne<{ count: number }>(
    'SELECT count FROM usage_counters WHERE user_id = $1 AND feature = $2 AND period = $3',
    [userId, feature, period],
    'read'
  )
  const used = row?.count || 0
  const remaining = Math.max(0, limit - used)
  return { ok: remaining > 0, limit, used, remaining }
}

/** 记录一次用量（默认 +1） */
export async function recordUsage(userId: string, feature: string, n = 1): Promise<void> {
  const period = currentPeriod()
  const existing = await queryOne<{ id: string; count: number }>(
    'SELECT id, count FROM usage_counters WHERE user_id = $1 AND feature = $2 AND period = $3',
    [userId, feature, period],
    'read'
  )
  if (existing) {
    await query(
      'UPDATE usage_counters SET count = count + $4, updated_at = now() WHERE id = $1',
      [existing.id, userId, feature, n],
      'write'
    )
  } else {
    await query(
      'INSERT INTO usage_counters (id, user_id, feature, period, count) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), userId, feature, period, n],
      'write'
    )
  }
}

async function activateSubscription(userId: string, planId: string): Promise<void> {
  const plan = await getPlan(planId)
  if (!plan) return
  const months = plan.interval === 'year' ? 12 : 1
  const expires = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000)
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM subscriptions WHERE user_id = $1',
    [userId],
    'read'
  )
  if (existing) {
    await query(
      `UPDATE subscriptions SET plan_id = $2, status = 'active', started_at = now(), expires_at = $3, created_at = now() WHERE id = $1`,
      [existing.id, planId, expires.toISOString()],
      'write'
    )
  } else {
    await query(
      `INSERT INTO subscriptions (id, user_id, plan_id, status, started_at, expires_at)
       VALUES ($1, $2, $3, 'active', now(), $4)`,
      [crypto.randomUUID(), userId, planId, expires.toISOString()],
      'write'
    )
  }
}

// ============================================================
// 3. 路由
// ============================================================

// 公开：套餐列表
billingRouter.get('/plans', async (_req, res) => {
  const plans = await listPlans()
  res.json({ success: true, plans })
})

// 我的订阅状态
billingRouter.get('/subscription', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const sub = await getSubscription(req.user!.uid)
  res.json({ success: true, ...sub })
})

// 我的用量（本月）
billingRouter.get('/usage', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { limits } = await getSubscription(req.user!.uid)
  const period = currentPeriod()
  const { rows } = await query<{ feature: string; count: number }>(
    'SELECT feature, count FROM usage_counters WHERE user_id = $1 AND period = $2',
    [req.user!.uid, period],
    'read'
  )
  const used: Record<string, number> = {}
  rows.forEach((r) => (used[r.feature] = r.count))
  const features = ['chat', 'image', 'video', 'music']
  const usage = features.map((f) => ({
    feature: f,
    limit: Number(limits[f] ?? 0),
    used: used[f] || 0,
    remaining: Math.max(0, (Number(limits[f] ?? 0)) - (used[f] || 0)),
  }))
  res.json({ success: true, period, usage })
})

// 单功能额度查询（前端发送前检查）
billingRouter.get('/quota', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const feature = (req.query.feature as string) || 'chat'
  const q = await checkQuota(req.user!.uid, feature)
  res.json({ success: true, feature, ...q })
})

// 上报一次用量（前端功能调用成功后调用）
billingRouter.post('/usage/record', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { feature, n } = req.body || {}
  if (!feature) return res.status(400).json({ error: '缺少 feature' })
  await recordUsage(req.user!.uid, feature, Number(n) || 1)
  res.json({ success: true })
})

// 创建订单（下单）
billingRouter.post('/checkout', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { planId, channel } = req.body || {}
  if (!planId) return res.status(400).json({ error: '请选择套餐' })
  const ch: PayChannel = channel === 'alipay' ? 'alipay' : 'wechat'
  const plan = await getPlan(planId)
  if (!plan || !plan.active) return res.status(400).json({ error: '套餐不存在或已下架' })

  // 免费套餐无需支付，直接激活
  if (plan.price_cents <= 0) {
    await activateSubscription(req.user!.uid, planId)
    return res.json({ success: true, free: true, planId })
  }

  const orderId = crypto.randomUUID()
  // 自动跟随当前访问的公网域名拼出回调与回跳地址
  const base = getPublicBaseUrl(req)
  const notifyUrl = base ? `${base}/api/billing/webhook/${ch}` : ''
  const returnUrl = base ? `${base}/` : ''
  const pay = await createPayment({
    channel: ch,
    orderId,
    amountCents: plan.price_cents,
    subject: `NEXUS LAB ${plan.name}`,
    notifyUrl,
    returnUrl,
  })
  await query(
    `INSERT INTO orders (id, user_id, plan_id, amount_cents, channel, status, out_trade_no, qr_code)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)`,
    [orderId, req.user!.uid, planId, plan.price_cents, ch, pay.outTradeNo, pay.qrCode],
    'write'
  )
  res.json({
    success: true,
    orderId,
    amount: plan.price_cents,
    channel: ch,
    qrCode: pay.qrCode,
    payUrl: pay.payUrl,
    mock: pay.mock,
    notifyUrl: pay.notifyUrl,
    returnUrl: pay.returnUrl,
  })
})

// 确认支付（开发期模拟；生产环境由微信/支付宝 webhook 触发）
billingRouter.post('/confirm', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { orderId } = req.body || {}
  if (!orderId) return res.status(400).json({ error: '缺少订单号' })
  const order = await queryOne<{ id: string; user_id: string; plan_id: string; status: string; channel: string }>(
    'SELECT id, user_id, plan_id, status, channel FROM orders WHERE id = $1',
    [orderId],
    'read'
  )
  if (!order) return res.status(404).json({ error: '订单不存在' })
  if (order.user_id !== req.user!.uid) return res.status(403).json({ error: '无权操作该订单' })
  if (order.status === 'paid') {
    const sub = await getSubscription(req.user!.uid)
    return res.json({ success: true, alreadyPaid: true, ...sub })
  }

  // 真实支付通道必须走 webhook，不允许客户端模拟
  const allowMock = process.env.ALLOW_MOCK_PAY !== 'false'
  if (!allowMock) {
    return res.status(402).json({ error: '等待支付通道回调确认' })
  }

  await activateSubscription(order.user_id, order.plan_id)
  await query(
    "UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1",
    [order.id],
    'write'
  )
  const sub = await getSubscription(req.user!.uid)
  res.json({ success: true, ...sub })
})

// 微信支付回调（占位：真实实现需验签后激活）
billingRouter.post('/webhook/wechat', async (req, res) => {
  const result = await verifyPaymentCallback('wechat', req.body || {})
  if (result.success && result.outTradeNo) {
    const order = await queryOne<{ id: string; user_id: string; plan_id: string; status: string }>(
      'SELECT id, user_id, plan_id, status FROM orders WHERE out_trade_no = $1',
      [result.outTradeNo],
      'read'
    )
    if (order && order.status !== 'paid') {
      await activateSubscription(order.user_id, order.plan_id)
      await query("UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1", [order.id], 'write')
    }
  }
  res.json({ success: true })
})

// 支付宝回调（占位）
billingRouter.post('/webhook/alipay', async (req, res) => {
  const result = await verifyPaymentCallback('alipay', req.body || {})
  if (result.success && result.outTradeNo) {
    const order = await queryOne<{ id: string; user_id: string; plan_id: string; status: string }>(
      'SELECT id, user_id, plan_id, status FROM orders WHERE out_trade_no = $1',
      [result.outTradeNo],
      'read'
    )
    if (order && order.status !== 'paid') {
      await activateSubscription(order.user_id, order.plan_id)
      await query("UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1", [order.id], 'write')
    }
  }
  res.json({ success: true })
})
