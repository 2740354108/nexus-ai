import { Capacitor } from "@capacitor/core";

/**
 * 后端接口根地址解析
 *
 * 网页端：与后端同源，直接用相对路径（如 `/api/...`）。
 * 原生应用（APK）：界面是从手机本地加载的，相对路径会指向手机本地、到不了后端，
 *   因此必须改写成「绝对地址」。默认地址在打包时由 VITE_API_BASE 注入；
 *   用户也可在设置里填「服务器地址」覆盖（存本地，便于换部署地址）。
 */

/** 打包时注入的默认后端地址（仅原生端使用；网页端忽略） */
export const BUILD_API_BASE = String(
  (import.meta as any).env?.VITE_API_BASE || "",
)
  .trim()
  .replace(/\/+$/, "");

const trimBase = (b?: string) => String(b || "").trim().replace(/\/+$/, "");

/** 内置默认后端地址（用于设置页占位提示） */
export function getDefaultApiBase(): string {
  return BUILD_API_BASE;
}

/** 计算当前平台应使用的接口根地址 */
export function resolveApiBase(serverBase?: string): string {
  const override = trimBase(serverBase);
  if (override) return override;
  // 网页端：同源相对路径
  if (!Capacitor.isNativePlatform()) return "";
  // 原生端：打包时注入的默认地址
  return BUILD_API_BASE;
}

let currentBase = "";

export function setApiBaseUrl(base?: string): void {
  currentBase = trimBase(base);
}

export function getApiBaseUrl(): string {
  return currentBase;
}

/** 把以 /api 开头的相对请求改写为指向后端绝对地址 */
export function apiUrl(path: string): string {
  return currentBase ? currentBase + path : path;
}

let installed = false;

/**
 * 安装全局请求改写：所有 `fetch('/api/...')` 在原生端自动指向后端地址。
 * 网页端 currentBase 为空，不做任何改写，行为与原来完全一致。
 */
export function installApiFetchBridge(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = ((input: any, init?: any) => {
    try {
      if (
        currentBase &&
        typeof input === "string" &&
        input.startsWith("/api/")
      ) {
        return original(currentBase + input, init);
      }
    } catch {
      /* 改写失败则按原样请求 */
    }
    return original(input, init);
  }) as typeof window.fetch;
}
