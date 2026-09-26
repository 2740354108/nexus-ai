import WebSocket from 'ws';
import type { BotAdapter } from '../types';
import { handleIncoming } from '../gateway';
import { CONFIG } from '../config';

// QQ 官方机器人（群 / 单聊 C2C）—— 群&单聊机器人走 OAuth2 鉴权流程：
//   1) 用 appId + clientSecret 换取 access_token（约 2 小时有效）
//   2) 网关 / API / WebSocket 统一使用 `Authorization: QQBot <access_token>`
// 订阅 GROUP_AND_C2C_EVENT (1<<25) 同时覆盖：群@消息 与 单聊(C2C)私信。
// 参考：https://bot.q.qq.com/wiki/

const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
const GATEWAY_URL = 'https://api.sgroup.qq.com/gateway';

let accessToken = '';
let tokenExpireAt = 0;

// QQ 官方鉴权头格式：`QQBot <access_token>`
const authHeader = () => `QQBot ${accessToken}`;

/**
 * 从 QQ 消息对象中提取图片 URL（群 / 单聊通用）。
 *
 * 重要：QQ 官方机器人推送的「附件对象」字段是 `content_type`（例如 image/jpeg）、
 * `filename` / `size` / `url`，**并不存在 `type` 字段**。
 * 早期代码判断 `a.type === 'image'` 永远不成立，导致
 * "图片明明发来了，却被当成没有图片"，这就是机器人不识图的直接原因。
 */
function extractImageUrl(c: any): string | null {
  const atts: any[] = Array.isArray(c?.attachments) ? c.attachments : [];
  for (const a of atts) {
    if (!a || typeof a !== 'object') continue;
    const url = typeof a.url === 'string' ? a.url : '';
    if (!url) continue;
    const kind = String(a.content_type || a.type || a.file_type || '').toLowerCase();
    // 附件声明是图片，或 URL 本身看起来就是图片，都接受
    if (kind.includes('image') || guessMimeFromUrl(url)) return url;
  }
  // 兜底 1：部分消息把图片 URL 放在 content 的 markdown 图片语法里
  const m = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/.exec(c?.content || '');
  if (m) return m[1];
  // 兜底 2：附件完全没带类型信息时，按图片尝试（QQ 群附件绝大多数是图片）
  const unknown = atts.find(
    (a) => a && typeof a.url === 'string' && a.url && !a.content_type && !a.type
  );
  return unknown ? unknown.url : null;
}

/**
 * 最近收到的图片缓存（有效期 5 分钟）。
 * 用于包容"先发图、再 @我 提问"的聊天习惯：只要图片曾在机器人能收到的消息里出现过，
 * 紧接着的追问仍可复用这张图。
 */
const IMAGE_CACHE_TTL = 5 * 60 * 1000;
const imageCache = new Map<string, { dataUrl: string; at: number }>();

function cacheImage(chatId: string, dataUrl: string): void {
  imageCache.set(chatId, { dataUrl, at: Date.now() });
}

function getCachedImage(chatId: string): string | undefined {
  const hit = imageCache.get(chatId);
  if (!hit) return undefined;
  if (Date.now() - hit.at > IMAGE_CACHE_TTL) {
    imageCache.delete(chatId);
    return undefined;
  }
  return hit.dataUrl;
}

/**
 * 判断用户是不是"在指代一张已经发过的图"（而不是"想生成一张图"）。
 * 前者在没收到图片时需要给出可操作提示；后者应正常交给对话处理。
 */
const IMAGE_REF_RE = /(图片|图像|照片|截图|看图|识图|读图|图里|图中)/;
const IMAGE_GEN_RE = /(生成|画一|画张|画个|绘制|做一张|做张|出一张|出张|生图|作图|设计一张|帮我画|给我画|来一张)/;
function looksLikeImageQuestion(text: string): boolean {
  return IMAGE_REF_RE.test(text) && !IMAGE_GEN_RE.test(text);
}

const IMAGE_GUIDE =
  '我这边只收到了文字，没收到图片。QQ 官方机器人有个限制：我只能看到「@我 的那一条消息」里附带的图片，单独先发出来的图片我是收不到的。\n' +
  '正确发法：在同一条消息里先 @我，再点「+」把图片选上，和文字一起发出来，我就能看图了。';
