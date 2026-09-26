/**
 * 微信 ClawBot（iLink）官方协议客户端
 * ------------------------------------------------------------
 * 直接对接腾讯官方接口 `ilinkai.weixin.qq.com`，不依赖 OpenClaw 核心。
 * 协议函数为官方插件 `openclaw-weixin` 的纯净移植（仅使用 Node 内置能力）。
 *
 * 关键接口（均为 POST/GET，域名为 ilinkai.weixin.qq.com）：
 *   ilink/bot/get_bot_qrcode    -> 获取扫码绑定二维码
 *   ilink/bot/get_qrcode_status -> 长轮询扫码状态（wait/scaned/confirmed/expired…）
 *   ilink/bot/getupdates        -> 长轮询收消息（服务端 hold ~35s）
 *   ilink/bot/sendmessage       -> 发送文本消息
 *   ilink/bot/getconfig         -> 获取 typing_ticket（打字状态用）
 *   ilink/bot/sendtyping        -> 发送"正在输入"状态
 */
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { createDecipheriv } from "node:crypto";

const ILINK_APP_ID = "bot";
const BOT_TYPE = "3";
const FIXED_BASE_URL = "https://ilinkai.weixin.qq.com";

const CHANNEL_VERSION = "1.0.0";
function buildClientVersion(version: string): number {
  const parts = version.split(".").map((p) => parseInt(p, 10));
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  return ((major & 0xff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff);
}
const CLIENT_VERSION = buildClientVersion(CHANNEL_VERSION);

export interface IlinkSession {
  token: string;
  accountId: string; // 机器人自身 id（ilink_bot_id）
  userId: string; // 登录的微信用户 id（ilink_user_id）
  baseUrl: string;
}

/** iLink 消息项类型（官方 proto: MessageItemType） */
export const MessageItemType = {
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5,
} as const;

/** CDN 媒体引用；aes_key 为 base64 编码字节 */
export interface CdnMedia {
  encrypt_query_param?: string;
  aes_key?: string;
  /** 加密类型: 0=只加密 fileid, 1=打包缩略图等 */
  encrypt_type?: number;
  /** 服务端直接返回的完整下载 URL */
  full_url?: string;
}

export interface ImageItem {
  /** 原图 CDN 引用 */
  media?: CdnMedia;
  /** 缩略图 CDN 引用 */
  thumb_media?: CdnMedia;
  /** 原始 AES-128 key（16 字节 hex 字符串），入站解密优先使用 */
  aeskey?: string;
  url?: string;
  mid_size?: number;
  thumb_size?: number;
  thumb_height?: number;
  thumb_width?: number;
  hd_size?: number;
}

export interface MessageItem {
  type?: number;
  text_item?: { text?: string };
  voice_item?: { text?: string; media?: CdnMedia };
  image_item?: ImageItem;
  msg_id?: string;
}

export interface InboundMessage {
  from_user_id: string;
  to_user_id?: string;
  context_token?: string;
  create_time_ms?: number;
  item_list?: MessageItem[];
  message_id?: string;
}

/** iLink CDN 基础地址（官方授权码：auth/accounts.ts 的 CDN_BASE_URL） */
const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

// ---------------------------------------------------------------------------
// 请求层
// ---------------------------------------------------------------------------
function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function buildCommonHeaders(): Record<string, string> {
  return {
    "iLink-App-Id": ILINK_APP_ID,
    "iLink-App-ClientVersion": String(CLIENT_VERSION),
  };
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": randomWechatUin(),
    ...buildCommonHeaders(),
  };
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  return headers;
}

