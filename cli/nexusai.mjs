#!/usr/bin/env node
import { readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
import https from 'https'
import http from 'http'
import { spawn, execSync } from 'child_process'
import { createRequire } from 'module'
import { loadMcpServers, toOpenAiTools, callMcpToolByName } from './mcp-client.mjs'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const VERSION = '1.3.1'
// 仓库地址（后台自更新与 `update` 命令共用）
const REPO_URL = 'https://github.com/2740354108/nexus-ai.git'
// 新版代码标记：安装器用它判断本地是否真的更新成功（此字符串请勿删除）
const SELF_UPDATE_MARKER = 'nexus-self-update-ok'

// 识别本次是被当作 `nexus`（短名、默认进终端聊天）还是 `nexusai`（原命令）调用。
// nexus 的快捷入口会在参数最前面插入 --nexus 标记。
let isNexus = false
const nexusFlagIdx = process.argv.indexOf('--nexus')
if (nexusFlagIdx >= 0) {
  process.argv.splice(nexusFlagIdx, 1)
  isNexus = true
}
// 命令名：用于提示文字，确保用户看到的启动命令与实际一致。
const CMD = isNexus ? 'nexus' : 'nexusai'

// 用户级配置目录（与登录态同目录，方便统一管理）
const NEXUS_DIR = join(homedir(), '.nexusai')
const CRED_FILE = join(NEXUS_DIR, 'credentials.json')
const CONFIG_FILE = join(NEXUS_DIR, 'config.json')
const ENV_FILE = join(ROOT, 'backend', '.env')
const UPDATE_STAMP = join(NEXUS_DIR, '.last-update-check')
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * 启动时在后台静默更新一次代码（每 6 小时最多一次），下次启动即生效。
 * 目的：用户永远跑在最新版本上，不用记任何更新命令；模型/接口有变化也能自动跟上。
 * 完全后台执行，不阻塞、不打扰；任何异常都静默忽略，绝不影响正常使用。
 * 如需关闭：设置环境变量 NEXUS_NO_AUTOUPDATE=1
 */
function selfUpdateInBackground() {
  try {
    if (process.env.NEXUS_NO_AUTOUPDATE === '1') return
    if (!existsSync(join(ROOT, '.git'))) return
    // 工作区存在“已跟踪文件的改动”时不自动更新，避免覆盖本地修改（开发者场景）。
    // 只看已跟踪文件的改动：nexus-data / node_modules 等未跟踪内容不算，否则会永远跳过。
    try {
      const dirty = execSync('git status --porcelain --untracked-files=no', {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim()
      if (dirty) return
    } catch {
      return
    }
    const now = Date.now()
    let last = 0
    try {
      last = Number(readFileSync(UPDATE_STAMP, 'utf-8').trim()) || 0
    } catch {}
    if (now - last < UPDATE_INTERVAL_MS) return
    mkdirSync(NEXUS_DIR, { recursive: true })
    writeFileSync(UPDATE_STAMP, String(now))
    const q = (p) => '"' + p + '"'
    const cmdline =
      `git -C ${q(ROOT)} fetch --depth 1 origin main && ` +
      `git -C ${q(ROOT)} reset --hard FETCH_HEAD`
    const child = spawn(cmdline, { detached: true, stdio: 'ignore', shell: true })
    child.on('error', () => {})
    child.unref()
  } catch {
    /* 自更新只是加分项，失败不影响使用 */
  }
}

// 解析 KEY=VALUE 形式的配置文件（零依赖）
function parseEnvFile(path) {
  const cfg = {}
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i > 0) cfg[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  }
  return cfg
}

function loadUserConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

// 配置优先级：用户级配置（nexus setup 写入）> 项目 backend/.env
const cfg = { ...parseEnvFile(ENV_FILE), ...loadUserConfig() }

let API_BASE = (cfg.AI_API_BASE || '').replace(/\/+$/, '')
let API_KEY = cfg.AI_API_KEY || ''
// 默认模型只是“起点”。OpenRouter 的免费模型会随时上下架（如 z-ai/glm-5.2:free 已下架），
// 因此实际请求时会由 completeWithFallback 在候选链里自动挑一个当前可用的并记住，
// 用户无需手动改模型名。
// 默认模型只在 OpenRouter 下有意义；换了别家平台（OpenAI / DeepSeek…），
// 模型名必须来自该平台，否则会一路 404。此时留空，由 setup 写入真实模型名。
let MODEL = cfg.AI_MODEL || (isOpenRouterBase() ? 'nvidia/nemotron-3-super-120b-a12b:free' : '')
let VISION_MODEL = cfg.AI_VISION_MODEL || (isOpenRouterBase() ? 'dots-studio/dots-3-note-preview:free' : '')

// 本次实际成功使用的模型（用于 config 展示与写回配置）
let ACTIVE_MODEL = null

// 自动换模型的提示只出现一次，避免同一行每轮都刷屏。
const _switchNoticed = new Set()
function noticeSwitch(to) {
  if (_switchNoticed.has(to)) return
  _switchNoticed.add(to)
  console.log(neon.gray(`（已自动换用可用模型：${to}）`))
}

// 静态候选（优先后备）；即使全部失效，也会从线上免费列表里动态补齐。
const TEXT_MODEL_CANDIDATES = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-31b-it:free',
  'thinkingmachines/inkling:free',
  'inclusionai/ling-3.0-flash-sante:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
]
const VISION_MODEL_CANDIDATES = [
  'dots-studio/dots-3-note-preview:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3.8-27b:free',
]

// 常见 OpenAI 兼容平台预设。选 1「自带 Key」时先挑一家，不必人人都去注册 OpenRouter。
// keyStrict：是否强制 sk- 开头的 Key 格式（智谱等平台格式不同，放宽为非空即可）。
// custom：自定义平台，地址与模型名由用户手填。
const PROVIDERS = [
  {
    id: 'openrouter',
    label: 'OpenRouter（聚合站 · 有免费额度 · 新手推荐）',
    base: 'https://openrouter.ai/api/v1',
    keyHint: '去 https://openrouter.ai/keys 免费申请，sk-or- 开头',
    keyStrict: true,
    models: TEXT_MODEL_CANDIDATES,
    vision: VISION_MODEL_CANDIDATES,
  },
  {
    id: 'openai',
    label: 'OpenAI 官方',
    base: 'https://api.openai.com/v1',
    keyHint: '去 https://platform.openai.com/api-keys 创建，sk- 开头',
    keyStrict: true,
    models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'],
    vision: ['gpt-4o-mini', 'gpt-4o'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek（便宜 · 国内可直连）',
    base: 'https://api.deepseek.com/v1',
    keyHint: '去 https://platform.deepseek.com/api_keys 创建，sk- 开头',
    keyStrict: true,
    models: ['deepseek-chat', 'deepseek-reasoner'],
    vision: [],
  },
  {
    id: 'moonshot',
    label: '月之暗面 Kimi（国内）',
    base: 'https://api.moonshot.cn/v1',
    keyHint: '去 https://platform.moonshot.cn/console/api-keys 创建，sk- 开头',
    keyStrict: true,
    models: ['moonshot-v1-8k', 'moonshot-v1-32k'],
    vision: ['moonshot-v1-8k-vision-preview'],
  },
  {
    id: 'zhipu',
    label: '智谱 GLM（国内）',
    base: 'https://open.bigmodel.cn/api/paas/v4',
    keyHint: '去 https://open.bigmodel.cn/usercenter/apikeys 复制，形如 xxxxxxxx.yyyyyyyy',
    keyStrict: false,
    models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus'],
    vision: ['glm-4v-flash', 'glm-4v-plus'],
  },
  {
    id: 'dashscope',
    label: '阿里通义千问（百炼 · 国内）',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyHint: '去 https://bailian.console.aliyun.com 创建 API-KEY，sk- 开头',
    keyStrict: false,
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
    vision: ['qwen-vl-plus', 'qwen-vl-max'],
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow（国内聚合）',
    base: 'https://api.siliconflow.cn/v1',
    keyHint: '去 https://cloud.siliconflow.cn/account/ak 创建，sk- 开头',
    keyStrict: false,
    models: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V3'],
    vision: ['Qwen/Qwen2-VL-7B-Instruct'],
  },
  {
    id: 'custom',
    label: '其它（自定义地址 · 任何 OpenAI 兼容服务）',
    base: '',
    keyHint: '填你所用服务商提供的 Key',
    keyStrict: false,
    custom: true,
    models: [],
    vision: [],
  },
]

// 当前生效的平台预设：由「已保存的配置」或「本次 setup 选择」决定。
// 决定候选模型链用哪一家的模型名（跨平台混用会全是 404）。
let ACTIVE_PROVIDER = null
{
  const saved = PROVIDERS.find((p) => p.id === cfg.AI_PROVIDER)
  const norm = (s) => String(s || '').replace(/\/+$/, '')
  if (saved && saved.base && API_BASE && norm(saved.base) === norm(API_BASE)) ACTIVE_PROVIDER = saved
}

function isOpenRouterBase() {
  return /openrouter\.ai/i.test(API_BASE || '')
}

// 文档里的示例占位域名：不是真实服务器。命中时直接给出可执行指引，
// 避免用户看到 “Hostname/IP does not match certificate's altnames” 这类看不懂的报错。
const PLACEHOLDER_HOSTS = ['yourdomain.com', 'your-domain.com', 'example.com']
function isPlaceholderBase() {
  return !!API_BASE && PLACEHOLDER_HOSTS.some((h) => API_BASE.includes(h))
}

function loadCreds() {
  try {
    return JSON.parse(readFileSync(CRED_FILE, 'utf-8'))
  } catch {
    return {}
  }
}
function saveCreds(c) {
  mkdirSync(dirname(CRED_FILE), { recursive: true })
  writeFileSync(CRED_FILE, JSON.stringify(c, null, 2))
}
const creds = loadCreds()

// 登录令牌优先；没有则回退到自己填的 AI_API_KEY
function authToken() {
  return creds.token || API_KEY
}

// setup 里刚填完地址就要注册时，用它覆盖模块加载时算出的中继地址
let RELAY_OVERRIDE = null

// 中继地址：默认从 AI_API_BASE 推导（https://host/api/ai/v1 -> https://host/api/relay）
// 也可用 NEXUS_RELAY_URL 显式覆盖
function relayBase() {
  if (RELAY_OVERRIDE) return RELAY_OVERRIDE.replace(/\/+$/, '') + '/api/relay'
  const override = cfg.NEXUS_RELAY_URL
  if (override) return override.replace(/\/+$/, '') + '/relay'
  const m = API_BASE.match(/(.*)\/ai\/v1$/)
  if (m) return m[1] + '/relay'
  return null
}

/** 把底层网络/证书错误翻译成人话，并给出下一步该做什么。 */
function explainError(e) {
  const m = String((e && e.message) || e)
  if (/altnames|CERT|self.signed|UNABLE_TO_VERIFY|Hostname\/IP/i.test(m))
    return (
      `连不上 AI 服务地址：${API_BASE}\n` +
      '   原因：该地址的证书与域名不匹配，多半填的是示例占位域名或已失效的地址。\n' +
      `   解决：运行 ${CMD} setup 重新填写可用的 AI 服务地址。`
    )
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|ERR_INVALID_URL/i.test(m))
    return (
      `连不上 AI 服务地址：${API_BASE || '（未配置）'}\n` +
      '   原因：域名解析失败（地址写错、域名不存在或网络不通）。\n' +
      `   解决：运行 ${CMD} setup 重新填写。`
    )
  if (/ECONNREFUSED/i.test(m))
    return (
      `连不上 AI 服务地址：${API_BASE}\n` +
      '   原因：对方拒绝连接（服务没启动，或本地服务地址不对）。\n' +
      `   解决：若用本机服务，先运行 ${CMD} serve；否则运行 ${CMD} setup 改地址。`
    )
  if (/超时|timeout|ETIMEDOUT/i.test(m))
    return `请求超时：${API_BASE}\n   解决：检查网络，或运行 ${CMD} setup 换一个 AI 服务地址。`
  if (
    /401|403|Unauthorized|Incorrect API key|No auth|Missing Authentication|Authentication header|invalid.*key/i.test(
      m
    )
  )
    return (
      `AI 密钥无效或未配置${API_BASE ? '（当前服务：' + API_BASE + '）' : ''}。\n` +
      `   解决：运行 ${CMD} setup 填入你自己的 Key。\n` +
      `   支持 OpenRouter（可免费申请 https://openrouter.ai/keys）· OpenAI · DeepSeek · 智谱 · 通义 · Kimi · 硅基流动 等。`
    )
  return m
}

/* ===== 终端霓虹样式（零依赖，纯 ANSI 转义码；非 TTY / 管道输入时自动关闭） ===== */
const _TTY = !!process.stdout.isTTY
const _e = (n) => (_TTY ? '\x1b[' + n + 'm' : '')
const RESET = _e('0')
const BOLD = _e('1')
const DIM = _e('2')
const C_CYAN = _e('38;2;103;232;249m') // #67e8f9
const C_VIOLET = _e('38;2;196;181;253m') // #c4b5fd
const C_GREEN = _e('38;2;110;231;183m')
const C_GRAY = _e('38;2;148;163;184m')
const paint = (s, code) => (_TTY ? code + s + RESET : s)
const neon = {
  cyan: (s) => paint(s, C_CYAN),
  violet: (s) => paint(s, C_VIOLET),
  green: (s) => paint(s, C_GREEN),
  gray: (s) => paint(s, C_GRAY),
  bold: (s) => paint(s, BOLD),
  dim: (s) => paint(s, DIM),
}

function _stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}
function _dlen(s) {
  let n = 0
  for (const ch of _stripAnsi(s)) n += ch.codePointAt(0) > 0x2e7f ? 2 : 1
  return n
}
// 从回复里取出纯文本：兼容字符串 / 多模态数组 / 完整消息对象三种结构。
// 少了这一步，把消息对象直接丢给排版函数会抛 "text is not iterable"。
function extractText(m) {
  if (m == null) return ''
  if (typeof m === 'string') return m
  if (Array.isArray(m)) {
    return m
      .map((p) => (typeof p === 'string' ? p : p && typeof p.text === 'string' ? p.text : ''))
      .join('')
  }
  if (typeof m === 'object') {
    if (typeof m.content === 'string') return m.content
    if (m.content != null) return extractText(m.content)
    return ''
  }
  return String(m)
}

