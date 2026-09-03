import { Router, Request, Response } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { fileURLToPath } from 'url'
import { env } from '../config/env'
import { logger } from '../config/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const videoRouter = Router()

// 工作流模板（图生视频 WanImageToVideo）
const I2V_WORKFLOW = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'comfy_workflow_i2v.json'), 'utf-8')
)

// 工作流模板（文生视频 WanTextToVideo）
const T2V_WORKFLOW = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'comfy_workflow_t2v.json'), 'utf-8')
)

// 内存存储上传的图片
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

/** 统一请求头：跳过 ngrok 免费版浏览器警告页 */
const COMFY_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

/** 隧道地址可在线更新（ngrok 免费版每次重启换网址），持久化到本地文件 */
const COMFY_CONFIG_PATH = path.join(process.cwd(), 'comfy-config.json')
let cachedComfyUrl: string | null = null

function getComfyUrl(): string {
  if (cachedComfyUrl) return cachedComfyUrl
  try {
    const cfg = JSON.parse(fs.readFileSync(COMFY_CONFIG_PATH, 'utf-8'))
    if (typeof cfg.url === 'string' && cfg.url.startsWith('http')) {
      const url: string = cfg.url.replace(/\/+$/, '')
      cachedComfyUrl = url
      return url
    }
  } catch {
    /* 文件不存在时回退到 .env 配置 */
  }
  return env.COMFYUI_URL.replace(/\/+$/, '')
}

function setComfyUrl(url: string): void {
  fs.writeFileSync(COMFY_CONFIG_PATH, JSON.stringify({ url: url.replace(/\/+$/, '') }, null, 2))
  cachedComfyUrl = url.replace(/\/+$/, '')
}

