import { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Save,
  Trash2,
  ShieldCheck,
  ChevronDown,
  Cloud,
  Server,
  PlugZap,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  CHAT_MODELS,
  DEFAULT_SETTINGS,
  OPENROUTER_BASE,
  isNativeApp,
  isOpenRouter,
  useSettings,
} from "@/lib/settings";
import { fetchFreeVisionModels } from "@/lib/providers/openrouter";
import { streamChatCompletion } from "@/lib/providers/chatClient";
import {
  comfyHealth,
  listCheckpoints,
  listClipVision,
  listUnets,
  listVaes,
} from "@/lib/providers/comfyClient";

/** 从用户自己的 ComfyUI 上拉到的模型清单 */
const ModelSelect = ({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder: string;
}) => (
  <div>
    <label className="text-[11px] text-white/60">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full appearance-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-white outline-none transition-colors focus:border-violet-500/50"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o} className="bg-[#12121c]">
          {o}
        </option>
      ))}
    </select>
  </div>
);

/** 常见本地/自建服务的地址与模型填写示例 */
const PRESETS: { key: string; label: string; base: string; model: string; tip: string }[] = [
  {
    key: "ollama",
    label: "Ollama",
    base: "http://192.168.1.10:11434/v1",
    model: "qwen2.5:7b",
    tip: "电脑上运行 ollama serve，并把 OLLAMA_HOST 设为 0.0.0.0",
  },
  {
    key: "lmstudio",
    label: "LM Studio",
    base: "http://192.168.1.10:1234/v1",
    model: "local-model",
    tip: "LM Studio 里打开 Local Server，允许局域网访问",
  },
  {
    key: "vllm",
    label: "vLLM / 自建",
    base: "http://192.168.1.10:8000/v1",
    model: "你的模型名",
    tip: "任何兼容 OpenAI 接口的服务都可以，地址填到 /v1",
  },
];

