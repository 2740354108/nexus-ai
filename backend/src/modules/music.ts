import { Router, Request, Response } from 'express'
import { env } from '../config/env'
import { logger } from '../config/logger'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const musicRouter = Router()

/** 生成音频落盘目录（随后端进程持久化，前端通过 /api/music/file 访问） */
const MUSIC_DIR = path.join(process.cwd(), 'data', 'music')
fs.mkdirSync(MUSIC_DIR, { recursive: true })

interface GenerateResult {
  audioUrl: string
  duration: number
}

/**
 * Provider 0（最高优先）: ACMusic.ai 云端 ACE-Step（OpenAI 兼容音频接口）
 *
 * POST https://api.acemusic.ai/v1/chat/completions
 * 文本直接生成音乐，音频以 data URI（base64）内联返回。
 * 需配置 ACEMUSIC_API_KEY（来自 acemusic.ai/api-key）。
 * 生成耗时较长（通常 15-40 秒），故设置 110 秒请求超时。
 */
async function generateViaAceStep(prompt: string): Promise<GenerateResult> {
  const key = env.ACEMUSIC_API_KEY
  if (!key) throw new Error('未配置 ACEMUSIC_API_KEY')

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    // 浏览器风格请求头，避免 Cloudflare 对 undici 默认请求指纹返回 504
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  }
  const body = JSON.stringify({
    model: 'acemusic/acestep-v15-turbo',
    modalities: ['audio'],
    messages: [{ role: 'user', content: prompt.slice(0, 1000) }],
  })

  // Cloudflare 自身的网关超时约 60 秒，单次请求一旦超过 ATTEMPT_TIMEOUT 基本已被判死。
  // 所以只在「快速失败」时才值得重试；慢超时不再空等第二轮，避免让用户干等两分钟。
  const ATTEMPT_TIMEOUT = 52000
  const RETRY_BUDGET = 15000 // 首次失败耗时超过它，就认为重试也来不及
  const started = Date.now()

  let resp: Awaited<ReturnType<typeof fetch>> | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT)
    try {
      resp = await fetch('https://api.acemusic.ai/v1/chat/completions', {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
    } catch (e: any) {
      clearTimeout(timer)
      const worthRetry = attempt === 0 && Date.now() - started < RETRY_BUDGET
      if (!worthRetry) throw new Error(`ACMusic 请求失败: ${e?.message}`)
      await new Promise((r) => setTimeout(r, 1200))
      continue
    }
    clearTimeout(timer)

    if (resp.ok) break

    const text = await resp.text().catch(() => '')
    const worthRetry =
      attempt === 0 && resp.status >= 500 && Date.now() - started < RETRY_BUDGET
    if (!worthRetry) {
      throw new Error(`ACMusic 返回 ${resp.status}: ${text.slice(0, 200)}`)
    }
    await new Promise((r) => setTimeout(r, 1200))
  }
  if (!resp) throw new Error('ACMusic 未收到响应')

  const data: any = await resp.json().catch(() => null)
  const audioArr: any[] = data?.choices?.[0]?.message?.audio
  const url: string | undefined = audioArr?.[0]?.audio_url?.url
  if (!url || !url.startsWith('data:')) {
    throw new Error('ACMusic 未返回音频数据')
  }

  const base64 = url.split(',')[1] ?? ''
  const buf = Buffer.from(base64, 'base64')
  if (buf.length < 1000) throw new Error('ACMusic 返回音频内容过小')

  const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  const fileName = `${id}.mp3`
  fs.writeFileSync(path.join(MUSIC_DIR, fileName), buf)

  // ACMusic 输出为 128kbps MP3，按此估算时长
  const duration = Math.max(1, Math.round(buf.length / (128000 / 8)))

  return { audioUrl: `/api/music/file/${fileName}`, duration }
}

/**
 * Provider 1（优先）: Hugging Face  Inference API — facebook/musicgen-small
 *
 * 文本直接生成音乐，返回原始音频字节（FLAC）。无 token 也可匿名调用，
 * 但速率受限；配置 HF_API_KEY 后更稳定。模型冷启动会返回 503，自动重试。
 */