// 按显示宽度换行（CJK 按字断行，拉丁按空白断行）
function _wrap(text, maxW) {
  text = text == null ? '' : String(text)
  const out = []
  let cur = ''
  let w = 0
  const add = (ch) => {
    const cw = ch.codePointAt(0) > 0x2e7f ? 2 : 1
    if (w + cw > maxW && cur.trim()) {
      out.push(cur)
      cur = ''
      w = 0
    }
    cur += ch
    w += cw
  }
  for (const ch of text) {
    if (ch === '\n') {
      out.push(cur)
      cur = ''
      w = 0
      continue
    }
    add(ch)
  }
  if (cur.trim() || out.length === 0) out.push(cur)
  return out.length ? out : ['']
}
// 圆角边框盒子：左上角标题标签 + 正文，颜色可青/紫
function _box(title, body, colorCode) {
  body = extractText(body)
  if (!_TTY) return (title ? '『' + title + '』\n' : '') + body + '\n'
  const col = colorCode || C_CYAN
  const W = Math.max(40, (process.stdout.columns || 80) - 2)
  const inner = W - 2
  const label = title ? ' ' + title + ' ' : ''
  const top =
    col +
    '╭' +
    BOLD +
    label +
    RESET +
    col +
    '─'.repeat(Math.max(1, W - 2 - _dlen(label))) +
    '╮' +
    RESET
  const mid = _wrap(body, inner)
    .map((ln) => {
      const pad = Math.max(0, inner - _dlen(ln))
      return col + '│' + RESET + ln + ' '.repeat(pad) + col + '│' + RESET
    })
    .join('\n')
  const bot = col + '╰' + '─'.repeat(W - 2) + '╯' + RESET
  return [top, mid, bot].join('\n') + '\n'
}
// 思考动画：返回停止函数，调用即清除本行动画
function _thinking() {
  if (!_TTY) return () => {}
  const f = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  const id = setInterval(() => {
    process.stdout.write('\r' + neon.dim('  ' + f[i % f.length] + ' NEXUS 正在思考…'))
    i++
  }, 90)
  return () => {
    clearInterval(id)
    process.stdout.write('\r' + ' '.repeat(30) + '\r')
  }
}

