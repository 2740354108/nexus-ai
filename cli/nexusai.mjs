#!/usr/bin/env node
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
import https from 'https'
import http from 'http'
import { spawn } from 'child_process'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

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

// 读取 backend/.env 中的 AI 配置（手动解析，零依赖）
function loadEnv() {
  const path = join(ROOT, 'backend', '.env')
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
const cfg = loadEnv()
const API_BASE = (cfg.AI_API_BASE || 'https://openrouter.ai/api/v1').replace(/\/$/, '')
const API_KEY = cfg.AI_API_KEY || ''
const MODEL = cfg.AI_MODEL || 'z-ai/glm-5.2:free'
const VISION_MODEL = cfg.AI_VISION_MODEL || MODEL

// 中继地址：默认从 AI_API_BASE 推导（https://host/api/ai/v1 -> https://host/api/relay）
// 也可用 NEXUS_RELAY_URL 显式覆盖
function relayBase() {
  const override = cfg.NEXUS_RELAY_URL
  if (override) return override.replace(/\/$/, '') + '/relay'
  const m = API_BASE.match(/(.*)\/ai\/v1$/)
  if (m) return m[1] + '/relay'
  return null
}

const CRED_FILE = join(homedir(), '.nexusai', 'credentials.json')
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

// chat 走 AI_API_BASE（OpenAI 兼容）；若已登录中继则带用户令牌，否则回退用自己的 API_KEY
const bearerToken = creds.token || API_KEY

const SYSTEM_PROMPT =
  '你是 NEXUS AI，一个本地运行的多模态助手，擅长回答各类问题、写代码、分析图片。回答简洁友好，中文为主。'

function requestCompletions(messages) {
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
          Authorization: `Bearer ${bearerToken}`,
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
  if (!bearerToken) {
    const rb = relayBase()
    if (rb) {
      console.log('⚠️ 你连的是 NEXUS 中继，需要先注册登录才能使用（每天免费额度）。')
      console.log(`   注册：${CMD} register 你的邮箱 密码`)
      console.log(`   登录：${CMD} login 你的邮箱 密码`)
    } else {
      console.log('⚠️ 未配置 AI_API_KEY，请在 backend/.env 填入 OpenRouter 等密钥后重试。')
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
      console.log('出错了: ' + e.message + '\n')
    }
  }
  rl.close()
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (a) => {
      rl.close()
      resolve(a.trim())
    })
  })
}

function relayPost(path, body) {
  const rb = relayBase()
  if (!rb) {
    console.log('⚠️ 未检测到 NEXUS 中继地址。请把 backend/.env 的 AI_API_BASE 指向中继（…/api/ai/v1），')
    console.log('   或设置 NEXUS_RELAY_URL，再执行 register / login。')
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
  if (!email) email = await ask('邮箱：')
  if (!password) password = await ask('密码（至少 6 位）：')
  const { status, json } = await relayPost('/register', { email, password })
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
  if (!email) email = await ask('邮箱：')
  if (!password) password = await ask('密码：')
  const { status, json } = await relayPost('/login', { email, password })
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
  ${CMD}               启动桌面应用（GUI 窗口）
  ${CMD} chat         终端对话模式（想问什么直接敲）
  ${CMD} register      注册中继账号（${CMD} register 邮箱 密码）
  ${CMD} login         登录中继账号（${CMD} login 邮箱 密码）
  ${CMD} me            查看当前登录与每日额度
  ${CMD} serve        启动本地后端 + 前端服务（浏览器访问 http://localhost:5173）
  ${CMD} app          同 ${CMD}，启动桌面应用
  ${CMD} help         显示本帮助

说明：
  - 连的是 NEXUS 中继时，需先 register/login 领取每日免费额度；
  - 用的是自己的 AI Key（backend/.env 的 AI_API_KEY）则无需登录，直接 chat；
  - 短命令 ${CMD === 'nexus' ? 'nexus' : 'nexus'}（不带参数）会直接进入终端对话。`)
}

// 不带子命令时：nexus 默认进终端聊天，nexusai 默认启动桌面应用
const cmd = process.argv[2] || (isNexus ? 'chat' : 'app')
switch (cmd) {
  case 'chat':
    chatMode()
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
