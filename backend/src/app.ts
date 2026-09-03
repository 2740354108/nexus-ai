import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import express, { Application } from 'express'
import cors from 'cors'
import compression from 'compression'
import 'express-async-errors'
import { env } from './config/env'
import { errorHandler } from './middleware/errorHandler'
import { httpLogger } from './middleware/logger'
import { systemRouter } from './modules/system'
import { musicRouter } from './modules/music'
import { videoRouter } from './modules/video'
import { aiRouter } from './modules/ai'
import { imageRouter } from './modules/image'
import { agnesRouter } from './modules/agnes'
import { authRouter } from './modules/auth'
import { historiesRouter } from './modules/histories'
// ============================================
// Add your domain module imports here
// ============================================
// Example: Product Module
// import { productRouter } from './modules/product.js'

export const createApp = (): Application => {
  const app = express()

  // HTTP request logging
  app.use(httpLogger)

  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN,
      credentials: env.CORS_ORIGIN !== '*',
    })
  )

  // Body parsing and compression
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.use(compression())

  // 生产部署：若存在前端构建产物（backend/web），由本服务一并提供，实现单端口访问
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const webDist = path.resolve(__dirname, '../web')
  const hasWebDist = fs.existsSync(path.join(webDist, 'index.html'))
  if (hasWebDist) {
    app.use(express.static(webDist))
  }

  // API routes - System & Health
  app.use(env.API_PREFIX, systemRouter)

  // Music generation - MiniMax 代理
  app.use(`${env.API_PREFIX}/music`, musicRouter)

  // Video generation - ComfyUI 图生视频代理
  app.use(`${env.API_PREFIX}/video`, videoRouter)

  // AI 对话代理（OpenAI 兼容）
  app.use(`${env.API_PREFIX}/ai`, aiRouter)

  // 图片生成（Pollinations 免费文生图）
  app.use(`${env.API_PREFIX}/image`, imageRouter)

  // Agnes AI 多模态免费接口（文生图 / 图生图 / 文生视频 / 图生视频）
  app.use(`${env.API_PREFIX}/agnes`, agnesRouter)

  // 账号系统与我的空间（自托管 JWT，TCB publish key 不可用时兜底）
  app.use(`${env.API_PREFIX}/auth`, authRouter)
  app.use(`${env.API_PREFIX}/histories`, historiesRouter)

  // ============================================
  // Add your domain module routes here
  // ============================================
  // Example: Product Module
  // app.use(`${env.API_PREFIX}/products`, productRouter)

  // 前端路由兜底：非接口请求一律返回首页，交给 React Router 处理（支持刷新子页面）
  if (hasWebDist) {
    app.use((req, res, next) => {
      if (req.path.startsWith(env.API_PREFIX)) return next()
      res.sendFile(path.join(webDist, 'index.html'))
    })
  }

  // Error handling
  app.use(errorHandler)

  return app
}
