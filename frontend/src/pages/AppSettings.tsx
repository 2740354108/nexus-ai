import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Save, Trash2, ShieldCheck, ChevronDown } from "lucide-react";
import { CHAT_MODELS, useSettings } from "@/lib/settings";
import { isNativeApp } from "@/lib/settings";
import { fetchFreeVisionModels } from "@/lib/providers/openrouter";

/**
 * 密钥设置页：让用户填入自己的 API 密钥。
 * 密钥只保存在本机（原生存系统存储 / 网页存浏览器本地），不会上传到任何地方。
 */
const AppSettings = () => {
  const { settings, update, reset, ready } = useSettings();
  const [draft, setDraft] = useState(settings);
  const [showKey, setShowKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  // 支持看图的免费模型（从 OpenRouter 实时获取）
  const [visionModels, setVisionModels] = useState<{ id: string; name: string }[]>([]);
  const [loadingVision, setLoadingVision] = useState(true);

  useEffect(() => {
    if (ready) setDraft(settings);
  }, [ready, settings]);

  useEffect(() => {
    fetchFreeVisionModels()
      .then(setVisionModels)
      .catch(() => setVisionModels([]))
      .finally(() => setLoadingVision(false));
  }, []);

  const handleSave = () => {
    update(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    reset();
    setDraft({
      openrouterKey: "",
      chatModel: CHAT_MODELS[0].id,
      pollinationsToken: "",
      comfyUrl: "",
    });
  };

  const currentModel =
    CHAT_MODELS.find((m) => m.id === draft.chatModel) || CHAT_MODELS[0];

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col bg-[#0a0a12] text-foreground">
      {/* 顶部 */}
      <header className="shrink-0 px-4 pb-3 pt-5">
        <h1 className="text-lg font-bold tracking-tight text-white">密钥设置</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          填入你自己的密钥后，AI 功能直连官方接口，不经过任何中间服务器。
        </p>
      </header>

      <div className="flex-1 space-y-4 px-4 pb-28">
        {/* 安全提示 */}
        <div className="flex items-start gap-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          <p className="text-[11px] leading-relaxed text-cyan-100/80">
            密钥仅保存在你这台设备的本地存储中{isNativeApp() ? "（系统级存储）" : "（浏览器本地）"}，
            不会上传，卸载应用即彻底消失。
          </p>
        </div>

        {/* OpenRouter 密钥 */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-white">
            <KeyRound className="h-3.5 w-3.5 text-cyan-400" />
            OpenRouter 密钥
            <span className="text-[10px] font-normal text-red-400">（对话必需）</span>
          </label>
          <div className="relative mt-2">
            <input
              type={showKey ? "text" : "password"}
              value={draft.openrouterKey}
              onChange={(e) =>
                setDraft((d) => ({ ...d, openrouterKey: e.target.value.trim() }))
              }
              placeholder="sk-or-v1-..."
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-white/10 bg-black/40 py-2.5 pl-3 pr-10 text-xs text-white placeholder:text-white/25 outline-none transition-colors focus:border-cyan-500/50"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/40 transition-colors hover:text-white"
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            到 openrouter.ai 注册后在 Keys 页面创建，复制以 sk-or-v1- 开头的密钥。
          </p>
        </section>

        {/* 模型选择 */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <label className="text-xs font-medium text-white">对话模型</label>
          <div className="relative mt-2">
            <button
              type="button"
              onClick={() => setModelOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-left text-xs text-white transition-colors hover:border-white/20"
            >
              <span>
                {currentModel.label}
                <span className="ml-2 text-[10px] text-white/40">{currentModel.note}</span>
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-white/40 transition-transform ${modelOpen ? "rotate-180" : ""}`}
              />
            </button>
            {modelOpen && (
              <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-[#12121c] shadow-xl">
                {CHAT_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setDraft((d) => ({ ...d, chatModel: m.id }));
                      setModelOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/5 ${
                      m.id === draft.chatModel ? "text-cyan-400" : "text-white/80"
                    }`}
                  >
                    <span>{m.label}</span>
                    <span className="text-[10px] text-white/35">{m.note}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 支持看图的免费模型（实时拉取，用于图片分析） */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-white">
            支持看图的免费模型
            <span className="text-[10px] font-normal text-white/40">（实时获取 · 图片分析用）</span>
          </label>
          {loadingVision ? (
            <p className="mt-2 text-[11px] text-muted-foreground">正在获取模型列表…</p>
          ) : visionModels.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              暂时获取不到列表，请检查网络后重新进入本页
            </p>
          ) : (
            <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
              {visionModels.map((m) => {
                const active = m.id === draft.chatModel;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, chatModel: m.id }))}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[11px] transition-colors ${
                      active
                        ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                        : "border-white/10 bg-black/30 text-white/75 hover:border-white/20"
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="ml-2 shrink-0 text-[10px] text-white/35">免费 · 可看图</span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            免费模型有速率限制，版权授权以模型页面说明为准；分析图片消耗比纯文字大。
          </p>
        </section>

        {/* Pollinations 令牌（可选） */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-white">
            Pollinations 令牌
            <span className="text-[10px] font-normal text-white/40">（绘图可选）</span>
          </label>
          <div className="relative mt-2">
            <input
              type={showToken ? "text" : "password"}
              value={draft.pollinationsToken}
              onChange={(e) =>
                setDraft((d) => ({ ...d, pollinationsToken: e.target.value.trim() }))
              }
              placeholder="不填也能画图，填了额度更高"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-white/10 bg-black/40 py-2.5 pl-3 pr-10 text-xs text-white placeholder:text-white/25 outline-none transition-colors focus:border-violet-500/50"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/40 transition-colors hover:text-white"
            >
              {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </section>

        {/* ComfyUI 地址（可选） */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-white">
            ComfyUI 地址
            <span className="text-[10px] font-normal text-white/40">（视频可选）</span>
          </label>
          <input
            type="text"
            value={draft.comfyUrl}
            onChange={(e) => setDraft((d) => ({ ...d, comfyUrl: e.target.value.trim() }))}
            placeholder="http://192.168.1.100:8188"
            autoComplete="off"
            spellCheck={false}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-xs text-white placeholder:text-white/25 outline-none transition-colors focus:border-violet-500/50"
          />
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            填你自己电脑上 ComfyUI 的局域网地址，手机和电脑需在同一 WiFi 下。
          </p>
        </section>

        {/* 操作按钮 */}
        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleSave}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 py-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            <Save className="h-3.5 w-3.5" />
            {saved ? "已保存" : "保存设置"}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 py-2.5 text-xs text-white/60 transition-colors hover:border-red-500/40 hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppSettings;
