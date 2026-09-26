#!/usr/bin/env node
import { spawn, execSync } from 'child_process'
import {
  existsSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
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
    // 目录已存在：若是 git 仓库，尝试拉取最新代码，确保用上修复后的版本
    if (existsSync(join(dest, '.git'))) {
      step(`目录 ${TARGET} 已存在，尝试更新到最新代码…`)
      try {
        await run('git', ['-C', dest, 'pull', '--ff-only'], { silent: true })
        ok('已更新到最新代码')
      } catch {
        // 浅克隆无法直接 fast-forward，改为 fetch 后重置到远端 HEAD
        try {
          await run('git', ['-C', dest, 'fetch', '--depth', '1', 'origin', 'main'], { silent: true })
          await run('git', ['-C', dest, 'reset', '--hard', 'FETCH_HEAD'], { silent: true })
          ok('已更新到最新代码')
        } catch {
          warn('更新失败（可能有本地改动），继续使用现有代码')
        }
      }
    } else {
      warn(`目录 ${TARGET} 已存在且非 git 仓库，跳过克隆，直接使用现有代码`)
    }
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

// 本地部署使用内嵌数据库（PGlite，零安装），不再强制安装 PostgreSQL。
// 如需连接外部 PostgreSQL，可在 backend/.env 设置 DATABASE_URL=postgresql://...

// 执行 pnpm 安装。新版 pnpm 处于“严格模式”时，只要存在被拦截的构建脚本
// （如 esbuild、electron），就会以退出码 1 结束，导致安装中断。这里显式把该行为
// 降级为提醒；真正需要执行构建脚本的依赖，已在各 package.json 的
// pnpm.onlyBuiltDependencies 中放行。
function pnpmInstall(cwd) {
  return run('pnpm', ['install', '--config.strict-dep-builds=false'], { cwd })
}

async function installDeps(dir) {
  step('安装依赖（backend / frontend / nexus-bot）…')
  for (const sub of ['backend', 'frontend', 'nexus-bot']) {
    const p = join(dir, sub)
    if (existsSync(p)) await pnpmInstall(p)
  }
  // 根目录 devDeps（electron，仅桌面打包需要）可选安装
  if (existsSync(join(dir, 'package.json'))) {
    try {
      await pnpmInstall(dir)
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
    content +=
      '\n# 本地部署默认：内嵌数据库（PGlite，零安装，数据存在 ./nexus-data）\nDB_MODE=local\n'
  }
  // 本地默认使用内嵌数据库，无需外部 PostgreSQL；如需连接外部 PostgreSQL，
  // 可手动设置：DATABASE_URL=postgresql://user:pass@host:5432/nexus
  writeFileSync(be, content)
  warn('请在 backend/.env 填入你自己的 AI_API_KEY（OpenRouter 等），否则无法对话。')
}

// npm 的全局可执行文件目录。Node.js 安装时该目录会加入系统 PATH，
// 因此把启动脚本写在这里，新开的终端一定能找到 nexusai 命令。
function npmGlobalBinDir() {
  try {
    const prefix = execSync('npm prefix -g', { encoding: 'utf-8' }).trim()
    if (!prefix) return null
    return platform() === 'win32' ? prefix : join(prefix, 'bin')
  } catch {
    return null
  }
}

// 直接写入启动脚本（不依赖 pnpm 的 PATH 配置，最稳妥）。
// 同时生成 nexus 与 nexusai 两个入口；nexus 默认进终端聊天，nexusai 保持原行为。
function writeShims(cliPath) {
  const binDir = npmGlobalBinDir()
  if (!binDir) return false
  try {
    mkdirSync(binDir, { recursive: true })
    const names = platform() === 'win32'
      ? (n) => [`${n}.cmd`, `${n}.ps1`]
      : (n) => [n]
    for (const name of ['nexus', 'nexusai']) {
      // nexus 短名默认进终端聊天，通过 --nexus 标记告知 CLI
      const marker = name === 'nexus' ? '--nexus ' : ''
      if (platform() === 'win32') {
        writeFileSync(join(binDir, `${name}.cmd`), `@echo off\r\nnode "${cliPath}" ${marker}%*\r\n`)
        writeFileSync(join(binDir, `${name}.ps1`), `node "${cliPath}" ${marker}$args\n`)
      } else {
        const f = join(binDir, name)
        writeFileSync(f, `#!/bin/sh\nexec node "${cliPath}" ${marker}"$@"\n`)
        chmodSync(f, 0o755)
      }
    }
    return true
  } catch {
    return false
  }
}

async function linkCli(dir) {
  step('注册 nexusai 命令…')
  const cliPath = join(dir, 'cli', 'nexusai.mjs')

  // 方式一：pnpm link --global（需要 pnpm 全局目录在 PATH 中）
  try {
    await run('pnpm', ['link', '--global'], { cwd: dir, silent: true })
    if (has('nexus') || has('nexusai')) {
      ok('已注册全局命令 nexus / nexusai')
      return
    }
  } catch {
    /* 失败则走方式二 */
  }

  // 方式二：写入 npm 全局可执行目录（Node 安装时已加入 PATH，最可靠）
  if (writeShims(cliPath) && (has('nexus') || has('nexusai'))) {
    ok('已注册全局命令 nexus / nexusai（写入 npm 全局目录）')
    return
  }

  // 两种都失败：给出不依赖全局命令的启动方式，保证照样能用
  warn('未能自动注册全局命令，可直接用下面任一方式启动（效果完全一样）：')
  warn(`  cd ${dir}`)
  warn('  pnpm nexusai chat      # 终端对话')
  warn('  pnpm nexusai serve     # 浏览器打开 http://localhost:5173')
  warn('  node cli/nexusai.mjs chat')
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
  const dir = await prepareApp()
  await installDeps(dir)
  await setupEnv(dir)
  await linkCli(dir)
  console.log(`\n${c.green}${c.bold}安装完成！${c.reset}`)
  console.log(`项目目录：${dir}`)
  console.log('接下来：')
  console.log('  1. 编辑 backend/.env，填入你的 AI_API_KEY（OpenRouter: https://openrouter.ai/keys）')
  console.log('  2. 终端对话：nexusai chat')
  console.log('  3. 桌面应用：nexusai')
  console.log('  4. 浏览器访问：nexusai serve  → http://localhost:5173')
  console.log('')
  console.log(`${c.yellow}如果提示「无法将 nexusai 项识别为 cmdlet」：${c.reset}`)
  console.log('  · 关掉这个终端窗口，重新开一个再试（PATH 需要新窗口才生效）；')
  console.log('  · 或者直接用下面两条等效命令（不用全局命令也能跑）：')
  console.log(`      cd "${dir}"`)
  console.log('      pnpm nexusai chat')
  console.log('详细文档见 README.md')
}

main().catch((e) => {
  err(e.message)
  process.exit(1)
})
