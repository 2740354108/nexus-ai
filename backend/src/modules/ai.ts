import { Router, Request, Response } from 'express'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { verifyToken } from './auth'
import { checkQuota, recordUsage } from './billing'
import { isRelayMode, isOwnerToken, enforceRelayQuota, bumpRelayUsage, RELAY_DAILY_LIMIT } from './relay'
import { webSearch, buildWebContext } from '../lib/websearch'

export const aiRouter = Router()

const CHAT_SYSTEM_PROMPT = `你是 NEXUS LAB 官网上的 AI 助手。NEXUS LAB 是一家技术驱动的设计工作室，提供品牌设计、网站开发、AI 音乐生成（Suno 风格）、AI 图生视频（Wan 模型）等服务。

你的职责：
- 友善、专业地回答访客的各类问题，尤其是技术与设计相关话题
- 介绍 NEXUS LAB 的能力时可以适度发挥，但不要编造具体价格和案例
- 回答保持简洁，中文为主，代码和技术名词用英文
- 涉及代码时用 markdown 代码块输出`

const CODE_SYSTEM_PROMPT = `你是一位资深全栈工程师，擅长 TypeScript / React / Python / Java / Go 等主流技术。

职责：根据用户需求生成高质量、可直接使用的代码。

要求：
- 代码必须放在 markdown 代码块中，并标注语言
- 如果用户要求“运行/预览”一个完整程序（如小游戏、交互页面），必须把所有可运行代码放在**同一个**代码块里，不要拆成多个代码块；说明文字放在代码块之外
- 关键逻辑加简短中文注释
- 只输出必要内容：需求模糊时先给出最合理的实现
- 如需补充说明，说明放在代码块之外，保持简短`

/** 多模态消息片段：文本或图片（base64 data URL） */
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string | ContentPart[]
}

/** 单张图片数据上限（≈9MB 原图 / 12MB base64，覆盖 QQ 高清原图） */
const MAX_IMAGE_DATA_URL_LENGTH = 12_000_000

/** 校验数组型内容：只保留文本与合法图片片段 */
function sanitizeContentParts(raw: unknown): ContentPart[] {
  if (!Array.isArray(raw)) return []
  const parts: ContentPart[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    if (p.type === 'text' && typeof (p as any).text === 'string' && (p as any).text.trim()) {
      parts.push({ type: 'text', text: String((p as any).text).slice(0, 4000) })
    } else if (
      p.type === 'image_url' &&
      typeof (p as any)?.image_url?.url === 'string' &&
      (p as any).image_url.url.startsWith('data:image/') &&
      (p as any).image_url.url.length <= MAX_IMAGE_DATA_URL_LENGTH
    ) {
      parts.push({ type: 'image_url', image_url: { url: String((p as any).image_url.url) } })
    }
  }
  return parts
}

/** 文本模型候选链：前一个被限流/出错时自动切换下一个 */
function getModelChain(): string[] {
  const primary = env.AI_MODEL.trim()
  const rest = (env.AI_MODEL_FALLBACKS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [primary, ...rest.filter((m) => m !== primary)]
}

/** 视觉（识图）模型候选链 */
function getVisionModelChain(): string[] {
  const primary = (env.AI_VISION_MODEL || '').trim()
  const rest = (env.AI_VISION_FALLBACKS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const chain = [primary, ...rest.filter((m) => m !== primary)].filter(Boolean)
  // 兜底：若未配置任何视觉模型，退回文本链（不会报错，只是可能看不懂图）
  return chain.length ? chain : getModelChain()
}

/** 深度思考模型候选链：推理模型，先思考再答 */
function getThinkModelChain(): string[] {
  const primary = (env.AI_MODEL_THINK || '').trim()
  const rest = (env.AI_MODEL_FALLBACKS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const chain = [primary, ...rest.filter((m) => m !== primary)].filter(Boolean)
  return chain.length ? chain : getModelChain()
}

/** 对外暴露的模型档位（前端渲染选择器用） */
aiRouter.get('/models', (_req: Request, res: Response) => {
  res.json({
    success: true,
    models: [
      { id: 'chat', label: '普通模式', model: env.AI_MODEL, desc: '快速响应，日常问答' },
      { id: 'think', label: '深度思考', model: env.AI_MODEL_THINK, desc: '推理模型，复杂问题先思考再答' },
      { id: 'code', label: '代码生成', model: env.AI_MODEL, desc: '面向编程任务优化' },
    ],
  })
})

/** 判断一组消息里是否包含图片（仅需看用户消息中的 image_url 片段） */
function messagesContainImage(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      m.role === 'user' &&
      Array.isArray(m.content) &&
      m.content.some((p) => p.type === 'image_url')
  )
}

/** 取最后一条用户消息的纯文本，作为联网搜索的查询词 */
function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue
    const c = messages[i].content
    if (typeof c === 'string') return c.slice(0, 200)
    const t = c
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join(' ')
      .trim()
    if (t) return t.slice(0, 200)
  }
  return ''
}

