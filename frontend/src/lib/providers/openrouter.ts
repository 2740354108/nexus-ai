/**
 * OpenRouter 平台相关能力。
 * 对话能力已统一到 providers/chatClient.ts（兼容任意 OpenAI 接口），
 * 这里只保留平台特有的能力：拉取免费且支持看图的模型列表。
 */

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
