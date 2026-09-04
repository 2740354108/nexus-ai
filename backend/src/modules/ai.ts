import { Router, Request, Response } from 'express'
import { env } from '../config/env'
import { logger } from '../config/logger'

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

/** 单张图片数据上限（≈4.5MB 的 base64） */
const MAX_IMAGE_DATA_URL_LENGTH = 6_000_000

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

/** 模型候选链：前一个被限流/出错时自动切换下一个 */
function getModelChain(): string[] {
  const primary = env.AI_MODEL.trim()
  const rest = (env.AI_MODEL_FALLBACKS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [primary, ...rest.filter((m) => m !== primary)]
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

  const systemPrompt = mode === 'code' ? CODE_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT
  const temperature = mode === 'code' ? 0.3 : 0.7
  const maxTokens = mode === 'code' ? 4096 : 2048

  const chain = getModelChain()
  const failures: string[] = []

  for (const model of chain) {
    try {
      const content = await callUpstream(model, systemPrompt, userMessages, temperature, maxTokens)
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
  const isAllRateLimit = failures.every((f) => f.includes('429'))
  return res.status(502).json({
    success: false,
    error: isAllRateLimit
      ? '当前 AI 免费模型都在限流高峰（用的人太多），请稍等一两分钟再试'
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

  const systemPrompt = mode === 'code' ? CODE_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT
  const temperature = mode === 'code' ? 0.3 : 0.7
  const maxTokens = mode === 'code' ? 4096 : 2048

  const chain = getModelChain()
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
