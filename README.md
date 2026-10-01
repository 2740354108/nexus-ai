# NEXUS AI

一个可本地运行的多模态 AI 助手：网页界面 + 桌面应用 + 终端对话 + 微信/QQ/Telegram 机器人。
对话、识图、生图、音乐、视频全部走公网模型接口（OpenRouter、MiniMax 等），数据默认存在本地内嵌数据库（零安装），也可直连外部 PostgreSQL / 云端数据库实现互通。

> 本项目开源免费。模型调用需要你自己的 API Key（OpenRouter 等），与部署方式无关。

## 功能特性

- **终端对话** `nexusai chat`：想问什么直接敲，支持多轮记忆、发图识图（`@图片路径`）
- **桌面应用** `nexusai`：GUI 窗口，自动拉起后端与前端
- **网页界面** `nexusai serve`：浏览器访问 `http://localhost:5173`
- **机器人接入**：微信、QQ、Telegram、Discord、企业微信（按需开启）
- **本地存储 / 云端互通**：默认存本地内嵌数据库（零安装）；也可直连外部 PostgreSQL / 云端数据库，两边数据一致

## 架构

一句话：**所有入口都是「瘦客户端」，能力全部集中在同一个后端**。网页、桌面、终端、手机、社交机器人只是不同的壳，真正干活的是后端；后端再向下对接「模型层」（各家 AI 接口）与「存储层」（内嵌或云端数据库），并通过 MCP 层接入外部工具。

```
用户触点（任一入口都能用）
  ├─ 网页 /ai         React + Vite         :5173
  ├─ 桌面 App         Electron
  ├─ 终端对话         nexusai (CLI)
  ├─ 手机 App         Capacitor (Android)
  └─ 社交机器人       nexus-bot             :3939
          │
          ▼ 所有入口统一走后端 API：http://localhost:3000/api
┌─ 服务层 · Backend（Express, :3000）
│  对话 / 识图 / 生图 / 音乐 / 视频
│  账号 / 会话 / 计费 / 配置 / 中继 / MCP 网关
└────────────────────────────────────
          │
          ▼
┌─ 支撑层
│  存储：PGlite 内嵌（默认，零安装）· TCB 云 · 外部 PostgreSQL
│  模型：OpenRouter（对话·识图·思考）· Agnes（图/视频）· MiniMax（音乐）· ComfyUI（本地视频）
│  能力：nexus-mcp（多 MCP 工具聚合）· nexus-up（后端与机器人常驻守护）
└────────────────────────────────────
```

### 模块清单

| 目录 | 角色 | 技术 | 端口 |
|------|------|------|------|
| `frontend/` | 网页界面 + 手机 App 界面 | React + Vite + Tailwind + shadcn/ui | `5173`（开发） |
| `electron/` | 桌面应用外壳，自动拉起后端与前端 | Electron | — |
| `cli/nexusai.mjs` | 终端对话、启动服务、打开桌面、常驻管理 | 纯 Node（零第三方依赖） | — |
| `cli/mcp-client.mjs` | CLI 侧多 MCP 客户端（stdio + HTTP 两种） | 纯 Node | — |
| `backend/` | 全部业务能力与 AI 代理 | Express + TypeScript | `3000` |
| `backend/web/` | 前端构建产物，由后端一并托管（单端口部署时） | — | 复用 `3000` |
| `nexus-bot/` | 社交平台机器人网关 | TypeScript + tsx | `3939` |
| `nexus-mcp/` | 自研 MCP 服务器（知识库 / 能力清单 / nexus_chat） | @modelcontextprotocol/sdk | `8787` / stdio |
| `installer/` | npm 安装器 `nexus-ai`，用于 `npx` 一键安装 | 纯 Node | — |
| `scripts/nexus-up.sh` | 后端 + 机器人双进程常驻守护 | Bash | — |
| `scripts/nexus.service` | 开机自启样例 | systemd | — |

### 后端接口分区

后端按业务拆成独立模块，挂载在不同前缀下（全部在 `/api` 之下）：

| 前缀 | 模块 | 作用 |
|------|------|------|
| `/api` | `system` | 健康检查、系统信息 |
| `/api/ai` | `ai` | 对话（`/chat`、`/chat/stream`、`/v1/*` OpenAI 兼容），多模型链自动切换 |
| `/api/image` | `image` | 文生图（Pollinations，免费开箱即用） |
| `/api/agnes` | `agnes` | 文生图 / 图生图 / 文生视频 / 图生视频 |
| `/api/music` | `music` | 音乐生成（MiniMax / Suno / HuggingFace / Replicate / ACE） |
| `/api/video` | `video` | 图生视频 / 文生视频（ComfyUI） |
| `/api/auth` | `auth` | 自托管账号（JWT）注册登录 |
| `/api/relay` | `relay` | 公开中继：注册 / 登录 / 每日额度 |
| `/api/histories` | `histories` | 聊天记录 |
| `/api/conversations` | `conversations` | 会话管理 |
| `/api/mcp` · `/api/servers` | `mcp` + `mcpAggregator` | MCP 转发网关（JSON-RPC 透传）+ 多 MCP 聚合状态 |
| `/api/billing` | `billing` | 套餐 / 订阅 / 订单 / 用量 |
| `/api/config` | `config` | 云端用户配置（多租户隔离） |

