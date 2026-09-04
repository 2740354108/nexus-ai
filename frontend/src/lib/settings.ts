import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

/**
 * 应用设置（自带密钥模式）
 * 原生环境用 Capacitor Preferences 存到系统存储，网页环境回落到 localStorage。
 */
export type AppSettings = {
  /** OpenRouter 密钥：驱动对话 / 代码助手 */
  openrouterKey: string;
  /** 对话使用的模型 id */
  chatModel: string;
  /** Pollinations 令牌（可选，不填也能画图，填了额度更高） */
  pollinationsToken: string;
  /** 本地 ComfyUI 地址（可选，用于视频生成） */
  comfyUrl: string;
};

const STORAGE_KEY = "nexus.app.settings";

export const DEFAULT_SETTINGS: AppSettings = {
  openrouterKey: "",
  chatModel: "z-ai/glm-5.2",
  pollinationsToken: "",
  comfyUrl: "",
};

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
