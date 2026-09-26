import WebSocket from 'ws';
import type { BotAdapter } from '../types';
import { handleIncoming } from '../gateway';
import { CONFIG } from '../config';

// OneBot 11 适配器（配合 NapCat / LLOneBot / go-cqhttp 等兼容实现）。
//
// 为什么需要它：QQ 官方机器人只能收到「@它」的消息，图片要是单独发的就收不到，
// 导致"不识图"。而 OneBot 是挂在你自己登录的 QQ 上的协议框架，能收到群里
// 「所有」消息（包括单独的图片），无需 @。本适配器：
//   - 连接 NapCat 暴露的 OneBot WebSocket，接收全部群 / 私聊消息
//   - 把图片下载成 base64 交给 NEXUS 视觉模型识图
//   - 图片缓存 5 分钟，所以"先单独发图、再 @问"也能正常识别
//   - 群聊默认只在被 @ 时才回复（避免刷屏）；私聊自动回复
// 参考：https://github.com/botuniverse/onebot-11

const DOWNLOAD_TIMEOUT = 15_000;
const IMAGE_CACHE_TTL = 5 * 60 * 1000;

/** 每个会话最近一次收到的图片（5 分钟内可复用，解决"单独发图"问题） */
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

/** 判断用户是否在"指代已发的图"（而非"要求生成图"） */
const IMAGE_REF_RE = /(图片|图像|照片|截图|看图|识图|读图|图里|图中)/;
const IMAGE_GEN_RE =
  /(生成|画一|画张|画个|绘制|做一张|做张|出一张|出张|生图|作图|设计一张|帮我画|给我画|来一张)/;
function looksLikeImageQuestion(text: string): boolean {
  return IMAGE_REF_RE.test(text) && !IMAGE_GEN_RE.test(text);
}

const IMAGE_GUIDE =
  '我这边没收到图片。你可以直接把图片发到群里（不用和文字连在一起，我记着最近 5 分钟里的图），然后 @我 说"看图 / 图片内容"，我就能识别。';
const IMAGE_GUIDE_C2C = '我这边没收到图片，把图片直接发给我（可和文字一起发），我就能看图了。';

/** 从 URL 后缀推断图片 MIME（图片服务器常不带正确 content-type） */
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

/** 把图片 URL 下载为 base64 data URL（失败抛错，调用方 catch 后按无图处理） */
async function downloadImage(url: string, token?: string): Promise<string> {
  const tryFetch = async (useToken: boolean) => {
    try {
      const headers: Record<string, string> = { 'User-Agent': 'NEXUS-ONEBOT' };
      if (useToken && token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['X-Access-Token'] = token;
      }
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT) });
      if (!res.ok) {
        console.warn(`[onebot] 图片下载 HTTP ${res.status}`);
        return null;
      }
      const ct = (res.headers.get('content-type') || '').split(';')[0].toLowerCase();
      const urlMime = guessMimeFromUrl(url);
      const okCt = ct.startsWith('image/') || ct === 'application/octet-stream';
      if (!okCt && !urlMime) {
        console.warn(`[onebot] 图片 content-type 非图片且无法从 URL 推断: ${ct || '空'}`);
        return null;
      }
      const buf = await res.arrayBuffer();
      const mime = ct.startsWith('image/') ? ct : urlMime || 'image/jpeg';
      return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
    } catch (e) {
      console.warn(`[onebot] 图片下载异常: ${(e as Error).message}`);
      return null;
    }
  };
  let r = await tryFetch(false);
  if (!r && token) r = await tryFetch(true);
  if (!r) throw new Error('图片下载失败');
  return r;
}

/** 从 OneBot message 段里提取纯文本 */
function extractText(segments: any[]): string {
  return (segments || [])
    .filter((s) => s && s.type === 'text')
    .map((s) => (s.data?.text || ''))
    .join('')
    .trim();
}

/**
 * 返回第一条图片的可下载 URL，或 '__GET_IMAGE__:<file>' 表示需要调 get_image 解析。
 */
