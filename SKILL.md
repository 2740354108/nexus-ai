---
name: nexus-ai
description: 把本机运行的 NEXUS AI 当作私有 AI 后端来用：对话、识图、文生图、文/图生视频、音乐生成，并在服务没启动时把它拉起来。当用户想用自己的 AI（而不是云端 API）处理任务，或需要把 AI 能力接入其他应用时使用。
---

# NEXUS AI 本地 AI 后端

NEXUS AI 是一套可本地运行的多模态 AI 服务。它的核心是**一个后端进程**（默认 `http://localhost:3000`），对外同时提供：

- 一套 **OpenAI 兼容接口**（任何 OpenAI SDK / 应用把 Base URL 指过来就能用）
- 一批**生成接口**：文生图、文/图生视频、音乐生成
- 一个 **MCP 网关**，可把外部工具接进来给模型调用

网页、桌面、终端、手机、社交机器人只是不同的外壳，能力全部集中在后端。

## When to Use This Skill

- 用户提到「NEXUS」「我本机的模型」「用我自己的 AI」来处理任务
- 需要在本机生成图片 / 视频 / 音乐，且不想依赖第三方密钥
- 需要把对话能力接入别的应用（走 OpenAI 兼容接口）
- 需要查看、启动或排查本机 NEXUS 服务

## 第一步：确认服务在跑

```bash
curl -s http://localhost:3000/api/health
```

正常会返回 JSON（HTTP 200）。**连不上**说明后端没启动，先拉起：

```bash
nexusai serve     # 启动后端(:3000) + 前端(:5173)
nexusai up        # 后台常驻，崩了自动拉起
```

如果本机还没有 NEXUS，安装与配置见 `skill/references/config.md`。

## 常用能力

### 1. 对话（OpenAI 兼容，推荐）

```bash
curl -s http://localhost:3000/api/ai/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"你好"}],"stream":false}'
```

- 格式与 OpenAI 完全一致：任何 OpenAI SDK 只要把 `base_url` 设为
  `http://localhost:3000/api/ai/v1` 即可直接调用
- `"stream": true` 得到 SSE 流式输出
- **模型不用自己指定**：后端会从服务端配置的模型链里自动挑，主模型被限流/下架会自动换下一个
- **识图**：按 OpenAI 多模态格式，在 `content` 里放
  `{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}`，
  后端会自动切到视觉模型
- **人设**：请求里带 `system` 消息即可自定义角色；不带则用 NEXUS 默认人格

### 2. 文生图（免费，开箱即用）

```bash
curl -s http://localhost:3000/api/image/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"一只赛博朋克风格的猫","width":1024,"height":1024}'
```

返回 `{ success, provider, imageUrl, width, height, prompt }`，
`imageUrl` 形如 `/api/image/file/xxx.png`，用 `GET http://localhost:3000<imageUrl>` 取回图片。

### 3. 更多生成能力

| 能力 | 接口 | 备注 |
|------|------|------|
| 多模态生图 / 生视频 | `POST /api/agnes/image/generate`、`POST /api/agnes/video/generate` | multipart，需 `AGNES_API_KEY` |
| 音乐生成 | `POST /api/music/generate` | 需配置任一音乐服务 Key |
| 图生视频（本地） | `POST /api/video/generate` | multipart，需本机 ComfyUI |
| MCP 工具 | `POST /api/mcp`、`GET /api/servers` | JSON-RPC 透传 + 聚合状态 |

字段级细节见 `skill/references/api.md`。

## 一键调用脚本

`skill/scripts/nexus.sh` 把常用调用包好了（零依赖）：

```bash
bash skill/scripts/nexus.sh health
bash skill/scripts/nexus.sh chat  "用一句话介绍你自己"
bash skill/scripts/nexus.sh image "赛博朋克风格的猫" cat.png
bash skill/scripts/nexus.sh music "轻快的钢琴曲" song.json
```

默认连 `http://localhost:3000`，可用环境变量覆盖：

```bash
# 连局域网里另一台机器上的 NEXUS
NEXUS_API_BASE=http://192.168.1.10:3000 bash skill/scripts/nexus.sh health

# 服务端开启了公开中继（AI_BOT_TOKEN）时，带上令牌
NEXUS_API_TOKEN=<站长令牌或登录后的 JWT> bash skill/scripts/nexus.sh chat "你好"
```

## 排障

| 现象 | 原因与处理 |
|------|-----------|
| 连不上 `localhost:3000` | 后端没启动：`nexusai serve` 或 `nexusai up` |
| `Hostname/IP does not match certificate` | 配置里填的是示例占位域名，运行 `nexusai setup` 重填 |
| `401 Missing Authentication` | `AI_API_KEY` 没配或无效 |
| `This model is unavailable for free` | 免费模型被下架，`nexus update` 更新到最新版 |
| 生图 503 / 生视频失败 | 对应服务未配置或上游不可用，见 `skill/references/config.md` |

## 参考文件

- `skill/references/api.md` — 全部接口、请求字段与返回值
- `skill/references/config.md` — 安装、配置、端口与常见错误