const IMAGE_GUIDE_C2C =
  '我这边只收到了文字，没收到图片。请把图片和文字放在同一条消息里一起发给我，我就能看图了。';

/** 从 URL 后缀推断图片 MIME（QQ 图片资源常不带正确 content-type） */
function guessMimeFromUrl(u: string): string {
  const m = /\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i.exec(u);
  if (!m) return '';
  const ext = m[1].toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  };
  return map[ext] || '';
}

/** 把图片 URL 下载为 base64 data URL，供视觉模型识别（先无鉴权，失败再用 QQBot 鉴权） */
async function downloadImage(url: string): Promise<string> {
  const tryFetch = async (useAuth: boolean) => {
    try {
      const headers: Record<string, string> = { 'User-Agent': 'NEXUS-BOT' };
      if (useAuth) headers['Authorization'] = authHeader();
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        console.warn(`[qq] 图片下载 HTTP ${res.status}`);
        return null;
      }
      const ct = (res.headers.get('content-type') || '').split(';')[0].toLowerCase();
      const urlMime = guessMimeFromUrl(url);
      // QQ 图片资源经常返回 application/octet-stream，只要像图片就接受
      const okCt = ct.startsWith('image/') || ct === 'application/octet-stream';
      if (!okCt && !urlMime) {
        console.warn(`[qq] 图片 content-type 非图片且无法从 URL 推断: ${ct || '空'}`);
        return null;
      }
      const buf = await res.arrayBuffer();
      const mime = ct.startsWith('image/') ? ct : urlMime || 'image/jpeg';
      return { buf, mime };
    } catch (e) {
      console.warn(`[qq] 图片下载异常: ${(e as Error).message}`);
      return null;
    }
  };
  let r = await tryFetch(false);
  if (!r) r = await tryFetch(true);
  if (!r) throw new Error('图片下载失败（QQ 图片资源可能过期或需鉴权）');
  return `data:${r.mime};base64,${Buffer.from(r.buf).toString('base64')}`;
}

async function ensureToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpireAt - 60_000) return accessToken;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appId: CONFIG.platforms.qq.appid,
      clientSecret: CONFIG.platforms.qq.token,
    }),
  });
  const data: any = await res.json();
  if (!data.access_token) {
    throw new Error('获取 QQ access_token 失败：' + JSON.stringify(data));
  }
  accessToken = data.access_token;
  tokenExpireAt = Date.now() + (Number(data.expires_in) || 7200) * 1000;
  console.log('[qq] access_token 已获取，有效期至', new Date(tokenExpireAt).toLocaleTimeString());
  return accessToken;
}

