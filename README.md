# NEXUS AI

一个可本地运行的多模态 AI 助手：网页界面 + 桌面应用 + 终端对话 + 微信/QQ/Telegram 机器人。
对话、识图、生图、音乐、视频全部走公网模型接口（OpenRouter、MiniMax 等），数据默认存在本地内嵌数据库（零安装），也可直连外部 PostgreSQL / 云端数据库实现互通。

> 本项目开源免费。模型调用需要你自己的 API Key（OpenRouter 等），与部署方式无关。

---

## 目录

1. [功能特性](#功能特性)
2. [架构](#架构)
3. [开始前要准备什么](#开始前要准备什么)
4. [快速开始（推荐）：npx 直接从 GitHub 安装](#快速开始推荐npx-直接从-github-安装)
5. [手动安装](#手动安装)
6. [第一次配置：填 Key、选模型](#第一次配置填-key选模型)
7. [怎么用：四个入口](#怎么用四个入口)
8. [机器人：把 AI 请进微信群 / QQ 群](#机器人把-ai-请进微信群--qq-群)
9. [常驻运行：一直在线、崩了自愈](#常驻运行一直在线崩了自愈)
10. [进阶一：生图 / 生视频](#进阶一生图--生视频)
11. [进阶二：本地部署模型](#进阶二本地部署模型)
12. [进阶三：接 MCP（多工具 / 多厂商）](#进阶三接-mcp多工具--多厂商)
13. [把我的模型 / AI 能力接进别的应用](#把我的模型--ai-能力接进别的应用)
14. [飞书回传](#飞书回传)
15. [链式自动化（Workflow 自动化办公）](#链式自动化workflow-自动化办公)
16. [端口与地址速查表](#端口与地址速查表)
17. [云端互通（本地连云端数据库）](#云端互通本地连云端数据库)
18. [更新与排障](#更新与排障)
19. [附：让别人免填 Key（站长中继模式）](#附让别人免填-key站长中继模式)
20. [作为技能接入 Agent（SKILL.md）](#作为技能接入-agent-skillmd)
21. [开发](#开发)

---

## 功能特性

一句话：**一个能跑在自己电脑 / 服务器上的多模态 AI 助手**，不只是聊天，而是一整套能力：

- **对话 + 识图**：网页 / 桌面 / 终端 / 机器人，多轮记忆，能看懂图片
- **终端对话** `nexusai chat`：想问什么直接敲，支持多轮记忆、发图识图（`@图片路径`，可一次多张）
- **桌面应用** `nexusai`：GUI 窗口，自动拉起后端与前端
- **网页界面** `nexusai serve`：浏览器访问 `http://localhost:5173`，功能最全
- **手机 App**：Capacitor 打包的安卓端，形态与网页一致
- **机器人接入**：微信、QQ、Telegram、Discord、企业微信（按需开启）
- **文生图 / 图生图**：网页「图像 / Agnes」页，联网即开箱即用
- **文生视频 / 图生视频**：云端免费接口，或本地 ComfyUI
- **AI 音乐**：一句话生成完整曲目
- **自动化办公（Workflow）**：链式任务，结果可回传飞书
- **本地模型接入**：Ollama、LM Studio、vLLM 直接接
- **MCP 聚合**：CLI + 后端共享配置，接多个厂商 / 本地 MCP 工具，对话时自动调用
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

三种模式，改一个 `DB_MODE` 即可切换（详见「第一次配置」）：

- **PGlite**（默认）：内嵌的 PostgreSQL（纯 WASM），**零安装**，数据落在本地 `nexus-data/` 目录
- **TCB 云端**：托管 PostgreSQL，服务器自动配置
- **外部 PostgreSQL**：保持 `DB_MODE=local` 并填 `DATABASE_URL`，即可与云端共用同一份数据，两边互通

### 模型层

对话默认走 **OpenRouter 的 OpenAI 兼容接口**，可换 DeepSeek / GLM / Kimi 等任意兼容服务。后端维护**多模型链**：对话、识图、深度思考各有一条链，主模型被限流或下架时自动切到下一个；CLI 侧同样会自动换用可用模型并记住选择。

### 能力层与运维层

- **`nexus-mcp`**：既能作为独立 MCP 服务器对外提供工具，也能被后端的 `/api/mcp` 网关转发
- **多 MCP 聚合**：CLI 与后端共享同一份 `~/.nexusai/mcp-servers.json`，可同时接入多个本地进程（stdio）或远程（HTTP）MCP server，工具名自动加前缀去重
- **`nexus-up`**：把后端和机器人做成后台常驻，谁崩了自动拉起，附 `systemd` 配置可开机自启

### 技术栈

| 层 | 技术 |
|----|------|
| 前端 / 网页 | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui（Radix）+ Framer Motion + TanStack Query + React Router |
| 桌面 | Electron |
| 手机 | Capacitor（Android） |
| 后端 | Node.js + Express + TypeScript + Zod + JWT |
| 机器人 | TypeScript + discord.js + ws |
| 终端 CLI | Node.js 单文件零依赖（`cli/nexusai.mjs`） |
| MCP | @modelcontextprotocol/sdk（nexus-mcp 服务端）；CLI / 后端手写零依赖聚合客户端 |
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

---

## 开始前要准备什么

需要准备的东西不多，别被「AI 项目」吓到：

1. **一台能联网的电脑或服务器**（Windows / macOS / Linux 都行）。
   - 想 24 小时在线当机器人服务器 → 用一台**云电脑**最稳（本机一休眠机器人就掉线）。
2. **Git**（用来从 GitHub 拉代码）。没装的去 https://git-scm.com 装。
3. **Node.js ≥ 18** 和 **pnpm**。
   - 装 Node：https://nodejs.org （选 LTS）
   - 装 pnpm：装好 Node 后，命令行跑 `npm install -g pnpm`
4. **一个 AI Key**（推荐 OpenRouter，免费申请）。
   - 去 https://openrouter.ai/keys 注册 → 创建一个 Key（免费额度够日常玩）。
   - 这就是后面要填的 `AI_API_KEY`。
5. **可选**：
   - 想跑**高质量本地生图 / 生视频** → 需要一张显卡 + 自己部署 ComfyUI（见「进阶一」）。
   - 想接**本地大模型**（Ollama 等）→ 本机再装个 Ollama 即可。
   - 想开**微信 / QQ 机器人** → 需要对应平台的账号 / 审核通过的机器人（见「机器人」一节）。

> 纯断网是跑不了的，因为默认模型在云端。接了本地模型（Ollama）后可以不完全依赖外网，但配置阶段还是要联网。

---

## 快速开始（推荐）：npx 直接从 GitHub 安装

别人（或你自己）在装好 Node.js 的电脑上，一行命令即可——**不需要先发 npm、不用手动 git clone**，直接从你的 GitHub 仓库下载安装：

```bash
npx github:2740354108/nexus-ai
```

安装器会自动做这些事：

- 检查 / 安装 pnpm
- 从 GitHub 克隆项目到当前目录的 `nexus-ai/`
- 安装依赖（内含**内嵌数据库 PGlite，零安装**，不用装任何数据库软件）
- 生成配置、注册 `nexusai` 全局命令

装完验证一下：重开一个终端，敲

```bash
nexusai help
```

能看到命令列表就成功了。

> 若终端提示「无法将 `nexusai` 项识别为 cmdlet / command not found」，说明全局命令没进 PATH：**重开一个终端窗口**再试；仍不行就进项目目录用 `pnpm nexusai chat`，效果完全一样。

想装到指定目录：

```bash
npx github:2740354108/nexus-ai my-folder
```

> `npx github:` 形式首次运行会把桌面打包工具（Electron）一起装上，属正常一次性下载，稍大；若想更轻量，可改用下面的手动安装。

### 另一种方式：先发布 npm 安装器（更快）

如果你希望别人用更短的 `npx nexus-ai`（不拉桌面构建依赖），可把 `installer/` 这个小包发布到 npm：

```bash
cd installer && npm publish
```

之后别人用 `npx nexus-ai` 即可（效果与 `npx github:` 完全一致，只是安装器本身来自 npm）。

> 无论哪种方式，最终装的都是同一个 GitHub 项目。`installer/installer.mjs` 里的 `REPO` 作为兜底地址，一般不用改。

---

## 手动安装

```bash
# 1. 克隆
git clone https://github.com/2740354108/nexus-ai.git
cd nexus-ai

# 2. 装依赖（根目录 + 三个子目录，共 4 次）
pnpm install                # 根目录
pnpm -C backend install     # 后端
pnpm -C frontend install    # 前端
pnpm -C nexus-bot install   # 机器人（只玩网页/终端可不装）

# 3. 第一次必做：配置 AI Key（向导式，自动写文件）
pnpm nexusai setup

# 4. 启动
pnpm nexusai chat      # 终端对话
pnpm nexusai serve     # 网页（浏览器开 http://localhost:5173）
pnpm nexusai app       # 桌面应用
```

> 开发者模式单独起各服务：
>
> ```bash
> cd backend   && pnpm dev      # 后端 :3000
> cd frontend  && pnpm dev      # 前端 :5173
> cd nexus-bot && pnpm start    # 机器人
> ```

---

## 第一次配置：填 Key、选模型

### 6.1 用向导（最省心）

```bash
nexusai setup
```

它会问两种用法，选一个：

- **用法 1（推荐，自带 Key）**：选「用自己的 Key」，把 OpenRouter 的 Key 粘进去。无限流、最稳，Key 只存在本地。
- **用法 2（连中继）**：如果知道某个站长部署的中继地址，选这个填进去，可免自己申请 Key（但有每日额度）。自己没部署中继**不要**选这个。

配置会写进两个地方（优先级：`~/.nexusai/config.json` > `backend/.env`）：

- `backend/.env` —— 网页 / 桌面端读取
- `~/.nexusai/config.json` —— 终端读取，更新代码不会丢

随时查看当前配置：`nexusai config`

### 6.2 后端 `backend/.env` 关键项（网页 / 桌面端用）

| 配置 | 说明 | 默认 |
|------|------|------|
| `AI_API_BASE` | AI 服务地址。自带 Key 用 `https://openrouter.ai/api/v1`；连中继填 `…/api/ai/v1` | openrouter |
| `AI_API_KEY` | **必填**。自带 Key 模式填自己的模型密钥；连中继模式填中继的公开令牌 | 空 |
| `AI_MODEL` | 对话主模型 | 免费模型，会随上下架变化 |
| `AI_MODEL_THINK` | 深度思考（推理）模型 | deepseek-r1:free |
| `AI_VISION_MODEL` / `AI_VISION_FALLBACKS` | 识图模型链（发图片时自动切） | 免费视觉模型 |
| `DB_MODE` | `local`（默认，内嵌数据库零安装）或 `cloud`（云端 TCB） | local |
| `NEXUS_DATA_DIR` | 内嵌数据库存放目录 | `./nexus-data` |
| `DATABASE_URL` | 可选，填 `postgresql://…` 则改用外部 PostgreSQL（与云端共用数据） | 空 |
| `AGNES_API_BASE` | Agnes 多模态服务地址（与下一项配套） | `https://apihub.agnes-ai.cn/v1` |
| `AGNES_API_KEY` | Agnes 多模态（文生图/视频）密钥，没有则那一块不可用 | 空 |
| `COMFYUI_URL` | 本地 ComfyUI 地址（高质量生图/视频用） | http://localhost:8188 |
| `ACEMUSIC_API_KEY` | AI 音乐（ACE-Step）。不填也能用其它音乐 provider | 空 |
| `AI_BOT_TOKEN` | 开中继模式才设（站长用） | 空 |

AI 密钥获取（免费）：https://openrouter.ai/keys

> 仓库默认**不内置任何可用服务器地址**，装完须配置一次。如果看到 `Hostname/IP does not match certificate` 报错，说明地址填的是示例占位域名，运行 `nexusai setup` 重新填写即可。
>
> 免费模型会随时上下架，CLI / 后端都做了**自动切换当前可用模型**，一般不用手改模型名。

### 6.3 前端「设置页」（网页 / 手机端对话用）

网页端对话默认走**前端设置页里填的接口与 Key**（前端直连 OpenAI 兼容服务），不是走后端。打开网页 → 设置，可以配：

- `chatApiBase` + `openrouterKey` + `chatModel`：对话接口（默认 OpenRouter，可改成 Ollama / LM Studio / vLLM）
- `chatModelThink`：深度思考模型
- `pollinationsToken`：生图令牌（不填也能画）
- `comfyUrl` / `comfyCheckpoint` / `comfyUnet` / `comfyVae` / `comfyClipVision`：本地 ComfyUI 生图 / 视频
- `workflowUrl` / `workflowKey`：自动化办公自建服务（见「链式自动化」）
- `feishuWebhook`：飞书回传（见「飞书回传」）
- `routerEndpoint` / `routerModel` / `routerApiKey`：备用模型，主模型可自动把子任务转给它

> 两套配置的区别：**后端 `.env`** 是「服务端」用的（机器人、对外接口、音乐 / 视频生成）；**前端设置页**是「网页 / 手机端自己直连」用的。想让网页端直接调本机的 Ollama，就改前端设置页；想让机器人和对外接口用某个模型，就改后端 `.env`。

---

## 怎么用：四个入口

### 7.1 网页端（功能最全）

```bash
nexusai serve
```

浏览器打开 **http://localhost:5173**。里面的标签页大致有：

- **智能对话**：聊天 + 发图识图 + 深度思考 / 联网开关
- **AI 音乐**：一句话生成曲目
- **图生视频**：上传一张图让它动起来（或文生视频）
- **图像 / 绘图**：文生图、切 ComfyUI 高质量
- **Agnes AI**：免费多模态，文生图 / 图生图 / 文生视频 / 图生视频合一
- **自动化**：Workflow 链式任务 + 飞书回传（见「链式自动化」）
- **我的空间 / 设置**：历史、配置、模型切换

### 7.2 终端 CLI（最轻量，霓虹风）

```bash
nexus                 # 短命令，直接进对话（没配置会自动弹向导）
nexusai               # 同上
nexusai chat          # 显式进入终端对话
```

对话里能用的小技巧：

- `@图片路径 描述` —— 发图识图（支持一次多张：`@a.png @b.jpg 对比这两张`）
- `/clear` —— 清空上下文
- `/exit` 或 Ctrl+D —— 退出
- `/mcp` —— 查看已接入的 MCP 工具（见「进阶三」）
- 思考时有旋转光标，不再干等

常用命令一览：

| 命令 | 作用 |
|------|------|
| `nexus` | 一敲直接进终端对话（最省事；未配置时自动弹配置向导） |
| `nexus setup` | 配置向导：填 AI Key 或中继地址（第一次必做） |
| `nexus config` | 查看当前配置、服务地址、Key、版本与登录状态 |
| `nexus update` | 更新到最新版本（自动拉代码 + 装依赖） |
| `nexusai` / `nexusai app` | 打开桌面应用（GUI） |
| `nexusai chat` | 终端对话，直接输入问题 |
| `nexusai register 邮箱 密码` | 注册中继账号并领取每日免费额度 |
| `nexusai login 邮箱 密码` | 登录已有中继账号 |
| `nexusai me` | 查看当前登录与每日额度剩余 |
| `nexusai serve` | 启动后端 + 前端，浏览器访问 `http://localhost:5173` |
| `nexusai up` / `up status` / `up stop` / `up restart` | 常驻管理（见「常驻运行」） |
| `nexusai help` | 帮助 |

### 7.3 桌面端

```bash
nexusai app
```

会弹出一个 GUI 窗口，自动拉起后端与前端，适合不想开浏览器的情况。打包 Windows 安装包：

```bash
pnpm install && pnpm pack:win    # 生成 dist-electron/ 下的 exe（必须在 Windows 本机打）
```

> exe 必须在本机打包，云端环境无法生成 Windows 安装包。

### 7.4 手机 App

前端用 Capacitor 打包安卓端，安装到手机后形态和网页一致，含「自动化」标签页。

---

## 机器人：把 AI 请进微信群 / QQ 群

机器人是一个**独立程序 `nexus-bot`**，它自己不聪明，只是把微信 / QQ 等平台的消息转给**后端（localhost:3000）**去算。所以记住一句话：

> **机器人能不能用，取决于后端在不在跑。** 后端没起，机器人就「连不上后端」没声。

### 8.1 配置 `nexus-bot/.env`

机器人目录下有 `.env.example`，复制成 `.env` 后按平台开启。关键项：

| 变量 | 作用 |
|------|------|
| `NEXUS_API_BASE` | 后端地址，**默认 `http://localhost:3000/api/ai/v1`**（和后端同机填这个） |
| `OPENROUTER_API_KEY` / `BOT_MODEL` | 机器人直连模型用（也可只靠后端，留空也行） |
| `ENABLE_TELEGRAM` + `TELEGRAM_BOT_TOKEN` | Telegram（最简单，填 Token 即可，本地就能跑） |
| `ENABLE_DISCORD` + `DISCORD_BOT_TOKEN` | Discord（填 Token） |
| `ENABLE_QQ` + `QQ_BOT_APPID` / `QQ_BOT_TOKEN` / `QQ_BOT_SECRET` | QQ 官方机器人（需开放平台审核发布） |
| `ENABLE_ONEBOT` + `ONEBOT_WS_URL` | OneBot / NapCat（挂在自己 QQ 上，能收全部消息，无 5 秒限制） |
| `ENABLE_WECOM` + 企业微信参数 | 企业微信（群机器人 webhook 或企业应用） |
| `ENABLE_WECHAT_MP` + 小程序参数 | 微信小程序 / 微信 iLink |
| `BOT_SYSTEM_PROMPT` | 自定义机器人人设（不填用默认） |
| `BOT_HEALTH_PORT` | 健康检查端口，默认 3939 |

### 8.2 各平台怎么开（由简到繁）

- **Telegram / Discord**：最省心，去对应平台申请 Bot Token，填上 `ENABLE_*` 和 Token，本地就能跑，不需要公网。
- **QQ 官方机器人**：去 QQ 开放平台创建机器人，拿到 appid / token / secret，填好。**必须审核发布后才会推送消息**。
- **OneBot（NapCat / LLOneBot）**：在自己登录的 QQ 上挂一个 OneBot 框架（如 NapCat），让它暴露 WebSocket（默认 `ws://127.0.0.1:3001`），机器人填 `ENABLE_ONEBOT=true` 即可。**优点**：能收群里所有消息、没有官方机器人的 5 秒被动回复限制，最稳。
- **企业微信 / 微信小程序**：按需填企业微信或微信小程序的参数。

启动机器人：

```bash
cd nexus-bot && pnpm start
```

### 8.3 让机器人不掉线（重点）

机器人依赖后端常驻，见「常驻运行」。最简方案：在同一台机器用 `nexusai up` 把后端 + 机器人一起守护起来，谁崩了自动重启。

### 8.4 常见机器人故障

- **「连不上后端」**：后端没起，或端口被抢。先用 `nexusai up status` 看后端在不在跑。
- **「动不动没声」**：
  1. 后端没常驻（用「常驻运行」解决）；
  2. QQ 官方机器人的「被动回复 5 秒窗口」——模型一慢，回复超时会被吞（换 OneBot 方案可根治）；
  3. 免费模型偶发限流。
- **图片收不到**：QQ 官方机器人只能看到「@它那条消息」里带的图；OneBot 没有这个限制。

### 8.5 微信陪伴搭子「阿枢」（可选）

微信通道（iLink / ClawBot 扫码那条）默认启用一个专属陪伴人设「阿枢」：它记得你做过的事、你说过的心情，你报喜时先真诚具体地祝贺、低落时先接住情绪再谈技术。

- **长期记忆**：存在 `~/.nexusai/companion-memory.json`，跨重启保留；想让它「忘掉」什么，删这个文件即可（注意 `/reset` 只清当轮对话，不清长期记忆）。
- **想换人设**：在 `nexus-bot/.env` 填 `WECHAT_SYSTEM_PROMPT=…`，记忆与报喜逻辑不受影响。
- **只作用于微信**：QQ / Telegram / Discord 等其它平台不受影响。

---

## 常驻运行：一直在线、崩了自愈

适合：云电脑 / 服务器上 24 小时挂着，让机器人永远在线。

项目里自带守护脚本 `scripts/nexus-up.sh`（纯 bash，零依赖），它会**同时守护后端和机器人**，任何一个崩了 2 秒后自动重启。

```bash
# 在项目根目录
nexusai up                 # 后台启动并守护（等效 ./scripts/nexus-up.sh start）
nexusai up status          # 看在不在跑、进程号
nexusai up stop            # 停止
nexusai up restart         # 重启
```

日志落在 `.nexus-runtime/logs/`（backend.log / bot.log），出问题一眼能看到。

**云电脑开机自启**（Linux）：把 `scripts/nexus.service` 放到 `/etc/systemd/system/nexus.service`，改里面的 `WorkingDirectory`（项目路径）和 `User`，然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nexus
```

之后云电脑重启会自动拉起，机器人不再掉线。

> 注意：机器人和后端要在**同一台机器**跑（脚本就是这么干的），这样机器人连 `localhost:3000` 才稳。

---

## 进阶一：生图 / 生视频

生图 / 生视频分三档，对硬件要求完全不同：

| 能力 | 入口 | 需要什么 | 难度 |
|------|------|----------|------|
| 文生图 | 网页「图像」页 | 联网即可（Pollinations 免费） | 零 |
| 图生图 / 文生视频 / 图生视频 | 网页「Agnes」页 | 配 `AGNES_API_KEY`（或云端已配） | 低 |
| 高质量自定义生图 / 视频 | 网页「图像 / 图生视频」页（切 ComfyUI） | 本地 ComfyUI + 显卡 + 模型 | 高 |

- **普通文生图**：本地部署完能联网直接玩，什么都不用装。
- **Agnes 多模态**：在后端 `.env` 配 `AGNES_API_KEY`（没有的话那一块不可用，但不影响对话和文生图）。
- **本地 ComfyUI（高质量）**：自己部署 ComfyUI（默认 `http://localhost:8188`），在前端设置页填 `comfyUrl` 和模型名（`comfyCheckpoint` / `comfyUnet` / `comfyVae` / `comfyClipVision`）。视频还需要装 ComfyUI 的视频相关节点（如 `ComfyUI-VideoHelperSuite`）。

> 一句话：**普通生图本地部署完直接就能玩；想要最高质量或自定义模型，才需要自己跑 ComfyUI。**

> **额度提醒**：自托管免费档每天大致配额——对话 50 次、生图 10 次、视频 2 次、音乐 2 次（在 `backend/src/modules/billing.ts` 可调）。走公开中继模式（`AI_BOT_TOKEN`）时同样按此每日额度、需先 `nexusai register` 注册登录。

---

## 进阶二：本地部署模型

完全可以不依赖云端模型，用自己电脑上的开源模型（Ollama / LM Studio / vLLM）。

### 11.1 支持的服务

| 服务 | 地址格式 | 说明 |
|------|----------|------|
| Ollama | `http://本机IP:11434/v1` | 先 `ollama serve`，并把 `OLLAMA_HOST` 设为 `0.0.0.0` 允许局域网 |
| LM Studio | `http://本机IP:1234/v1` | 打开 Local Server，允许局域网访问 |
| vLLM / 自建网关 | `http://地址/v1` | 任意 OpenAI 兼容接口 |

### 11.2 在网页 / 手机端接（前端直连）

打开网页「设置」→ 把 `chatApiBase` 改成上面的地址，`chatModel` 填本地模型名（如 `qwen2.5:7b`），`openrouterKey` 本地模型可留空。这样网页端对话就走本地模型了。

### 11.3 在后端 / CLI 接

后端 `.env` 改 `AI_API_BASE` 和 `AI_API_KEY`（本地可空）、`AI_MODEL` 为本地模型名。CLI 用 `nexusai setup` 重填即可。改完重启后端（`nexusai up restart`）。

### 11.4 在 MCP 里接本地模型

`nexus-mcp` 也支持本地模型（Ollama），配 `.env` 即可让 MCP 工具调用本地模型。

---

## 进阶三：接 MCP（多工具 / 多厂商）

MCP（Model Context Protocol）能把「文件系统、GitHub、各家厂商工具」等聚合进 NEXUS，对话时 AI 自己挑着用。

### 12.1 配置文件

前后端共享一份配置：`~/.nexusai/mcp-servers.json`。示例：

```json
{
  "servers": [
    {
      "name": "filesystem",
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/要开放的目录"],
      "env": {}
    },
    {
      "name": "my-vendor",
      "enabled": true,
      "transport": "http",
      "url": "https://厂商地址/mcp",
      "headers": { "Authorization": "Bearer 令牌" }
    }
  ]
}
```

两种形态都支持：

- **stdio（本地进程型）**：`command` + `args` 启动，如 filesystem、GitHub。
- **http（远程型）**：给个 `url` + token 就能连厂商云 MCP。

### 12.2 在 CLI 里用

```bash
nexusai            # 进对话，工具自动带上
/mcp               # 随时看接入状态、工具清单
```

对话时 AI 会自动跨厂商调用这些工具（比如一边读本地文件、一边调某厂商接口）。

### 12.3 在后端 / 网页用

后端非流式对话也接入了 MCP 工具循环，可用 `GET /api/mcp/servers` 查看已连 server 与工具。默认没启用任何 server 时对线上零影响。

---

## 把我的模型 / AI 能力接进别的应用

NEXUS 后端本质上就是 **一个 OpenAI 兼容网关 + 一个 MCP 服务**。而市面上现代 AI 客户端基本只认这两类协议——所以 NEXUS 几乎能塞进任何工具当「大脑」。

- **接法 A · OpenAI 兼容（最通用，覆盖约 90% 工具）**：在对方工具里把 Base URL 指向 NEXUS，任何认 OpenAI 格式的客户端都能直接用。
- **接法 B · MCP（让 Claude Desktop / Cursor 等把 NEXUS 当「工具」调用）**：对方支持 MCP 时，把 NEXUS 注册成一个 MCP server 即可。

> 不管用哪种，先确认后端在跑：`nexusai up` 或 `nexusai serve`（端口 3000）。

### 13.1 接法 A：OpenAI 兼容（通用）

在对方工具里找「Base URL / API Base / Endpoint / Server URL」这类字段，统一填：

```
http://localhost:3000/api/ai/v1        # 同一台机器
http://<服务器IP或域名>:3000/api/ai/v1  # 别的机器 / 云电脑
```

另外两个必填项：

| 字段 | 填什么 |
|------|--------|
| API Key | **任意非空字符串**（本机直连不校验）；若开了中继模式（`AI_BOT_TOKEN`），就填那个 token |
| Model | **任意**（实际模型由服务端模型链决定，主模型被限流会自动换下一个） |

请求体就是标准 OpenAI 格式：

```json
{
  "model": "nexus",
  "messages": [{ "role": "user", "content": "你好" }],
  "stream": false
}
```

示例调用（curl / Python）：

```bash
curl http://localhost:3000/api/ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <任意非空或 AI_BOT_TOKEN>" \
  -d '{"model":"nexus","messages":[{"role":"user","content":"你好"}],"stream":false}'
```

```python
from openai import OpenAI
c = OpenAI(base_url="http://localhost:3000/api/ai/v1", api_key="任意非空")
print(c.chat.completions.create(model="nexus", messages=[{"role":"user","content":"你好"}]).choices[0].message.content)
```

### 13.2 哪些工具走 OpenAI 兼容就能接

下面是市面上主流、确认支持自定义 OpenAI 兼容 Base URL 的工具（不管字段叫 Base URL 还是 API Base，本质一样）。把这些工具的地址填成 `http://localhost:3000/api/ai/v1` 即可：

| 工具 / 应用 | 类型 | 配置入口（大致位置） |
|------------|------|---------------------|
| **Cursor** | 编码助手 | Settings → Models → 自定义 Base URL |
| **Cline**（VS Code 插件） | 编码助手 | 设置里 `cline.apiProvider` → OpenAI Compatible + Base URL |
| **Continue** | 编码插件 | `config.json` 里 `apiBase` 字段 |
| **Roo Code** | 编码插件 | 模型设置 → OpenAI Compatible |
| **Aider** | 命令行编码 | 启动参数 `--openai-api-base` 或 `.aider.conf.yml` |
| **Zed** | 编辑器 | Settings → AI → 自定义 Provider |
| **Windsurf** | 编码助手 | 设置 → 模型 → 自定义端点 |
| **Codex / 类 Codex 工具** | 编码 | 环境变量 `OPENAI_BASE_URL` |
| **Claude Code** | 命令行 Agent | 切到 OpenAI-compatible Provider 模式，填 Base URL |
| **ChatBox** | 聊天客户端 | 设置 → 添加自定义供应商 → OpenAI Compatible |
| **Cherry Studio** | 聊天客户端 | 设置 → 模型服务 → 添加 OpenAI 兼容 |
| **LobeChat** | 聊天客户端 | 设置 → 模型供应商 → 自定义（OpenAI） |
| **LibreChat** | 聊天客户端 | `.env` 的 `OPENAI_API_BASE_URL` |
| **Open WebUI** | 自托管聊天 | 管理员 → 连接 → OpenAI 兼容 |
| **AnythingLLM** | 知识库聊天 | 设置 → LLM → Provider 选 OpenAI |
| **SillyTavern** | 角色聊天 | 连接设置 → API 类型 OpenAI |
| **Dify** | AI 工作流 | 模型供应商 → 自定义 OpenAI |
| **n8n / Flowise** | 自动化 | 节点里 OpenAI 凭证 → Base URL |
| **LangChain / 自写代码** | 开发框架 | `OpenAI(base_url=...)` |
| **WorkBuddy（CodeBuddy）** | 桌面 / 多端 Agent | 设置 → 模型 → 新建自定义模型 → 选「OpenAI 兼容」 |
| **Hermes Agent** | 开源 Agent | 启动 / 设置里选 `Custom endpoint (OpenAI compatible)` |
| **LiteLLM / OpenRouter / AI快站 等网关** | 聚合网关 | 把 NEXUS 当成一个上游 Base URL 接入 |

> 一句话：只要某个工具里有「Base URL / OpenAI 兼容 / 自定义模型」这些字眼，把地址填成 `http://localhost:3000/api/ai/v1` 就行。

### 13.3 重点三家怎么填

- **WorkBuddy（CodeBuddy）**：`设置 → 模型 → 新建自定义模型`，类型选**「OpenAI 兼容」**；Base URL 填 `http://localhost:3000/api/ai/v1`，API Key 填任意非空，Model 随便写。它**同时支持 MCP**——`连接器 → 自定义连接器 → MCP`，URL 填 `http://localhost:8787/mcp`。
- **Hermes Agent**：启动或设置里选 `Custom endpoint (OpenAI compatible)`，API Base URL 填 `http://localhost:3000/api/ai/v1`。
- **Claude Code**：在模型设置里把 Provider 切到 **OpenAI-compatible**，Base URL 填 `http://localhost:3000/api/ai/v1`，即可把它当模型用；它也能走 Anthropic 兼容地址（`ANTHROPIC_BASE_URL`）由网关转译。更原生的接法是下面的 MCP。

### 13.4 接法 B：MCP（让客户端把 NEXUS 当工具调）

NEXUS 自带一个 MCP 服务（`nexus-mcp`），能被 **Claude Desktop、Cursor、Cline、Cherry Studio、Continue、Zed、LibreChat** 等支持 MCP 的客户端直接连。

它有**两种形态**，按需选：

**形态 1 · 本地 stdio（同一台机器，最省事）**

让客户端自己启动 `nexus-mcp` 进程。在客户端的 MCP 配置里加：

```json
{
  "mcpServers": {
    "nexus": {
      "command": "node",
      "args": ["/项目路径/nexus-mcp/src/index.ts"],
      "env": { "TRANSPORT": "stdio" }
    }
  }
}
```

**形态 2 · 远程 HTTP（跨机器 / 云电脑）**

先单独起 MCP 服务：

```bash
TRANSPORT=http PORT=8787 MCP_TOKEN=令牌 node nexus-mcp/src/index.ts
```

然后在客户端加（URL 型 MCP server）：

```json
{
  "mcpServers": {
    "nexus": { "url": "http://localhost:8787/mcp" }
  }
}
```

> 不想直连 8787，也可走后端转发：`http://localhost:3000/api/mcp`（公网场景建议配 `MCP_TOKEN` 鉴权）。

NEXUS 作为 MCP server 暴露的工具：`query_nexus_knowledge`（查本地知识库）、`nexus_capabilities`（能力清单）、`nexus_chat`（用 NEXUS 配置的模型对话）。

### 13.5 鉴权与放行

- 开了**中继模式**（`AI_BOT_TOKEN`）：用这个 token 当 Bearer；别人用需先 `nexusai register/login` 拿每日额度。
- 没开中继、纯自用：把后端放公网 + 设强 `JWT_SECRET`，或前面套一层自己的鉴权网关。
- **CORS**：后端 `.env` 的 `CORS_ORIGIN`。默认 `*`（允许所有），生产环境建议改成前端 / 应用的域名。

### 13.6 其它可用端点（给别的应用对接）

| 端点 | 方法 | 作用 |
|------|------|------|
| `/api/ai/v1/chat/completions` | POST | 对话（OpenAI 兼容，接法 A 用这个） |
| `/api/chat` | POST | 网页端对话（流式 / 非流式） |
| `/api/image/generate` | POST | 生图（Pollinations） |
| `/api/image/file/:name` | GET | 取生成的图 |
| `/api/music/generate` | POST | 生成音乐 |
| `/api/video/generate` | POST | 提交视频任务（ComfyUI） |
| `/api/video/status/:promptId` | GET | 查视频进度 |
| `/api/agnes/image/generate` | POST | Agnes 文生图 / 图生图 |
| `/api/agnes/video/generate` | POST | Agnes 文生视频 / 图生视频 |
| `/api/mcp` | POST | MCP 网关（JSON-RPC，接法 B 用这个） |
| `/api/mcp/servers` | GET | 查看已接 MCP |

---

## 飞书回传

「飞书回传」= 让 NEXUS 把任务结果自动发到飞书群。

### 14.1 拿 Webhook

在飞书群里：**设置 → 群机器人 → 添加机器人**，复制它的 Webhook 地址，长这样：

```
https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
```

### 14.2 填到 NEXUS

打开网页「设置」→ 飞书机器人 Webhook，粘贴进去；在 `AppSettings` 里也能看到。

### 14.3 用起来

- **WorkflowStudio（自动化页）**：提交任务后勾选「完成后回传飞书」，跑完自动推到群。
- **测试**：设置页有「测试飞书回传」按钮，点一下群里收到测试消息就说明通了。

---

## 链式自动化（Workflow 自动化办公）

「自动化」页（WorkflowStudio）干的事：把一句话任务发给**自己部署的技术栈**（比如 Hermes + 本地模型 + 飞书回传的流水线），实时显示进度，跑完一键回传飞书。

### 15.1 配置

网页「设置」里填两项：

- `workflowUrl`：自建 HTTP 服务地址（如 `http://192.168.1.10:8000` 或域名）
- `workflowKey`：该服务的密钥（没有可留空）

### 15.2 自建服务约定

NEXUS 前端会这样调自建服务（约定很简单）：

- `POST {workflowUrl}/run`，带 `Authorization: Bearer <workflowKey>`，body 含任务描述；
- 自建服务返回进度 / 最终结果；
- 前端拿到结果后，若勾选了飞书回传，就调飞书 Webhook 把结果推到群。

这样就能把「读飞书群讨论 → 整理成日报 → 回传飞书」这种链式任务完全自动化，而且模型跑在自己机器上，数据不出内网。

---

## 端口与地址速查表

| 服务 / 用途 | 端口 | 地址 / 说明 |
|------------|------|-------------|
| 后端 API | 3000 | `http://localhost:3000/api`（`API_PREFIX=/api`），生产环境同时托管网页 |
| 前端（dev） | 5173 | `http://localhost:5173`（`/api` 代理到 3000） |
| 机器人主进程 | 3939 | `http://localhost:3939`（进程存活探测） |
| MCP 服务（nexus-mcp） | 8787 | 独立 MCP 服务端 |
| 企业微信回调 | 8788 | `WECOM_CALLBACK_PORT`，需公网可访问 |
| 微信小程序 | 8789 | `WX_MP_PORT`，需公网可访问 |
| OneBot（NapCat） | 3001 | `ws://127.0.0.1:3001`（默认） |
| ComfyUI（本地生图/视频） | 8188 | `http://localhost:8188`（可改 `COMFYUI_URL`） |
| Ollama（本地模型） | 11434 | `http://本机IP:11434/v1` |
| LM Studio（本地模型） | 1234 | `http://本机IP:1234/v1` |

**核心地址回顾**：

- 对话对外接口：`http://<地址>:3000/api/ai/v1/chat/completions`
- 机器人连后端：`http://localhost:3000/api/ai/v1`（同机）
- 网页访问：`http://localhost:5173`

---

## 云端互通（本地连云端数据库）

想让本机部署和云端跑同一份数据，只需在本地 `backend/.env` 里把 `DATABASE_URL` 指向**云端数据库的外网连接串**（在云厂商控制台开启 PostgreSQL 公网访问后获取），并保持 `DB_MODE=local`。这样本地读写的数据，云端也能看到，反之亦然。

```
DB_MODE=local
DATABASE_URL=postgresql://云端用户:云端密码@云端主机:5432/nexus
```

> 安全提示：云端数据库外网连接串包含账号密码，请勿提交到公开仓库；建议为本地单独创建一个只读/限定权限的账号。

---

## 更新与排障

### 18.1 更新

```bash
nexusai update       # 自动拉最新代码 + 装依赖
```

代码也会在每次启动时**后台静默对齐**最新版（每 6 小时最多一次，有本地改动时不动）。如果本机的 `nexusai` 根本没有 `update` 子命令，说明太旧了，整段复制粘贴下面四行重装一次即可（重装会保留数据 `nexus-data/` 和配置 `~/.nexusai/config.json`，Key 不用重填）：

```powershell
cd $env:USERPROFILE\Desktop
Remove-Item -Recurse -Force nexus-ai -ErrorAction SilentlyContinue
git clone --depth 1 https://github.com/2740354108/nexus-ai.git nexus-ai
node nexus-ai\installer\installer.mjs
```

### 18.2 常见坑

- **证书报错 / 连示例域名**：说明 `AI_API_BASE` 填的是占位域名，跑 `nexusai setup` 重填。
- **模型下架 / 英文报错**：CLI / 后端会自动切换当前可用免费模型，一般无需手改。
- **机器人没声 / 连不上后端**：本质是后端没常驻，用 `nexusai up` 守护。
- **本地模型连不上**：确认电脑开机、手机 / 前端和电脑在同一 WiFi，地址填对（含 `/v1`）。
- **Agnes / 音乐某一块用不了**：对应 Key 没配，不影响对话和其它能力。
- **Google 一键登录不可用**：本地部署请用网页里的「邮箱注册」登录，功能一样。
- **`nexus` 也是可用命令**：装过全局命令后，短命令 `nexus` 等效 `nexusai chat`，直接进入对话。

### 18.3 日志

- 后端 / 机器人常驻日志：`.nexus-runtime/logs/`（用 `nexusai up` 启动才有）
- 前端问题：浏览器 F12 控制台
- 机器人控制台：启动 `pnpm start` 的终端输出

---

## 附：让别人免填 Key（站长中继模式）

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
   网页/桌面端也会自动弹出「免费试用 · 注册/登录」入口。所有下载者**全程看不到你的真 key**。

安全说明：开启 `AI_BOT_TOKEN` 后即进入「公开中继模式」——未注册访客只有极少量 IP 试用额度，注册后按账号计每日额度，超限提示第二天再来；`AI_BOT_TOKEN` 可公开、可随时重置，真实 key 始终只在你的服务器，不会产生你的计费风险。想无限流或超额了，下载者也可 `nexusai setup` 填自己的 key。

---

## 作为技能接入 Agent（SKILL.md）

仓库根目录的 `SKILL.md` 让本项目可以被支持「从 GitHub 导入技能」的 Agent 直接导入。
导入后，Agent 就知道如何调用你本机的 NEXUS AI——对话、识图、文生图、生视频、生音乐，
并在服务没启动时把它拉起来。

- 技能入口：`SKILL.md`
- 接口速查：`skill/references/api.md`
- 配置与排障：`skill/references/config.md`
- 一键调用：`skill/scripts/nexus.sh`

> **导入请用独立技能仓库**：`https://github.com/2740354108/nexus-ai-skill`
>
> 部分「从 GitHub 导入技能」的实现限制**单仓库最多 100 个文件**，
> 而本仓库包含完整应用（280+ 文件）会被拒绝。
> 上面这个仓库只含技能本体（5 个文件），专供导入使用，内容与本处一致。

---

## 开发

```bash
cd backend && pnpm dev      # 后端 :3000
cd frontend && pnpm dev     # 前端 :5173
cd nexus-bot && pnpm start  # 机器人
```

## License

[MIT](./LICENSE) — 自由使用、修改、分发。
