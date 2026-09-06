/** 多模态消息片段：文本或图片（base64 data URL） */
export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatApiMessage = {
  role: string;
  content: string | ChatPart[];
};

export type StreamHandlers = {
  onToken: (t: string) => void;
  onModel?: (m: string) => void;
  onError: (e: string) => void;
};

const CODE_SYSTEM_PROMPT =
  "你是一名资深软件工程师。用户会给出需求，请直接输出可用的代码，用 markdown 代码块包裹，代码之外只保留极简说明，不要啰嗦。";

/** 拼出对话接口地址，兼容用户填的根地址或已含 /v1 的地址 */
function buildEndpoint(base: string): string {
  const trimmed = (base || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "https://openrouter.ai/api/v1/chat/completions";
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

/**
 * 通用流式对话客户端（OpenAI 兼容）。
 * 同一套代码既能接云端服务（OpenRouter），也能接本地/自建模型
 * （Ollama、LM Studio、vLLM 等），只需换接口地址和模型名。
 */
export async function streamChatCompletion(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  mode: "chat" | "code";
  messages: ChatApiMessage[];
  handlers: StreamHandlers;
}): Promise<void> {
  const { baseUrl, apiKey, model, mode, messages, handlers } = opts;

  if (!model) {
    handlers.onError("请先在「我的 → AI 接口设置」里填写模型名称");
    return;
  }

  const finalMessages =
    mode === "code"
      ? [{ role: "system", content: CODE_SYSTEM_PROMPT }, ...messages]
      : messages;

  handlers.onModel?.(model);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // 本地服务通常不需要密钥，有密钥时才带上
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let resp: Response;
  try {
    resp = await fetch(buildEndpoint(baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages: finalMessages, stream: true }),
    });
  } catch (e: any) {
    handlers.onError(
      `${e?.message || "连接失败"}。若使用本地模型，请确认电脑已开机、手机与电脑在同一 WiFi，且地址填写正确。`,
    );
    return;
  }

  if (!resp.ok || !resp.body) {
    let msg = `请求失败（${resp.status}）`;
    try {
      const data = await resp.json();
      msg = data?.error?.message || data?.error || msg;
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
