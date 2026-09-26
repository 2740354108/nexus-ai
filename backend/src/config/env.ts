import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  API_PREFIX: z.string().default('/api'),

  CORS_ORIGIN: z.string().refine(
    (val) => val === '*' || z.string().url().safeParse(val).success,
    { message: 'CORS_ORIGIN must be a valid URL or "*" for all origins' }
  ).default('*'),

  // 数据库模式：cloud（默认，走 TCB auth-proxy）| local（直连本地 PostgreSQL）
  DB_MODE: z.string().default('cloud'),
  DATABASE_URL: z.string().default(''),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),

  // MiniMax 音乐生成 API
  MINIMAX_API_KEY: z.string().default(''),
  MINIMAX_API_URL: z.string().url().default('https://api.minimax.io/v1/music_generation'),
  MINIMAX_MODEL: z.string().default('music-2.6'),

  // aimusicapi.org（Suno chirp 模型）
  AIMUSIC_API_KEY: z.string().default(''),
  AIMUSIC_MODEL: z.string().default('chirp-v3-5'),

  // Hugging Face 音乐生成（MusicGen / audiocraft 推理 API）
  HF_API_KEY: z.string().default(''),
  HF_MUSIC_MODEL: z.string().default('facebook/musicgen-small'),

  // Replicate 音乐生成（meta/musicgen，沙箱可达，需 token）
  REPLICATE_API_TOKEN: z.string().default(''),

  // ACMusic.ai 云端 ACE-Step（OpenAI 兼容音频接口，来自 acemusic.ai/api-key）
  ACEMUSIC_API_KEY: z.string().default(''),

  // ComfyUI（本机部署，通过 ngrok 公网访问）
  COMFYUI_URL: z.string().url().default('http://localhost:8188'),

  // AI 对话（OpenAI 兼容接口：OpenRouter / DeepSeek / GLM / Kimi 等通用）
  AI_API_BASE: z.string().url().default('https://openrouter.ai/api/v1'),
  AI_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default('z-ai/glm-5.2:free'),
  // 备选模型链（逗号分隔），主模型被限流时自动切换
  AI_MODEL_FALLBACKS: z.string().default(''),
  /** 深度思考模式使用的推理模型（先思考再答，适合复杂问题） */
  AI_MODEL_THINK: z.string().default('deepseek/deepseek-r1:free'),

  // 识图（视觉）模型链：当用户发送图片时，自动切换到支持图片输入的模型
  AI_VISION_MODEL: z.string().default('nex-agi/nex-n2.5-pro:free'),
  AI_VISION_FALLBACKS: z
    .string()
    .default(
      'dots-studio/dots-3-note-preview:free,google/gemma-4-31b-it:free,qwen/qwen3.8-27b:free,google/gemma-4-26b-a4b-it:free'
    ),

  // Agnes AI 多模态免费 API（文生图 / 图生图 / 文生视频 / 图生视频）
  AGNES_API_BASE: z.string().url().default('https://apihub.agnes-ai.cn/v1'),
  AGNES_API_KEY: z.string().default(''),

  // 自托管账号系统（TCB publish key 不可用时兜底）
  JWT_SECRET: z.string().min(16).default('nexus-lab-jwt-secret-change-me'),

  // 公开中继（AI_BOT_TOKEN 开启）的每日配额与匿名试用额度
  RELAY_DAILY_LIMIT: z.string().transform(Number).default('20'),
  RELAY_TRIAL_PER_IP: z.string().transform(Number).default('5'),

  // Google 一键登录（在 Google Cloud 后台创建 OAuth Web 客户端后填写）
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
})

const parseEnv = () => {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    console.error('❌ Invalid environment variables:', error)
    process.exit(1)
  }
}

export const env = parseEnv()