function buildBaseInfo() {
  return { channel_version: CHANNEL_VERSION, bot_agent: "NEXUS-BOT" };
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

const LOSSLESS_ID_FIELDS = new Set(["message_id", "msg_id", "svr_id"]);
/**
 * 官方 JSON 解析：把 uint64 消息 id（超出 JS 安全整数）转成字符串，避免精度丢失。
 */
export function parseWeixinApiJson(rawText: string): any {
  let output = "";
  let index = 0;
  while (index < rawText.length) {
    if (rawText[index] !== '"') {
      output += rawText[index++];
      continue;
    }
    const stringStart = index;
    index++;
    let escaped = false;
    while (index < rawText.length) {
      const char = rawText[index++];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') break;
    }
    const stringToken = rawText.slice(stringStart, index);
    output += stringToken;
    let cursor = index;
    while (/\s/.test(rawText[cursor] ?? "")) cursor++;
    if (rawText[cursor] !== ":") continue;
    let key: string;
    try {
      key = JSON.parse(stringToken);
    } catch {
      continue;
    }
    if (typeof key !== "string" || !LOSSLESS_ID_FIELDS.has(key)) continue;
    output += rawText.slice(index, cursor + 1);
    cursor++;
    while (/\s/.test(rawText[cursor] ?? "")) output += rawText[cursor++];
    const numberStart = cursor;
    if (rawText[cursor] === "-") cursor++;
    while (/\d/.test(rawText[cursor] ?? "")) cursor++;
    if (cursor > numberStart && !(cursor === numberStart + 1 && rawText[numberStart] === "-")) {
      output += `"${rawText.slice(numberStart, cursor)}"`;
      index = cursor;
    } else {
      index = numberStart;
    }
  }
  return JSON.parse(output);
}

async function apiPostFetch(opts: {
  baseUrl: string;
  endpoint: string;
  body: any;
  token?: string;
  timeoutMs?: number;
  label?: string;
}): Promise<string> {
  const base = ensureTrailingSlash(opts.baseUrl);
  const url = new URL(opts.endpoint, base);
  const hdrs = buildHeaders(opts.token);
  const controller = opts.timeoutMs ? new AbortController() : undefined;
  const t = controller && opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined;
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify(opts.body),
    });
    if (t) clearTimeout(t);
    const raw = await res.text();
    if (!res.ok) throw new Error(`${opts.label} HTTP ${res.status}: ${raw}`);
    return raw;
  } catch (err) {
    if (t) clearTimeout(t);
    throw err;
  }
}