/** 校验并裁剪消息列表（支持图片：仅最后一条用户消息允许携带图片） */
function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  const cleaned = raw
    .filter(
      (m): m is ChatMessage =>
        m &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        (typeof m.content === 'string' || Array.isArray(m.content))
    )
    .slice(-12) // 最多带 12 条上下文

  // 定位最后一条用户消息：只有它保留图片，历史消息一律降级为纯文本
  let lastUserIdx = -1
  for (let i = cleaned.length - 1; i >= 0; i--) {
    if (cleaned[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }

  const out: ChatMessage[] = []
  cleaned.forEach((m, i) => {
    if (typeof m.content === 'string') {
      const text = m.content.trim()
      if (text) out.push({ role: m.role, content: text.slice(0, 4000) })
      return
    }

    const parts = sanitizeContentParts(m.content)
    const hasImage = parts.some((p) => p.type === 'image_url')
    if (hasImage && i !== lastUserIdx) {
      const textOnly = parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      if (textOnly.length) out.push({ role: m.role, content: textOnly })
      return
    }
    if (parts.length) out.push({ role: m.role, content: parts })
  })

  return out
}

/**
 * GET /api/ai/status
 * 返回 AI 是否已配置（未配置时前端显示引导提示）。
 */
aiRouter.get('/status', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    configured: Boolean(env.AI_API_KEY),
    model: env.AI_MODEL,
  })
})

/**
 * POST /api/ai/web-search
 * 公开的纯网络搜索接口（无需登录、无需 AI Key），供前端原生端在调用自有模型前
 * 先取回实时资料。返回 results 与拼好的 context（可直接注入 system 提示）。
 */
aiRouter.post('/web-search', async (req: Request, res: Response) => {
  const q = String(req.body?.query || '')
    .trim()
    .slice(0, 200)
  if (!q) {
    return res.status(400).json({ success: false, error: 'query 不能为空' })
  }
  const results = await webSearch(q)
  return res.json({ success: true, results, context: buildWebContext(results) })
})

/** 调用 OpenAI 兼容接口，成功返回回复文本 */
async function callUpstream(
  model: string,
  systemPrompt: string,
  userMessages: ChatMessage[],
  temperature: number,
  maxTokens: number
): Promise<string> {
  const upstream = await fetch(`${env.AI_API_BASE.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.AI_API_KEY}`,
      'HTTP-Referer': 'https://nexus.ai',
      'X-Title': 'NEXUS',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...userMessages],
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(60_000),
  })

  const data: any = await upstream.json().catch(() => null)

  if (!upstream.ok) {
    const code = data?.error?.code || upstream.status
    const msg = data?.error?.message || `HTTP ${upstream.status}`
    const err = new Error(`${code}: ${msg}`)
    ;(err as any).statusCode = upstream.status
    throw err
  }

  const content: string | undefined = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('模型未返回内容')
  }
  return content
}

/**
 * 以流式（SSE）调用 OpenAI 兼容接口，逐块转发 token。
 * 通过 onToken 回调把上游增量内容实时吐出；start 前抛错（标记 beforeFirstToken）才允许换模型。
 */
