# NEXUS BOT

一个**独立运行**的 AI 机器人程序，可同时接入多个社交平台，背后复用 NEXUS 同款对话模型（GLM-5.2）。
不在网站里，不依赖 NEXUS LAB 前端，单独跑即可。

## 支持平台

| 平台 | 模式 | 是否需要公网 | 难度 |
|------|------|------|------|
| Telegram | 轮询（polling） | 否，本地即可 | 最简单 |
| Discord | 网关（discord.js） | 否 | 简单 |
| 企业微信 | 群机器人 webhook 发 / 企业应用回调双向 | 双向需公网 | 中 |
| 微信公众号 | 回调接收 + 客服消息回复 | 是 | 中 |
| QQ | 官方机器人 WebSocket | 是（需审核） | 中 |

## 快速开始

```bash
cd nexus-bot
pnpm install        # 或 npm install
cp .env.example .env
# 编辑 .env，至少填 OPENROUTER_API_KEY 和想启用的平台凭证
pnpm start          # 开发可用 pnpm dev（热重载）
```

## 各平台凭证申请

### Telegram（推荐先跑这个）
1. 在 Telegram 搜索 `@BotFather`，发送 `/newbot`
2. 按提示取名，得到 `token`
3. `.env` 中：`ENABLE_TELEGRAM=true` + `TELEGRAM_BOT_TOKEN=...`
4. 直接 `pnpm start`，本地轮询即可，**无需公网**

### Discord
1. 打开 https://discord.com/developers/applications 新建应用 → Bot
2. 复制 Bot Token，并在 OAuth2 里生成邀请链接把 bot 加进你的服务器（勾选 `bot` 与 `Send Messages` 等权限）
3. `.env`：`ENABLE_DISCORD=true` + `DISCORD_BOT_TOKEN=...`
4. 在频道里 @ 机器人说话即可（私聊直接说）

### 企业微信
- **仅发送（最简单）**：在群设置里添加"群机器人"，复制 webhook 地址 → `.env`：`WECOM_WEBHOOK_URL=...`
- **双向对话**：在企业微信管理后台创建应用，拿到 corpid / agentid / secret，并配置"接收消息"回调地址为你的公网 `http://域名/api/wecom`（代码已监听 `WECOM_CALLBACK_PORT`，需反代到该端口） → 填 `WECOM_TOKEN`、`WECOM_AES_KEY`（后台"接收消息"里的 EncodingAESKey）

### 微信公众号 / 服务号
1. 公众号后台「设置与开发 → 基本配置」拿到 AppID / AppSecret
2. 配置服务器地址为你公网 `http://域名/api/wechat_mp`（代码监听 `WX_MP_PORT`，需反代），并设 Token 与 EncodingAESKey
3. `.env`：填 `WX_MP_APPID`、`WX_MP_SECRET`、`WX_MP_TOKEN`、`WX_MP_AES_KEY`

### QQ
1. 到 QQ 开放平台（bot.q.qq.com）创建机器人，审核通过后拿到 appid / token / secret
2. `.env`：`ENABLE_QQ=true` + 对应三项

## 架构说明

```
社交平台  ──►  [平台适配器]  ──►  [消息网关 gateway.ts]  ──►  [对话核心 llm.ts]  ──►  OpenRouter(GLM-5.2)
   ▲                                                                            │
   └──────────────────────────────────────────────────────────────────────────┘
```

- `types.ts`：统一消息格式与适配器接口
- `gateway.ts`：所有消息入口，以后接知识库 / 工具调用只改这一层
- `llm.ts`：维护每会话多轮记忆，调用模型
- `adapters/`：每个平台一个文件，新增平台只加一个文件

## 命令

- `pnpm start` 运行
- `pnpm dev` 开发（文件改动自动重启）
- `pnpm typecheck` 仅类型检查

> 注：本程序与 NEXUS LAB 网站互相独立。知识库 / 私有数据接入可在 `gateway.ts` 中扩展。
