import { createApp } from './app'
import { env } from './config/env'
import { logger } from './config/logger'
import { ensureBillingSchema } from './modules/billing'
import { ensureConfigSchema } from './modules/config'
import { ensureRelaySchema } from './modules/relay'

const startServer = async () => {
  try {
    const app = createApp()
    // 确保商业化相关表与默认套餐存在（幂等）
    await ensureBillingSchema()
    // 确保云端用户配置表存在（多租户隔离）
    await ensureConfigSchema()
    // 确保中继/自托管账号相关表存在（users / relay_daily_usage 等）
    await ensureRelaySchema()

    // 端口被占用时（重启窗口内旧实例尚未释放，或进程管理器重复拉起）
    // 自动重试绑定，而不是直接崩溃，避免大脑在重启时"抽风"。
    const bindWithRetry = (attempt = 1): void => {
      const server = app.listen(env.PORT, () => {
        if (env.NODE_ENV === 'development') {
          console.log(`Server running on http://localhost:${env.PORT}${env.API_PREFIX}`)
        }
      })
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempt < 30) {
          // 退避重试：给旧实例留出释放端口的时间（重启窗口内很常见）。
          // 注意打印的时长与实际等待保持一致，否则日志会误导排查方向。
          const wait = Math.min(attempt * 1000, 10_000)
          console.warn(`[backend] 端口 ${env.PORT} 被占用，${wait}ms 后重试绑定…（第 ${attempt} 次）`)
          setTimeout(() => bindWithRetry(attempt + 1), wait)
        } else {
          logger.error({ err }, 'Failed to bind server')
          console.error(
            `[backend] 无法监听端口 ${env.PORT}：可能有旧的同名进程仍在运行。\n` +
              `  排查：ss -ltnp | grep :${env.PORT}，结束旧进程后重试`
          )
          process.exit(1)
        }
      })
    }
    bindWithRetry()
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server')
    process.exit(1)
  }
}

// Handle graceful shutdown silently
process.on('SIGTERM', async () => {
  process.exit(0)
})

process.on('SIGINT', async () => {
  process.exit(0)
})

startServer()