async function streamUpstream(
  model: string,
  systemPrompt: string,
  userMessages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  onToken: (token: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const upstream = await fetch(`${env.AI_API_BASE.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.AI_API_KEY}`,
      'HTTP-Referer': 'https://nexus.ai',
      'X-Title': 'NEXUS',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...userMessages],
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
    signal,
  })

  if (!upstream.ok) {
    const data: any = await upstream.json().catch(() => null)
    const code = data?.error?.code || upstream.status
    const msg = data?.error?.message || `HTTP ${upstream.status}`
    const err = new Error(`${code}: ${msg}`)
    ;(err as any).statusCode = upstream.status
    ;(err as any).beforeFirstToken = true
    throw err
  }

  if (!upstream.body) throw new Error('上游未返回流')

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let nl: number
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const json: any = JSON.parse(payload)
        const token: string | undefined = json?.choices?.[0]?.delta?.content
        if (token) onToken(token)
      } catch {
        // 忽略不完整的分片
      }
    }
  }
}

/**
 * POST /api/ai/chat
 * OpenAI 兼容的对话代理，mode=chat 普通对话 / mode=code 代码生成。
 */
aiRouter.post('/chat', async (req: Request, res: Response) => {
  const { mode = 'chat' } = req.body || {}
  const userMessages = sanitizeMessages(req.body?.messages)

  if (userMessages.length === 0) {
    return res.status(400).json({ success: false, error: '消息不能为空' })
  }
  if (!env.AI_API_KEY) {
    return res.status(503).json({ success: false, error: 'AI 引擎尚未配置 API Key，请联系站长开通' })
  }

  // 登录用户：按套餐限额计量对话次数
  let cuid: string | null = null
  const cbearer = req.headers.authorization || ''
  const ctoken = cbearer.startsWith('Bearer ') ? cbearer.slice(7) : ''
  if (ctoken) {
    const payload = verifyToken(ctoken)
    if (payload) {
      cuid = payload.uid
      const quota = await checkQuota(cuid, 'chat')
      if (!quota.ok) {
        return res.status(402).json({
          success: false,
          error: `本月对话额度已用完（${quota.limit} 次），请升级套餐或等待下月恢复`,
          quota,
        })
      }
    }
  }

  let systemPrompt = mode === 'code' ? CODE_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT
  // 联网模式：先检索再回答
  if (req.body?.web) {
    const ctx = buildWebContext(await webSearch(lastUserText(userMessages)))
    if (ctx) systemPrompt += ctx
  }
  const temperature = mode === 'code' ? 0.3 : 0.7
  const maxTokens = mode === 'code' ? 4096 : 2048

  const chain = mode === 'think' ? getThinkModelChain() : getModelChain()
  const failures: string[] = []

  for (const model of chain) {
    try {
      const content = await callUpstream(model, systemPrompt, userMessages, temperature, maxTokens)
      if (cuid) void recordUsage(cuid, 'chat', 1)
      return res.json({ success: true, content, model })
    } catch (err: any) {
      const status = (err as any).statusCode
      const brief = `${model} → ${err?.message || '失败'}`
      failures.push(brief)
      // 429 限流 / 5xx 服务故障 → 换下一个模型；其他错误也继续尝试
      logger.warn({ model, status }, 'AI 模型调用失败，尝试下一个')
    }
  }

  logger.error({ failures }, 'AI 全部模型均失败')
  const quotaHit = failures.some((f) =>
    /free-models-per-day|per-day|daily|quota exceeded|额度/i.test(f)
  )
  const rateHit = failures.some((f) => /429|rate limit|limit/i.test(f))
  // 免费额度用尽：明确告知，避免被误解成"网络抖动、重试就好"
  if (quotaHit) {
    return res.status(429).json({
      success: false,
      error:
        'AI 免费额度已用完（免费模型每天 50 次）。给模型账户充值可提升到 1000 次/天，或等到明天自动重置。',
    })
  }
  return res.status(502).json({
    success: false,
    error: rateHit
      ? '当前 AI 模型都在限流高峰（用的人太多），请稍等一两分钟再试'
      : 'AI 服务暂时不可用，请稍后重试',
  })
})

/**
 * POST /api/ai/chat/stream
 * 流式对话代理（SSE）。逐字输出，体感像真人打字。
 * 事件：model（开始）、token（增量）、done（结束）、error（失败）。
 * 模型切换只在"尚未吐出首个 token"前发生；一旦开始输出即锁定该模型。
 */