export function createQQAdapter(): BotAdapter {
  const cfg = CONFIG.platforms.qq;
  let ws: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  // 发送回复：群消息走 /v2/groups，单聊走 /v2/users
  async function sendReply(kind: 'group' | 'c2c', target: string, text: string, msgId: string) {
    const url =
      kind === 'group'
        ? `https://api.sgroup.qq.com/v2/groups/${target}/messages`
        : `https://api.sgroup.qq.com/v2/users/${target}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({ content: text, msg_type: 0, msg_id: msgId }),
    });
    // 主动把失败原因打出来，避免"消息没发出去却毫无线索"
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[qq] 回复发送失败 HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  }

  const connect = async () => {
    try {
      await ensureToken();
      // QQ 网关：身份头格式为 `Authorization: QQBot <access_token>`
      const gwRes = await fetch(GATEWAY_URL, { headers: { Authorization: authHeader() } });
      const gw: any = await gwRes.json();
      if (!gw.url) throw new Error('未获取到 QQ 网关地址：' + JSON.stringify(gw));

      ws = new WebSocket(gw.url, {
        headers: { Authorization: authHeader(), 'X-Union-AppID': cfg.appid },
      });

      ws.on('message', async (data: WebSocket.RawData) => {
        let msg: any;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.op === 10) {
          const interval = msg.d.heartbeat_interval;
          heartbeat = setInterval(() => {
            ws?.send(JSON.stringify({ op: 1, d: Date.now() }));
          }, interval ?? 30000);
          // 鉴权：token 同样使用 `QQBot <access_token>` 格式
          ws?.send(JSON.stringify({ op: 2, d: { token: authHeader(), intents: 1 << 25 } }));
        }
        // op=0 为服务端下发事件；op=11 表示心跳 ACK
        if (msg.op === 0 && msg.t === 'READY') {
          console.log('[qq] 已连接官方网关，开始监听群@与单聊消息。');
        }
        if (msg.op === 0 && msg.t === 'GROUP_AT_MESSAGE_CREATE') {
          const c = msg.d;
          const groupId = c.group_openid || c.group_id || '';
          const userId = c.author?.member_openid || c.author?.id || c.openid || '';
          const chatId = `qq:group:${groupId}`;
          const text = (c.content || '').replace(/<@!\d+>/g, '').trim();
          const imageUrl = extractImageUrl(c);
          console.log(
            `[qq] 群消息 附件=${(c.attachments || []).length} 图片=${imageUrl ? '有' : '无'} 文本=${JSON.stringify(text.slice(0, 20))}`
          );
          if (!text && !imageUrl) return;
          if (!groupId) {
            console.warn('[qq] 群消息缺少 group_openid，无法回复，已忽略');
            return;
          }
          const imageRelated = looksLikeImageQuestion(text);
          let imageDataUrl = imageUrl
            ? await downloadImage(imageUrl).catch(() => undefined)
            : undefined;
          if (imageDataUrl) {
            cacheImage(chatId, imageDataUrl);
          } else if (imageRelated) {
            // 这条消息没带图：若刚发过图，复用最近那张
            imageDataUrl = getCachedImage(chatId);
          }
          // 明显在问图片、却确实拿不到图：直接说明原因与正确发法，不让模型凭空猜
          if (!imageDataUrl && imageRelated) {
            await sendReply('group', groupId, IMAGE_GUIDE, c.id).catch((e) =>
              console.warn('[qq] 发送提示失败:', (e as Error).message)
            );
            return;
          }
          handleIncoming({
            platform: 'qq',
            userId,
            userName: c.author?.username,
            text: text || '',
            imageDataUrl,
            chatId,
            reply: async (t: string) => {
              await sendReply('group', groupId, t, c.id);
            },
          });
        }
        if (msg.op === 0 && msg.t === 'C2C_MESSAGE_CREATE') {
          const c = msg.d;
          const openid = c.author?.user_openid || c.author?.id || c.openid || '';
          const chatId = `qq:c2c:${openid}`;
          const text = (c.content || '').trim();
          const imageUrl = extractImageUrl(c);
          console.log(
            `[qq] 单聊消息 附件=${(c.attachments || []).length} 图片=${imageUrl ? '有' : '无'} 文本=${JSON.stringify(text.slice(0, 20))}`
          );
          if (!text && !imageUrl) return;
          if (!openid) {
            console.warn('[qq] 单聊消息缺少 user_openid，无法回复，已忽略');
            return;
          }
          const imageRelated = looksLikeImageQuestion(text);
          let imageDataUrl = imageUrl
            ? await downloadImage(imageUrl).catch(() => undefined)
            : undefined;
          if (imageDataUrl) {
            cacheImage(chatId, imageDataUrl);
          } else if (imageRelated) {
            imageDataUrl = getCachedImage(chatId);
          }
          if (!imageDataUrl && imageRelated) {
            await sendReply('c2c', openid, IMAGE_GUIDE_C2C, c.id).catch((e) =>
              console.warn('[qq] 发送提示失败:', (e as Error).message)
            );
            return;
          }
          handleIncoming({
            platform: 'qq',
            userId: openid,
            userName: c.author?.username,
            text: text || '',
            imageDataUrl,
            chatId,
            reply: async (t: string) => {
              await sendReply('c2c', openid, t, c.id);
            },
          });
        }
      });

      ws.on('error', (e) => console.error('[qq] WebSocket 错误:', (e as Error).message));
      ws.on('close', () => {
        if (heartbeat) clearInterval(heartbeat);
        console.log('[qq] 连接关闭，10 秒后尝试重连…');
        setTimeout(() => {
          console.log('[qq] 正在重连…');
          connect().catch((err: any) => console.error('[qq] 重连失败:', err));
        }, 10_000);
      });
      console.log('[qq] 正在连接官方网关…');
    } catch (e) {
      console.error('[qq] 连接失败（需 QQ 开放平台审核/发布后才会推送消息）:', e);
    }
  };

  return {
    name: 'qq',
    start: async () => {
      await connect();
    },
    stop: async () => {
      if (heartbeat) clearInterval(heartbeat);
      ws?.close();
    },
  };
}