async function generateViaHuggingFace(prompt: string): Promise<GenerateResult> {
  const model = env.HF_MUSIC_MODEL || 'facebook/musicgen-small'
  const url = `https://api-inference.huggingface.co/models/${model}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'audio/*',
  }
  if (env.HF_API_KEY) headers['Authorization'] = `Bearer ${env.HF_API_KEY}`

  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs: prompt.slice(0, 500) }),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      // 模型冷启动 / 限流：稍后重试
      if (resp.status === 503 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 5000))
        continue
      }
      throw new Error(`HuggingFace 返回 ${resp.status}: ${text.slice(0, 200)}`)
    }

    const ct = resp.headers.get('content-type') || ''
    // 返回 JSON 通常是错误页，且其可能夹带音频，保险起见仅在明显为 JSON 时判错
    if (ct.includes('application/json')) {
      const j = (await resp.json().catch(() => ({}))) as any
      lastErr = j?.error || JSON.stringify(j).slice(0, 200)
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 4000))
        continue
      }
      throw new Error(`HuggingFace: ${lastErr}`)
    }

    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length < 100) throw new Error('HuggingFace 返回内容过小')

    const ext = ct.includes('wav') ? 'wav' : 'flac'
    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const fileName = `${id}.${ext}`
    fs.writeFileSync(path.join(MUSIC_DIR, fileName), buf)

    // MusicGen 默认输出约 10 秒，前端拿到元数据后会自动校正时长展示
    return { audioUrl: `/api/music/file/${fileName}`, duration: 10 }
  }
  throw new Error(lastErr || 'HuggingFace 生成失败')
}

/**
 * Provider 2（沙箱可达）: Replicate 托管的 Meta MusicGen（meta/musicgen）
 *
 * 文本生成音乐，返回音频文件 URL。需配置 REPLICATE_API_TOKEN；
 * 注册即送免费额度，超出按 GPU 时长计费（一首约几分钱）。
 */
async function generateViaReplicate(prompt: string): Promise<GenerateResult> {
  const token = env.REPLICATE_API_TOKEN
  if (!token) throw new Error('未配置 REPLICATE_API_TOKEN')

  const createResp = await fetch(
    'https://api.replicate.com/v1/models/meta/musicgen/predictions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ input: { text: prompt.slice(0, 500) } }),
    }
  )

  if (!createResp.ok) {
    const text = await createResp.text().catch(() => '')
    throw new Error(`Replicate 返回 ${createResp.status}: ${text.slice(0, 200)}`)
  }

  const pred: any = await createResp.json()
  const id: string | undefined = pred?.id
  if (!id) throw new Error('Replicate 未返回预测 ID')

  // 轮询直到完成
  let status: any = pred
  for (let i = 0; i < 80; i++) {
    if (status?.status === 'succeeded') break
    await new Promise((r) => setTimeout(r, 3000))
    const pollResp = await fetch(
      `https://api.replicate.com/v1/predictions/${id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    status = await pollResp.json()
    if (status?.status === 'failed' || status?.status === 'canceled') {
      throw new Error(`Replicate 生成失败: ${status?.error || '未知错误'}`)
    }
  }
  if (status?.status !== 'succeeded') {
    throw new Error('Replicate 生成超时，请稍后重试')
  }

  const out = status?.output
  const audioUrl: string | undefined = Array.isArray(out) ? out[0] : out
  if (!audioUrl || typeof audioUrl !== 'string') {
    throw new Error('Replicate 未返回音频地址')
  }

  // 下载音频落盘，统一由 /api/music/file 托管
  const audioResp = await fetch(audioUrl)
  const buf = Buffer.from(await audioResp.arrayBuffer())
  const lower = audioUrl.split('?')[0].toLowerCase()
  const ext = lower.endsWith('.mp3') ? 'mp3' : 'wav'
  const fileName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`
  fs.writeFileSync(path.join(MUSIC_DIR, fileName), buf)

  return { audioUrl: `/api/music/file/${fileName}`, duration: 10 }
}

/** Provider 3: aimusicapi.org（Suno chirp 模型，异步任务模式） */
async function generateViaAimusicapi(prompt: string): Promise<GenerateResult> {
  const key = env.AIMUSIC_API_KEY
  if (!key) throw new Error('aimusicapi 未配置')

  const genResp = await fetch('https://aimusicapi.org/api/v2/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: env.AIMUSIC_MODEL,
      gpt_description_prompt: prompt.slice(0, 400),
      make_instrumental: false,
    }),
  })

  const genData: any = await genResp.json()
  if (genData?.code !== 200 || !genData?.data?.task_id) {
    throw new Error(genData?.message || `aimusicapi 发起失败 (${genData?.code ?? genResp.status})`)
  }
  const workId: string = genData.data.task_id

  const maxAttempts = 40
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 6000))
    const feedResp = await fetch(`https://aimusicapi.org/api/v2/feed?workId=${encodeURIComponent(workId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const feed: any = await feedResp.json()
    const clips: any[] = feed?.data?.response_data || []
    const last = clips[clips.length - 1]
    if (last?.fail_message) throw new Error(`生成被拒绝: ${last.fail_message}`)
    const done = clips.find((c) => c.extra_message === 'All generated successfully.' && c.audio_url)
    if (done) {
      return { audioUrl: done.audio_url, duration: parseDuration(done.duration) || 30 }
    }
  }
  throw new Error('aimusicapi 生成超时')
}