aiRouter.post('/chat/stream', async (req: Request, res: Response) => {
  const { mode = 'chat' } = req.body || {}
  const userMessages = sanitizeMessages(req.body?.messages)

  if (userMessages.length === 0) {
    res.status(400).json({ success: false, error: '消息不能为空' })
    return
  }
  if (!env.AI_API_KEY) {
    res.status(503).json({ success: false, error: 'AI 引擎尚未配置 API Key，请联系站长开通' })
    return
  }

  // 公开中继模式（设置了 AI_BOT_TOKEN）：要求注册登录，未登录给 IP 试用额度
  let uid: string | null = null
  const bearer = req.headers.authorization || ''
  const sseToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : ''
  if (isRelayMode()) {
    const r = await enforceRelayQuota(req, res)
    if (r === null) return // 已被拒（响应已写出 401/429）
    uid = r
  } else if (sseToken) {
    const payload = verifyToken(sseToken)
    if (payload) {
      uid = payload.uid
      const quota = await checkQuota(uid, 'chat')
      if (!quota.ok) {
        res.status(402).json({
          success: false,
          error: `本月对话额度已用完（${quota.limit} 次），请升级套餐或等待下月恢复`,
          quota,
        })
        return
      }
    }
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (event: string, data: unknown) => {
    if (res.writableEnded || res.destroyed) return
    try {
      res.write(`event: ${event}\n`)
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    } catch {
      // 客户端已断开，忽略写入错误
    }
  }

  let systemPrompt = mode === 'code' ? CODE_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT
  // 联网模式：先检索再回答
  if (req.body?.web) {
    const ctx = buildWebContext(await webSearch(lastUserText(userMessages)))
    if (ctx) systemPrompt += ctx
  }
  const temperature = mode === 'code' ? 0.3 : 0.7
  const maxTokens = mode === 'code' ? 4096 : 2048

  const chain = mode === 'think' ? getThinkModelChain() : getModelChain()
  const failures: string[] = []
  let started = false

  // 客户端断开时中止上游请求（仅当响应尚未正常结束），避免无谓的流式拉取
  const ac = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) ac.abort()
  })

  const finish = () => {
    if (res.writableEnded) return
    res.end()
  }

  for (const model of chain) {
    try {
      await streamUpstream(
        model,
        systemPrompt,
        userMessages,
        temperature,
        maxTokens,
        (token) => {
          if (!started) {
            started = true
            send('model', { model })
          }
          send('token', { token })
        },
        ac.signal,
      )
      send('done', {})
      if (uid && !isRelayMode()) void recordUsage(uid, 'chat', 1)
      finish()
      return
    } catch (err: any) {
      if (started) {
        // 已经在输出，无法回退，直接报错结束
        send('error', { error: '生成中断，请稍后重试' })
        finish()
        break
      }
      const brief = `${model} → ${err?.message || '失败'}`
      failures.push(brief)
      logger.warn({ model, status: err?.statusCode }, 'AI 流式模型调用失败，尝试下一个')
    }
  }

  if (!started) {
    const isAllRateLimit = failures.every((f) => f.includes('429'))
    send('error', {
      error: isAllRateLimit
        ? '当前 AI 免费模型都在限流高峰（用的人太多），请稍等一两分钟再试'
        : 'AI 服务暂时不可用，请稍后重试',
    })
    finish()
  }
})

/**
 * POST /api/ai/v1/chat/completions
 * 标准 OpenAI 兼容接口，供外部 AI 网关（如 OpenClaw）把 NEXUS AI 当作模型后端调用。
 * 支持流式（OpenAI SSE delta 格式）与非流式。
 * 公开中继模式（AI_BOT_TOKEN 开启）：携带 AI_BOT_TOKEN 视为站长自有网关放行；
 * 普通用户需携带注册登录后的 JWT，按每日额度计量，否则拒绝。
 */
