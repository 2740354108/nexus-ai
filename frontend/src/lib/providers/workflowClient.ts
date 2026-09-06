/**
 * 通用「技术栈 / 自动化」客户端。
 * 你的自建 HTTP 服务（如 Hermes + 本地模型 + 飞书回传的流水线）只要满足下面的简单约定，
 * App 就能直接触发它、读取结果，并把结果推到飞书。
 *
 * 约定（App → 你的服务）：
 *   POST {你的地址}  application/json
 *   body: { "task": "<任务描述>", "timestamp": <毫秒> }
 *   可选鉴权头: Authorization: Bearer <workflowKey>
 * 你的服务可以返回：
 *   - SSE 流（Content-Type: text/event-stream），每行 data: {"content":"..."} 或 {"result":"..."}
 *   - JSON：{ "result"/"output"/"content"/"text"/"message"/"answer": "..." }
 *   - 纯文本
 */

export type WorkflowHandlers = {
  onToken?: (chunk: string) => void;
  onStatus?: (text: string) => void;
  onDone?: (full: string) => void;
  onError?: (msg: string) => void;
};

function buildWorkflowUrl(base: string): string {
  const t = (base || "").trim();
  if (!t) return "";
  return t.replace(/\/+$/, "");
}

/** 触发你自己的技术栈执行一个任务 */
export async function runWorkflow(opts: {
  baseUrl: string;
  apiKey: string;
  task: string;
  handlers: WorkflowHandlers;
}): Promise<void> {
  const { baseUrl, apiKey, task, handlers } = opts;
  const url = buildWorkflowUrl(baseUrl);
  if (!url) {
    handlers.onError?.("请先在「我的 → AI 接口设置」里填写你的技术栈地址");
    return;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ task, timestamp: Date.now() }),
    });
  } catch {
    handlers.onError?.(
      "连不上你的服务。请确认：1) 电脑已开机且服务在运行；2) 手机和电脑连同一个 WiFi；3) 地址含 http:// 且填对；4) 你的服务已开启 CORS（允许跨域）。"
    );
    return;
  }

  if (!resp.ok) {
    handlers.onError?.(`服务返回 ${resp.status} ${resp.statusText}`);
    return;
  }

  const ct = resp.headers.get("content-type") || "";

  // 1) SSE 流式
  if (ct.includes("text/event-stream")) {
    const reader = resp.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith("data:")) continue;
          const data = s.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const piece =
              json.content ?? json.result ?? json.output ?? json.text ?? json.message ?? json.answer ?? "";
            if (piece) {
              full += piece;
              handlers.onToken?.(piece);
            }
            if (json.status) handlers.onStatus?.(String(json.status));
          } catch {
            full += data;
            handlers.onToken?.(data);
          }
        }
      }
    }
    handlers.onDone?.(full);
    return;
  }

  // 2) JSON 或纯文本
  const text = await resp.text();
  if (!text) {
    handlers.onDone?.("");
    return;
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    handlers.onToken?.(text);
    handlers.onDone?.(text);
    return;
  }
  const out =
    (parsed?.result ?? parsed?.output ?? parsed?.content ?? parsed?.text ?? parsed?.message ?? parsed?.answer) as
      | string
      | undefined;
  const str = typeof out === "string" && out ? out : JSON.stringify(parsed);
  handlers.onToken?.(str);
  handlers.onDone?.(str);
}

export type FeishuPushResult = { ok: boolean; text: string };

/** 把一段文本推送到飞书机器人（自定义群机器人 Webhook） */
export async function pushToFeishu(opts: {
  webhook: string;
  title?: string;
  content: string;
}): Promise<FeishuPushResult> {
  const { webhook, title = "NEXUS AI 任务结果", content } = opts;
  if (!webhook) return { ok: false, text: "未填写飞书机器人 webhook" };
  try {
    const body = {
      msg_type: "post",
      content: {
        post: {
          zh_cn: {
            title,
            content: [[{ tag: "text", text: content }]],
          },
        },
      },
    };
    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await resp.json().catch(() => null)) as { code?: number; msg?: string } | null;
    if (data && data.code === 0) return { ok: true, text: "已回传飞书" };
    if (data && data.code !== undefined)
      return { ok: false, text: `飞书返回错误：code=${data.code} ${data.msg || ""}` };
    if (!resp.ok) return { ok: false, text: `飞书返回 ${resp.status}` };
    return { ok: true, text: "已回传飞书" };
  } catch {
    return { ok: false, text: "回传飞书失败，请检查 webhook 地址与网络" };
  }
}