const SYSTEM_PROMPT =
  '你是 NEXUS AI，一个本地运行的多模态助手，擅长回答各类问题、写代码、分析图片。回答简洁友好，中文为主。'

function requestCompletions(messages, modelOverride, tools) {
  if (!API_BASE) return Promise.reject(new Error('未配置 AI 服务地址（请运行 ' + CMD + ' setup）'))
  const useVision = messages.some((m) => Array.isArray(m.content))
  const model = modelOverride || (useVision ? VISION_MODEL : MODEL)
  const body = JSON.stringify({
    model,
    messages,
    stream: false,
    ...(tools && tools.length ? { tools, tool_choice: 'auto' } : {}),
  })
  const url = new URL(API_BASE + '/chat/completions')
  const lib = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken()}`,
          'HTTP-Referer': 'https://nexus.local',
          'X-Title': 'NEXUS AI Local',
        },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.error) return reject(new Error(json.error.message || JSON.stringify(json.error)))
            resolve(json.choices?.[0]?.message || { content: '(无回复)' })
          } catch (e) {
            reject(new Error('解析失败: ' + data.slice(0, 300)))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(60000, () => req.destroy(new Error('请求超时（请检查网络或 API_KEY）')))
    req.write(body)
    req.end()
  })
}

/** 简单 GET JSON（用于拉取 OpenRouter 模型列表，无需鉴权）。 */
function httpsGetJson(url) {
  const u = new URL(url)
  const lib = u.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = lib.get(
      u,
      { headers: { 'HTTP-Referer': 'https://nexus.local', 'X-Title': 'NEXUS AI Local' } },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(d))
          } catch {
            reject(new Error('模型列表解析失败'))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('拉取模型列表超时')))
  })
}

/** 是否为“模型不可用”类错误：这类错误换个模型重试即可，不是用户的问题。 */
function isModelError(msg) {
  // 覆盖各家措辞：OpenRouter「unavailable for free」、OpenAI「does not exist」、
  // DeepSeek「Model Not Exist」、智谱「模型不存在」等。
  return /unavailable for free|not a valid model|no endpoints found|invalid model|does not exist|model.{0,24}not exist|model.{0,24}not found|no such model|unsupported model|not available|no allowed providers|deprecated|模型不存在|不存在的模型/i.test(
    msg
  )
}

// 线上免费模型列表缓存（一次进程内只拉一次）
let _freeModelsCache = null
async function getFreeModelIds(wantImage) {
  // 免费模型清单是 OpenRouter 独有的；别家平台（OpenAI / DeepSeek / 智谱…）没有这个概念
  if (!isOpenRouterBase()) return []
  if (!_freeModelsCache) {
    try {
      const data = await httpsGetJson('https://openrouter.ai/api/v1/models')
      _freeModelsCache = data && Array.isArray(data.data) ? data.data : []
    } catch {
      _freeModelsCache = []
    }
  }
  return _freeModelsCache
    .filter(
      (m) =>
        m.pricing &&
        m.pricing.prompt === '0' &&
        m.pricing.completion === '0' &&
        !/lyria|whisper|tts|embed|content-safety|guard/i.test(m.id) &&
        (!wantImage || (m.architecture && (m.architecture.input_modalities || []).includes('image')))
    )
    .map((m) => m.id)
}

/**
 * 依次尝试候选模型，返回第一个成功的回复，并把可用模型记到用户配置里。
 * 遇到“模型下架/不可用”的错误自动换下一个；遇到网络/鉴权错误则直接抛出（换模型也没用）。
 */
async function completeWithFallback(messages, tools) {
  const wantImage = messages.some((m) => Array.isArray(m.content))
  // 没配专用识图模型时退回文本模型，避免候选链为空
  const current = wantImage ? (VISION_MODEL || MODEL) : MODEL
  const chain = []
  const push = (id) => {
    if (id && !chain.includes(id)) chain.push(id)
  }
  push(current)
  // 候选链必须与当前平台一致：选了 DeepSeek 就不能再拿 OpenRouter 的模型名去试。
  // 非 OpenRouter 且平台未知时，只用配置里写明的模型，避免无谓的失败请求。
  const preset = wantImage
    ? (ACTIVE_PROVIDER?.vision?.length ? ACTIVE_PROVIDER.vision : [])
    : (ACTIVE_PROVIDER?.models?.length ? ACTIVE_PROVIDER.models : [])
  const fallbackPool = ACTIVE_PROVIDER
    ? preset
    : isOpenRouterBase()
      ? (wantImage ? VISION_MODEL_CANDIDATES : TEXT_MODEL_CANDIDATES)
      : []
  for (const id of fallbackPool) push(id)
  try {
    for (const id of await getFreeModelIds(wantImage)) push(id)
  } catch {}
  let lastErr
  for (const id of chain) {
    try {
      const msg = await requestCompletions(messages, id, tools)
      ACTIVE_MODEL = id
      if (id !== current) {
        // 记住这次真正可用的模型：既写回配置文件，也同步更新内存变量。
        // 少了内存这一步，下一句话会再拿已下架的旧模型去试、失败再切一次，
        // 于是同一句提示反复出现，还白费一次失败请求。
        if (wantImage) VISION_MODEL = id
        else MODEL = id
        noticeSwitch(id)
        saveUserConfig(wantImage ? { AI_VISION_MODEL: id } : { AI_MODEL: id })
      }
      return msg
    } catch (e) {
      const m = String((e && e.message) || e)
      if (isModelError(m)) {
        lastErr = e
        continue
      }
      throw e
    }
  }
  throw lastErr || new Error('暂时没有可用的免费模型，请稍后重试。')
}

function mimeFromPath(p) {
  const e = p.toLowerCase().split('.').pop()
  return (
    { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[e] || 'image/png'
  )
}

// 从输入里提取所有存在的图片附件（@路径，可多张，任意位置）
function extractAttachments(text) {
  const atts = []
  for (const t of text.split(/\s+/)) {
    if (!t.startsWith('@')) continue
    const p = resolve(process.cwd(), t.slice(1))
    if (existsSync(p)) atts.push(p)
  }
  return atts
}

async function buildUserMessage(input) {
  const atts = extractAttachments(input)
  const text = input.replace(/@(\S+)/g, '').trim()
  if (atts.length) {
    const content = atts.map((p) => ({
      type: 'image_url',
      image_url: { url: `data:${mimeFromPath(p)};base64,${readFileSync(p).toString('base64')}` },
    }))
    content.push({ type: 'text', text: text || '请描述这些图片' })
    return { role: 'user', content }
  }
  return { role: 'user', content: input }
}

// 带多 MCP 工具调用的对话循环：模型可多次调用工具，直到不再调用为止
async function runAgent(messages, tools, servers) {
  for (let turn = 0; turn < 8; turn++) {
    const msg = await completeWithFallback(messages, tools)
    messages.push(msg)
    const calls = msg && msg.tool_calls
    if (!calls || !calls.length) return msg
    for (const c of calls) {
      let result
      try {
        result = await callMcpToolByName(servers, c.function.name, c.function.arguments || {})
      } catch (e) {
        result = '工具调用失败: ' + e.message
      }
      messages.push({ role: 'tool', tool_call_id: c.id, content: result })
    }
  }
  return messages[messages.length - 1]
}

function printMcpStatus(servers, failed) {
  if (!servers.length && !failed.length) {
    console.log(neon.gray('  未配置任何 MCP server。编辑 ') + neon.cyan('~/.nexusai/mcp-servers.json') + neon.gray(' 添加。'))
    return
  }
  console.log(neon.violet('  MCP server 状态：'))
  for (const s of servers) {
    const names = (s.tools || []).map((t) => s.name + '__' + t.name)
    console.log(
      '   ' +
        neon.green('●') +
        ' ' +
        neon.cyan(s.name) +
        neon.gray(' (' + s.transport + ') ') +
        (names.length ? neon.gray('工具: ') + names.join(', ') : neon.gray('无工具'))
    )
  }
  for (const f of failed) {
    console.log('   ' + neon.violet('○') + ' ' + neon.cyan(f.name) + neon.gray(' 连接失败: ' + f.error))
  }
  console.log('')
}

async function chatMode() {
  // 预检：没配地址、或还是示例占位域名时，就地打开配置向导，
  // 省得用户再去猜该敲哪个命令（配置完自动继续对话）。
  if (isPlaceholderBase() || !API_BASE) {
    console.log(
      neon.violet('⚠ 还没配置 AI 服务') +
        (isPlaceholderBase() ? neon.gray('（当前是无效的示例地址）') : neon.gray('地址')) +
        neon.gray('，先花一分钟配置一下：\n')
    )
    await setupMode()
    const fresh = { ...parseEnvFile(ENV_FILE), ...loadUserConfig() }
    API_BASE = (fresh.AI_API_BASE || '').replace(/\/+$/, '')
    API_KEY = fresh.AI_API_KEY || ''
    if (!API_BASE || isPlaceholderBase()) {
      console.log(neon.gray('仍未配置完成，已退出。'))
      process.exit(1)
    }
  }
  if (!authToken()) {
    const rb = relayBase()
    if (rb) {
      console.log(neon.violet('⚠ 你连的是 NEXUS 中继，需要先注册登录才能使用（每天免费额度）。'))
      console.log('   ' + neon.cyan(`${CMD} register 你的邮箱 密码`))
      console.log('   ' + neon.cyan(`${CMD} login 你的邮箱 密码`))
      console.log('   ' + neon.gray(`或改用自己的 Key：${CMD} setup`))
    } else {
      console.log(neon.violet('⚠ 未配置 AI_API_KEY。'))
      console.log('   ' + neon.cyan(`运行 ${CMD} setup 填入你的 Key`))
      console.log('   ' + neon.gray('  支持 OpenRouter（可免费申请）· OpenAI · DeepSeek · 智谱 · 通义 · Kimi · 硅基流动 等'))
    }
    process.exit(1)
  }

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }]
  console.log(
    _box(
      ' NEXUS AI ',
      '本地多模态助手 · 终端版 v' + VERSION + '\n' + neon.gray('青紫霓虹 · 零依赖 · 多模型自动切换'),
      C_VIOLET
    ) +
      neon.gray('  命令：') +
      neon.cyan('/exit') +
      neon.gray(' 退出   ') +
      neon.cyan('/clear') +
      neon.gray(' 清空   ') +
      neon.cyan('@图片路径') +
      neon.gray(' 发图识图') +
      '\n'
  )

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  rl.setPrompt(neon.cyan('▶ ') + neon.violet('你') + neon.gray(' › '))
  rl.prompt()
  for await (const line of rl) {
    const cmd = line.trim()
    if (cmd === '/exit' || cmd === '/quit') {
      console.log(neon.gray('  再见 👋'))
      break
    }
    if (cmd === '/clear') {
      messages.length = 1
      console.log(neon.gray('  已清空对话。'))
      rl.prompt()
      continue
    }
    if (!cmd) {
      rl.prompt()
      continue
    }
    try {
      const atts = extractAttachments(cmd)
      const um = await buildUserMessage(cmd)
      messages.push(um)
      const textOnly = cmd.replace(/@(\S+)/g, '').trim() || (atts.length ? '（看图提问）' : '')
      const uBody = atts.length
        ? textOnly + '\n' + neon.gray('📎 已附图片 ') + neon.cyan(String(atts.length)) + neon.gray(' 张')
        : textOnly
      console.log(_box(' 你 ', uBody, C_VIOLET))
      const stop = _thinking()
      const replyMsg = await completeWithFallback(messages)
      stop()
      const reply = extractText(replyMsg)
      messages.push({ role: 'assistant', content: reply })
      console.log(_box(' NEXUS AI ', reply, C_CYAN) + neon.green('  ✓ ') + neon.gray('模型: ' + (ACTIVE_MODEL || MODEL)))
    } catch (e) {
      console.log(_box(' 出错 ', explainError(e), C_VIOLET))
    }
    rl.prompt()
  }
  rl.close()
}

// 交互提问：共用一个 readline 实例 + 行队列。
// 直接用 rl.question 在管道/粘贴输入时存在竞态（后一行的 line 事件可能早于提问注册而丢失），
// 改为先把行缓存进队列，提问时按序取，交互与管道输入都稳定。
let _rl = null
let _lineQueue = []
let _lineWaiters = []
function getReader() {
  if (!_rl) {
    _rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY })
    _rl.on('line', (l) => {
      if (_lineWaiters.length) _lineWaiters.shift()(l)
      else _lineQueue.push(l)
    })
  }
  return _rl
}
function nextLine() {
  getReader()
  if (_lineQueue.length) return Promise.resolve(_lineQueue.shift())
  return new Promise((res) => _lineWaiters.push(res))
}
function prompt(question) {
  process.stdout.write(question)
  return nextLine().then((a) => (a || '').trim())
}
function closePrompter() {
  if (_rl) {
    _rl.close()
    _rl = null
  }
  _lineWaiters = []
}

function relayPost(path, body) {
  const rb = relayBase()
  if (!rb) {
    console.log('⚠️ 未检测到 NEXUS 中继地址。请把 backend/.env 的 AI_API_BASE 指向中继（…/api/ai/v1），')
    console.log(`   或运行 ${CMD} setup 填写中继地址。`)
    process.exit(1)
  }
  const url = new URL(rb + path)
  const lib = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) })
          } catch {
            resolve({ status: res.statusCode, json: {} })
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('请求超时')))
    req.write(JSON.stringify(body))
    req.end()
  })
}

async function registerMode(email, password) {
  if (!email) email = await prompt('邮箱：')
  if (!password) password = await prompt('密码（至少 6 位）：')
  closePrompter()
  let res
  try {
    res = await relayPost('/register', { email, password })
  } catch (e) {
    console.log('❌ 注册失败（连不上中继）：')
    console.log('   ' + explainError(e))
    process.exit(1)
  }
  const { status, json } = res
  if (status >= 200 && status < 300 && json.token) {
    creds.token = json.token
    creds.email = email
    saveCreds(creds)
    console.log('✅ 注册成功并已登录，令牌已保存到 ' + CRED_FILE)
    console.log(`   现在运行 ${CMD} chat 即可对话（每日免费额度）。`)
  } else {
    console.log('❌ 注册失败：' + (json.error || 'HTTP ' + status))
    process.exit(1)
  }
}

async function loginMode(email, password) {
  if (!email) email = await prompt('邮箱：')
  if (!password) password = await prompt('密码：')
  closePrompter()
  let res
  try {
    res = await relayPost('/login', { email, password })
  } catch (e) {
    console.log('❌ 登录失败（连不上中继）：')
    console.log('   ' + explainError(e))
    process.exit(1)
  }
  const { status, json } = res
  if (status >= 200 && status < 300 && json.token) {
    creds.token = json.token
    creds.email = email
    saveCreds(creds)
    console.log(`✅ 登录成功，令牌已保存。运行 ${CMD} chat 开始对话。`)
  } else {
    console.log('❌ 登录失败：' + (json.error || 'HTTP ' + status))
    process.exit(1)
  }
}

async function meMode() {
  if (!creds.token) {
    console.log(`ℹ️ 尚未登录。运行 ${CMD} register 或 ${CMD} login。`)
    return
  }
  const rb = relayBase()
  if (!rb) {
    console.log('ℹ️ 当前不是中继模式（已使用自己的 AI Key），无需登录。')
    return
  }
  const url = new URL(rb + '/me')
  const lib = url.protocol === 'https:' ? https : http
  const { status, json } = await new Promise((resolve) => {
    const req = lib.request(url, { method: 'GET', headers: { Authorization: `Bearer ${creds.token}` } }, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(d || '{}') }))
    })
    req.on('error', () => resolve({ status: 0, json: {} }))
    req.end()
  })
  if (status >= 200 && status < 300) {
    console.log(`已登录：${json.email}`)
    console.log(`每日额度：${json.dailyLimit} 次　匿名试用/IP：${json.trialPerIp} 次`)
  } else {
    console.log(`令牌已失效，请重新登录（${CMD} login）。`)
  }
}

// 把配置写回 backend/.env（网页端也读这个文件，保持两端一致）
function upsertEnvKeys(keys) {
  // 没有 .env 时先按示例补齐，避免只剩两行的残缺配置
  if (!existsSync(ENV_FILE) && existsSync(ENV_FILE + '.example')) copyFileSync(ENV_FILE + '.example', ENV_FILE)
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf-8').split('\n') : []
  for (const [k, v] of Object.entries(keys)) {
    const idx = lines.findIndex((l) => new RegExp(`^\\s*${k}\\s*=`).test(l))
    const line = `${k}=${v}`
    if (idx >= 0) lines[idx] = line
    else lines.push(line)
  }
  writeFileSync(ENV_FILE, lines.join('\n'))
}

// 写入用户级配置（不受项目代码更新影响）
function saveUserConfig(keys) {
  const merged = { ...loadUserConfig(), ...keys }
  mkdirSync(NEXUS_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2))
}

async function setupMode() {
  try {
    return await setupModeInner()
  } finally {
    closePrompter()
  }
}

// 选 1 之后：挑一家平台。返回平台预设（自定义平台会把地址与模型名解析好），取消则返回 null。
async function pickProvider() {
  console.log('\n用哪家的 Key？（直接回车 = 1 推荐）')
  PROVIDERS.forEach((p, i) => console.log('  ' + (i + 1) + ') ' + p.label))
  const raw = await prompt('请输入 1-' + PROVIDERS.length + '：')
  const p = PROVIDERS[raw ? Number(raw) - 1 : 0]
  if (!p) {
    console.log('⚠️ 没看懂这个选项，已取消。')
    return null
  }
  if (!p.custom) return p
  const base = (await prompt('AI 服务地址（需 OpenAI 兼容，如 https://api.xxx.com/v1）：')).replace(/\/+$/, '')
  if (!base) {
    console.log('已取消（没有输入地址）。')
    return null
  }
  const model = (await prompt('模型名（如 gpt-4o-mini / deepseek-chat）：')).trim()
  if (!model) {
    console.log('已取消（没有输入模型名）。')
    return null
  }
  return { ...p, base, models: [model], vision: [] }
}

async function setupModeInner() {
  console.log('NEXUS AI 配置向导\n')
  console.log('当前 AI 服务地址：' + (API_BASE || '（未配置）') + (isPlaceholderBase() ? '   ← 示例占位地址，无效' : ''))
  console.log('\n请选择接入方式（输入 1 或 2）：')
  console.log('  1) 用我自己的 AI Key —— 推荐。OpenAI / DeepSeek / OpenRouter / 智谱 等都能用，无限流、最稳。')
  console.log('  2) 连我自己的中继服务器 —— 需要你已有公网地址（想给多人免 Key 用时选这个）。')
  const choice = await prompt('请输入 1 或 2：')

  if (choice === '2') {
    let url = (await prompt('中继地址（如 https://你的域名）：')).replace(/\/+$/, '')
    if (!url) return console.log('已取消（没有输入地址）。')
    if (!/\/api\/ai\/v1$/.test(url)) url += '/api/ai/v1'
    const token = (await prompt('中继令牌 [直接回车用默认 nexus-public-demo]：')) || 'nexus-public-demo'
    RELAY_OVERRIDE = url.replace(/\/api\/ai\/v1$/, '')
    API_BASE = url
    API_KEY = token
    saveUserConfig({ AI_API_BASE: url, AI_API_KEY: token })
    upsertEnvKeys({ AI_API_BASE: url, AI_API_KEY: token })
    console.log('\n✅ 已保存中继地址，接下来注册领取每日额度。')
    await registerMode()
    return
  }

  const provider = await pickProvider()
  if (!provider) return

  const key = (await prompt('请粘贴你的 AI Key（' + provider.keyHint + '）：')).trim()
  if (!key) return console.log('已取消（没有输入 Key）。')
  // 先做格式体检：明显不是有效 Key 时直接拦下，绝不写进任何配置。
  // 之前是"先落盘再验证"，一个错字就会写进项目配置，导致网页端、微信/QQ 机器人
  // 全部报"服务不可用"，排查方向被完全带偏。
  // 注意：sk- 前缀只是 OpenRouter / OpenAI / DeepSeek 等的习惯，智谱等平台不是这个格式，
  // 所以只在明确要求 sk- 的平台校验它，其余平台只用"太短=没复制全"兜底。
  if (provider.keyStrict && !/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) {
    console.log('⚠️ 这看起来不是有效的 Key（应以 sk- 开头、长度 20 位以上）。')
    console.log('   已取消，未写入任何配置。请确认复制完整后重试。')
    return
  }
  if (key.length < 8) {
    console.log('⚠️ Key 太短，多半没复制完整。已取消，未写入任何配置。')
    return
  }
  console.log('\n正在验证 Key 是否真的可用（' + provider.label + '）…')
  ACTIVE_PROVIDER = provider
  API_BASE = provider.base
  API_KEY = key
  MODEL = provider.models[0] || MODEL
  VISION_MODEL = provider.vision[0] || ''
  try {
    await completeWithFallback([{ role: 'user', content: '你好' }])
  } catch (e) {
    console.log('❌ 验证没通过：' + explainError(e))
    console.log('   为避免把无效配置写进项目（网页端和机器人会跟着一起坏），本次未保存。')
    console.log('   请确认 Key 复制完整、网络能访问 ' + provider.base + ' 后，重新运行 ' + CMD + ' setup。')
    return
  }
  console.log('✅ 通过')
  const textModel = ACTIVE_MODEL || MODEL
  const visionFirst = provider.vision[0] || ''
  // 验证通过才落盘：CLI 读用户级配置，网页端/机器人读项目 backend/.env，两边都要写。
  // 模型名必须跟平台一起写，否则网页端会拿 OpenRouter 的模型名去请求别家服务。
  saveUserConfig({
    AI_API_BASE: API_BASE,
    AI_API_KEY: key,
    AI_PROVIDER: provider.id,
    AI_MODEL: textModel,
    AI_VISION_MODEL: visionFirst,
  })
  upsertEnvKeys({
    AI_API_BASE: API_BASE,
    AI_API_KEY: key,
    AI_MODEL: textModel,
    AI_VISION_MODEL: visionFirst,
    AI_VISION_FALLBACKS: provider.vision.join(','),
  })
  console.log('\n✅ 配置完成！现在直接敲 ' + CMD + ' 就能聊天了。')
  console.log('   已同步写入网页端 / 微信机器人的配置（backend/.env），无需手动改文件。')
  if (!provider.vision.length) console.log('   提示：该平台暂无识图模型，发图片识别可能不可用，纯文字对话不受影响。')
  console.log('   配置已保存在：' + CONFIG_FILE + '（含你的 Key，请勿外传）')
}

function configMode() {
  const mask = (s) => (s ? s.slice(0, 8) + '…' + s.slice(-4) : '（空）')
  console.log('NEXUS AI 当前配置')
  console.log('  平台     : ' + (ACTIVE_PROVIDER ? ACTIVE_PROVIDER.label : isOpenRouterBase() ? 'OpenRouter' : '自定义 / 其它'))
  console.log('  服务地址 : ' + (API_BASE || '（未配置）') + (isPlaceholderBase() ? '  ← 示例占位地址，无效' : ''))
  console.log('  API Key  : ' + mask(API_KEY))
  console.log('  模型     : ' + (ACTIVE_MODEL || MODEL))
  console.log('  版本     : ' + VERSION + '（' + gitShortRev() + '）')
  console.log('  中继地址 : ' + (relayBase() || '（无）'))
  console.log('  登录状态 : ' + (creds.token ? '已登录 ' + (creds.email || '') : '未登录'))
  console.log('  用户配置 : ' + CONFIG_FILE)
  console.log('  项目配置 : ' + ENV_FILE)
  if (!API_BASE || isPlaceholderBase()) console.log(`\n提示：运行 ${CMD} setup 完成配置。`)
}

function serveMode() {
  console.log('启动本地服务（后端 + 前端）…')
  const backend = spawn('pnpm', ['dev'], {
    cwd: join(ROOT, 'backend'),
    env: { ...process.env, DB_MODE: cfg.DB_MODE || 'local', DATABASE_URL: cfg.DATABASE_URL || '' },
    shell: true,
    detached: true,
    stdio: 'inherit',
  })
  const frontend = spawn('pnpm', ['dev'], {
    cwd: join(ROOT, 'frontend'),
    env: { ...process.env, VITE_DEPLOY_MODE: 'local' },
    shell: true,
    detached: true,
    stdio: 'inherit',
  })
  console.log('后端: http://localhost:3000/api   前端: http://localhost:5173')
  const shutdown = () => {
    try {
      process.kill(-backend.pid)
    } catch {}
    try {
      process.kill(-frontend.pid)
    } catch {}
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

function appMode() {
  let electron
  try {
    electron = require('electron')
  } catch {
    console.log('未安装 Electron。请先在本机执行：pnpm install，然后运行 pnpm app 或 pnpm pack:win 打包。')
    process.exit(1)
  }
  // Electron 会读取本目录 package.json 的 "main" 字段（electron/main.cjs）
  const child = spawn(process.platform === 'win32' ? 'electron.cmd' : 'electron', ['.'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  })
  child.on('exit', () => process.exit(0))
}

function help() {
  console.log(`NEXUS AI 本地入口

