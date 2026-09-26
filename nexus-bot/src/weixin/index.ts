/**
 * NEXUS BOT —— 微信（ClawBot / iLink）通道
 * ------------------------------------------------------------
 * 把微信消息接进 NEXUS AI：用户在微信里发消息 -> 云端 NEXUS 大脑回复。
 * 使用腾讯官方 iLink 协议（见 ilink-client.ts），无需公网回调。
 *
 * 用法：
 *   nexus-bot 启动参数 `--weixin` 或环境变量 ENABLE_WEIXIN=true
 *   首次运行会生成二维码（weixin-qr.png）并打印链接，用手机微信扫码绑定。
 *   登录成功后会自动保存会话到 .weixin-session.json，下次免扫码（直到 24h 令牌过期）。
 */
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import {
  fetchQRCode,
  waitForLogin,
  getUpdates,
  sendMessage,
  getConfig,
  sendTyping,
  extractText,
  extractImageInfo,
  downloadImage,
  sleep,
  type IlinkSession,
  type InboundMessage,
  type ImageDownloadInfo,
} from "./ilink-client";
import { callNexus, resetNexus } from "../nexus";

const SESSION_FILE = path.join(process.cwd(), ".weixin-session.json");

function saveSession(session: IlinkSession) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session), "utf-8");
  console.log(`[weixin] 会话已保存 -> ${SESSION_FILE}`);
}

function loadSession(): IlinkSession | null {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
  } catch {
    return null;
  }
}

/** 生成二维码图片 + 打印链接，返回扫码登录所需的 qrcode token 与图片路径 */
async function showQR(): Promise<{ qrcode: string; qrcodeUrl: string; pngPath: string }> {
  const { qrcode, qrcodeUrl } = await fetchQRCode();
  // 每次用时间戳生成新文件名，避免前端预览缓存导致"看起来没刷新"
  const pngPath = path.join(process.cwd(), `weixin-qr-${Date.now()}.png`);
  await QRCode.toFile(pngPath, qrcodeUrl, { width: 360, margin: 2 });
  console.log("────────────────────────────────────────");
  console.log("请打开手机微信，用「扫一扫 -> 相册」选择下方二维码图片，");
  console.log("或直接复制链接在微信内打开：");
  console.log("");
  console.log("  二维码图片：", pngPath);
  console.log("  绑定链接  ：", qrcodeUrl);
  console.log("────────────────────────────────────────");
  return { qrcode, qrcodeUrl, pngPath };
}

async function doLogin(): Promise<IlinkSession> {
  const first = await showQR();
  const session = await waitForLogin(first.qrcode, {
    timeoutMs: 1800_000,
    getFreshQR: async () => showQR(),
  });
  saveSession(session);
  return session;
}

/** 统一的回复流程：打字态 -> 调大脑（可带图）-> 发送 -> 取消打字态 */
async function respond(
  session: IlinkSession,
  from: string,
  text: string,
  imgInfo: ImageDownloadInfo | null,
  ctxToken?: string
) {
  // 打字状态（尽力而为）
  try {
    const cfg = await getConfig(session.token, session.baseUrl, {
      ilinkUserId: session.userId,
      contextToken: ctxToken,
    });
    await sendTyping(session.token, session.baseUrl, {
      ilinkUserId: session.userId,
      typing_ticket: cfg?.typing_ticket,
      status: 1,
    });
  } catch {
    /* ignore */
  }

  let reply: string;
  if (imgInfo) {
    try {
      const dataUrl = await downloadImage(imgInfo);
      reply = await callNexus(from, text, dataUrl);
    } catch (err) {
      console.error("[weixin] 图片处理失败：", (err as Error).message);
      reply = "（这张图片我暂时下载不下来，可能无法识图，换个图或发文字试试）";
    }
  } else {
    reply = await callNexus(from, text);
  }

  try {
    await sendMessage(session.token, session.baseUrl, {
      to: from,
      text: reply,
      contextToken: ctxToken,
    });
  } catch (err) {
    console.error("[weixin] 发送失败：", (err as Error).message);
  }

  try {
    await sendTyping(session.token, session.baseUrl, {
      ilinkUserId: session.userId,
      status: 2,
    });
  } catch {
    /* ignore */
  }
}

// 微信里"图片"和"追问"常分两条发送。这里做两层兜底：
//  1) 短延时缓冲：紧随图片（4 秒内）的追问，与图片合并成一次"看图回答"；
//  2) 最近图片记忆：若图片已单独回复、追问来晚了，在时间窗内仍把这张图补给追问。
// 这样无论"图+字"还是"先图后字"，模型都能看到图，不会再回"没看到图片"。
const IMAGE_BUFFER_MS = 4000;
const RECENT_IMAGE_TTL_MS = 120_000;
const pendingImages = new Map<
  string,
  { imgInfo: ImageDownloadInfo; timer: NodeJS.Timeout; ctxToken?: string }
>();
const recentImages = new Map<string, { imgInfo: ImageDownloadInfo; at: number }>();

function clearPending(from: string) {
  const p = pendingImages.get(from);
  if (p) {
    clearTimeout(p.timer);
    pendingImages.delete(from);
  }
}

