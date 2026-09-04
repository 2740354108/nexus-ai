const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type StreamHandlers = {
  onToken: (t: string) => void;
  onModel?: (m: string) => void;
  onError: (e: string) => void;
};

/** 多模态消息片段：文本或图片（base64 data URL） */
export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatApiMessage = {
  role: string;
  content: string | ChatPart[];
};

/**
 * 拉取 OpenRouter 上「支持看图且免费」的模型列表（该接口无需鉴权）。
 * 以平台返回的实时数据为准，避免手写模型 ID 过期失效。
 */
export async function fetchFreeVisionModels(): Promise<{ id: string; name: string }[]> {
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/models");
    if (!resp.ok) return [];
    const data = await resp.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return list
      .filter(
        (m: any) =>
          Array.isArray(m?.architecture?.input_modalities) &&
          m.architecture.input_modalities.includes("image") &&
          (String(m?.id || "").endsWith(":free") ||
            (Number(m?.pricing?.prompt) === 0 && Number(m?.pricing?.completion) === 0)),
      )
      .map((m: any) => ({ id: String(m.id), name: String(m.name || m.id) }))
      .slice(0, 24);
  } catch {
    return [];
  }
}

const CODE_SYSTEM_PROMPT =
  "你是一名资深软件工程师。用户会给出需求，请直接输出可用的代码，用 markdown 代码块包裹，代码之外只保留极简说明，不要啰嗦。";

/**
 * 直连 OpenRouter 进行流式对话（应用内自带密钥模式）。
 * 消费 OpenAI 兼容的 SSE 流：data: {...} / data: [DONE]
 */
export async function streamOpenRouter(opts: {
  apiKey: string;
  model: string;
  mode: "chat" | "code";
  messages: ChatApiMessage[];
  handlers: StreamHandlers;
}): Promise<void> {
  const { apiKey, model, mode, messages, handlers } = opts;

  if (!apiKey) {
    handlers.onError("请先在「我的 → 密钥设置」里填写 OpenRouter 密钥");
    return;
  }

  const finalMessages =
    mode === "code"
      ? [{ role: "system", content: CODE_SYSTEM_PROMPT }, ...messages]
      : messages;

  handlers.onModel?.(model);

  let resp: Response;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nexuslab.ai",
        "X-Title": "NEXUS AI",
      },
      body: JSON.stringify({ model, messages: finalMessages, stream: true }),
    });
  } catch (e: any) {
    handlers.onError(e?.message || "网络异常，请检查网络连接");
    return;
  }

  if (!resp.ok || !resp.body) {
    let msg = `请求失败（${resp.status}）`;
    try {
      const data = await resp.json();
      msg = data?.error?.message || msg;
    } catch {
      /* 忽略解析失败 */
    }
    handlers.onError(msg);
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;

        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) handlers.onToken(delta);
        } catch {
          /* 忽略畸形分片 */
        }
      }
    }
  } catch (e: any) {
    handlers.onError(e?.message || "读取响应失败");
  }
}