async function apiGetFetch(opts: {
  baseUrl: string;
  endpoint: string;
  timeoutMs?: number;
  label?: string;
}): Promise<string> {
  const base = ensureTrailingSlash(opts.baseUrl);
  const url = new URL(opts.endpoint, base);
  const hdrs = buildCommonHeaders();
  const controller = opts.timeoutMs ? new AbortController() : undefined;
  const t = controller && opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined;
  try {
    const res = await fetch(url.toString(), { method: "GET", headers: hdrs });
    if (t) clearTimeout(t);
    const raw = await res.text();
    if (!res.ok) throw new Error(`${opts.label} HTTP ${res.status}: ${raw}`);
    return raw;
  } catch (err) {
    if (t) clearTimeout(t);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 登录 / 扫码
// ---------------------------------------------------------------------------
export async function fetchQRCode(): Promise<{ qrcode: string; qrcodeUrl: string }> {
  const raw = await apiPostFetch({
    baseUrl: FIXED_BASE_URL,
    endpoint: `ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`,
    body: { local_token_list: [] },
    label: "fetchQRCode",
  });
  const r = JSON.parse(raw);
  if (!r.qrcode || !r.qrcode_img_content) {
    throw new Error(`获取二维码失败：${JSON.stringify(r).slice(0, 200)}`);
  }
  return { qrcode: r.qrcode, qrcodeUrl: r.qrcode_img_content };
}

export interface LoginResult {
  session: IlinkSession;
  alreadyConnected?: boolean;
}

/** 长轮询扫码状态，直到 confirmed / expired / 超时 */
export async function waitForLogin(
  qrcode: string,
  opts: { timeoutMs?: number; onScanned?: () => void; getFreshQR?: () => Promise<{ qrcode: string; qrcodeUrl: string }> } = {}
): Promise<IlinkSession> {
  const timeoutMs = Math.max(opts.timeoutMs ?? 1800_000, 1000);
  const deadline = Date.now() + timeoutMs;
  let currentQrcode = qrcode;
  let scannedPrinted = false;

  while (Date.now() < deadline) {
    let status: any;
    try {
      const raw = await apiGetFetch({
        baseUrl: FIXED_BASE_URL,
        endpoint: `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(currentQrcode)}`,
        timeoutMs: 35_000,
        label: "pollQRStatus",
      });
      status = JSON.parse(raw);
    } catch (err) {
      // 网络/网关超时视为等待，继续轮询
      console.log(`[weixin] 轮询扫码状态网络抖动，重试：${(err as Error).message}`);
      await sleep(1000);
      continue;
    }

    switch (status.status) {
      case "wait":
        break;
      case "scaned":
        if (!scannedPrinted) {
          console.log("[weixin] 已扫码，请在手机上点击确认连接…");
          scannedPrinted = true;
          opts.onScanned?.();
        }
        break;
      case "binded_redirect":
        return Promise.reject(new Error("ALREADY_CONNECTED"));
      case "expired": {
        // iLink 二维码有效期很短，持续刷新直到用户扫码；不主动放弃。
        console.log("[weixin] 二维码已过期，正在刷新…");
        if (opts.getFreshQR) {
          const fresh = await opts.getFreshQR();
          currentQrcode = fresh.qrcode;
          scannedPrinted = false;
        } else {
          throw new Error("二维码已过期，请重新运行登录");
        }
        break;
      }
      case "confirmed": {
        if (!status.ilink_bot_id) throw new Error("登录确认但缺少 ilink_bot_id");
        console.log("[weixin] ✅ 连接成功！");
        return {
          token: status.bot_token,
          accountId: status.ilink_bot_id,
          userId: status.ilink_user_id,
          baseUrl: status.baseurl || FIXED_BASE_URL,
        };
      }
      default:
        console.log(`[weixin] 未知扫码状态：${status.status}`);
    }
    await sleep(1000);
  }
  throw new Error("登录超时，请重新运行登录");
}

// ---------------------------------------------------------------------------
// 消息收发
// ---------------------------------------------------------------------------
export async function getUpdates(token: string, baseUrl: string, getUpatesBuf = ""): Promise<any> {
  const raw = await apiPostFetch({
    baseUrl,
    endpoint: "ilink/bot/getupdates",
    body: { get_updates_buf: getUpatesBuf, base_info: buildBaseInfo() },
    token,
    timeoutMs: 35_000,
    label: "getUpdates",
  });
  return parseWeixinApiJson(raw);
}

export async function sendMessage(
  token: string,
  baseUrl: string,
  params: { to: string; text: string; contextToken?: string }
): Promise<any> {
  const clientId = `nexus-weixin-${crypto.randomBytes(8).toString("hex")}`;
  const body = {
    msg: {
      from_user_id: "",
      to_user_id: params.to,
      client_id: clientId,
      message_type: 2, // BOT
      message_state: 2, // FINISH
      item_list: [{ type: 1, text_item: { text: params.text } }],
      context_token: params.contextToken || undefined,
    },
    base_info: buildBaseInfo(),
  };
  const raw = await apiPostFetch({
    baseUrl,
    endpoint: "ilink/bot/sendmessage",
    body,
    token,
    timeoutMs: 15_000,
    label: "sendMessage",
  });
  return parseWeixinApiJson(raw);
}

export async function getConfig(
  token: string,
  baseUrl: string,
  params: { ilinkUserId: string; contextToken?: string }
): Promise<any> {
  const raw = await apiPostFetch({
    baseUrl,
    endpoint: "ilink/bot/getconfig",
    body: {
      ilink_user_id: params.ilinkUserId,
      context_token: params.contextToken,
      base_info: buildBaseInfo(),
    },
    token,
    timeoutMs: 10_000,
    label: "getConfig",
  });
  return JSON.parse(raw);
}

export async function sendTyping(
  token: string,
  baseUrl: string,
  params: { ilinkUserId: string; typing_ticket?: string; status: 1 | 2 }
): Promise<void> {
  await apiPostFetch({
    baseUrl,
    endpoint: "ilink/bot/sendtyping",
    body: {
      ilink_user_id: params.ilinkUserId,
      typing_ticket: params.typing_ticket,
      status: params.status,
      base_info: buildBaseInfo(),
    },
    token,
    timeoutMs: 10_000,
    label: "sendTyping",
  }).catch(() => undefined); // 打字状态失败不影响主流程
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
export function extractText(msg: InboundMessage): string {
  if (!msg.item_list?.length) return "";
  for (const item of msg.item_list) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
      return String(item.text_item.text).trim();
    }
    // 语音转文字：若语音项带 text，则直接用文字内容
    if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
      return String(item.voice_item.text).trim();
    }
  }
  return "";
}

