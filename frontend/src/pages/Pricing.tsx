import { useEffect, useRef, useState } from "react";
import {
  X,
  Check,
  Crown,
  Loader2,
  CreditCard,
  MessageSquare,
  Image as ImageIcon,
  Clapperboard,
  Music4,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  getPlans,
  getSubscription,
  getUsage,
  checkout,
  confirmOrder,
  type Plan,
  type UsageItem,
} from "@/lib/billing";

const FEATURE_LABEL: Record<string, { label: string; icon: typeof MessageSquare }> = {
  chat: { label: "对话", icon: MessageSquare },
  image: { label: "绘图", icon: ImageIcon },
  video: { label: "视频", icon: Clapperboard },
  music: { label: "音乐", icon: Music4 },
};

/**
 * 会员与订阅页（多租户商业化前端）。
 * - 展示套餐、当前订阅、本月用量
 * - 购买：PayPal.me 个人收款（无营业执照也能用）→ 新标签页打开收款链接 → 回站点点「我已支付」激活
 */
const Pricing = ({ onClose }: { onClose: () => void }) => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [usage, setUsage] = useState<UsageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pay, setPay] = useState<{ orderId: string; amount: number; amountUsd?: number; channel: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // 出错时把滚动条拉回顶部，否则提示在折叠区外，用户会以为按钮没反应
  const showError = (msg: string) => {
    setError(msg);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const load = async () => {
    setLoading(true);
    try {
      const [p, s, u] = await Promise.all([getPlans(), getSubscription(), getUsage()]);
      setPlans(p);
      setSub(s);
      setUsage(u);
    } catch (e: any) {
      setError(e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void load();
    else setLoading(false);
  }, [user]);

  const startCheckout = async (plan: Plan) => {
    setError("");
    try {
      const r = await checkout(plan.id, "paypal");
      if (r.free) {
        setToast("已切换至免费版");
        await load();
        return;
      }
      // PayPal.me 收款：新标签页打开收款链接，本页弹出「我已支付」确认框手动激活
      if (r.payUrl) window.open(r.payUrl, "_blank", "noopener");
      setPay({ orderId: r.orderId, amount: r.amount, amountUsd: r.amountUsd, channel: r.channel });
    } catch (e: any) {
      showError(e?.message || "下单失败");
    }
  };

  const finishPay = async () => {
    if (!pay) return;
    setConfirming(true);
    try {
      await confirmOrder(pay.orderId);
      setToast("订阅已激活，感谢支持！");
      setPay(null);
      await load();
    } catch (e: any) {
      showError(e?.message || "确认失败");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div ref={scrollRef} className="absolute inset-0 z-50 overflow-y-auto bg-[#0a0a12] px-4 py-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">会员与用量</h2>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {!user && (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-sm text-muted-foreground">
          登录后即可订阅套餐、查看用量；未登录可使用免费额度。
        </div>
      )}

      {toast && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
          {toast}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
          {error}
        </div>
      )}

      {user && sub && (
        <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3.5">
          <div className="flex items-center gap-2 text-sm text-white">
            <Crown className="h-4 w-4 text-cyan-300" />
            当前套餐：
            <span className="font-semibold">{sub.plan?.name || "免费版"}</span>
          </div>
          {sub.subscribed && sub.subscription?.expires_at && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              有效期至 {new Date(sub.subscription.expires_at).toLocaleDateString("zh-CN")}
            </p>
          )}
        </div>
      )}

      {user && usage.length > 0 && (
        <div className="mt-4 space-y-2.5">
          <p className="text-xs text-white/70">本月用量</p>
          {usage.map((u) => {
            const f = FEATURE_LABEL[u.feature];
            const pct = u.limit > 0 ? Math.min(100, (u.used / u.limit) * 100) : 0;
            const Icon = f?.icon;
            return (
              <div key={u.feature} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-white/80">
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    {f?.label || u.feature}
                  </span>
                  <span className="text-muted-foreground">
                    {u.limit > 0 ? `${u.used} / ${u.limit}` : `${u.used} / 不限`}
                  </span>
                </div>
                {u.limit > 0 && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${
                        u.remaining <= 0
                          ? "bg-red-400"
                          : "bg-gradient-to-r from-cyan-400 to-violet-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-xs text-white/70">选择套餐</p>
      <div className="mt-2 space-y-3">
        {loading && <p className="text-xs text-muted-foreground">加载中…</p>}
        {plans.map((p) => {
          const active = sub?.subscribed && sub?.plan?.id === p.id;
          return (
            <div
              key={p.id}
              className={`rounded-2xl border p-4 ${
                active ? "border-cyan-500/50 bg-cyan-500/5" : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{p.name}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {p.interval === "month" ? "按月计费" : "按年计费"}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-white">
                    ${(p.price_usd ?? p.price_cents / 100 / 7.2).toFixed(2)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    /{p.interval === "month" ? "月" : "年"}
                  </span>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    约 ¥{(p.price_cents / 100).toFixed(0)}
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-[11px] text-white/70">
                    <Check className="h-3 w-3 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>
              {active ? (
                <div className="mt-3 rounded-lg bg-white/5 py-2 text-center text-[11px] text-cyan-300">
                  当前套餐
                </div>
              ) : p.price_cents <= 0 ? (
                <button
                  onClick={() => startCheckout(p)}
                  className="mt-3 w-full rounded-lg border border-white/15 py-2.5 text-xs font-medium text-white transition-colors hover:border-cyan-400/40"
                >
                  免费开通
                </button>
              ) : (
                <button
                  onClick={() => startCheckout(p)}
                  className="mt-3 w-full rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 py-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  用 PayPal 购买
                </button>
              )}
            </div>
          );
        })}
      </div>

      {pay && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6"
          onClick={() => setPay(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12121c] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-sm text-white">
              <CreditCard className="h-4 w-4 text-cyan-300" /> PayPal 收款
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              已在新标签页打开 PayPal 收款页。请完成付款，然后点击下方「我已支付」激活订阅（个人收款无自动回调，需手动确认）。
            </p>
            <div className="mt-3 rounded-xl bg-black/30 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">应付金额</p>
              <p className="text-2xl font-bold text-white">
                ${(pay.amountUsd ?? pay.amount / 100 / 7.2).toFixed(2)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                约 ¥{(pay.amount / 100).toFixed(2)} · 渠道：PayPal
              </p>
            </div>
            <button
              onClick={finishPay}
              disabled={confirming}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {confirming ? "确认中…" : "我已支付"}
            </button>
            <button
              onClick={() => setPay(null)}
              className="mt-2 w-full py-2 text-[11px] text-muted-foreground transition-colors hover:text-white"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;
