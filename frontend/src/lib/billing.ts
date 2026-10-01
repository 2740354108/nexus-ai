/**
 * 商业化前端调用层：套餐 / 订阅 / 订单 / 用量 / 云端配置
 * 自动从 localStorage 读取登录令牌并注入 Authorization 头。
 */

const TOKEN_KEY = "nexus_token";

function authHeaders(): Record<string, string> {
  const token =
    typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) || "" : "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败：${res.status}`);
  return data as T;
}

export interface Plan {
  id: string;
  name: string;
  price_cents: number;
  price_usd?: number;
  interval: string;
  limits: Record<string, number>;
  features: string[];
}

export interface UsageItem {
  feature: string;
  limit: number;
  used: number;
  remaining: number;
}

export const getPlans = () => api<{ plans: Plan[] }>("/billing/plans").then((d) => d.plans);

export const getSubscription = () =>
  api<{ subscribed: boolean; plan: Plan; subscription: any }>("/billing/subscription");

export const getUsage = () => api<{ usage: UsageItem[] }>("/billing/usage").then((d) => d.usage);

export const checkout = (planId: string, channel: "paypal" = "paypal") =>
  api<{
    orderId: string;
    amount: number;
    amountUsd?: number;
    channel: string;
    qrCode: string;
    payUrl: string;
    mock: boolean;
    returnUrl?: string;
    free?: boolean;
    planId?: string;
  }>("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ planId, channel }),
  });

export const confirmOrder = (orderId: string) =>
  api("/billing/confirm", { method: "POST", body: JSON.stringify({ orderId }) });

export const getCloudConfig = () => api<{ config: any }>("/config").then((d) => d.config || {});

export const saveCloudConfig = (config: any) =>
  api("/config", { method: "PUT", body: JSON.stringify({ config }) });

/** 上报一次用量（静默失败，不影响主功能） */
export const recordUsage = (feature: string, n = 1) =>
  api("/billing/usage/record", {
    method: "POST",
    body: JSON.stringify({ feature, n }),
  }).catch(() => null);

/** 查询某功能剩余额度（未登录时抛错，调用方自行兜底） */
export const checkQuota = (feature: string) =>
  api<{ ok: boolean; limit: number; used: number; remaining: number }>(
    `/billing/quota?feature=${feature}`
  );
