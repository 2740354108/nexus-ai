# NEXUS AI

一个可本地运行的多模态 AI 助手：网页界面 + 桌面应用 + 终端对话 + 微信/QQ/Telegram 机器人。
对话、识图、生图、音乐、视频全部走公网模型接口（OpenRouter、MiniMax 等），数据可存在本地 PostgreSQL，也可直接连云端数据库实现互通。

> 本项目开源免费。模型调用需要你自己的 API Key（OpenRouter 等），与部署方式无关。

## 功能特性

- **终端对话** `nexusai chat`：想问什么直接敲，支持多轮记忆、发图识图（`@图片路径`）
- **桌面应用** `nexusai`：GUI 窗口，自动拉起后端与前端
- **网页界面** `nexusai serve`：浏览器访问 `http://localhost:5173`
- **机器人接入**：微信、QQ、Telegram、Discord、企业微信（按需开启）
- **本地存储 / 云端互通**：默认存本地 PostgreSQL；也可直连云端数据库，两边数据一致

## 架构

```
┌────────────┐   ┌────────────┐   ┌────────────────┐
│  网页/桌面  │   │  后端 API   │   │ PostgreSQL    │
│ (React)    │──▶│ (Express)  │──▶│ 本地 或 云端    │
└────────────┘   └─────┬──────┘   └────────────────┘
                       │
              ┌────────┴────────┐
              │  微信/QQ 机器人   │
              │  (nexus-bot)    │
              └─────────────────┘
```

- **前端** `frontend/`：React + Vite
- **后端** `backend/`：Express，负责 AI 调用、数据库、文件存储
- **机器人** `nexus-bot/`：把各聊天平台消息转给后端
- **本地入口** `cli/nexusai.mjs`：终端对话 / 启动服务 / 打开桌面应用
- **安装器** `installer/`：发布到 npm 的 `nexus-ai`，用于 `npx` 一键安装

## 快速开始（推荐）：npx 直接从 GitHub 安装

别人（或你自己）在装好 Node.js 的电脑上，一行命令即可——**不需要先发 npm**，直接从你的 GitHub 仓库下载安装：

```bash
npx github:2740354108/nexus-ai
```

安装器会自动：检查/安装 pnpm、安装 PostgreSQL、从你的 GitHub 克隆本项目、安装依赖、生成配置、注册 `nexusai` 全局命令。

可选：指定安装目录

```bash
npx github:2740354108/nexus-ai my-folder
```

> 把命令里的 `2740354108` 换成你自己的 GitHub 账号。`npx github:` 形式首次运行会把桌面打包工具（Electron）一起装上，属正常一次性下载；若想更轻量，可改用下面的 npm 形式。

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

# 2. 安装依赖
pnpm install
cd backend && pnpm install && cd ..
cd frontend && pnpm install && cd ..
cd nexus-bot && pnpm install && cd ..

# 3. 准备数据库（PostgreSQL）
createdb nexus

# 4. 配置
cp backend/.env.example backend/.env
# 编辑 backend/.env，至少填入 AI_API_KEY

# 5. 启动
pnpm nexusai chat      # 终端对话
pnpm nexusai           # 桌面应用
pnpm nexusai serve     # 网页（http://localhost:5173）
```

## 配置说明（backend/.env）

| 配置 | 说明 |
|------|------|
| `AI_API_KEY` | **必填**。OpenRouter 等模型密钥，决定能否对话 |
| `AI_MODEL` / `AI_VISION_MODEL` | 对话 / 识图模型，默认免费模型 |
| `DB_MODE` | `local`（默认，直连 PostgreSQL）或 `cloud` |
| `DATABASE_URL` | PostgreSQL 连接串，例如 `postgresql://postgres:密码@localhost:5432/nexus` |

AI 密钥获取：https://openrouter.ai/keys

## 让别人免填 key（托管中继）

想让下载你项目的人**零配置直接能用 AI**，而你的真实 key 又不泄露，做法是：你自己在公网部署一份后端当"中继"，真 key 只放在那里。

1. **站长（你）部署中继**：在一台公网服务器上跑本项目的后端，设置：
   ```
   AI_API_KEY=sk-or-你的真实key        # 真 key，只在你服务器，不下发、不进仓库
   AI_BOT_TOKEN=nexus-public-demo      # 开启公开中继模式的开关（同时作为站长自有网关的放行令牌）
   RELAY_DAILY_LIMIT=20                # 每个注册账号每天免费对话次数（可选，默认 20）
   RELAY_TRIAL_PER_IP=5                # 未登录访客每 IP 每天试用次数（可选，默认 5）
   ```
2. **改默认值并推 GitHub**：把 `backend/.env.example` 里的 `AI_API_BASE` 改成你的中继地址（如 `https://你的域名/api/ai/v1`），`AI_API_KEY` 改成同一个 `AI_BOT_TOKEN` 值，然后推到 GitHub。
3. **下载者**：`npx github:你的名/nexus-ai` 装完后，先在终端注册/登录即可对话：
   ```
   nexusai register 你的邮箱 密码     # 注册并领取每日免费额度
   nexusai login   你的邮箱 密码     # 已注册则直接登录
   nexusai chat                      # 开始对话（每天 20 次免费）
   ```
   网页/桌面端也会自动弹出"免费试用 · 注册/登录"入口。所有下载者**全程看不到你的真 key**。

安全说明：开启 `AI_BOT_TOKEN` 后即进入"公开中继模式"——未注册访客只有极少量 IP 试用额度，注册后按账号计每日额度，超限提示第二天再来；`AI_BOT_TOKEN` 可公开、可随时重置，真实 key 始终只在你的服务器，不会产生你的计费风险。想无限流或超额了，下载者也可按"用法 B"填自己的 key。

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
| `nexusai` / `nexusai app` | 打开桌面应用（GUI） |
| `nexusai chat` | 终端对话，直接输入问题；`@图片路径` 发图识图；`/clear` 清空；`/exit` 退出 |
| `nexusai register 邮箱 密码` | 注册中继账号并领取每日免费额度 |
| `nexusai login 邮箱 密码` | 登录已有中继账号 |
| `nexusai me` | 查看当前登录与每日额度剩余 |
| `nexusai serve` | 启动后端 + 前端，浏览器访问 `http://localhost:5173` |
| `nexusai help` | 帮助 |

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

## 开发

```bash
cd backend && pnpm dev      # 后端 :3000
cd frontend && pnpm dev     # 前端 :5173
cd nexus-bot && pnpm start  # 机器人
```

## License

[MIT](./LICENSE) — 自由使用、修改、分发。