/** 入站图片的下载所需信息（CDN 地址 + 可选 AES key）。 */
export interface ImageDownloadInfo {
  fullUrl?: string;
  encryptQueryParam?: string;
  aesKeyBase64?: string;
}

/**
 * 从消息里提取图片项（type=2），返回 CDN 下载信息。
 * iLink 图片不是普通 URL，而是 CDN 上的 AES-128-ECB 加密资源，
 * 需结合 media.full_url / encrypt_query_param + aeskey 下载解密。
 */
export function extractImageInfo(msg: InboundMessage): ImageDownloadInfo | null {
  if (!msg.item_list?.length) return null;
  for (const item of msg.item_list) {
    if (item.type !== MessageItemType.IMAGE) continue;
    const img = item.image_item;
    if (!img) continue;
    const media = img.media;
    const fullUrl = media?.full_url || img.url;
    const enc = media?.encrypt_query_param;
    if (!fullUrl && !enc) continue;
    // 原图优先用 image_item.aeskey（hex），回退 media.aes_key（base64）
    const aesKeyBase64 = img.aeskey
      ? Buffer.from(img.aeskey, "hex").toString("base64")
      : media?.aes_key;
    return { fullUrl, encryptQueryParam: enc, aesKeyBase64 };
  }
  return null;
}

/** 解析 aes_key：支持 base64(16字节) 与 base64(32位hex字符串) 两种编码。 */
function parseAesKey(aesKeyBase64: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, "base64");
  if (decoded.length === 16) return decoded;
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString("ascii"))) {
    return Buffer.from(decoded.toString("ascii"), "hex");
  }
  throw new Error(`非法 aes_key（解码后 ${decoded.length} 字节）`);
}

/** AES-128-ECB 解密（PKCS7 填充，与官方 cdn/pic-decrypt.ts 一致）。 */
function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** 依据文件头推断图片 MIME（iLink 图片多为 jpeg）。 */
function detectImageMime(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 3 && buf.slice(0, 3).toString("ascii") === "GIF") return "image/gif";
  if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp";
  return "image/jpeg";
}

/**
 * 从 iLink CDN 下载图片并（如有加密）AES-128-ECB 解密，返回 base64 data URL。
 * CDN 下载无需 iLink 鉴权头，加密资源靠 aes_key 解密。
 */
export async function downloadImage(info: ImageDownloadInfo): Promise<string> {
  const url = info.fullUrl
    ? info.fullUrl
    : `${CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(info.encryptQueryParam ?? "")}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CDN 下载失败 HTTP ${res.status} ${body.slice(0, 120)}`);
  }
  const raw = Buffer.from(await res.arrayBuffer());
  let buf: Buffer = raw;
  if (info.aesKeyBase64) {
    buf = decryptAesEcb(raw, parseAesKey(info.aesKeyBase64));
  }
  const mime = detectImageMime(buf);
  console.log(
    `[weixin] 图片下载完成：原始 ${raw.length}B，${
      info.aesKeyBase64 ? `AES 解密后 ${buf.length}B` : "未加密"
    }，mime=${mime}`
  );
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export { randomUUID };