/** 取出最近一张图（时间窗内）；取出即失效，避免之后的无关提问反复带图 */
function takeRecentImage(from: string): ImageDownloadInfo | null {
  const r = recentImages.get(from);
  if (!r) return null;
  if (Date.now() - r.at > RECENT_IMAGE_TTL_MS) {
    recentImages.delete(from);
    return null;
  }
  recentImages.delete(from);
  return r.imgInfo;
}

async function handleMessage(session: IlinkSession, msg: InboundMessage) {
  const text = extractText(msg);
  const imgInfo = extractImageInfo(msg);
  const from = msg.from_user_id || "";
  const ctxToken = msg.context_token;
  if (!from) return;

  if (text === "/reset") {
    clearPending(from);
    recentImages.delete(from);
    resetNexus(from);
    await sendMessage(session.token, session.baseUrl, {
      to: from,
      text: "已清空我们之间的对话记忆。",
      contextToken: ctxToken,
    });
    return;
  }
  if (text === "/help") {
    await sendMessage(session.token, session.baseUrl, {
      to: from,
      text: "在微信里直接聊天即可，我会用 NEXUS AI 回答，也可以直接发图片让我识图。命令：/reset 清空记忆。",
      contextToken: ctxToken,
    });
    return;
  }

  // 情况一：只有图片、没有文字 —— 先缓冲，等待可能的追问
  if (imgInfo && !text) {
    console.log(`[weixin] 收到来自 ${from}：[图片]（缓冲等待追问 ${IMAGE_BUFFER_MS}ms）`);
    // 记下最近图片：即使缓冲到期先单独回复了，后面来晚的追问也能补回这张图
    recentImages.set(from, { imgInfo, at: Date.now() });
    clearPending(from);
    const timer = setTimeout(() => {
      pendingImages.delete(from);
      void respond(session, from, "", imgInfo, ctxToken);
    }, IMAGE_BUFFER_MS);
    pendingImages.set(from, { imgInfo, timer, ctxToken });
    return;
  }

  // 情况二：图片与文字同条 —— 直接识图问答
  if (imgInfo) {
    console.log(`[weixin] 收到来自 ${from}：[图片] ${text}`);
    clearPending(from);
    recentImages.delete(from);
    await respond(session, from, text, imgInfo, ctxToken);
    return;
  }

  // 情况三：纯文字 —— 若之前有缓冲的图片，合并为"看图回答这个问题"
  const pending = pendingImages.get(from);
  if (pending) {
    clearPending(from);
    recentImages.delete(from);
    console.log(`[weixin] 收到来自 ${from}：${text}（合并先前图片）`);
    await respond(session, from, text, pending.imgInfo, pending.ctxToken ?? ctxToken);
    return;
  }

  // 情况四：纯文字，但刚刚发过图（图片已单独回复）——把最近一张图补给这次追问
  const recent = takeRecentImage(from);
  if (recent) {
    console.log(`[weixin] 收到来自 ${from}：${text}（补回最近图片）`);
    await respond(session, from, text, recent, ctxToken);
    return;
  }

  if (!text) return;
  console.log(`[weixin] 收到来自 ${from}：${text}`);
  await respond(session, from, text, null, ctxToken);
}

let running = true;

async function startLoop(session: IlinkSession) {
  let buf = "";
  let consecutiveFails = 0;
  while (running) {
    let resp: any;
    try {
      resp = await getUpdates(session.token, session.baseUrl, buf);
      consecutiveFails = 0;
    } catch (err) {
      console.error("[weixin] 收消息出错：", (err as Error).message);
      consecutiveFails++;
      if (consecutiveFails >= 5) {
        // 很可能是令牌过期，尝试重新登录
        console.log("[weixin] 连续失败，尝试重新登录…");
        try {
          const newSession = await doLogin();
          session = newSession;
          buf = "";
          consecutiveFails = 0;
          continue;
        } catch (e) {
          console.error("[weixin] 重新登录失败：", (e as Error).message);
          await sleep(10_000);
          continue;
        }
      }
      await sleep(3000);
      continue;
    }

    if (resp?.get_updates_buf) buf = resp.get_updates_buf;

    const msgs: InboundMessage[] = resp?.msgs || [];
    for (const m of msgs) {
      // 并发处理，但保持顺序发送更稳妥：这里顺序 await
      await handleMessage(session, m);
    }
    await sleep(300);
  }
}

export async function startWeixin(): Promise<void> {
  let session = loadSession();
  if (!session) {
    console.log("[weixin] 没有已保存的会话，开始扫码登录…");
    session = await doLogin();
  } else {
    console.log("[weixin] 使用已保存的会话启动…");
  }
  await startLoop(session);
}

// CLI 入口：tsx src/weixin/index.ts login | run
async function main() {
  const cmd = process.argv[2] || "run";
  if (cmd === "login") {
    const s = await doLogin();
    console.log("[weixin] 登录成功，可运行 run 启动消息循环。");
    return;
  }
  await startWeixin();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("[weixin] 退出：", e?.message || e);
    process.exit(1);
  });
}