aiRouter.post('/v1/chat/completions', async (req: Request, res: Response) => {
  const body = req.body || {}
  const reqMessages: any[] = Array.isArray(body.messages) ? body.messages : []
  const stream = Boolean(body.stream)

  if (reqMessages.length === 0) {
    return res.status(400).json({ error: { message: 'messages 不能为空' } })
  }
  if (!env.AI_API_KEY) {
    return res.status(503).json({ error: { message: 'AI 引擎尚未配置 API Key，请联系站长开通' } })
  }

  // 公开中继模式（AI_BOT_TOKEN）鉴权与每日配额：
  // - 携带 AI_BOT_TOKEN 的调用视为站长自有网关，放行且不计配额
  // - 普通用户需携带注册登录后的 JWT，按每日额度计量
  // - 未登录 / 无效令牌一律拒绝，引导注册
  const botToken = process.env.AI_BOT_TOKEN
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (botToken && !isOwnerToken(token)) {
    const payload = verifyToken(token)
    if (!payload) {
      return res.status(401).json({
        error: {
          message: '请先注册并登录后使用（nexusai register），或填写自己的 AI Key 解锁无限使用',
        },
      })
    }
    const r = await bumpRelayUsage(payload.uid, RELAY_DAILY_LIMIT)
    if (!r.ok) {
      return res.status(429).json({
        error: { message: `今日额度已用完（${r.limit} 次），明天自动重置，或填写自己的 AI Key` },
      })
    }
  }

  // system 提示：请求自带则尊重请求的（可在 OpenClaw 里配置角色），否则套 NEXUS 人格
  let systemPrompt = CHAT_SYSTEM_PROMPT
  const sysMsg = reqMessages.find(
    (m) => m && m.role === 'system' && typeof m.content === 'string' && m.content.trim()
  )
  if (sysMsg) systemPrompt = String(sysMsg.content).slice(0, 2000)

  const userMessages = sanitizeMessages(reqMessages)
  const hasImage = messagesContainImage(userMessages)
  const chain = hasImage ? getVisionModelChain() : getModelChain()
  if (hasImage && !sysMsg) {
    systemPrompt =
      systemPrompt +
      '\n提示：用户可能发送了图片，请结合图片内容用简体中文回答；若只有图片没有文字，请主动描述图片主要内容。'
  }
  // 联网模式（外部网关默认不开启，需显式传 web:true）
  if (body.web) {
    const ctx = buildWebContext(await webSearch(lastUserText(userMessages)))
    if (ctx) systemPrompt += ctx
  }
  const failures: string[] = []

  // 非流式：直接返回 OpenAI 格式
  if (!stream) {
    for (const model of chain) {
      try {
        const content = await callUpstream(model, systemPrompt, userMessages, 0.7, 4000)
        return res.json({
          id: `chatcmpl-nexus-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        })
      } catch (err: any) {
        failures.push(`${model} → ${err?.message || '失败'}`)
        logger.warn({ model }, 'OpenAI 兼容接口调用失败，尝试下一个')
      }
    }
    const quotaHit = failures.some((f) =>
      /free-models-per-day|per-day|daily|quota exceeded|额度/i.test(f)
    )
    const rateHit = failures.some((f) => /429|rate limit/i.test(f))
    if (quotaHit) {
      return res.status(429).json({
        error: {
          message:
            'AI 免费额度已用完（免费模型每天 50 次）。给模型账户充值可提升到 1000 次/天，或等到明天自动重置。',
        },
      })
    }
    return res.status(502).json({
      error: {
        message: rateHit
          ? '当前 AI 模型都在限流高峰（用的人太多），请稍等一两分钟再试'
          : 'AI 服务暂时不可用，请稍后重试',
      },
    })
  }

  // 流式：返回 OpenAI SSE（delta 格式），OpenClaw 等网关原生支持
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const ac = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) ac.abort()
  })

  let started = false
  let usedModel = chain[0]
  for (const model of chain) {
    try {
      usedModel = model
      await streamUpstream(
        model,
        systemPrompt,
        userMessages,
        0.7,
        4000,
        (token) => {
          if (!started) started = true
          const chunk = {
            choices: [{ index: 0, delta: { content: token }, finish_reason: null }],
          }
          res.write(`data: ${JSON.stringify(chunk)}\n\n`)
        },
        ac.signal
      )
      res.write(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`
      )
      res.write('data: [DONE]\n\n')
      res.end()
      return
    } catch (err: any) {
      if (started) {
        res.write(`data: ${JSON.stringify({ error: { message: '生成中断，请稍后重试' } })}\n\n`)
        res.end()
        break
      }
      failures.push(`${model} → ${err?.message || '失败'}`)
      logger.warn({ model }, 'OpenAI 兼容流式调用失败，尝试下一个')
    }
  }
  if (!started) {
    res.write(`data: ${JSON.stringify({ error: { message: 'AI 服务暂时不可用' } })}\n\n`)
    res.end()
  }
})
