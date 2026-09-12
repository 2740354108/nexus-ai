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
  /** 模型决定调用某个工具时回调（用于 UI 提示「正在调用 XX」） */
  onToolCall?: (name: string) => void;
};

/** 一个可被模型调用的工具（OpenAI / OpenRouter 兼容格式） */
export type ChatTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/** 模型返回的一次工具调用 */
export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
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
 *
 * 支持工具调用（function calling）：传入 tools + executeTool 后，
 * 若模型决定调用工具，会执行并把结果回传，再让模型产出最终回答。
 * 这是接入 MCP / 调用其他模型的基础——把"别的模型"包成一个工具即可。
 */
export async function streamChatCompletion(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  mode: "chat" | "code";
  messages: ChatApiMessage[];
  tools?: ChatTool[];
  executeTool?: (call: ToolCall) => Promise<string>;
  handlers: StreamHandlers;
}): Promise<void> {
  const { baseUrl, apiKey, model, mode, messages, handlers } = opts;
  const tools = opts.tools;
  const executeTool = opts.executeTool;

  if (!model) {
    handlers.onError("请先在「我的 → AI 接口设置」里填写模型名称");
    return;
  }

  // 工作消息（会随工具调用轮次增长）
  const working: any[] = messages.map((m) => ({ ...m }));
  const MAX_ROUNDS = 4;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const finalMessages =
      mode === "code"
        ? [{ role: "system", content: CODE_SYSTEM_PROMPT }, ...working]
        : working;

    const body: Record<string, unknown> = {
      model,
      messages: finalMessages,
      stream: true,
    };
    // 仅在首轮声明工具，避免模型无限循环调用
    if (round === 0 && tools?.length) body.tools = tools;

    const run = await runStream({ baseUrl, apiKey, body, handlers, live: !(tools && tools.length) });
    if (run.toolCalls.length === 0) {
      // 没有工具调用：本轮就是最终回答（run 内部已流式输出）
      return;
    }

    // 有工具调用：把 assistant 的工具调用与每个工具结果补回上下文，再让模型继续
    working.push({
      role: "assistant",
      content: run.content || "",
      tool_calls: run.toolCalls.map((t) => ({
        id: t.id,
        type: "function",
        function: { name: t.name, arguments: t.arguments },
      })),
    });

    for (const tc of run.toolCalls) {
      handlers.onToolCall?.(tc.name);
      let result: string;
      try {
        result = executeTool ? await executeTool(tc) : "（未提供工具执行器）";
      } catch (e: any) {
        result = `工具执行出错：${e?.message || e}`;
      }
      working.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  handlers.onError("工具调用轮次过多，已停止");
}

/** 执行一次流式请求，返回累积的内容与工具调用；可实时 or 缓冲输出 token */
async function runStream(opts: {
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
  handlers: StreamHandlers;
  live: boolean;
}): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const { baseUrl, apiKey, body, handlers, live } = opts;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let resp: Response;
  try {
    resp = await fetch(buildEndpoint(baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    handlers.onError(
      `${e?.message || "连接失败"}。若使用本地模型，请确认电脑已开机、手机与电脑在同一 WiFi，且地址填写正确。`,
    );
    return { content: "", toolCalls: [] };
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
    return { content: "", toolCalls: [] };
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const acc: Record<number, { id: string; name: string; arguments: string }> = {};

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
        if (payload === "[DONE]") break;

        try {
          const json = JSON.parse(payload);
          const choice = json?.choices?.[0];
          const delta = choice?.delta;
          if (!delta) continue;

          if (typeof delta.content === "string" && delta.content) {
            content += delta.content;
            if (live) handlers.onToken(delta.content);
          }

          const tcs = delta.tool_calls;
          if (Array.isArray(tcs)) {
            for (const tc of tcs) {
              const i = tc.index ?? 0;
              if (!acc[i]) acc[i] = { id: "", name: "", arguments: "" };
              if (tc.id) acc[i].id = tc.id;
              if (tc.function?.name) acc[i].name = tc.function.name;
              if (typeof tc.function?.arguments === "string") acc[i].arguments += tc.function.arguments;
            }
          }
        } catch {
          /* 忽略畸形分片 */
        }
      }
    }
  } catch (e: any) {
    handlers.onError(e?.message || "读取响应失败");
  }

  // 非实时模式（工具会话）：若本轮没产生工具调用，把缓冲内容一次性输出
  if (!live && Object.keys(acc).length === 0 && content) {
    handlers.onToken(content);
  }

  const toolCalls = Object.values(acc).map((t) => ({
    id: t.id || `call_${Math.random().toString(36).slice(2)}`,
    name: t.name,
    arguments: t.arguments,
  }));

  return { content, toolCalls };
}

/** 一次性（非流式）调用另一个 OpenAI 兼容模型，返回文本 */
export async function callModelOnce(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatApiMessage[];
}): Promise<string> {
  const { baseUrl, apiKey, model, messages } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const resp = await fetch(buildEndpoint(baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, stream: false }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`子模型调用失败（${resp.status}）：${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const c = data?.choices?.[0]?.message?.content ?? data?.content ?? "";
  return typeof c === "string" ? c : JSON.stringify(c);
}

/**
 * 内置工具：调用「另一个模型」。
 * 把别的模型（本地或云端、任何 OpenAI 兼容服务）包成一个工具，
 * 主模型就能在对话中按需把子任务转给它——这就是「AI 连到别的模型」的最小实现。
 * 后续要接真正的 MCP，只需把 executeModelRouterTool 换成 MCP 客户端调用即可。
 */
export const MODEL_ROUTER_TOOL: ChatTool = {
  type: "function",
  function: {
    name: "call_another_model",
    description:
      "当需要调用另一个 AI 模型来完成子任务时使用，例如换一个更擅长某领域的模型，或调用用户本地部署的专用模型。提供该模型的接口地址、模型名和要发送的内容。",
    parameters: {
      type: "object",
      properties: {
        endpoint: {
          type: "string",
          description: "目标模型的 OpenAI 兼容接口地址，例如 http://192.168.1.100:11434/v1 或 https://openrouter.ai/api/v1",
        },
        model: {
          type: "string",
          description: "目标模型名称，例如 qwen3-32b、deepseek-chat、glm-5.2",
        },
        prompt: {
          type: "string",
          description: "要发送给目标模型的完整内容",
        },
        api_key: {
          type: "string",
          description: "目标模型的 API Key（可选，本地模型可留空）",
        },
      },
      required: ["endpoint", "model", "prompt"],
    },
  },
};

/** MODEL_ROUTER_TOOL 的执行器：调用另一个模型并拿回文本结果 */
export async function executeModelRouterTool(call: ToolCall): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    return "工具参数解析失败";
  }
  const endpoint = args.endpoint as string;
  const model = args.model as string;
  const prompt = args.prompt as string;
  if (!endpoint || !model || !prompt) return "缺少必要参数 endpoint / model / prompt";

  try {
    const text = await callModelOnce({
      baseUrl: endpoint,
      apiKey: (args.api_key as string) || "",
      model,
      messages: [{ role: "user", content: String(prompt) }],
    });
    return text.slice(0, 8000);
  } catch (e: any) {
    return `调用子模型失败：${e?.message || e}`;
  }
}
