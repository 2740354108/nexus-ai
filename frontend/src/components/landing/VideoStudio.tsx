import { useRef, useState, useEffect } from "react";
import { AiBadge } from "../AiBadge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clapperboard,
  UploadCloud,
  Loader2,
  Wand2,
  X,
  Link2,
} from "lucide-react";

type VideoItem = {
  id: string;
  prompt: string;
  videoUrl: string;
  imageUrl: string;
  createdAt: number;
};

type InFlight = {
  promptId: string;
  prompt: string;
  mode: "i2v" | "t2v";
  imagePreview: string;
  stage: string;
};

const VIDEOS_KEY = "nexus.video.history.v1";
const INFLOW_KEY = "nexus.video.inflight.v1";

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}
function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

const VideoStudio = ({ embedded = false }: { embedded?: boolean }) => {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [videos, setVideos] = useState<VideoItem[]>(() =>
    loadJSON<VideoItem[]>(VIDEOS_KEY, [])
  );
  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  // ComfyUI 隧道状态：null = 检测中
  const [tunnelOnline, setTunnelOnline] = useState<boolean | null>(null);
  const [showTunnel, setShowTunnel] = useState(false);
  const [tunnelInput, setTunnelInput] = useState("");
  const [tunnelSaving, setTunnelSaving] = useState(false);
  const [tunnelMsg, setTunnelMsg] = useState("");
  const [mode, setMode] = useState<"i2v" | "t2v">("i2v");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  /** 轮询 ComfyUI 生成状态，直到完成/出错/超时。可跨标签切换恢复 */
  const startPolling = (pid: string, p: string, _m: "i2v" | "t2v", img: string) => {
    stopPolling();
    let attempts = 0;
    const maxAttempts = 80; // 最多约 6.5 分钟（含重试缓冲）
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const statusResp = await fetch(`/api/video/status/${encodeURIComponent(pid)}`);
        const statusData = await statusResp.json();

        if (!statusResp.ok || !statusData.success) {
          stopPolling();
          setGenerating(false);
          setStage("");
          removeKey(INFLOW_KEY);
          setErrorMsg(statusData.error || "状态查询失败");
          return;
        }

        if (statusData.status === "done") {
          stopPolling();
          const item: VideoItem = {
            id: `video-${Date.now()}`,
            prompt: p,
            videoUrl: statusData.videoUrl,
            imageUrl: img,
            createdAt: Date.now(),
          };
          setVideos((prev) => [item, ...prev]);
          setCurrentVideo(item);
          setGenerating(false);
          setStage("");
          removeKey(INFLOW_KEY);
          return;
        }

        if (statusData.status === "error") {
          stopPolling();
          setGenerating(false);
          setStage("");
          removeKey(INFLOW_KEY);
          setErrorMsg(statusData.error || "生成出错");
          return;
        }

        // 超时
        if (attempts >= maxAttempts) {
          stopPolling();
          setGenerating(false);
          setStage("");
          removeKey(INFLOW_KEY);
          setErrorMsg("生成超时，请到你的 ComfyUI 界面查看实际进度");
        }
      } catch (err) {
        // 轮询请求失败，继续重试
        console.error("轮询失败:", err);
      }
    }, 5000);
  };

  /** 检测本地 ComfyUI 隧道连通性 */
  const checkTunnel = async () => {
    try {
      const resp = await fetch("/api/video/tunnel");
      const data = await resp.json();
      setTunnelOnline(!!data.online);
    } catch {
      setTunnelOnline(false);
    }
  };

  // 组件卸载时停止轮询，避免内存泄漏
  useEffect(() => {
    checkTunnel();
    // 若上次有未完成的生成任务，自动恢复轮询（切换标签或刷新页面后）
    const saved = loadJSON<InFlight | null>(INFLOW_KEY, null);
    if (saved?.promptId) {
      setGenerating(true);
      setPrompt(saved.prompt);
      setMode(saved.mode);
      setImagePreview(saved.imagePreview);
      setStage(saved.stage || "正在生成视频，请稍候...");
      startPolling(saved.promptId, saved.prompt, saved.mode, saved.imagePreview);
    }
    return () => stopPolling();
  }, []);

  // 历史记录持久化：切换标签或刷新页面后仍在
  useEffect(() => {
    saveJSON(VIDEOS_KEY, videos);
  }, [videos]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMsg("请上传图片文件");
      return;
    }
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
    setErrorMsg("");
  };

  /** 保存新的 ComfyUI 隧道地址 */
  const handleSaveTunnel = async () => {
    const url = tunnelInput.trim();
    if (!/^https?:\/\/.+/.test(url)) {
      setTunnelMsg("请粘贴完整的 https 地址（ngrok 窗口里 Forwarding 那一行）");
      return;
    }
    setTunnelSaving(true);
    setTunnelMsg("正在验证连接...");
    try {
      const resp = await fetch("/api/video/tunnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setTunnelOnline(true);
        setTunnelMsg("连接成功，可以生成视频了");
        setTimeout(() => setShowTunnel(false), 1200);
      } else {
        setTunnelOnline(false);
        setTunnelMsg(data.error || "连接失败，请检查 ngrok 是否在运行");
      }
    } catch {
      setTunnelMsg("保存失败，请稍后重试");
    } finally {
      setTunnelSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (mode === "i2v" && !image) {
      setErrorMsg("请先上传一张图片");
      return;
    }
    if (!prompt.trim()) {
      setErrorMsg(mode === "i2v" ? "请描述你希望视频呈现的内容" : "请描述想要生成的画面");
      return;
    }

    setGenerating(true);
    setErrorMsg("");
    setStage(mode === "i2v" ? "上传图片到生成引擎..." : "正在生成视频，通常需要 1.5-4 分钟，请耐心等待...");
    stopPolling();

    const formData = new FormData();
    if (image) formData.append("image", image);
    formData.append("prompt", prompt.trim());
    formData.append("mode", mode);

    try {
      // 1) 提交任务，立即返回 promptId
      const resp = await fetch("/api/video/generate", {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || `提交失败 (${resp.status})`);
      }

      const promptId = data.promptId;
      const stageMsg = "正在生成视频，通常需要 1.5-4 分钟，请耐心等待...";
      setStage(stageMsg);

      // 持久化进行中任务，切换标签/刷新页面后可自动恢复
      saveJSON(INFLOW_KEY, {
        promptId,
        prompt: prompt.trim(),
        mode,
        imagePreview,
        stage: stageMsg,
      });

      startPolling(promptId, prompt.trim(), mode, imagePreview);
    } catch (err: any) {
      setErrorMsg(err?.message || "提交失败，请稍后重试");
      setGenerating(false);
      setStage("");
      stopPolling();
    }
  };

  return (
    <section id="video-studio" className={`relative overflow-hidden border-y border-white/5 bg-black/20 ${embedded ? "py-10" : "py-24 sm:py-32"}`}>
      {/* 背景光晕 */}
      <div className="glow-blue absolute -right-24 top-10 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-30" />
      <div className="glow-violet absolute -left-20 bottom-10 h-[26rem] w-[26rem] rounded-full blur-3xl opacity-30" />

      <div className="relative mx-auto max-w-5xl px-6">
        {/* 标题（嵌入模式隐藏，由套件页提供标签） */}
        {!embedded && (
          <div className="mx-auto max-w-2xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full bg-violet-400/10 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-violet-300 uppercase"
          >
            <Clapperboard className="h-3.5 w-3.5" />
            {mode === "i2v" ? "AI 图生视频" : "AI 文生视频"}
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl"
          >
            {mode === "i2v" ? (
              <>
                让一张图，<span className="text-gradient-neon">动起来</span>
              </>
            ) : (
              <>
                用一句话，<span className="text-gradient-neon">生成视频</span>
              </>
            )}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-5 text-base leading-relaxed text-muted-foreground"
          >
            {mode === "i2v"
              ? "上传任意图片，描述你想要的动态效果，AI 将把它变成一段流畅的视频。"
              : "输入一句画面与运动描述，无需图片，AI 直接为你生成一段视频。"}
          </motion.p>
        </div>
        )}

        {/* 上传 + 输入区 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className={`border-glow rounded-3xl p-6 sm:p-8 ${embedded ? "mt-2" : "mt-12"}`}
        >
          {/* 模式切换：图生视频 / 文生视频 */}
          <div className="mb-6 flex justify-center">
            <div className="glass inline-flex rounded-2xl p-1">
              {(["i2v", "t2v"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setErrorMsg("");
                  }}
                  className={`rounded-xl px-5 py-2 text-sm font-medium transition-colors ${
                    mode === m
                      ? "bg-gradient-to-r from-violet-400 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {m === "i2v" ? "图生视频" : "文生视频"}
                </button>
              ))}
            </div>
          </div>

          {/* 图片上传（图生视频模式） */}
          {mode === "i2v" && (
          <div
            onClick={() => fileRef.current?.click()}
            className="group relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-white/15 bg-black/20 transition-colors hover:border-violet-400/50 hover:bg-black/30"
          >
            {imagePreview ? (
              <>
                <img
                  src={imagePreview}
                  alt="上传预览"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImage(null);
                    setImagePreview("");
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                  aria-label="移除图片"
                >
                  <X className="h-4 w-4" />
                </button>
                <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur-sm">
                  点击更换图片
                </span>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
                  <UploadCloud className="h-8 w-8 text-violet-300" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    点击上传一张图片
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PNG / JPG，建议 16:9 横图，效果更佳
                  </p>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          )}

          {/* 文生视频提示（文生视频模式无需上传图片） */}
          {mode === "t2v" && (
            <div className="flex min-h-[140px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-6 text-center">
              <p className="text-sm font-medium text-white">文生视频模式</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                无需上传图片。直接在下方描述你想要的画面与运动，例如“一只狐狸在冬日山林中奔跑，镜头平稳跟随”。
              </p>
            </div>
          )}

          {/* 提示词输入 */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === "i2v"
                ? "描述视频动态，例如：人物转头看向镜头，背景光线缓缓流动，画面平滑运镜"
                : "描述画面与运动，例如：一只狐狸在冬日山林中奔跑，镜头平稳跟随，自然光线"
            }
            rows={2}
            className="mt-4 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
            disabled={generating}
          />

          {/* 生成按钮 */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => {
                setTunnelMsg("");
                setTunnelInput("");
                setShowTunnel(true);
                checkTunnel();
              }}
              className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3.5 py-2 text-xs text-muted-foreground transition-colors hover:border-violet-400/40 hover:text-white"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  tunnelOnline === null
                    ? "animate-pulse bg-yellow-400"
                    : tunnelOnline
                      ? "bg-emerald-400"
                      : "bg-red-500"
                }`}
              />
              {tunnelOnline === null
                ? "检测引擎中..."
                : tunnelOnline
                  ? "本地引擎已连接"
                  : "本地引擎未连接，点击更新地址"}
              <Link2 className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" />
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-400 to-fuchsia-500 px-7 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 btn-neon"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  生成视频
                </>
              )}
            </button>
          </div>

          {/* 隧道地址更新弹窗 */}
          <AnimatePresence>
            {showTunnel && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                onClick={() => !tunnelSaving && setShowTunnel(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 12 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d0d18] p-6 shadow-2xl"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-white">连接本地 ComfyUI</h3>
                    <button
                      onClick={() => !tunnelSaving && setShowTunnel(false)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
                      aria-label="关闭"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    ngrok 免费版每次重启都会换新网址。打开你电脑上的 ngrok 窗口，复制 Forwarding
                    一行里 <span className="text-violet-300">https://</span> 开头的地址粘贴到下面。
                  </p>
                  <input
                    value={tunnelInput}
                    onChange={(e) => setTunnelInput(e.target.value)}
                    placeholder="https://xxxx-xx-xx.ngrok-free.dev"
                    className="mt-4 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-muted-foreground/50 focus:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
                    disabled={tunnelSaving}
                  />
                  {tunnelMsg && (
                    <p
                      className={`mt-3 text-xs ${
                        tunnelMsg.includes("成功") ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {tunnelMsg}
                    </p>
                  )}
                  <button
                    onClick={handleSaveTunnel}
                    disabled={tunnelSaving}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-400 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {tunnelSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        验证中...
                      </>
                    ) : (
                      "保存并测试连接"
                    )}
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 生成进度 */}
          <AnimatePresence>
            {generating && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-5 flex items-center gap-4 rounded-2xl bg-black/30 p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400/20 to-fuchsia-500/20">
                    <Loader2 className="h-6 w-6 animate-spin text-violet-300" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{stage}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-500"
                        initial={{ width: "5%" }}
                        animate={{ width: ["5%", "90%"] }}
                        transition={{ duration: 420, ease: "linear" }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 错误提示 */}
          <AnimatePresence>
            {errorMsg && !generating && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                  {errorMsg}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* 当前视频 */}
        <AnimatePresence>
          {currentVideo && !generating && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="border-glow mt-6 overflow-hidden rounded-3xl"
            >
              <video
                src={currentVideo.videoUrl}
                controls
                autoPlay
                loop
                className="aspect-video w-full bg-black"
              />
              <div className="p-5">
                <p className="text-sm font-medium text-white">视频已生成</p>
                <AiBadge label="NEXUS AI 生成" className="mt-1" />
                <p className="mt-1 text-xs text-muted-foreground">{currentVideo.prompt}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 历史 */}
        {videos.length > 0 && (
          <div className="mt-10">
            <h3 className="mb-4 text-sm font-semibold tracking-wide text-white">
              视频作品
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {videos.length} 个
              </span>
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {videos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setCurrentVideo(v)}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-card text-left transition-colors hover:border-violet-400/40"
                >
                    <div className="relative aspect-video overflow-hidden bg-black">
                    {v.imageUrl ? (
                      <img
                        src={v.imageUrl}
                        alt={v.prompt}
                        className="h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-50"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-violet-600/30 via-fuchsia-600/20 to-cyan-600/30" />
                    )}
                    <AiBadge label="NEXUS AI 生成" className="absolute left-2 top-2 z-10 pointer-events-none" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
                        <Clapperboard className="h-5 w-5" />
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="truncate text-xs text-muted-foreground">{v.prompt}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground/60">
          由本地 ComfyUI（Wan 视频模型）驱动 · 支持「图生视频」与「文生视频」两种模式 · 生成时间约 1.5-4 分钟
        </p>
      </div>
    </section>
  );
};

export default VideoStudio;