### 四条主要链路

**A · 网页 / 桌面**　浏览器(`5173`) → Vite 代理 `/api` → 后端(`3000`) → 模型层 / 存储层。桌面版由 Electron 自动拉起后端和前端，窗口内加载 `http://localhost:5173`。

**B · 终端对话**　`nexusai chat` → 直接调模型接口（不经后端）。若配了 MCP，会先连上这些 server、把工具表交给模型，由模型自己决定调用哪个工具，多轮跑完再输出。

**C · 社交机器人**　微信 / QQ / Telegram / Discord / 企业微信 → `nexus-bot`(`3939`) 统一成标准消息 → POST 后端 `/api/ai/v1/chat/completions` → 回复按原路回传平台。

**D · 外部应用接入**　任何第三方应用 → 后端 OpenAI 兼容接口 `http://localhost:3000/api/ai/v1/chat/completions`（带 `AI_BOT_TOKEN` 或用户 Key 鉴权）→ 模型层。等于把你的模型能力开放成一整套标准接口。

### 存储层

三种模式，改一个 `DB_MODE` 即可切换（详见下方「配置说明」）：

- **PGlite**（默认）：内嵌的 PostgreSQL（纯 WASM），**零安装**，数据落在本地 `nexus-data/` 目录
- **TCB 云端**：托管 PostgreSQL，服务器自动配置
- **外部 PostgreSQL**：保持 `DB_MODE=local` 并填 `DATABASE_URL`，即可与云端共用同一份数据，两边互通

### 模型层

对话默认走 **OpenRouter 的 OpenAI 兼容接口**，可换 DeepSeek / GLM / Kimi 等任意兼容服务。后端维护**多模型链**：对话、识图、深度思考各有一条链，主模型被限流或下架时自动切到下一个；CLI 侧同样会自动换用可用模型并记住选择。

### 能力层与运维层

- **`nexus-mcp`**：既能作为独立 MCP 服务器对外提供工具，也能被后端的 `/api/mcp` 网关转发
- **多 MCP 聚合**：CLI 与后端共享同一份 `~/.nexusai/mcp-servers.json`，可同时接入多个本地进程（stdio）或远程（HTTP）MCP server，工具名自动加前缀去重
- **`nexus-up`**：把后端和机器人做成后台常驻，谁崩了自动拉起，附 `systemd` 配置可开机自启

### 端口速查

| 端口 | 服务 | 说明 |
|------|------|------|
| `3000` | 后端 API | 所有能力的统一入口；生产环境同时托管网页 |
| `5173` | 前端开发服务器 | Vite，`/api` 代理到 `3000` |
| `3939` | 机器人主进程 | nexus-bot 运行端口 |
| `8787` | nexus-mcp HTTP 模式 | MCP 服务器 |
| `8788` | 企业微信回调 | 需公网可访问 |
| `8789` | 微信公众号回调 | 需公网可访问 |
| `3001` | OneBot / NapCat | 非官方 QQ 通道（默认 WebSocket） |
| `8188` | ComfyUI | 本地生视频 |
| `11434` | Ollama | 本地模型 |
| `1234` | LM Studio | 本地模型（OpenAI 兼容） |

### 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui（Radix）+ Framer Motion + TanStack Query + React Router |
| 桌面 | Electron |
| 手机 | Capacitor（Android） |
| 后端 | Node.js + Express + TypeScript + Zod + JWT |
| 机器人 | TypeScript + discord.js + ws |
| MCP | @modelcontextprotocol/sdk |
| 数据 | PGlite（内嵌 WASM）/ TCB 托管 PostgreSQL / 外部 PostgreSQL |
| 模型 | OpenRouter · Agnes · MiniMax · Suno · HuggingFace · Replicate · ComfyUI · Ollama |
| 安装 | `npx`（installer/）+ pnpm workspace |

### 数据与配置落点

| 内容 | 位置 |
|------|------|
| 终端配置 | `~/.nexusai/config.json`（优先级最高） |
| 后端配置 | `backend/.env` |
| 机器人配置 | `nexus-bot/.env` |
| MCP 聚合配置 | `~/.nexusai/mcp-servers.json` |
| 本地数据 | `nexus-data/`（PGlite 数据目录） |
| 常驻日志 | `.nexus-runtime/logs/` |

