import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

/**
 * 应用设置（自带密钥模式）
 * 原生环境用 Capacitor Preferences 存到系统存储，网页环境回落到 localStorage。
 */
export type AppSettings = {
  /**
   * 对话接口地址（OpenAI 兼容）。
   * 默认走 OpenRouter；改成自己的服务即可接本地/自建模型，例如：
   * - Ollama：http://192.168.1.10:11434/v1
   * - LM Studio：http://192.168.1.10:1234/v1
   * - vLLM / 自建网关：http://你的地址/v1
   */
  chatApiBase: string;
  /** 该接口的密钥（本地服务通常留空） */
  openrouterKey: string;
  /** 对话使用的模型 id（本地服务填本地模型名，如 qwen2.5:7b） */
  chatModel: string;
  /** Pollinations 令牌（可选，不填也能画图，填了额度更高） */
  pollinationsToken: string;
  /** 本地 ComfyUI 地址（可选，用于画图 / 视频） */
  comfyUrl: string;
  /** ComfyUI 画图底模（CheckpointLoaderSimple 里的模型名） */
  comfyCheckpoint: string;
  /** ComfyUI 视频模型（UNETLoader 里的模型名，如 wan2.x） */
  comfyUnet: string;
  /** ComfyUI VAE（视频用） */
  comfyVae: string;
  /** ComfyUI CLIP 视觉编码器（图生视频可选） */
  comfyClipVision: string;
  /** 自建技术栈（自动化办公）HTTP 服务地址 */
  workflowUrl: string;
  /** 该技术栈服务的密钥（可选，没有就留空） */
  workflowKey: string;
  /** 飞书机器人 Webhook（任务结果回传用，可选） */
  feishuWebhook: string;
  /**
   * 备用模型（对话中可被主模型调用）。
   * 预设后，主模型在合适时会自动把子任务转给它，无需每次手填。
   */
  routerEndpoint: string;
  /** 备用模型名，例如 qwen3-32b、deepseek-chat */
  routerModel: string;
  /** 备用模型密钥（本地模型可留空） */
  routerApiKey: string;
};

const STORAGE_KEY = "nexus.app.settings";

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export const DEFAULT_SETTINGS: AppSettings = {
  chatApiBase: OPENROUTER_BASE,
  openrouterKey: "",
  chatModel: "z-ai/glm-5.2",
  pollinationsToken: "",
  comfyUrl: "",
  comfyCheckpoint: "",
  comfyUnet: "",
  comfyVae: "",
  comfyClipVision: "",
  workflowUrl: "",
  workflowKey: "",
  feishuWebhook: "",
  routerEndpoint: "",
  routerModel: "",
  routerApiKey: "",
};

/** 是否使用 OpenRouter（决定「免费看图模型」等功能是否适用） */
export const isOpenRouter = (base: string) =>
  !base || base.trim() === "" || base.trim() === OPENROUTER_BASE;

/** 可选模型：均为明确允许商用的开放权重模型 */
export const CHAT_MODELS: { id: string; label: string; note: string }[] = [
  { id: "z-ai/glm-5.2", label: "GLM-5.2", note: "MIT · 可商用" },
  { id: "nvidia/nemotron-3-super", label: "Nemotron 3 Super", note: "可商用" },
  { id: "google/gemma-4-31b", label: "Gemma 4 31B", note: "可商用" },
];

export const isNativeApp = () => Capacitor.isNativePlatform();

export async function loadSettings(): Promise<AppSettings> {
  try {
    let raw: string | null = null;
    if (isNativeApp()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      raw = value;
    } else {
      raw = localStorage.getItem(STORAGE_KEY);
    }
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  const raw = JSON.stringify(next);
  if (isNativeApp()) {
    await Preferences.set({ key: STORAGE_KEY, value: raw });
  } else {
    localStorage.setItem(STORAGE_KEY, raw);
  }
}

export async function clearSettings(): Promise<void> {
  if (isNativeApp()) {
    await Preferences.remove({ key: STORAGE_KEY });
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** 在组件里读写设置，自动加载 + 自动持久化 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSettings().then((s) => {
      if (!alive) return;
      setSettings(s);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    void clearSettings();
  }, []);

  return { settings, update, reset, ready };
}