/** 探测隧道连通性 */
async function probeTunnel(baseUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl}/system_stats`, {
      headers: COMFY_HEADERS,
      signal: AbortSignal.timeout(8000),
    })
    return resp.ok
  } catch {
    return false
  }
}

/** 带重试的 fetch：ngrok 免费隧道偶尔闪断，自动重试可大幅提高成功率 */
async function fetchWithRetry(
  label: string,
  url: string,
  init: RequestInit = {},
  maxAttempts = 3
): Promise<globalThis.Response> {
  let lastErr: Error | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) })
      // 5xx 视为临时故障（隧道闪断），重试
      if (resp.status >= 500 && attempt < maxAttempts) {
        logger.warn({ label, attempt, status: resp.status }, `${label} 返回 ${resp.status}，重试中`)
        await new Promise((r) => setTimeout(r, 2000 * attempt))
        continue
      }
      return resp
    } catch (err: any) {
      lastErr = err
      if (attempt < maxAttempts) {
        logger.warn({ label, attempt, err: err?.message }, `${label} 请求失败，重试中`)
        await new Promise((r) => setTimeout(r, 2000 * attempt))
      }
    }
  }
  throw new Error(
    `${label} 连续失败：${lastErr?.message || '隧道不可用'}。请确认本地 ComfyUI 和 ngrok 都在运行`
  )
}

/** 把用户上传的图片上传到 ComfyUI 的 /upload/image */
async function uploadImageToComfy(imageBuffer: Buffer, filename: string): Promise<void> {
  const form = new FormData()
  const blob = new Blob([imageBuffer])
  form.append('image', blob, filename)
  form.append('overwrite', 'true')
  const resp = await fetchWithRetry('图片上传', `${getComfyUrl()}/upload/image`, {
    method: 'POST',
    headers: COMFY_HEADERS,
    body: form,
  })
  if (!resp.ok) {
    throw new Error(
      resp.status === 502 || resp.status === 503
        ? '无法连接你本地的 ComfyUI：请检查 ngrok 是否还在运行、网址是否变了'
        : `图片上传失败: ${resp.status}`
    )
  }
}

/** 提交 prompt 到 ComfyUI，返回 prompt_id */
async function submitPrompt(workflow: Record<string, unknown>): Promise<string> {
  const resp = await fetchWithRetry('任务提交', `${getComfyUrl()}/prompt`, {
    method: 'POST',
    headers: { ...COMFY_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  })
  let data: any
  try {
    data = await resp.json()
  } catch {
    throw new Error(
      "生成引擎返回了非预期响应（通常是 ngrok 地址变了或 ComfyUI 未运行），请点击右下角“本地引擎”重新连接"
    )
  }
  if (!resp.ok || data.error) {
    throw new Error(data.error?.message || `提交失败: ${resp.status}`)
  }
  return data.prompt_id
}

/** 查询 ComfyUI history，返回当前任务状态和视频 URL */
async function queryHistory(promptId: string): Promise<
  | { status: 'running' }
  | { status: 'done'; videoUrl: string }
  | { status: 'error'; error: string }
> {
  const resp = await fetchWithRetry('状态查询', `${getComfyUrl()}/history/${promptId}`, {
    headers: COMFY_HEADERS,
  }, 1)
  const data: any = await resp.json()
  const entry = data?.[promptId]

  if (!entry) {
    return { status: 'running' }
  }

  const status = entry.status
  if (status?.status_str === 'error') {
    const msgs = status.messages?.filter((m: any) => m[0] === 'execution_error')
    const err = msgs?.[0]?.[1]
    return { status: 'error', error: err?.exception_message || 'ComfyUI 执行出错' }
  }

  const outputs = entry.outputs || {}
  for (const nodeId of Object.keys(outputs)) {
    const node = outputs[nodeId]
    const files: any[] = node.gifs || node.images || []
    for (const f of files) {
      const filename: string = f.filename
      if (/\.(mp4|webm|gif|mov)$/i.test(filename)) {
        const subfolder = f.subfolder || ''
        // 通过本服务转发，避免 ngrok 拦截页导致浏览器无法直接播放
        const videoUrl = `/api/video/file?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`
        return { status: 'done', videoUrl }
      }
    }
  }

  return { status: 'running' }
}

/**
 * POST /api/video/generate
 * 提交图生视频任务，立即返回 promptId，不等待生成完成。
 */
videoRouter.post('/generate', upload.single('image'), async (req: Request, res: Response) => {
  const { prompt, mode } = req.body || {}
  const isT2V = mode === 't2v'

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ success: false, error: '请提供视频描述 (prompt)' })
  }

  // 文生视频：纯文本驱动，无需图片
  if (isT2V) {
    try {
      const workflow: Record<string, any> = JSON.parse(JSON.stringify(T2V_WORKFLOW))
      // 找到 KSampler 正向链接的 CLIPTextEncode 节点，替换为正向提示词；
      // 负向提示词保留工作流自带的中文反例描述
      let targetNode: string | null = null
      for (const nodeId of Object.keys(workflow)) {
        const node = workflow[nodeId]
        if (/KSampler/.test(node.class_type) && Array.isArray(node.inputs?.positive)) {
          targetNode = String((node.inputs as any).positive[0])
          break
        }
      }
      if (!targetNode || workflow[targetNode]?.class_type !== 'CLIPTextEncode') {
        targetNode = Object.keys(workflow).find((k) => workflow[k].class_type === 'CLIPTextEncode') || null
      }
      if (targetNode && workflow[targetNode]?.class_type === 'CLIPTextEncode') {
        workflow[targetNode].inputs.text = prompt.trim().slice(0, 500)
      }

      const promptId = await submitPrompt(workflow)
      logger.info({ promptId, mode: 't2v' }, '文生视频任务已提交')
      return res.json({ success: true, promptId, status: 'submitted' })
    } catch (err: any) {
      logger.error({ err: err?.message }, '文生视频提交失败')
      return res.status(500).json({ success: false, error: err?.message || '提交失败' })
    }
  }

  // 图生视频：需要上传图片
  if (!req.file) {
    return res.status(400).json({ success: false, error: '请上传一张图片' })
  }

  try {
    // 1) 上传图片到 ComfyUI
    const originalExt = path.extname(req.file.originalname) || '.png'
    const comfyFilename = `gen_${Date.now()}${originalExt}`
    await uploadImageToComfy(req.file.buffer, comfyFilename)

    // 2) 深拷贝工作流并替换输入图片文件名 + 文本提示词
    const workflow: Record<string, any> = JSON.parse(JSON.stringify(I2V_WORKFLOW))
    for (const nodeId of Object.keys(workflow)) {
      const node = workflow[nodeId]
      if (node.class_type === 'LoadImage' && node.inputs.image) {
        node.inputs.image = comfyFilename
      }
      if (node.class_type === 'CLIPTextEncode' && typeof node.inputs.text === 'string' && node.inputs.text.trim().length > 0) {
        node.inputs.text = prompt.trim().slice(0, 500)
      }
    }

    // 3) 提交任务，立即返回 promptId
    const promptId = await submitPrompt(workflow)
    logger.info({ promptId }, '视频生成任务已提交')

    return res.json({ success: true, promptId, status: 'submitted' })
  } catch (err: any) {
    logger.error({ err: err?.message }, '图生视频提交失败')
    return res.status(500).json({ success: false, error: err?.message || '提交失败' })
  }
})

/**
 * GET /api/video/status/:promptId
 * 轮询查询视频生成状态。
 */
videoRouter.get('/status/:promptId', async (req: Request, res: Response) => {
  const { promptId } = req.params
  try {
    const result = await queryHistory(String(promptId))
    return res.json({ success: true, promptId, ...result })
  } catch (err: any) {
    logger.error({ err: err?.message, promptId }, '查询视频状态失败')
    return res.status(500).json({ success: false, error: err?.message || '查询失败' })
  }
})

/**
 * GET /api/video/tunnel
 * 查询当前 ComfyUI 隧道地址与连通状态。
 */
videoRouter.get('/tunnel', async (_req: Request, res: Response) => {
  const url = getComfyUrl()
  const online = await probeTunnel(url)
  return res.json({ success: true, url, online })
})

/**
 * POST /api/video/tunnel
 * 更新 ComfyUI 隧道地址（ngrok 免费版重启后网址会变）。
 */
videoRouter.post('/tunnel', async (req: Request, res: Response) => {
  const { url } = req.body || {}
  if (!url || typeof url !== 'string' || !/^https?:\/\/.+/i.test(url.trim())) {
    return res.status(400).json({ success: false, error: '请提供合法的隧道地址（以 https:// 开头）' })
  }
  const clean = url.trim().replace(/\/+$/, '')
  const online = await probeTunnel(clean)
  if (!online) {
    return res.status(400).json({
      success: false,
      error: '这个地址连不上 ComfyUI，请确认 ngrok 正在运行、地址复制完整（Forwarding 那一行的 https 地址）',
    })
  }
  setComfyUrl(clean)
  logger.info({ url: clean }, 'ComfyUI 隧道地址已更新')
  return res.json({ success: true, url: clean, online: true })
})

/**
 * GET /api/video/file
 * 转发 ComfyUI 生成的视频文件，浏览器可直接播放。
 */
videoRouter.get('/file', async (req: Request, res: Response) => {
  const { filename, subfolder = '', type = 'output' } = req.query as Record<string, string>
  if (!filename) {
    return res.status(400).json({ success: false, error: '缺少 filename 参数' })
  }
  const viewUrl = `${getComfyUrl()}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`
  try {
    // 透传 Range 请求头，支持视频拖动进度条
    const headers: Record<string, string> = { ...COMFY_HEADERS }
    if (req.headers.range) headers['Range'] = req.headers.range

    const upstream = await fetch(viewUrl, { headers })
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ success: false, error: `获取视频失败: ${upstream.status}` })
    }

    const contentType = upstream.headers.get('content-type') || 'video/mp4'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Accept-Ranges', 'bytes')
    const contentRange = upstream.headers.get('content-range')
    if (contentRange) {
      res.status(upstream.status)
      res.setHeader('Content-Range', contentRange)
    }
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) res.setHeader('Content-Length', contentLength)

    Readable.fromWeb(upstream.body as any).pipe(res)
    return
  } catch (err: any) {
    logger.error({ err: err?.message, filename }, '转发视频文件失败')
    return res.status(500).json({ success: false, error: err?.message || '转发失败' })
  }
})
