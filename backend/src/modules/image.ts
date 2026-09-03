import { Router, Request, Response } from 'express'
import { logger } from '../config/logger'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const imageRouter = Router()

/** 生成图片落盘目录 */
const IMAGE_DIR = path.join(process.cwd(), 'data', 'images')
fs.mkdirSync(IMAGE_DIR, { recursive: true })

interface GenerateResult {
  imageUrl: string
  width: number
  height: number
  prompt: string
}

/** 风格后缀：自动追加到用户描述后面 */
const STYLE_SUFFIX: Record<string, string> = {
  realistic: 'photorealistic, highly detailed, 8k uhd, professional photography',
  anime: 'anime style, vibrant colors, clean line art, detailed illustration',
  cyberpunk: 'cyberpunk, neon lights, futuristic city, synthwave atmosphere',
  oil: 'oil painting, rich brushstrokes, classical art style, canvas texture',
  pixel: 'pixel art, retro game style, 8-bit, dithering',
  fantasy: 'epic fantasy, dramatic lighting, cinematic composition, highly detailed',
}

/** 通过文件头识别图片格式 */
function detectExtension(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'
  if (buf.toString('ascii', 0, 8) === '\x89PNG\r\n\x1a\n') return 'png'
  if (buf.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

/**
 * 调用 Pollinations 免费文生图接口。
 * 不需要 API Key，沙箱可直连，出图快（通常 2-6 秒）。
 * 地址: https://image.pollinations.ai/prompt/{prompt}?...
 */
async function generateViaPollinations(
  prompt: string,
  style: string,
  width: number,
  height: number,
  seed?: number
): Promise<GenerateResult> {
  // Pollinations 对分辨率有限制，这里把宽高限制在合理区间并取 8 的倍数
  const w = Math.min(Math.max(Math.round(width / 8) * 8, 256), 1536)
  const h = Math.min(Math.max(Math.round(height / 8) * 8, 256), 1536)

  const suffix = STYLE_SUFFIX[style] || ''
  const finalPrompt = suffix ? `${prompt.trim()}, ${suffix}` : prompt.trim()

  const seedParam = seed !== undefined ? `&seed=${encodeURIComponent(seed)}` : ''
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}` +
    `?width=${w}&height=${h}&nologo=true&safe=true${seedParam}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'image/*',
      },
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`Pollinations 返回 ${resp.status}: ${text.slice(0, 200)}`)
    }

    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length < 1024) throw new Error('返回的图片数据过小，可能被拦截')

    const hash = crypto.randomBytes(4).toString('hex')
    const ext = detectExtension(buf) || 'png'
    const fileName = `${Date.now()}-${hash}.${ext}`
    fs.writeFileSync(path.join(IMAGE_DIR, fileName), buf)

    return {
      imageUrl: `/api/image/file/${fileName}`,
      width: w,
      height: h,
      prompt: prompt.trim(),
    }
  } finally {
    clearTimeout(timer)
  }
}

imageRouter.post('/generate', async (req: Request, res: Response) => {
  const {
    prompt,
    style = 'none',
    width = 768,
    height = 768,
    seed,
  } = req.body || {}

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    res.status(400).json({ success: false, error: '请提供画面描述 (prompt)' })
    return
  }

  try {
    const r = await generateViaPollinations(
      prompt.trim(),
      style,
      Number(width) || 768,
      Number(height) || 768,
      seed !== undefined ? Number(seed) : undefined
    )
    return res.json({
      success: true,
      provider: 'pollinations',
      ...r,
    })
  } catch (e: any) {
    logger.warn({ err: e?.message }, '图片生成失败')
    return res.status(503).json({
      success: false,
      error: e?.message || '图片生成失败，请稍后重试',
    })
  }
})

imageRouter.get('/file/:name', (req: Request, res: Response) => {
  const name = (req.params.name as string) || ''
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
    res.status(400).send('invalid filename')
    return
  }

  const filePath = path.join(IMAGE_DIR, name)
  if (!fs.existsSync(filePath)) {
    res.status(404).send('not found')
    return
  }

  const ext = path.extname(name).toLowerCase()
  const contentType =
    ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.mp4'
          ? 'video/mp4'
          : 'image/png'

  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'public, max-age=86400')
  fs.createReadStream(filePath).pipe(res)
})
