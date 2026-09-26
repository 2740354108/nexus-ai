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

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const VERSION = '1.2.0'

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
let MODEL = cfg.AI_MODEL || 'z-ai/glm-5.2:free'
let VISION_MODEL = cfg.AI_VISION_MODEL || MODEL

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
  if (/401|403|Unauthorized|Incorrect API key|No auth|invalid.*key/i.test(m))
    return (
      `AI 密钥无效或未配置。\n` +
      `   解决：运行 ${CMD} setup 填入你自己的 Key（https://openrouter.ai/keys 可免费申请）。`
    )
  return m
}

const SYSTEM_PROMPT =
  '你是 NEXUS AI，一个本地运行的多模态助手，擅长回答各类问题、写代码、分析图片。回答简洁友好，中文为主。'

function requestCompletions(messages) {
  if (!API_BASE) return Promise.reject(new Error('未配置 AI 服务地址（请运行 ' + CMD + ' setup）'))
  const useVision = messages.some((m) => Array.isArray(m.content))
  const model = useVision ? VISION_MODEL : MODEL
  const body = JSON.stringify({ model, messages, stream: false })
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
            resolve(json.choices?.[0]?.message?.content || '(无回复)')
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

function mimeFromPath(p) {
  const e = p.toLowerCase().split('.').pop()
  return (
    { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[e] || 'image/png'
  )
}

async function buildUserMessage(input) {
  const m = input.match(/^@(\S+)\s*([\s\S]*)$/)
  if (m) {
    const imgPath = resolve(process.cwd(), m[1])
    if (!existsSync(imgPath)) throw new Error('图片不存在: ' + imgPath)
    const b64 = readFileSync(imgPath).toString('base64')
    const dataUrl = `data:${mimeFromPath(imgPath)};base64,${b64}`
    return {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: m[2] || '请描述这张图片' },
      ],
    }
  }
  return { role: 'user', content: input }
}

async function chatMode() {
  // 预检：没配地址、或还是示例占位域名时，就地打开配置向导，
  // 省得用户再去猜该敲哪个命令（配置完自动继续对话）。
  if (isPlaceholderBase() || !API_BASE) {
    console.log('⚠️ 还没配置 AI 服务' + (isPlaceholderBase() ? '（当前是无效的示例地址）' : '地址') + '，先花一分钟配置一下：\n')
    await setupMode()
    const fresh = { ...parseEnvFile(ENV_FILE), ...loadUserConfig() }
    API_BASE = (fresh.AI_API_BASE || '').replace(/\/+$/, '')
    API_KEY = fresh.AI_API_KEY || ''
    if (!API_BASE || isPlaceholderBase()) {
      console.log('仍未配置完成，已退出。')
      process.exit(1)
    }
  }
  if (!authToken()) {
    const rb = relayBase()
    if (rb) {
      console.log('⚠️ 你连的是 NEXUS 中继，需要先注册登录才能使用（每天免费额度）。')
      console.log(`   注册：${CMD} register 你的邮箱 密码`)
      console.log(`   登录：${CMD} login 你的邮箱 密码`)
      console.log(`   或改用自己的 Key：${CMD} setup`)
    } else {
      console.log('⚠️ 未配置 AI_API_KEY。')
      console.log(`   运行 ${CMD} setup 填入你的 Key（https://openrouter.ai/keys 免费申请）。`)
    }
    process.exit(1)
  }
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }]
  console.log('NEXUS AI 终端对话（Ctrl+D 或 /exit 退出，/clear 清空，@图片路径 发图识图）\n')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  for await (const line of rl) {
    const cmd = line.trim()
    if (cmd === '/exit' || cmd === '/quit') break
    if (cmd === '/clear') {
      messages.length = 1
      console.log('已清空对话。\n')
      continue
    }
    if (!cmd) continue
    try {
      const um = await buildUserMessage(cmd)
      messages.push(um)
      process.stdout.write('NEXUS> ')
      const reply = await requestCompletions(messages)
      messages.push({ role: 'assistant', content: reply })
      console.log(reply + '\n')
    } catch (e) {
      console.log('出错了: ' + explainError(e) + '\n')
    }
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

async function setupModeInner() {
  console.log('NEXUS AI 配置向导\n')
  console.log('当前 AI 服务地址：' + (API_BASE || '（未配置）') + (isPlaceholderBase() ? '   ← 示例占位地址，无效' : ''))
  console.log('\n请选择接入方式（输入 1 或 2）：')
  console.log('  1) 用我自己的 AI Key —— 推荐。去 https://openrouter.ai/keys 免费申请，无限流、最稳。')
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

  const key = await prompt('请粘贴你的 AI Key（sk-or- 开头）：')
  if (!key) return console.log('已取消（没有输入 Key）。')
  API_BASE = 'https://openrouter.ai/api/v1'
  API_KEY = key
  saveUserConfig({ AI_API_BASE: API_BASE, AI_API_KEY: key, AI_MODEL: MODEL })
  upsertEnvKeys({ AI_API_BASE: API_BASE, AI_API_KEY: key })
  process.stdout.write('\n正在验证 Key 是否可用… ')
  try {
    await requestCompletions([{ role: 'user', content: '你好' }])
    console.log('✅ 通过')
  } catch (e) {
    console.log('⚠️ 没通过')
    console.log('   ' + explainError(e))
    console.log('   （不一定是 Key 错，也可能是模型名或网络问题）')
  }
  console.log('\n✅ 配置完成！现在直接敲 ' + CMD + ' 就能聊天了。')
  console.log('   配置已保存在：' + CONFIG_FILE + '（含你的 Key，请勿外传）')
}

function configMode() {
  const mask = (s) => (s ? s.slice(0, 8) + '…' + s.slice(-4) : '（空）')
  console.log('NEXUS AI 当前配置')
  console.log('  服务地址 : ' + (API_BASE || '（未配置）') + (isPlaceholderBase() ? '  ← 示例占位地址，无效' : ''))
  console.log('  API Key  : ' + mask(API_KEY))
  console.log('  模型     : ' + MODEL)
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
  ${CMD} register      注册中继账号（${CMD} register 邮箱 密码）
  ${CMD} login         登录中继账号（${CMD} login 邮箱 密码）
  ${CMD} me            查看当前登录与每日额度
  ${CMD} help          显示本帮助

说明：
  - 用别人的中继：先 register/login 领取每日免费额度，再 chat；
  - 用自己的 AI Key：${CMD} setup 选 1，填一次即可，无限流、最稳；
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

function updateMode() {
  const cur = gitShortRev()
  console.log(`当前版本：${VERSION}（${cur}）`)
  if (!existsSync(join(ROOT, '.git'))) {
    console.log('⚠️ 当前目录不是 git 仓库，无法自动更新。')
    console.log('   请重新安装：npx github:2740354108/nexus-ai')
    return
  }
  console.log('正在从 GitHub 更新到最新版本…')
  try {
    execSync('git fetch --depth 1 origin main', { cwd: ROOT, stdio: 'inherit' })
    execSync('git reset --hard FETCH_HEAD', { cwd: ROOT, stdio: 'inherit' })
  } catch (e) {
    console.log('❌ 更新失败（多为网络问题）：' + ((e && e.message) || e))
    console.log('   可稍后重试；或重新安装：npx github:2740354108/nexus-ai')
    process.exit(1)
  }
  console.log(`✅ 代码已更新：${cur} → ${gitShortRev()}`)
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
