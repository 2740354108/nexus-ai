/**
 * 统一的 NEXUS 大脑调用层
 * ------------------------------------------------------------
 * 所有社交平台（微信 / QQ / Telegram / Discord …）都通过这里调用同一个
 * NEXUS AI（/api/ai/v1/chat/completions），保证"一个大脑"的体验。
 * 之前各适配器分别走 OpenRouter，现在统一收敛到 NEXUS。
 */
const NEXUS_API_BASE = process.env.NEXUS_API_BASE || "http://localhost:3000/api/ai/v1";
const NEXUS_BOT_TOKEN =
  process.env.NEXUS_BOT_TOKEN || "nexusbot_7c1f9a3e5d8b2460fa9c7e2b4d6f8a01";

const SYSTEM_PROMPT =
  "你是 NEXUS LAB 的 AI 助手。请用简体中文、简洁友好地回答。你了解 NEXUS LAB 的产品：" +
  "NEXUS LAB AI 是一个支持对话、生图、生视频、生音乐、代码生成以及自动化办公的多能力 AI 平台，" +
  "并提供私有知识库（MCP）与云端订阅。除非用户明确询问网站/公司信息，否则不要编造细节。";

// 按会话（chatId）维护的多轮记忆，进程内有效，重启清空。
const histories = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();

export async function callNexus(
  chatId: string,
  text: string,
  imageDataUrl?: string
): Promise<string> {
  const hist = histories.get(chatId) || [];
  // 最后一条用户消息可携带图片（多模态）；其余历史保持纯文本，避免反复传图
  const lastUserContent: any = imageDataUrl
    ? [
        {
          type: "text",
          text: text && text.trim() ? text : "请直接、客观地描述这张图片的主要内容与可见细节，不要反问用户想做什么。",
        },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ]
    : text || "";

  console.log(
    `[nexus] 调用大脑 chat=${chatId.slice(0, 12)} 图片=${imageDataUrl ? "有" : "无"} 文本=${JSON.stringify(
      (text || "").slice(0, 30)
    )}`
  );

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...hist.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: lastUserContent },
  ];

  try {
    const result = await postToNexus(messages);
    if (!result.ok) {
      return `（${result.error}）`;
    }
    const data: any = result.data;
    const content: string = data?.choices?.[0]?.message?.content || "（没有收到回复）";
    // 历史里只记纯文本，便于后续追问；图片本身不进历史
    hist.push({
      role: "user",
      content: (text || "") + (imageDataUrl ? " [用户发送了一张图片]" : ""),
    });
    hist.push({ role: "assistant", content });
    histories.set(chatId, hist.slice(-20));
    return content;
  } catch (err) {
    return `（调用 NEXUS 失败：${(err as Error).message}）`;
  }
}

/** 清空某个会话的对话记忆（/reset 命令用） */
export function resetNexus(chatId: string): void {
  histories.delete(chatId);
}

/**
 * 带超时与重试地调用 NEXUS 大脑。
 * 之前这里没有超时：一旦大脑（后端）正在重启或上游模型卡顿，请求会无限挂起，
 * 微信侧就永远收不到回复，表现成"看不了图"。现在：
 *  - 单次请求 50s 超时；
 *  - 失败后最多重试 2 次（间隔 1.5s），覆盖大脑短暂重启的空窗；
 *  - 全部失败才返回友好提示，绝不静默卡死。
 */
async function postToNexus(messages: any[]): Promise<any> {
  const MAX_TRIES = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await fetch(`${NEXUS_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NEXUS_BOT_TOKEN}`,
        },
        body: JSON.stringify({ model: "nexus", messages, stream: false }),
        signal: AbortSignal.timeout(50_000),
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        // 尽量透出后端给出的具体原因（如"额度已用完"），而不是干巴巴的状态码
        let detail = "";
        try {
          const parsed = JSON.parse(raw);
          const e = parsed?.error;
          detail = typeof e === "string" ? e : e?.message || parsed?.message || "";
        } catch {
          detail = "";
        }
        lastErr = `HTTP ${res.status}`;
        // 只有 5xx 这类瞬时错误才重试；429（额度/限流）不重试，直接如实告知
        if (res.status >= 500) {
          if (attempt < MAX_TRIES) {
            await sleep(1500);
            continue;
          }
        }
        return {
          ok: false,
          error: detail || `AI 服务暂时不可用（${res.status}）`,
        };
      }
      return { ok: true, data: await res.json() };
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_TRIES) {
        await sleep(1500);
        continue;
      }
    }
  }
  return {
    ok: false,
    error: `调用 NEXUS 失败：${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