function firstImageUrl(segments: any[]): string | null {
  for (const s of segments || []) {
    if (!s || s.type !== 'image') continue;
    const d = s.data || {};
    if (typeof d.url === 'string' && /^https?:\/\//.test(d.url)) return d.url;
    if (typeof d.file === 'string' && /^https?:\/\//.test(d.file)) return d.file;
    if (typeof d.file === 'string' && d.file) return '__GET_IMAGE__:' + d.file;
  }
  return null;
}

export function createOneBotAdapter(): BotAdapter {
  const cfg = CONFIG.platforms.onebot;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let msgSeq = 0;
  const pending = new Map<
    string,
    { resolve: (v: any) => void; reject: (e: any) => void; timer: ReturnType<typeof setTimeout> }
  >();

  /** 通过 OneBot WebSocket 调用 API（带 echo 匹配返回） */
  function callAction(action: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('OneBot WS 未连接'));
        return;
      }
      const echo = 'n' + ++msgSeq;
      const timer = setTimeout(() => {
        if (pending.has(echo)) {
          pending.delete(echo);
          reject(new Error('OneBot API 超时'));
        }
      }, 20_000);
      pending.set(echo, { resolve, reject, timer });
      ws.send(JSON.stringify({ action, params, echo }));
    });
  }

  async function sendGroup(groupId: string | number, text: string): Promise<void> {
    await callAction('send_group_msg', { group_id: groupId, message: text });
  }
  async function sendPrivate(userId: string | number, text: string): Promise<void> {
    await callAction('send_private_msg', { user_id: userId, message: text });
  }

  function buildWsUrl(): string {
    const base = cfg.wsUrl || 'ws://127.0.0.1:3001';
    if (!cfg.token) return base;
    if (base.includes('access_token=')) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}access_token=${encodeURIComponent(cfg.token)}`;
  }

  async function onMessage(m: any): Promise<void> {
    const isGroup = m.message_type === 'group';
    const chatId = isGroup ? `onebot:group:${m.group_id}` : `onebot:private:${m.user_id}`;
    const segments: any[] = Array.isArray(m.message) ? m.message : [];
    const text = extractText(segments);
    const imageSlot = firstImageUrl(segments);
    console.log(
      `[onebot] ${isGroup ? '群' : '私聊'} 文本=${JSON.stringify(text.slice(0, 20))} 图片=${imageSlot ? '有' : '无'}`
    );

    // 解析图片（可能要先调 get_image 拿到真实 URL）
    let imageDataUrl: string | undefined;
    if (imageSlot) {
      let url = imageSlot;
      if (url.startsWith('__GET_IMAGE__:')) {
        const file = url.slice('__GET_IMAGE__:'.length);
        try {
          const r: any = await callAction('get_image', { file });
          url = r?.data?.url || r?.url || '';
        } catch (e) {
          console.warn('[onebot] get_image 失败:', (e as Error).message);
          url = '';
        }
      }
      if (url) imageDataUrl = await downloadImage(url, cfg.token || undefined).catch(() => undefined);
    }
    if (imageDataUrl) cacheImage(chatId, imageDataUrl);

    // 是否回复：私聊全回；群聊仅在被 @ 或配置了「总是回复」的群才回
    let shouldReply = false;
    if (!isGroup) {
      shouldReply = true;
    } else {
      const atBot = cfg.botQq
        ? segments.some((s) => s?.type === 'at' && String(s.data?.qq) === String(cfg.botQq))
        : false;
      const atName = cfg.botName ? text.includes('@' + cfg.botName) : false;
      const always = cfg.allowGroups.includes(String(m.group_id));
      shouldReply = atBot || atName || always;
    }
    if (!shouldReply) return;

    // 没带图但提到图：优先复用最近缓存的图；实在没有则给出提示
    let finalImage = imageDataUrl;
    if (!finalImage && looksLikeImageQuestion(text)) finalImage = getCachedImage(chatId);
    if (!finalImage && looksLikeImageQuestion(text)) {
      await (isGroup ? sendGroup(m.group_id, IMAGE_GUIDE) : sendPrivate(m.user_id, IMAGE_GUIDE_C2C)).catch(
        (e) => console.warn('[onebot] 提示发送失败:', (e as Error).message)
      );
      return;
    }

    // 去掉 @ 段与 @昵称 噪音，再交给模型
    const cleanText = text
      .replace(/\[CQ:at,qq=\d+\]/g, '')
      .replace(/@\S+\s?/g, '')
      .trim();

    try {
      await handleIncoming({
        platform: 'onebot',
        userId: String(m.user_id),
        userName: m.sender?.nickname || m.sender?.card || String(m.user_id),
        text: cleanText,
        imageDataUrl: finalImage,
        chatId,
        reply: async (t: string) => {
          await (isGroup ? sendGroup(m.group_id, t) : sendPrivate(m.user_id, t));
        },
      });
    } catch (e) {
      console.error('[onebot] 处理失败:', e);
    }
  }

  async function connect(): Promise<void> {
    try {
      const url = buildWsUrl();
      console.log(
        `[onebot] 正在连接 OneBot WebSocket: ${url.replace(/access_token=[^&]+/, 'access_token=***')}`
      );
      ws = new WebSocket(
        url,
        cfg.token ? { headers: { Authorization: `Bearer ${cfg.token}` } } : {}
      );

      ws.on('open', () => console.log('[onebot] 已连接 OneBot（NapCat / LLOneBot）'));
      ws.on('error', (e) => console.error('[onebot] WebSocket 错误:', (e as Error).message));
      ws.on('close', () => {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        console.log('[onebot] 连接关闭，5 秒后重连…');
        reconnectTimer = setTimeout(() => {
          connect().catch((e) => console.error('[onebot] 重连失败:', e));
        }, 5000);
      });

      ws.on('message', async (data: WebSocket.RawData) => {
        let m: any;
        try {
          m = JSON.parse(data.toString());
        } catch {
          return;
        }
        // API 调用的响应：按 echo 匹配
        if (m.echo && pending.has(m.echo)) {
          const p = pending.get(m.echo)!;
          clearTimeout(p.timer);
          pending.delete(m.echo);
          if (m.status === 'failed' || m.retcode) p.reject(new Error(JSON.stringify(m)));
          else p.resolve(m.data);
          return;
        }
        // 事件：消息
        if (m.post_type === 'message') {
          onMessage(m).catch((e) => console.error('[onebot] 消息处理异常:', e));
        }
      });
    } catch (e) {
      console.error('[onebot] 连接失败:', e);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        connect().catch((e) => console.error('[onebot] 重连失败:', e));
      }, 5000);
    }
  }

  return {
    name: 'onebot',
    start: async () => {
      await connect();
    },
    stop: async () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}
