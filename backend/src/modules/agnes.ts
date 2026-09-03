import { Router, Request, Response } from 'express'
import { env } from '../config/env'
import { logger } from '../config/logger'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import multer from 'multer'

export const agnesRouter = Router()

/** 图片落盘目录（复用已有图片服务目录，便于 /api/image/file 静态读取） */
const IMAGE_DIR = path.join(process.cwd(), 'data', 'images')
fs.mkdirSync(IMAGE_DIR, { recursive: true })

const AGNES_BASE = env.AGNES_API_BASE.replace(/\/$/, '')
const AGNES_ROOT = AGNES_BASE.replace(/\/v1$/, '')
const AGNES_KEY = env.AGNES_API_KEY

function agnesHeaders() {
  return {
    Authorization: `Bearer ${AGNES_KEY}`,
    'Content-Type': 'application/json',
  }
}

/** 通过文件头识别图片格式 */
function detectExtension(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'
  if (buf.toString('ascii', 0, 8) === '\x89PNG\r\n\x1a\n') return 'png'
  if (buf.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

function getPublicUrl(req: Request, fileName: string): string {
  const host = req.get('host') || `localhost:${env.PORT}`
  const protocol = req.protocol === 'https' ? 'https' : 'http'
  return `${protocol}://${host}${env.API_PREFIX}/image/file/${fileName}`
}

/** 把用户上传的图片保存到本地并返回可访问 URL */
async function saveUpload(req: Request, buf: Buffer): Promise<{ fileName: string; url: string }> {
  const hash = crypto.randomBytes(4).toString('hex')
  const ext = detectExtension(buf) || 'png'
  const fileName = `${Date.now()}-${hash}.${ext}`
  fs.writeFileSync(path.join(IMAGE_DIR, fileName), buf)
  return { fileName, url: getPublicUrl(req, fileName) }
}

/** 从 Agnes 下载结果图片并本地落盘 */
async function downloadResult(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) throw new Error(`download failed: ${resp.status}`)
    const buf = Buffer.from(await resp.arrayBuffer())
    const hash = crypto.randomBytes(4).toString('hex')
    const ext = detectExtension(buf) || 'png'
    const fileName = `agnes-${Date.now()}-${hash}.${ext}`
    fs.writeFileSync(path.join(IMAGE_DIR, fileName), buf)
    return `${env.API_PREFIX}/image/file/${fileName}`
  } finally {
    clearTimeout(timer)
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

/* ------------------------------------------------------------------ */
/*  模型列表                                                           */
/* ------------------------------------------------------------------ */

agnesRouter.get('/models', (_req: Request, res: Response) => {
  res.json({
    success: true,
    imageModels: [
      { id: 'agnes-image-2.1-flash', name: 'Agnes Image 2.1 Flash' },
      { id: 'agnes-image-2.5-flash', name: 'Agnes Image 2.5 Flash' },
      { id: 'agnes-image-2.0-flash', name: 'Agnes Image 2.0 Flash' },
    ],
    videoModels: [
      { id: 'agnes-video-v2.0', name: 'Agnes Video V2.0' },
      { id: 'agnes-video-2.5-flash', name: 'Agnes Video 2.5 Flash' },
    ],
    imageSizes: ['1024x768', '1024x1024', '768x1024', '768x768', '1280x720', '720x1280'],
    videoModes: [
      { id: 'text2video', name: '文生视频' },
      { id: 'img2video', name: '图生视频' },
      { id: 'multi_img', name: '多图视频' },
      { id: 'keyframes', name: '关键帧动画' },
    ],
  })
})

/* ------------------------------------------------------------------ */
/*  图片生成（文生图 / 图生图 / 多图参考）                              */
/* ------------------------------------------------------------------ */

agnesRouter.post('/image/generate', upload.array('files'), async (req: Request, res: Response) => {
  try {
    const mode = req.body.mode || 'text2img'
    const model = req.body.model || 'agnes-image-2.1-flash'
    const prompt = String(req.body.prompt || '').trim()
    const size = req.body.size || '1024x1024'
    const responseFormat = req.body.response_format || 'url'

    if (!prompt) {
      res.status(400).json({ success: false, error: '请提供画面描述' })
      return
    }

    const payload: Record<string, any> = {
      model,
      prompt,
      size,
      response_format: responseFormat,
    }

    if (mode === 'text2img') {
      // 纯文生图，无需额外参数
    } else {
      const files = req.files as Express.Multer.File[] | undefined
      const providedUrls = req.body.images ? (Array.isArray(req.body.images) ? req.body.images : [req.body.images]) : []

      const uploadUrls: string[] = []
      if (files && files.length > 0) {
        for (const f of files) {
          const saved = await saveUpload(req, f.buffer)
          uploadUrls.push(saved.url)
        }
      }
      const images = [...uploadUrls, ...providedUrls]

      if (images.length === 0) {
        res.status(400).json({ success: false, error: '图生图 / 参考模式需要提供输入图片' })
        return
      }

      if (mode === 'img2img' && images.length > 1) {
        res.status(400).json({ success: false, error: '单图编辑模式仅支持一张参考图' })
        return
      }

      payload.extra_body = {
        image: images,
        response_format: responseFormat,
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 360000)
    const resp = await fetch(`${AGNES_BASE}/images/generations`, {
      method: 'POST',
      headers: agnesHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`Agnes API ${resp.status}: ${text.slice(0, 400)}`)
    }

    const data = await resp.json()
    const item = data.data?.[0]
    if (!item?.url) {
      throw new Error('Agnes API 未返回图片地址')
    }

    // 把远端结果图下载到本地，避免外链过期
    const localUrl = await downloadResult(item.url)

    res.json({
      success: true,
      imageUrl: localUrl,
      originalUrl: item.url,
      prompt,
      size,
      mode,
      model,
    })
  } catch (e: any) {
    logger.warn({ err: e?.message }, 'Agnes 图片生成失败')
    res.status(503).json({ success: false, error: e?.message || '图片生成失败，请稍后重试' })
  }
})

/* ------------------------------------------------------------------ */
/*  视频生成（文生视频 / 图生视频 / 多图 / 关键帧）                      */
/* ------------------------------------------------------------------ */

agnesRouter.post('/video/generate', upload.array('files'), async (req: Request, res: Response) => {
  try {
    const mode = req.body.mode || 'text2video'
    const model = req.body.model || 'agnes-video-v2.0'
    const prompt = String(req.body.prompt || '').trim()
    const width = Number(req.body.width) || 854
    const height = Number(req.body.height) || 480
    const numFrames = Number(req.body.num_frames) || 81
    const frameRate = Number(req.body.frame_rate) || 24
    const negativePrompt = req.body.negative_prompt || ''
    const numInferenceSteps = req.body.num_inference_steps ? Number(req.body.num_inference_steps) : undefined
    const seed = req.body.seed !== undefined ? Number(req.body.seed) : undefined

    if (!prompt) {
      res.status(400).json({ success: false, error: '请提供视频描述' })
      return
    }

    const payload: Record<string, any> = {
      model,
      prompt,
      width,
      height,
      num_frames: numFrames,
      frame_rate: frameRate,
    }
    if (negativePrompt) payload.negative_prompt = negativePrompt
    if (numInferenceSteps) payload.num_inference_steps = numInferenceSteps
    if (seed !== undefined) payload.seed = seed

    const files = req.files as Express.Multer.File[] | undefined
    const providedUrls = req.body.images ? (Array.isArray(req.body.images) ? req.body.images : [req.body.images]) : []
    const uploadUrls: string[] = []
    if (files && files.length > 0) {
      for (const f of files) {
        const saved = await saveUpload(req, f.buffer)
        uploadUrls.push(saved.url)
      }
    }
    const images = [...uploadUrls, ...providedUrls]

    if (mode === 'text2video') {
      // 无需图片
    } else if (mode === 'img2video') {
      if (images.length === 0) {
        res.status(400).json({ success: false, error: '图生视频需要提供输入图片' })
        return
      }
      payload.image = images[0]
    } else if (mode === 'multi_img' || mode === 'keyframes') {
      if (images.length < 2) {
        res.status(400).json({ success: false, error: `${mode === 'multi_img' ? '多图视频' : '关键帧动画'}至少需要 2 张图片` })
        return
      }
      payload.extra_body = { image: images }
      if (mode === 'keyframes') payload.extra_body.mode = 'keyframes'
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120000)
    const resp = await fetch(`${AGNES_BASE}/videos`, {
      method: 'POST',
      headers: agnesHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`Agnes API ${resp.status}: ${text.slice(0, 400)}`)
    }

    const data = await resp.json()
    res.json({
      success: true,
      taskId: data.task_id || data.id,
      videoId: data.video_id,
      status: data.status || 'queued',
      progress: data.progress || 0,
      seconds: data.seconds,
      size: data.size,
      message: '任务已提交，请轮询状态',
    })
  } catch (e: any) {
    logger.warn({ err: e?.message }, 'Agnes 视频生成失败')
    res.status(503).json({ success: false, error: e?.message || '视频生成失败，请稍后重试' })
  }
})

/* ------------------------------------------------------------------ */
/*  视频状态轮询                                                       */
/* ------------------------------------------------------------------ */

agnesRouter.get('/video/status/:videoId', async (req: Request, res: Response) => {
  try {
    const videoId = req.params.videoId
    const modelName = req.query.model as string | undefined
    if (!videoId) {
      res.status(400).json({ success: false, error: '缺少 videoId' })
      return
    }

    const params = new URLSearchParams({ video_id: videoId })
    if (modelName) params.set('model_name', modelName)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000)
    const resp = await fetch(`${AGNES_ROOT}/agnesapi?${params.toString()}`, {
      headers: { Authorization: `Bearer ${AGNES_KEY}` },
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`Agnes API ${resp.status}: ${text.slice(0, 400)}`)
    }

    const data = await resp.json()

    // 若已完成且带 url，把视频下载到本地（避免外链过期）
    let localUrl: string | undefined
    if (data.status === 'completed' && data.url) {
      try {
        localUrl = await downloadVideo(data.url)
      } catch (e) {
        logger.warn({ err: (e as Error).message }, 'Agnes 视频下载失败，保留原链接')
      }
    }

    res.json({
      success: true,
      status: data.status,
      progress: data.progress ?? 0,
      videoUrl: localUrl || data.url,
      originalUrl: data.url,
      seconds: data.seconds,
      size: data.size,
      error: data.error?.message || data.error,
    })
  } catch (e: any) {
    logger.warn({ err: e?.message }, 'Agnes 视频状态查询失败')
    res.status(503).json({ success: false, error: e?.message || '状态查询失败' })
  }
})

async function downloadVideo(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)
  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) throw new Error(`download failed: ${resp.status}`)
    const buf = Buffer.from(await resp.arrayBuffer())
    const hash = crypto.randomBytes(4).toString('hex')
    const fileName = `agnes-video-${Date.now()}-${hash}.mp4`
    fs.writeFileSync(path.join(IMAGE_DIR, fileName), buf)
    return `${env.API_PREFIX}/image/file/${fileName}`
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ */
/*  图片上传（供图生图 / 图生视频使用）                                  */
/* ------------------------------------------------------------------ */

agnesRouter.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: '请上传图片' })
      return
    }
    const saved = await saveUpload(req, req.file.buffer)
    res.json({ success: true, url: saved.url, fileName: saved.fileName })
  } catch (e: any) {
    logger.warn({ err: e?.message }, 'Agnes 图片上传失败')
    res.status(500).json({ success: false, error: e?.message || '上传失败' })
  }
})