## 快速开始（推荐）：npx 直接从 GitHub 安装

别人（或你自己）在装好 Node.js 的电脑上，一行命令即可——**不需要先发 npm**，直接从你的 GitHub 仓库下载安装：

```bash
npx github:2740354108/nexus-ai
```

安装器会自动：检查/安装 pnpm、从你的 GitHub 克隆本项目、安装依赖（含内嵌数据库，无需你装任何数据库软件）、生成配置、注册 `nexusai` 全局命令。

> 若终端提示「无法将 `nexusai` 项识别为 cmdlet / command not found」，说明全局命令没进 PATH：**重开一个终端窗口**再试；仍不行就进项目目录用 `pnpm nexusai chat`，效果完全一样。

可选：指定安装目录

```bash
npx github:2740354108/nexus-ai my-folder
```

> `npx github:` 形式首次运行会把桌面打包工具（Electron）一起装上，属正常一次性下载；若想更轻量，可改用下面的 npm 形式。

### 另一种方式：先发布 npm 安装器（更快）

如果你希望别人用更短的 `npx nexus-ai`（不拉桌面构建依赖），可把 `installer/` 这个小包发布到 npm：

```bash
cd installer && npm publish
```

之后别人用 `npx nexus-ai` 即可（效果与 `npx github:` 完全一致，只是安装器本身来自 npm）。

> 无论哪种方式，最终装的都是你 GitHub 上的同一个项目。`installer/installer.mjs` 里的 `REPO` 作为兜底地址，一般不用改。

## 手动安装

```bash
# 1. 克隆
git clone https://github.com/2740354108/nexus-ai.git
cd nexus-ai

# 2. 安装依赖（根目录 + 三个子目录，共 4 次）
pnpm install                # 根目录
pnpm -C backend install     # 后端
pnpm -C frontend install    # 前端
pnpm -C nexus-bot install   # 机器人（可选）

# 3. 配置 AI（第一次必做，一条命令搞定）
pnpm nexusai setup     # 向导：选「用自己的 Key」→ 粘贴 Key 即可（自动写好配置）

# 4. 启动
pnpm nexusai chat      # 终端对话（装过全局命令后直接敲 nexus）
pnpm nexusai           # 桌面应用
pnpm nexusai serve     # 网页（http://localhost:5173）
```

## 配置说明

配置由 `nexusai setup` 自动写入两处：项目内 `backend/.env`（网页/桌面端读取）和 `~/.nexusai/config.json`（终端读取，优先级更高，更新代码不会丢）。用 `nexusai config` 可随时查看。

| 配置 | 说明 |
|------|------|
| `AI_API_BASE` | AI 服务地址。自带 Key 用 `https://openrouter.ai/api/v1`；连中继时填你的中继地址（…/api/ai/v1） |
| `AI_API_KEY` | **必填**。自带 Key 模式填你自己的模型密钥；连中继模式填中继的公开令牌 |
| `AI_MODEL` / `AI_VISION_MODEL` | 对话 / 识图模型，默认免费模型 |
| `DB_MODE` | `local`（默认，内嵌数据库，零安装）或 `cloud`（云端 TCB） |
| `NEXUS_DATA_DIR` | 内嵌数据库存放目录，默认 `./nexus-data` |
| `DATABASE_URL` | 可选。填 `postgresql://...` 则改用外部 PostgreSQL（与云端共用数据时用） |

AI 密钥获取（免费）：https://openrouter.ai/keys

> 仓库默认**不内置任何可用服务器地址**，装完须配置一次。如果看到 `Hostname/IP does not match certificate` 报错，说明地址填的是示例占位域名，运行 `nexusai setup` 重新填写即可。

## 让别人免填 key（可选：托管中继）

这一步**不是必须的**。只有当你希望下载你项目的人「零配置直接能用 AI」时才需要做，且需要你**自己有一台公网服务器**。没部署中继也完全能用——下载者各自 `nexusai setup` 填自己的 Key 即可。

1. **站长（你）部署中继**：在一台公网服务器上跑本项目的后端，设置：
   ```
   AI_API_KEY=sk-or-你的真实key        # 真 key，只在你服务器，不下发、不进仓库
   AI_BOT_TOKEN=nexus-public-demo      # 开启公开中继模式的开关（同时作为站长自有网关的放行令牌）
   RELAY_DAILY_LIMIT=20                # 每个注册账号每天免费对话次数（可选，默认 20）
   RELAY_TRIAL_PER_IP=5                # 未登录访客每 IP 每天试用次数（可选，默认 5）
   ```
