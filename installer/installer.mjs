#!/usr/bin/env node
import { spawn, execSync } from 'child_process'
import {
  existsSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from 'fs'
import { resolve, join } from 'path'
import { platform } from 'os'

// 安装器要克隆的仓库地址（作为兜底；用 npx github: 时 cwd 已经是仓库，不会再克隆）。
// 发布前可改成你自己的 GitHub 地址。
const REPO = process.env.NEXUS_REPO || 'https://github.com/2740354108/nexus-ai.git'
// 安装到哪个目录（npx nexus-ai 我的目录）
const TARGET = process.argv[2] || 'nexus-ai'

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
}
const ok = (s) => console.log(`${c.green}✓ ${s}${c.reset}`)
const warn = (s) => console.log(`${c.yellow}! ${s}${c.reset}`)
const err = (s) => console.log(`${c.red}✗ ${s}${c.reset}`)
const step = (s) => console.log(`\n${c.bold}${c.cyan}▶ ${s}${c.reset}`)

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: opts.silent ? 'ignore' : 'inherit',
      shell: opts.shell !== false,
      cwd: opts.cwd,
    })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}`))))
  })
}

function has(cmd) {
  try {
    execSync(platform() === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// 判断当前目录是否已经是克隆好的仓库（开发者在仓库内直接跑安装器时）
function isRepoHere() {
  return existsSync(join(process.cwd(), 'backend', 'package.json')) &&
    existsSync(join(process.cwd(), 'frontend', 'package.json'))
}

async function prepareApp() {
  if (isRepoHere()) {
    ok('已在仓库目录内，直接使用当前目录')
    return process.cwd()
  }
  const dest = resolve(process.cwd(), TARGET)
  if (existsSync(dest)) {
    warn(`目录 ${TARGET} 已存在，跳过克隆`)
    return dest
  }
  step(`从 GitHub 克隆 NEXUS AI → ${TARGET}`)
  await run('git', ['clone', '--depth', '1', REPO, TARGET])
  return dest
}

async function ensurePnpm() {
  if (has('pnpm')) {
    ok('pnpm 已安装')
    return
  }
  step('安装 pnpm…')
  await run('npm', ['install', '-g', 'pnpm'])
}

async function ensurePostgres() {
  if (has('psql') || has('pg_ctl') || has('postgres')) {
    ok('PostgreSQL 已安装')
    return true
  }
  if (platform() === 'win32') {
    warn('未检测到 PostgreSQL，尝试用 winget 安装（需要管理员权限）…')
    try {
      await run('winget', [
        'install',
        '-e',
        '--id',
        'PostgreSQL.PostgreSQL',
        '--accept-package-agreements',
        '--accept-source-agreements',
      ])
      ok('PostgreSQL 安装命令已执行，请按提示完成')
      return false
    } catch {
      warn('winget 安装失败，请手动安装 PostgreSQL：https://www.postgresql.org/download/windows/')
      return false
    }
  } else if (platform() === 'darwin') {
    warn('macOS 请执行：brew install postgresql')
    return false
  } else {
    warn('Linux 请执行：sudo apt install postgresql（或对应发行版命令）')
    return false
  }
}

async function installDeps(dir) {
  step('安装依赖（backend / frontend / nexus-bot）…')
  for (const sub of ['backend', 'frontend', 'nexus-bot']) {
    const p = join(dir, sub)
    if (existsSync(p)) await run('pnpm', ['install'], { cwd: p })
  }
  // 根目录 devDeps（electron，仅桌面打包需要）可选安装
  if (existsSync(join(dir, 'package.json'))) {
    try {
      await run('pnpm', ['install'], { cwd: dir })
    } catch {
      /* 桌面打包依赖可选，失败不影响核心功能 */
    }
  }
}

async function setupEnv(dir) {
  step('准备配置文件…')
  const be = join(dir, 'backend', '.env')
  if (!existsSync(be) && existsSync(join(dir, 'backend', '.env.example'))) {
    copyFileSync(join(dir, 'backend', '.env.example'), be)
  }
  let content = existsSync(be) ? readFileSync(be, 'utf-8') : ''
  if (!/^\s*DB_MODE=/m.test(content)) {
    content += '\n# 本地部署默认：直连本地 PostgreSQL\nDB_MODE=local\n'
  }
  if (!/^\s*DATABASE_URL=/m.test(content)) {
    content +=
      'DATABASE_URL=postgresql://postgres:你的密码@localhost:5432/nexus\n'
  }
  writeFileSync(be, content)
  warn('请在 backend/.env 填入你自己的 AI_API_KEY（OpenRouter 等），否则无法对话。')
}

async function ensureDb() {
  try {
    await run('createdb', ['nexus'], { silent: true })
    ok('已创建数据库 nexus')
  } catch {
    warn('数据库 nexus 可能已存在，或 PostgreSQL 未启动/未加入 PATH。可手动执行：createdb nexus')
  }
}

async function linkCli(dir) {
  step('将 nexusai 命令安装到全局…')
  try {
    await run('pnpm', ['link', '--global'], { cwd: dir })
    ok('已注册全局命令 nexusai')
  } catch {
    warn('全局链接失败，可手动在目录内运行：pnpm nexusai chat')
  }
}

async function main() {
  console.log(
    `${c.bold}${c.cyan}
   ___  ___  __ _  __ _   _ __ ___  
  / _ \\/ __|/ _\` |/ _\` | | '_ \` _ \\ 
 |  __/\\__ \\ (_| | (_| | | | | | | |
  \\___||___/\\__,_|\\__, | |_| |_| |_|
                   |___/   NEXUS AI 安装器${c.reset}`
  )
  if (!has('git')) {
    err('未检测到 git，请先安装：https://git-scm.com')
    process.exit(1)
  }
  if (!has('node')) {
    err('未检测到 Node.js，请先安装：https://nodejs.org')
    process.exit(1)
  }
  const nodeVer = Number(process.versions.node.split('.')[0])
  if (nodeVer < 18) {
    err(`Node.js 版本过低（${nodeVer}），需 >= 18`)
    process.exit(1)
  }
  await ensurePnpm()
  const pgOk = await ensurePostgres()
  const dir = await prepareApp()
  await installDeps(dir)
  await setupEnv(dir)
  if (pgOk) await ensureDb()
  await linkCli(dir)
  console.log(`\n${c.green}${c.bold}安装完成！${c.reset}`)
  console.log('接下来：')
  console.log('  1. 编辑 backend/.env，填入你的 AI_API_KEY（OpenRouter: https://openrouter.ai/keys）')
  console.log('  2. 终端对话：nexusai chat')
  console.log('  3. 桌面应用：nexusai')
  console.log('  4. 浏览器访问：nexusai serve  → http://localhost:5173')
  console.log('详细文档见 README.md')
}

main().catch((e) => {
  err(e.message)
  process.exit(1)
})
