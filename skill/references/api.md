# NEXUS AI 接口速查

- 默认地址：`http://localhost:3000`
- 前缀：`/api`
- 除标注 **multipart** 的接口外，POST 请求体均为 JSON

## 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/status` | 运行状态 |
| GET | `/api/version` | 版本号 |

## 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ai/models` | 可用模型清单 |
| GET | `/api/ai/status` | 引擎状态（Key 是否已配置等） |
| POST | `/api/ai/chat` | 非流式对话（NEXUS 自有格式） |
| POST | `/api/ai/chat/stream` | 流式对话（SSE） |
| POST | `/api/ai/v1/chat/completions` | **OpenAI 兼容**，外部应用推荐用这个 |
| POST | `/api/ai/web-search` | 联网搜索 |

### POST /api/ai/v1/chat/completions

请求体（OpenAI 标准）：

```json
{
  "messages": [
    { "role": "system", "content": "你是一个简洁的助手" },
    { "role": "user", "content": "你好" }
  ],
  "stream": false
}
```

- `model` 字段**不会被使用**：实际模型由服务端配置的模型链自动选择，主模型不可用时自动降级到备用模型。
- 请求里带 `system` 消息会覆盖默认人设（最长 2000 字符）。
- 识图：`content` 使用数组形式，元素为
  `{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}`，
  后端检测到图片后会自动切换到视觉模型链。
- 鉴权：本机直连且未开启公开中继时不校验；若站长设置了 `AI_BOT_TOKEN`（公开中继模式），
  需带 `Authorization: Bearer <token>`（站长令牌，或注册用户的 JWT），
  否则返回 401；额度用尽返回 429。

返回：标准 OpenAI `choices[0].message.content`。

## 文生图（Pollinations，免费）

`POST /api/image/generate`

| 字段 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `prompt` | 是 | — | 画面描述 |
| `style` | 否 | `none` | 风格 |
| `width` | 否 | `768` | 宽 |
| `height` | 否 | `768` | 高 |
| `seed` | 否 | — | 随机种子 |

返回：

```json
{ "success": true, "provider": "pollinations",
  "imageUrl": "/api/image/file/1730000000-ab12cd34.png",
  "width": 1024, "height": 1024, "prompt": "..." }
```

取图：`GET http://localhost:3000/api/image/file/<文件名>`

## Agnes 多模态（文生图 / 图生图 / 文生视频 / 图生视频）

需配置 `AGNES_API_KEY`。两个接口都是 **multipart/form-data**。

### POST /api/agnes/image/generate

| 字段 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `prompt` | 是 | — | 画面描述 |
| `mode` | 否 | `text2img` | `text2img` / `img2img` |
| `model` | 否 | `agnes-image-2.1-flash` | 模型 |
| `size` | 否 | `1024x1024` | 尺寸 |
| `response_format` | 否 | `url` | 返回形式 |
| `files` | 图生图必填 | — | 输入图片（multipart 文件，可多张） |
| `images` | 否 | — | 也可直接传图片 URL 数组 |

### POST /api/agnes/video/generate

| 字段 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `prompt` | 是 | — | 视频描述 |
| `mode` | 否 | `text2video` | `text2video` / 图生视频 |
| `model` | 否 | `agnes-video-v2.0` | 模型 |
| `width` / `height` | 否 | `854` / `480` | 分辨率 |
| `num_frames` | 否 | `81` | 帧数 |
| `frame_rate` | 否 | `24` | 帧率 |
| `negative_prompt` | 否 | — | 反向提示 |
| `num_inference_steps` | 否 | — | 推理步数 |
| `seed` | 否 | — | 随机种子 |
| `files` / `images` | 否 | — | 图生视频的输入图片 |

查询进度：`GET /api/agnes/video/status/:videoId`

上传素材：`POST /api/agnes/upload`（multipart，字段 `file`）

## 音乐生成

`POST /api/music/generate`

| 字段 | 必填 | 说明 |
|------|------|------|
| `prompt` | 是 | 音乐描述 |
| `isInstrumental` | 否 | 是否纯音乐，默认 `false` |

后端按优先级依次尝试多个服务商并自动降级：
`ACMusic(ACE-Step)` → `HuggingFace MusicGen` → `Replicate` → `aimusicapi(Suno)` → `MiniMax`。
**至少要配置其中一个服务的 Key**，否则会失败。

返回 `{ success, provider, ... }`（不同服务商字段略有差异）。
取音频：`GET /api/music/file/<文件名>`

## 视频生成（本地 ComfyUI）

`POST /api/video/generate` — **multipart**，字段 `image`（输入图片文件）

依赖本机运行的 ComfyUI，地址由 `COMFYUI_URL` 指定（默认 `http://localhost:8188`）。

- 查询进度：`GET /api/video/status/:promptId`
- 取文件：`GET /api/video/file`

## MCP

| 方法 | 路径 | 说明 |
|------|------|------|
| POST/GET | `/api/mcp` | MCP JSON-RPC 网关，原样转发到本机 MCP 服务器（默认 `:8787`） |
| GET | `/api/servers` | 多 MCP 聚合状态：已连上的 server 及其工具（工具名带 `server__` 前缀） |

多 MCP 配置位于 `~/.nexusai/mcp-servers.json`，支持本地进程（stdio）与远程 HTTP 两种形态，CLI 与后端共用同一份配置。

## 账号 / 其他

| 前缀 | 说明 |
|------|------|
| `/api/auth` | 自托管账号（JWT）注册登录 |
| `/api/relay` | 公开中继：注册 / 登录 / 每日额度 |
| `/api/histories` | 聊天记录 |
| `/api/conversations` | 会话管理 |
| `/api/billing` | 套餐 / 订阅 / 订单 / 用量 |
| `/api/config` | 云端用户配置（多租户隔离） |