2. **告诉下载者你的中继地址**：下载者 `nexusai setup` 选 2 填入即可；也可把 `backend/.env.example` 的 `AI_API_BASE` 默认值改成你的中继地址，让下载者免填。
3. **下载者**：`npx github:2740354108/nexus-ai` 装完后：
   ```
   nexusai setup                      # 选 2，填中继地址
   nexusai register 你的邮箱 密码     # 注册并领取每日免费额度
   nexusai login   你的邮箱 密码     # 已注册则直接登录
   nexusai chat                      # 开始对话（每天 20 次免费）
   ```
   网页/桌面端也会自动弹出"免费试用 · 注册/登录"入口。所有下载者**全程看不到你的真 key**。

安全说明：开启 `AI_BOT_TOKEN` 后即进入"公开中继模式"——未注册访客只有极少量 IP 试用额度，注册后按账号计每日额度，超限提示第二天再来；`AI_BOT_TOKEN` 可公开、可随时重置，真实 key 始终只在你的服务器，不会产生你的计费风险。想无限流或超额了，下载者也可 `nexusai setup` 填自己的 key。

## 云端互通（本地连云端数据库）

想让本机部署和云端跑同一份数据，只需在本地 `backend/.env` 里把 `DATABASE_URL` 指向**云端数据库的外网连接串**（在云厂商控制台开启 PostgreSQL 公网访问后获取），并保持 `DB_MODE=local`。这样本地读写的数据，云端也能看到，反之亦然。

```
DB_MODE=local
DATABASE_URL=postgresql://云端用户:云端密码@云端主机:5432/nexus
```

> 安全提示：云端数据库外网连接串包含账号密码，请勿提交到公开仓库；建议为本地单独创建一个只读/限定权限的账号。

## CLI 用法

| 命令 | 作用 |
|------|------|
| `nexus` | 一敲直接进终端对话（短命令，最省事；未配置时自动弹配置向导） |
| `nexus setup` | 配置向导：填 AI Key 或中继地址（第一次必做） |
| `nexus config` | 查看当前配置、服务地址、Key、版本与登录状态 |
| `nexus update` | 更新到最新版本（自动拉代码 + 装依赖） |
| `nexusai` / `nexusai app` | 打开桌面应用（GUI） |
| `nexusai chat` | 终端对话，直接输入问题；`@图片路径` 发图识图；`/clear` 清空；`/exit` 退出 |
| `nexusai register 邮箱 密码` | 注册中继账号并领取每日免费额度 |
| `nexusai login 邮箱 密码` | 登录已有中继账号 |
| `nexusai me` | 查看当前登录与每日额度剩余 |
| `nexusai serve` | 启动后端 + 前端，浏览器访问 `http://localhost:5173` |
| `nexusai help` | 帮助 |

### 更新与排障

代码会**自动保持最新**：每次启动都会在后台静默对齐一次最新代码（每 6 小时最多一次，存在本地改动时不动），正常情况下你不需要管更新。

如果你的命令行里**没有 `update` 这个子命令**，说明本机是很旧的版本（模型/接口都可能已过期）。整段复制粘贴下面四行，重装一次即可，之后上面的自动更新就会生效：

```powershell
cd $env:USERPROFILE\Desktop
Remove-Item -Recurse -Force nexus-ai -ErrorAction SilentlyContinue
git clone --depth 1 https://github.com/2740354108/nexus-ai.git nexus-ai
node nexus-ai\installer\installer.mjs
```

重装会保留你的聊天数据（`nexus-data/`）和配置（`~/.nexusai/config.json`），Key 不用重填。

## 桌面应用打包（Windows）

```bash
pnpm install        # 安装含 electron 的根依赖
pnpm pack:win       # 生成 dist-electron/ 下的 exe 安装包
```

> exe 必须在本机打包，云端环境无法生成 Windows 安装包。

## 机器人（可选）

机器人配置见 `nexus-bot/.env.example`。各平台按需开启：

- **微信 / QQ**：需各自平台的账号或审核通过的机器人
- **Telegram / Discord**：填 Bot Token 即可，本地轮询无需公网
- **企业微信**：支持群机器人 webhook 或企业应用双向消息

## 作为技能接入 Agent（SKILL.md）

仓库根目录的 `SKILL.md` 让本项目可以被支持「从 GitHub 导入技能」的 Agent 直接导入。
导入后，Agent 就知道如何调用你本机的 NEXUS AI——对话、识图、文生图、生视频、生音乐，
并在服务没启动时把它拉起来。

- 技能入口：`SKILL.md`
- 接口速查：`skill/references/api.md`
- 配置与排障：`skill/references/config.md`
- 一键调用：`skill/scripts/nexus.sh`

## 开发

```bash
cd backend && pnpm dev      # 后端 :3000
cd frontend && pnpm dev     # 前端 :5173
cd nexus-bot && pnpm start  # 机器人
```

## License

[MIT](./LICENSE) — 自由使用、修改、分发。