function parseDuration(d: unknown): number {
  if (typeof d === 'number') return Math.round(d)
  if (typeof d === 'string') {
    const m = d.match(/(\d+):(\d+)/)
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
    const n = parseInt(d, 10)
    if (!isNaN(n)) return n
  }
  return 0
}

/** Provider 3: MiniMax（同步返回） */
async function generateViaMinimax(prompt: string, isInstrumental: boolean): Promise<GenerateResult> {
  const key = env.MINIMAX_API_KEY
  if (!key) throw new Error('minimax 未配置')

  const body: Record<string, unknown> = {
    model: env.MINIMAX_MODEL,
    prompt: prompt.slice(0, 2000),
    is_instrumental: isInstrumental,
    output_format: 'url',
    stream: false,
  }
  if (!isInstrumental) body.lyrics_optimizer = true

  const resp = await fetch(env.MINIMAX_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  })

  const data: any = await resp.json()
  if (!resp.ok || data?.base_resp?.status_code !== 0) {
    throw new Error(data?.base_resp?.status_msg || `MiniMax 返回 ${resp.status}`)
  }
  const audioUrl: string | undefined = data?.data?.audio
  if (!audioUrl) throw new Error('MiniMax 未返回音频')
  return {
    audioUrl,
    duration: Math.round((data?.extra_info?.music_duration || 30000) / 1000),
  }
}

musicRouter.post('/generate', async (req: Request, res: Response) => {
  const { prompt, isInstrumental = false } = req.body || {}
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ success: false, error: '请提供音乐描述 (prompt)' })
  }

  const errors: string[] = []

  // Provider 0（最高优先）: ACMusic.ai 云端 ACE-Step
  if (env.ACEMUSIC_API_KEY) {
    try {
      const r = await generateViaAceStep(prompt)
      return res.json({ success: true, provider: 'acemusic', ...r })
    } catch (e: any) {
      errors.push(`acemusic: ${e?.message}`)
      logger.warn({ err: e?.message }, 'ACMusic 生成失败，尝试下一个 provider')
    }
  }

  // Provider 1（优先）: Hugging Face MusicGen
  try {
    const r = await generateViaHuggingFace(prompt)
    return res.json({ success: true, provider: 'huggingface', ...r })
  } catch (e: any) {
    errors.push(`huggingface: ${e?.message}`)
    logger.warn({ err: e?.message }, 'Hugging Face 生成失败，尝试下一个 provider')
  }

  // Provider 2: Replicate（沙箱可达，需 token）
  if (env.REPLICATE_API_TOKEN) {
    try {
      const r = await generateViaReplicate(prompt)
      return res.json({ success: true, provider: 'replicate', ...r })
    } catch (e: any) {
      errors.push(`replicate: ${e?.message}`)
      logger.warn({ err: e?.message }, 'Replicate 生成失败，尝试下一个 provider')
    }
  }

  // Provider 3: aimusicapi（Suno 效果更好）
  if (env.AIMUSIC_API_KEY) {
    try {
      const r = await generateViaAimusicapi(prompt)
      return res.json({ success: true, provider: 'aimusicapi', ...r })
    } catch (e: any) {
      errors.push(`aimusicapi: ${e?.message}`)
      logger.warn({ err: e?.message }, 'aimusicapi 生成失败，尝试下一个 provider')
    }
  }

  // Provider 4: MiniMax
  if (env.MINIMAX_API_KEY) {
    try {
      const r = await generateViaMinimax(prompt, isInstrumental === true)
      return res.json({ success: true, provider: 'minimax', ...r })
    } catch (e: any) {
      errors.push(`minimax: ${e?.message}`)
      logger.warn({ err: e?.message }, 'minimax 生成失败')
    }
  }

  return res.status(503).json({
    success: false,
    error: errors.length ? errors.join('; ') : '服务器未配置任何音乐生成 API',
    fallback: 'local',
  })
})

/**
 * 托管制定的音频文件（Hugging Face 落盘产物）。
 * 前端 <audio> 同源请求，经由 Vite 代理到后端。
 */
musicRouter.get('/file/:name', (req: Request, res: Response) => {
  const name = (req.params.name as string) || ''
  // 防目录穿越
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
    res.status(400).send('invalid filename')
    return
  }
  const filePath = path.join(MUSIC_DIR, name)
  if (!fs.existsSync(filePath)) {
    res.status(404).send('not found')
    return
  }
  const lower = name.toLowerCase()
  const ct = lower.endsWith('.mp3')
    ? 'audio/mpeg'
    : lower.endsWith('.flac')
      ? 'audio/flac'
      : 'audio/wav'
  res.setHeader('Content-Type', ct)
  res.setHeader('Accept-Ranges', 'bytes')
  fs.createReadStream(filePath).pipe(res)
})