用法：
  ${CMD}               开始终端对话（一敲即聊）
  ${CMD} setup         配置向导：填 AI Key 或中继地址（第一次用先跑这个）
  ${CMD} config        查看当前配置与登录状态
  ${CMD} update        更新到最新版本（自动拉代码 + 装依赖）
  ${CMD} chat          终端对话模式（同 ${CMD}）
  ${CMD} app           启动桌面应用（GUI 窗口）
  ${CMD} serve         启动本地后端 + 前端（浏览器访问 http://localhost:5173）
  ${CMD} up [start|stop|restart|status]  常驻运行后端+机器人（云电脑 24h 在线，崩了自动重启）
  ${CMD} register      注册中继账号（${CMD} register 邮箱 密码）
  ${CMD} login         登录中继账号（${CMD} login 邮箱 密码）
  ${CMD} me            查看当前登录与每日额度
  ${CMD} help          显示本帮助

说明：
  - 用别人的中继：先 register/login 领取每日免费额度，再 chat；
  - 用自己的 AI Key：${CMD} setup 选 1，支持 OpenRouter / OpenAI / DeepSeek / 智谱 / 通义 / Kimi 等；
  - 配置存在 ${CONFIG_FILE}，改配置重跑 ${CMD} setup 即可。`)
}

// 更新到最新版本：直接从 GitHub 拉取代码并强制对齐，再补装依赖。
// 有了它，以后更新只需一条 `nexus update`，不必再记 npx 那一长串。
function gitShortRev() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

// 打印一段可直接整段复制粘贴的重装命令。不走 npx（避免命中旧缓存），
// 直接 git clone 官方仓库，保证一定拿到最新代码。
function printReinstall() {
  console.log('   cd $env:USERPROFILE\\Desktop')
  console.log('   Remove-Item -Recurse -Force nexus-ai -ErrorAction SilentlyContinue')
  console.log(`   git clone --depth 1 ${REPO_URL} nexus-ai`)
  console.log('   node nexus-ai\\installer\\installer.mjs')
}

function updateMode() {
  const cur = gitShortRev()
  console.log(`当前版本：${VERSION}（${cur}）`)
  if (!existsSync(join(ROOT, '.git'))) {
    console.log('⚠️ 当前目录不是 git 仓库，无法自动更新。请按下面重装一次（整段复制粘贴）：')
    printReinstall()
    return
  }
  console.log('正在从 GitHub 更新到最新版本…')
  try {
    // 兜底把远端地址纠正为官方仓库，避免之前指向镜像/无令牌地址导致拉不到代码
    try {
      execSync(`git remote set-url origin ${REPO_URL}`, { cwd: ROOT, stdio: 'ignore' })
    } catch {}
    execSync('git fetch --depth 1 origin main', { cwd: ROOT, stdio: 'ignore' })
    execSync('git reset --hard FETCH_HEAD', { cwd: ROOT, stdio: 'ignore' })
  } catch {
    console.log('❌ 更新失败（多为网络问题）。可稍后重试，或按下面重装一次（整段复制粘贴）：')
    printReinstall()
    return
  }
  const after = gitShortRev()
  console.log(cur === after ? '✅ 已是最新版本。' : `✅ 代码已更新：${cur} → ${after}`)
  for (const sub of ['backend', 'frontend', 'nexus-bot']) {
    if (!existsSync(join(ROOT, sub))) continue
    console.log(`安装依赖：${sub}…`)
    try {
      execSync('pnpm install --config.strict-dep-builds=false', { cwd: join(ROOT, sub), stdio: 'inherit' })
    } catch {
      console.log(`⚠️ ${sub} 依赖安装有告警，通常不影响使用。`)
    }
  }
  console.log(`\n✅ 更新完成。运行 ${CMD} 即可使用最新版本。`)
}

// 不带子命令时：nexus 默认进终端聊天，nexusai 默认启动桌面应用
const cmd = process.argv[2] || (isNexus ? 'chat' : 'app')

// 除更新命令本身外，每次启动都在后台静默对齐一次最新代码（节流为 6 小时一次）。
if (!['update', 'upgrade'].includes(cmd)) selfUpdateInBackground()

switch (cmd) {
  case 'chat':
    // 不 await：终端对话靠 stdin 保持进程存活；await 在管道输入下会因 stdin 提前
    // 结束而产生「unsettled top-level await」告警并以退出码 13 结束。
    chatMode().catch((e) => {
      console.error('出错：' + ((e && e.message) || e))
      process.exit(1)
    })
    break
  case 'setup':
    setupMode()
    break
  case 'config':
    configMode()
    break
  case 'update':
  case 'upgrade':
    updateMode()
    break
  case 'register':
    registerMode(process.argv[3], process.argv[4])
    break
  case 'login':
    loginMode(process.argv[3], process.argv[4])
    break
  case 'me':
    meMode()
    break
  case 'serve':
    serveMode()
    break
  case 'up': {
    // 常驻模式：后台守护后端 + 机器人，崩了自动重启（云电脑 24h 在线用）
    const script = join(ROOT, 'scripts', 'nexus-up.sh')
    const sub = process.argv.slice(3)
    const child = spawn('bash', [script, ...sub], { stdio: 'inherit' })
    child.on('exit', (code) => process.exit(code || 0))
    break
  }
  case 'app':
  case 'start':
    appMode()
    break
  case 'help':
  case '--help':
  case '-h':
    help()
    break
  default:
    console.log('未知命令: ' + cmd + '\n')
    help()
}
