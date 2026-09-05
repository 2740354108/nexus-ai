import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

/** 本地保存的聊天消息 */
export type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  /** 图片 data URL（可选，体积较大，超预算时优先丢弃） */
  image?: string;
};

const STORAGE_KEY = "nexus.chat.history";
/** 最多保留的条数（一问一答算两条） */
const MAX_MESSAGES = 60;
/** 总字符数预算，超过后先丢图片再丢旧消息 */
const MAX_TOTAL_CHARS = 3_500_000;

const isNative = () => Capacitor.isNativePlatform();

/**
 * 控制体积：超出预算时，先丢掉较老消息里的图片（图片最占空间），
 * 仍然超预算再丢弃最早的消息，保证最近对话一定能留下。
 */
function trim(msgs: StoredMessage[]): StoredMessage[] {
  let list = msgs.slice(-MAX_MESSAGES);
  const sizeOf = () =>
    list.reduce((n, m) => n + (m.content?.length ?? 0) + (m.image?.length ?? 0), 0);

  for (let i = 0; i < list.length && sizeOf() > MAX_TOTAL_CHARS; i++) {
    if (list[i].image) list[i] = { ...list[i], image: undefined };
  }
  while (list.length > 1 && sizeOf() > MAX_TOTAL_CHARS) list = list.slice(1);

  return list;
}

export async function loadChatHistory(): Promise<StoredMessage[]> {
  try {
    let raw: string | null = null;
    if (isNative()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      raw = value;
    } else {
      raw = localStorage.getItem(STORAGE_KEY);
    }
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m: any) =>
          m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
      )
      .map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        image: typeof m.image === "string" ? m.image : undefined,
      }));
  } catch {
    return [];
  }
}

export async function saveChatHistory(msgs: StoredMessage[]): Promise<void> {
  try {
    // 过滤掉空白的助手占位消息（例如失败或未完成的回合）
    const cleaned = msgs.filter((m) => m.content.trim().length > 0);
    const raw = JSON.stringify(trim(cleaned));
    if (isNative()) {
      await Preferences.set({ key: STORAGE_KEY, value: raw });
    } else {
      localStorage.setItem(STORAGE_KEY, raw);
    }
  } catch {
    /* 存储写满时忽略，不影响继续使用 */
  }
}

export async function clearChatHistory(): Promise<void> {
  try {
    if (isNative()) await Preferences.remove({ key: STORAGE_KEY });
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
