import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { loadGoogleScript, getGoogleClientId } from "@/lib/google";
import { X, Mail, Loader2, KeyRound, UserPlus, LogIn, ShieldCheck, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type Tab = "login" | "register" | "phone";
type Step = "form" | "verify" | "unverified" | "phoneVerify" | "forgot" | "reset";

export default function LoginModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    registerWithEmail,
    signInWithEmailPassword,
    verifyEmail,
    resendCode,
    sendSmsCode,
    loginWithPhone,
    signInWithGoogle,
    forgotPassword,
    resetPassword,
  } = useAuth();

  const [tab, setTab] = useState<Tab>("login");
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [err, setErr] = useState("");

  const googleClientId = getGoogleClientId();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  // 公开中继模式下，登录/注册即代表领取每日免费额度，给用户一个明确说明
  const [relayMode, setRelayMode] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/relay/status")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setRelayMode(!!d.relay);
      })
      .catch(() => {
        /* 忽略：非中继模式仅少一行提示 */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !googleClientId || !googleBtnRef.current) return
    let cancelled = false
    loadGoogleScript()
      .then(() => {
        const g = (window as any).google
        if (cancelled || !g?.accounts?.id || !googleBtnRef.current) return
        g.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (resp: any) => {
            if (!resp?.credential) return
            setBusy(true)
            setErr("")
            try {
              await signInWithGoogle(resp.credential)
              finish()
            } catch (e: any) {
              setErr(e?.message || "Google 登录失败")
            } finally {
              setBusy(false)
            }
          },
        })
        g.accounts.id.renderButton(googleBtnRef.current, {
          theme: "filled_black",
          size: "large",
          width: googleBtnRef.current.clientWidth,
          text: "continue_with",
          locale: "zh_CN",
        })
      })
      .catch(() => setErr("Google 登录组件加载失败，请刷新重试"))
    return () => {
      cancelled = true
    }
  }, [open, googleClientId]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPhone = /^1[3-9]\d{9}$/.test(phone);

  const resetState = () => {
    setEmail("");
    setPassword("");
    setPhone("");
    setCode("");
    setNewPassword("");
    setDevCode("");
    setErr("");
    setStep("form");
    setTab("login");
  };

  const finish = () => {
    onClose();
    resetState();
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setStep("form");
    setErr("");
    setCode("");
    setNewPassword("");
    setDevCode("");
  };

  const doRegister = async () => {
    if (!validEmail || !password || password.length < 6) {
      setErr("请输入有效邮箱，密码至少 6 位");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const data = await registerWithEmail(email.trim(), password);
      setPassword("");
      setDevCode(data.devCode || "");
      setStep("verify");
    } catch (e: any) {
      setPassword("");
      setErr(e?.message || "注册失败");
    } finally {
      setBusy(false);
    }
  };

  const doVerify = async () => {
    if (code.length !== 6) {
      setErr("请输入 6 位验证码");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await verifyEmail(email.trim(), code.trim());
      finish();
    } catch (e: any) {
      setErr(e?.message || "验证失败");
    } finally {
      setBusy(false);
    }
  };

  const doLogin = async () => {
    if (!validEmail || !password) {
      setErr("请输入邮箱和密码");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const result = await signInWithEmailPassword(email.trim(), password);
      if (result.emailVerified) {
        finish();
      } else {
        setStep("unverified");
      }
    } catch (e: any) {
      setErr(e?.message || "登录失败");
    } finally {
      setBusy(false);
    }
  };

  const doForgot = async () => {
    if (!validEmail) {
      setErr("请输入有效邮箱");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const data = await forgotPassword(email.trim());
      setDevCode(data.devCode || "");
      setStep("reset");
    } catch (e: any) {
      setErr(e?.message || "发送失败");
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (code.length !== 6) {
      setErr("请输入 6 位验证码");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setErr("请设置新密码，至少 6 位");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await resetPassword(email.trim(), code.trim(), newPassword);
      setTab("login");
      setStep("form");
      setPassword("");
      setNewPassword("");
      setCode("");
      setDevCode("");
      setErr("密码已重置，请用新密码登录");
    } catch (e: any) {
      setErr(e?.message || "重置失败");
    } finally {
      setBusy(false);
    }
  };

  const doResend = async () => {
    setResendBusy(true);
    setErr("");
    try {
      const data = await resendCode(email.trim());
      setDevCode(data.devCode || "");
      setErr("验证码已重新发送");
    } catch (e: any) {
      setErr(e?.message || "发送失败");
    } finally {
      setResendBusy(false);
    }
  };

  const doSendSms = async () => {
    if (!validPhone) {
      setErr("请输入有效的手机号");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const data = await sendSmsCode(phone.trim());
      setDevCode(data.devCode || "");
      setStep("phoneVerify");
    } catch (e: any) {
      setErr(e?.message || "发送失败");
    } finally {
      setBusy(false);
    }
  };

  const doPhoneVerify = async () => {
    if (code.length !== 6) {
      setErr("请输入 6 位验证码");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await loginWithPhone(phone.trim(), code.trim());
      finish();
    } catch (e: any) {
      setErr(e?.message || "验证失败");
    } finally {
      setBusy(false);
    }
  };

  const doResendSms = async () => {
    setResendBusy(true);
    setErr("");
    try {
      const data = await sendSmsCode(phone.trim());
      setDevCode(data.devCode || "");
      setErr("验证码已重新发送");
    } catch (e: any) {
      setErr(e?.message || "发送失败");
    } finally {
      setResendBusy(false);
    }
  };

  if (!open) return null;

  const submit = () => {
    if (tab === "register") doRegister();
    else doLogin();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {(step === "form" || step === "phoneVerify") && (
          <>
            <h2 className="text-xl font-bold text-white">登录 / 注册 NEXUS LAB</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              登录后可在「我的空间」保存你的生成作品
            </p>

            {relayMode && (
              <div className="mt-3 rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-2.5 text-xs text-cyan-200">
                登录 / 注册后即可领取每日免费额度；终端同样可用 <span className="font-mono">nexusai login</span> 登录。
              </div>
            )}

            {err && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                <div>{err}</div>
                {err.includes("Google") && (
                  <button
                    onClick={() => { setErr(""); window.location.reload(); }}
                    className="mt-2 text-xs text-cyan-300 hover:underline"
                  >
                    点击刷新页面重试
                  </button>
                )}
              </div>
            )}

            {step === "form" && (
              <div className="mt-5 space-y-3">
                <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
                  <button
                    onClick={() => switchTab("login")}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                      tab === "login" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"
                    }`}
                  >
                    登录
                  </button>
                  <button
                    onClick={() => switchTab("register")}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                      tab === "register" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"
                    }`}
                  >
                    注册
                  </button>
                </div>

                {tab === "phone" ? (
                  <div className="relative">
                    <Smartphone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      placeholder="手机号"
                      className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none"
                    />
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="你的邮箱"
                        className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none"
                      />
                    </div>

                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={tab === "register" ? "设置密码（至少 6 位）" : "密码"}
                        className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {tab === "phone" ? (
                  <Button
                    onClick={doSendSms}
                    disabled={busy}
                    className="w-full gap-2 bg-gradient-to-r from-cyan-400 to-violet-500 text-white hover:brightness-110"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                    获取验证码
                  </Button>
                ) : (
                  <Button
                    onClick={submit}
                    disabled={busy}
                    className="w-full gap-2 bg-gradient-to-r from-cyan-400 to-violet-500 text-white hover:brightness-110"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : tab === "register" ? (
                      <UserPlus className="h-4 w-4" />
                    ) : (
                      <LogIn className="h-4 w-4" />
                    )}
                    {tab === "register" ? "注册并获取验证码" : "登录"}
                  </Button>
                )}

                {googleClientId && (
                  <div className="mt-3">
                    <div className="my-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-xs text-muted-foreground">或</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <div ref={googleBtnRef} className="flex justify-center" />
                  </div>
                )}

                <p className="text-center text-xs text-muted-foreground">
                  {tab === "phone"
                    ? "输入手机号获取短信验证码，免密码直接登录"
                    : tab === "register"
                    ? "注册后会向邮箱发送验证码，验证后登录"
                    : (
                      <span>
                        没有账号？输入邮箱和密码点击注册即可自动创建
                        <button
                          type="button"
                          onClick={() => { setStep("forgot"); setErr(""); setDevCode(""); }}
                          className="ml-2 text-cyan-300 hover:underline"
                        >
                          忘记密码？
                        </button>
                      </span>
                    )}
                </p>
              </div>
            )}
          </>
        )}

        {step === "verify" && (
          <>
            <h2 className="text-xl font-bold text-white">验证邮箱</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              我们已向 <span className="text-white">{email}</span> 发送了 6 位验证码
            </p>

            {err && (
              <div
                className={`mt-4 rounded-xl border p-3 text-sm ${
                  err.includes("已重新发送")
                    ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
                }`}
              >
                {err}
              </div>
            )}

            {devCode && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                开发模式验证码：
                <span className="font-mono font-bold tracking-widest">{devCode}</span>
                <div className="mt-1 text-xs text-amber-300/80">（正式上线后将发送到你的邮箱）</div>
              </div>
            )}

            <div className="mt-5 space-y-3">
              <div className="relative">
                <ShieldCheck className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="输入 6 位验证码"
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none"
                />
              </div>

              <Button
                onClick={doVerify}
                disabled={busy}
                className="w-full gap-2 bg-gradient-to-r from-cyan-400 to-violet-500 text-white hover:brightness-110"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                验证并登录
              </Button>

              <button
                onClick={doResend}
                disabled={resendBusy}
                className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-cyan-300"
              >
                <RefreshCw className={`h-3 w-3 ${resendBusy ? "animate-spin" : ""}`} />
                没收到？重新发送验证码
              </button>
            </div>
          </>
        )}

        {step === "phoneVerify" && (
          <>
            <h2 className="text-xl font-bold text-white">验证手机号</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              我们已向 <span className="text-white">{phone}</span> 发送了 6 位短信验证码
            </p>

            {err && (
              <div
                className={`mt-4 rounded-xl border p-3 text-sm ${
                  err.includes("已重新发送")
                    ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
                }`}
              >
                {err}
              </div>
            )}

            {devCode && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                开发模式验证码：
                <span className="font-mono font-bold tracking-widest">{devCode}</span>
                <div className="mt-1 text-xs text-amber-300/80">（正式上线后将发送短信到你的手机）</div>
              </div>
            )}

            <div className="mt-5 space-y-3">
              <div className="relative">
                <ShieldCheck className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="输入 6 位验证码"
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none"
                />
              </div>

              <Button
                onClick={doPhoneVerify}
                disabled={busy}
                className="w-full gap-2 bg-gradient-to-r from-cyan-400 to-violet-500 text-white hover:brightness-110"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                验证并登录
              </Button>

              <button
                onClick={doResendSms}
                disabled={resendBusy}
                className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-cyan-300"
              >
                <RefreshCw className={`h-3 w-3 ${resendBusy ? "animate-spin" : ""}`} />
                没收到？重新发送验证码
              </button>

              <button
                onClick={() => setStep("form")}
                className="w-full text-center text-xs text-muted-foreground hover:text-white"
              >
                返回修改手机号
              </button>
            </div>
          </>
        )}

        {step === "unverified" && (
          <>
            <h2 className="text-xl font-bold text-white">邮箱待验证</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              你的账号 <span className="text-white">{email}</span> 还没验证邮箱，建议验证后再继续使用。
            </p>

            {err && (
              <div
                className={`mt-4 rounded-xl border p-3 text-sm ${
                  err.includes("已重新发送")
                    ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
                }`}
              >
                {err}
              </div>
            )}

            {devCode && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                开发模式验证码：<span className="font-mono font-bold tracking-widest">{devCode}</span>
              </div>
            )}

            <div className="mt-5 space-y-3">
              <div className="relative">
                <ShieldCheck className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="输入 6 位验证码"
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none"
                />
              </div>

              <Button
                onClick={doVerify}
                disabled={busy}
                className="w-full gap-2 bg-gradient-to-r from-cyan-400 to-violet-500 text-white hover:brightness-110"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                验证并登录
              </Button>

              <button
                onClick={doResend}
                disabled={resendBusy}
                className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-cyan-300"
              >
                <RefreshCw className={`h-3 w-3 ${resendBusy ? "animate-spin" : ""}`} />
                没收到？重新发送验证码
              </button>
            </div>
          </>
        )}

        {step === "forgot" && (
          <>
            <h2 className="text-xl font-bold text-white">找回密码</h2>
            <p className="mt-1 text-sm text-muted-foreground">输入你的注册邮箱，我们将发送重置验证码</p>

            {err && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>
            )}

            <div className="mt-5 space-y-3">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="你的邮箱"
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none"
                />
              </div>

              <Button
                onClick={doForgot}
                disabled={busy}
                className="w-full gap-2 bg-gradient-to-r from-cyan-400 to-violet-500 text-white hover:brightness-110"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                发送验证码
              </Button>

              <button
                onClick={() => setStep("form")}
                className="w-full text-center text-xs text-muted-foreground hover:text-white"
              >
                返回登录
              </button>
            </div>
          </>
        )}

        {step === "reset" && (
          <>
            <h2 className="text-xl font-bold text-white">重置密码</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              验证码已发送至 <span className="text-white">{email}</span>
            </p>

            {err && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>
            )}

            {devCode && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                开发模式验证码：<span className="font-mono font-bold tracking-widest">{devCode}</span>
              </div>
            )}

            <div className="mt-5 space-y-3">
              <div className="relative">
                <ShieldCheck className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="输入 6 位验证码"
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none"
                />
              </div>

              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="设置新密码（至少 6 位）"
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none"
                />
              </div>

              <Button
                onClick={doReset}
                disabled={busy}
                className="w-full gap-2 bg-gradient-to-r from-cyan-400 to-violet-500 text-white hover:brightness-110"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                重置密码
              </Button>

              <button
                onClick={doForgot}
                disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-cyan-300"
              >
                <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
                重新发送验证码
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