/**
 * 密钥与接口设置页：让用户填入自己的密钥，或接自己部署的模型服务。
 * 设置只保存在本机（原生存系统存储 / 网页存浏览器本地），不会上传到任何地方。
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
  // 连接测试
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  // ComfyUI 连接状态与模型清单
  const [comfyState, setComfyState] = useState<{ ok: boolean; text: string } | null>(null);
  const [comfyBusy, setComfyBusy] = useState(false);
  const [comfyModels, setComfyModels] = useState<{
    checkpoints: string[];
    unets: string[];
    vaes: string[];
    clipVisions: string[];
  }>({ checkpoints: [], unets: [], vaes: [], clipVisions: [] });

  const cloud = isOpenRouter(draft.chatApiBase);

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
    setDraft({ ...DEFAULT_SETTINGS });
    setTestResult(null);
  };

  const switchToCloud = () => {
    setDraft((d) => ({ ...d, chatApiBase: OPENROUTER_BASE }));
    setTestResult(null);
  };

  const switchToLocal = () => {
    setDraft((d) => ({
      ...d,
      chatApiBase: isOpenRouter(d.chatApiBase) ? PRESETS[0].base : d.chatApiBase,
    }));
    setTestResult(null);
  };

  /** 用一条极短消息验证地址、密钥、模型名是否都对 */
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    let got = false;
    await streamChatCompletion({
      baseUrl: draft.chatApiBase,
      apiKey: draft.openrouterKey,
      model: draft.chatModel,
      mode: "chat",
      messages: [{ role: "user", content: "回复 OK 两个字" }],
      handlers: {
        onToken: () => {
          got = true;
        },
        onError: (e) => setTestResult({ ok: false, text: e }),
      },
    });
    setTesting(false);
    if (got) setTestResult({ ok: true, text: "连接成功，模型已响应" });
  };

  /** 连一下 ComfyUI：成功就顺手把你机器上的模型清单拉回来 */
  const handleComfyTest = async () => {
    setComfyBusy(true);
    setComfyState(null);
    const res = await comfyHealth(draft.comfyUrl);
    setComfyState({ ok: res.ok, text: res.msg });
    if (res.ok) {
      const [checkpoints, unets, vaes, clipVisions] = await Promise.all([
        listCheckpoints(draft.comfyUrl),
        listUnets(draft.comfyUrl),
        listVaes(draft.comfyUrl),
        listClipVision(draft.comfyUrl),
      ]);
      setComfyModels({ checkpoints, unets, vaes, clipVisions });
      // 只选了一个底模时自动填上，省一步
      setDraft((d) => ({
        ...d,
        comfyCheckpoint: d.comfyCheckpoint || (checkpoints.length === 1 ? checkpoints[0] : ""),
        comfyUnet: d.comfyUnet || (unets.length === 1 ? unets[0] : ""),
      }));
    }
    setComfyBusy(false);
  };

  // 已填过地址就自动连一次，进页面直接能选模型
  useEffect(() => {
    if (ready && draft.comfyUrl && !comfyState && !comfyBusy) void handleComfyTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const currentModel = CHAT_MODELS.find((m) => m.id === draft.chatModel) || CHAT_MODELS[0];

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col bg-[#0a0a12] text-foreground">
      {/* 顶部 */}
      <header className="shrink-0 px-4 pb-3 pt-5">
        <h1 className="text-lg font-bold tracking-tight text-white">AI 接口设置</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          可以用云端服务开箱即用，也可以接你自己电脑或服务器上跑的模型。
        </p>
      </header>

      <div className="flex-1 space-y-4 px-4 pb-28">
        {/* 安全提示 */}
        <div className="flex items-start gap-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          <p className="text-[11px] leading-relaxed text-cyan-100/80">
            密钥与地址仅保存在你这台设备的本地存储中{isNativeApp() ? "（系统级存储）" : "（浏览器本地）"}，
            不会上传，卸载应用即彻底消失。
          </p>
        </div>

        {/* 云端 / 本地 一键切换 */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <label className="text-xs font-medium text-white">AI 从哪来</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={switchToCloud}
              className={`flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-xs transition-colors ${
                cloud
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                  : "border-white/10 bg-black/30 text-white/60 hover:border-white/20"
              }`}
            >
              <Cloud className="h-3.5 w-3.5" />
              云端服务
            </button>
            <button
              type="button"
              onClick={switchToLocal}
              className={`flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-xs transition-colors ${
                !cloud
                  ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                  : "border-white/10 bg-black/30 text-white/60 hover:border-white/20"
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              我自己的服务
            </button>
          </div>

          {/* 接口地址 */}
          <div className="mt-3">
            <label className="text-[11px] text-white/60">接口地址</label>
            <input
              type="text"
              value={draft.chatApiBase}
              onChange={(e) => {
                setDraft((d) => ({ ...d, chatApiBase: e.target.value.trim() }));
                setTestResult(null);
              }}
              placeholder={OPENROUTER_BASE}
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-[11px] text-white placeholder:text-white/25 outline-none transition-colors focus:border-cyan-500/50"
            />
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              {cloud
                ? "留空或填 OpenRouter 地址即走云端，装上就能用。"
                : "填你的服务地址，末尾带 /v1。局域网地址形如 http://192.168.x.x:端口/v1。"}
            </p>
          </div>

          {/* 本地服务填写引导 */}
          {!cloud && (
            <div className="mt-3 space-y-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, chatApiBase: p.base, chatModel: p.model }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-black/30 p-2.5 text-left transition-colors hover:border-violet-500/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-white/85">{p.label}</span>
                    <span className="font-mono text-[10px] text-violet-300/70">{p.base}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{p.tip}</p>
                </button>
              ))}
              <p className="pt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                怎么看电脑的局域网 IP：Windows 在命令行输入 ipconfig，看 IPv4 地址；Mac 在网络设置里看。
                手机和电脑要连同一个 WiFi。
              </p>
            </div>
          )}
        </section>

        {/* 密钥（云端必需，本地服务通常不需要） */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-white">
            <KeyRound className="h-3.5 w-3.5 text-cyan-400" />
            接口密钥
            {cloud ? (
              <span className="text-[10px] font-normal text-red-400">（云端对话必需）</span>
            ) : (
              <span className="text-[10px] font-normal text-white/40">（本地服务一般留空）</span>
            )}
          </label>
          <div className="relative mt-2">
            <input
              type={showKey ? "text" : "password"}
              value={draft.openrouterKey}
              onChange={(e) => {
                setDraft((d) => ({ ...d, openrouterKey: e.target.value.trim() }));
                setTestResult(null);
              }}
              placeholder={cloud ? "sk-or-v1-..." : "没有就留空"}
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
          {cloud && (
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              到 openrouter.ai 注册后在 Keys 页面创建，复制以 sk-or-v1- 开头的密钥。
            </p>
          )}
        </section>

        {/* 模型名称：云端用下拉，自己的服务直接填模型名 */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <label className="text-xs font-medium text-white">模型名称</label>
          {cloud ? (
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
          ) : (
            <>
              <input
                type="text"
                value={draft.chatModel}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, chatModel: e.target.value }));
                  setTestResult(null);
                }}
                placeholder="例如 qwen2.5:7b"
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-xs text-white placeholder:text-white/25 outline-none transition-colors focus:border-violet-500/50"
              />
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                填你服务里加载好的模型名，例如 qwen2.5:7b、llama3.1:8b。名字要和服务里显示的完全一致。
              </p>
            </>
          )}
        </section>

        {/* 连接测试 */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !draft.chatModel}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-black/30 py-2.5 text-xs text-white/80 transition-colors hover:border-cyan-500/40 disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlugZap className="h-3.5 w-3.5 text-cyan-400" />
            )}
            {testing ? "正在测试…" : "测试连接"}
          </button>
          {testResult && (
            <p
              className={`mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                testResult.ok
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-red-500/10 text-red-300"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              {testResult.text}
            </p>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            测试会发送一条极短消息，用来确认地址、密钥和模型名都填对了。
          </p>
        </section>

        {/* 支持看图的免费模型（仅云端） */}
        {cloud && (
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
        )}

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

        {/* ComfyUI：接你自己电脑上的画图 / 视频引擎 */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-white">
            <Server className="h-3.5 w-3.5 text-violet-400" />
            ComfyUI 地址
            <span className="text-[10px] font-normal text-white/40">（画图 / 视频）</span>
          </label>
          <input
            type="text"
            value={draft.comfyUrl}
            onChange={(e) => {
              setDraft((d) => ({ ...d, comfyUrl: e.target.value.trim() }));
              setComfyState(null);
            }}
            placeholder="http://192.168.1.100:8188"
            autoComplete="off"
            spellCheck={false}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-xs text-white placeholder:text-white/25 outline-none transition-colors focus:border-violet-500/50"
          />
          <button
            type="button"
            onClick={handleComfyTest}
            disabled={comfyBusy || !draft.comfyUrl}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-black/30 py-2 text-xs text-white/80 transition-colors hover:border-violet-500/40 disabled:opacity-50"
          >
            {comfyBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlugZap className="h-3.5 w-3.5 text-violet-400" />
            )}
            {comfyBusy ? "正在连接…" : "连接并读取模型"}
          </button>
          {comfyState && (
            <p
              className={`mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                comfyState.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
              }`}
            >
              {comfyState.ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              {comfyState.text}
            </p>
          )}

          {comfyState?.ok && (
            <div className="mt-3 space-y-2.5">
              <ModelSelect
                label="画图底模"
                value={draft.comfyCheckpoint}
                options={comfyModels.checkpoints}
                onChange={(v) => setDraft((d) => ({ ...d, comfyCheckpoint: v }))}
                placeholder="未选择（画图将用在线免费接口）"
              />
              <ModelSelect
                label="视频模型"
                value={draft.comfyUnet}
                options={comfyModels.unets}
                onChange={(v) => setDraft((d) => ({ ...d, comfyUnet: v }))}
                placeholder="未选择（视频不可用）"
              />
              <ModelSelect
                label="VAE（视频用）"
                value={draft.comfyVae}
                options={comfyModels.vaes}
                onChange={(v) => setDraft((d) => ({ ...d, comfyVae: v }))}
                placeholder="自动选择"
              />
              <ModelSelect
                label="视觉编码器（图生视频可选）"
                value={draft.comfyClipVision}
                options={comfyModels.clipVisions}
                onChange={(v) => setDraft((d) => ({ ...d, comfyClipVision: v }))}
                placeholder="不使用"
              />
            </div>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            填你自己电脑上 ComfyUI 的局域网地址，手机和电脑需在同一 WiFi 下。选好模型后，画图与视频都会跑在你自己的显卡上。
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
