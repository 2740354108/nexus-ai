# 安装、配置与排障

## 安装

**自动安装（推荐）**：装好 Node.js 后一行命令，直接从 GitHub 拉取：

```bash
npx github:2740354108/nexus-ai
```

**手动安装**：

```bash
git clone https://github.com/2740354108/nexus-ai.git
cd nexus-ai
pnpm install
pnpm -C backend install
pnpm -C frontend install
pnpm -C nexus-bot install      # 机器人，可选
```

## 配置 AI

第一次使用必须配置一次（填自己的 Key，或连接别人搭好的中继）：

```bash
nexusai setup      # 向导式：选「用自己的 Key」→ 挑平台 → 粘贴 Key
nexusai config     # 随时查看当前配置与登录状态
```

支持的平台（选 1 后挑一家，地址与模型名会自动填好）：

| 平台 | 服务地址 | Key 申请 |
|------|----------|----------|
| OpenRouter（推荐） | `https://openrouter.ai/api/v1` | <https://openrouter.ai/keys> |
| OpenAI | `https://api.openai.com/v1` | <https://platform.openai.com/api-keys> |
| DeepSeek | `https://api.deepseek.com/v1` | <https://platform.deepseek.com/api_keys> |
| 月之暗面 Kimi | `https://api.moonshot.cn/v1` | <https://platform.moonshot.cn/console/api-keys> |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | <https://open.bigmodel.cn/usercenter/apikeys> |
| 通义千问（百炼） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | <https://bailian.console.aliyun.com> |
| 硅基流动 | `https://api.siliconflow.cn/v1` | <https://cloud.siliconflow.cn/account/ak> |
| 其它 | 自定义 | 任意 OpenAI 兼容服务 |

配置会写入两处：

| 位置 | 谁读它 |
|------|--------|
| `backend/.env` | 后端（网页 / 桌面 / 机器人） |
| `~/.nexusai/config.json` | 终端 CLI（优先级更高，更新代码不会丢） |

常用配置项：

| 配置 | 说明 |
|------|------|
| `AI_API_BASE` | AI 服务地址，任何 OpenAI 兼容服务均可（OpenRouter / OpenAI / DeepSeek / 智谱…） |
| `AI_API_KEY` | **必填**，模型密钥 |
| `AI_MODEL` / `AI_VISION_MODEL` | 对话 / 识图模型 |
| `DB_MODE` | `local`（默认，内嵌数据库零安装）/ `cloud`（云端） |
| `DATABASE_URL` | 可选，填 `postgresql://...` 改用外部 PostgreSQL |
| `AGNES_API_KEY` | 可选，开启多模态生图 / 生视频 |
| `COMFYUI_URL` | 可选，本地生视频，默认 `http://localhost:8188` |
| `AI_BOT_TOKEN` | 可选，开启公开中继（让别人的客户端免填 Key） |

## 启动与常驻

```bash
nexusai chat      # 终端对话
nexusai           # 桌面应用
nexusai serve     # 后端(:3000) + 前端(:5173)
nexusai up        # 后台常驻：后端 + 机器人，崩了自动拉起
nexusai up status # 查看常驻状态
nexusai up stop   # 停止常驻
nexusai update    # 更新到最新版本
```

## 端口速查

| 端口 | 服务 |
|------|------|
| `3000` | 后端 API（所有能力的统一入口） |
| `5173` | 前端开发服务器（`/api` 代理到 3000） |
| `3939` | 机器人主进程 |
| `8787` | nexus-mcp（HTTP 模式） |
| `8788` / `8789` | 企业微信 / 微信公众号回调，需公网 |
| `3001` | OneBot / NapCat（非官方 QQ 通道） |
| `8188` | ComfyUI（本地生视频） |
| `11434` | Ollama（本地模型） |
| `1234` | LM Studio（本地模型） |

## 常见错误

| 报错 / 现象 | 原因 | 处理 |
|-------------|------|------|
| 连不上 `localhost:3000` | 后端没运行 | `nexusai serve` 或 `nexusai up` |
| `Hostname/IP does not match certificate` | 配置里是示例占位域名 | `nexusai setup` 重新填写 |
| `401 Missing Authentication` | `AI_API_KEY` 未配置或已失效 | `nexusai setup` 重新填 Key |
| `This model is unavailable for free` | 免费模型被平台下架 | `nexusai update` 更新到最新版 |
| `429` 额度用完 | 公开中继的每日额度耗尽 | 次日重置，或填自己的 Key |
| 生图 503 | 上游生图服务不可用 | 稍后重试；或用 `/api/agnes/image/generate` |
| 生视频失败 | 未配 `AGNES_API_KEY`，或 ComfyUI 未启动 | 补齐对应配置 |
| 音乐生成失败 | 未配置任何音乐服务 Key | 配置 HF / Replicate / MiniMax 之一 |
| 命令 `nexusai` 找不到 | 全局命令没进 PATH | 重开终端；或项目目录内用 `pnpm nexusai ...` |

## 把能力接入别的应用

任何支持「自定义 OpenAI 接口」的应用（OpenAI SDK、各类客户端、Cursor、Chatbox 等），
把 Base URL 指向本机即可：

```
Base URL : http://localhost:3000/api/ai/v1
API Key  : 任意非空字符串（本机直连不校验）
Model    : 任意（实际模型由服务端模型链决定）
```

局域网内其他设备访问时，把 `localhost` 换成这台机器的内网 IP，
例如 `http://192.168.1.10:3000/api/ai/v1`。

> 若服务端设置了 `AI_BOT_TOKEN`（即开启「公开中继模式」），客户端必须带
> `Authorization: Bearer <token>`：站长令牌放行且不计额度，普通用户需先
> `nexusai register` / `nexusai login` 拿到 JWT，按账号每日额度计次。
