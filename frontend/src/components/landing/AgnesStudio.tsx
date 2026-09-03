import { useEffect, useRef, useState } from "react";
import { AiBadge } from "../AiBadge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Image as ImageIcon,
  Images,
  Clapperboard,
  UploadCloud,
  Loader2,
  Wand2,
  X,
  Download,
  Trash2,
  Play,
} from "lucide-react";

type AgnesMode = "text2img" | "img2img" | "text2video" | "img2video";

type ImageItem = {
  id: string;
  mode: "text2img" | "img2img";
  prompt: string;
  imageUrl: string;
  createdAt: number;
};

type VideoItem = {
  id: string;
  mode: "text2video" | "img2video";
  prompt: string;
  videoUrl: string;
  imageUrl?: string;
  createdAt: number;
};

type InFlightVideo = {
  videoId: string;
  taskId?: string;
  prompt: string;
  mode: "text2video" | "img2video";
  imagePreview?: string;
};

const MODE_TABS: { key: AgnesMode; label: string; icon: typeof ImageIcon }[] = [
  { key: "text2img", label: "文生图", icon: ImageIcon },
  { key: "img2img", label: "全能参考 / 图生图", icon: Images },
  { key: "text2video", label: "文生视频", icon: Clapperboard },
  { key: "img2video", label: "图生视频", icon: Play },
];

const IMAGE_MODELS = [
  { id: "agnes-image-2.1-flash", label: "Agnes Image 2.1 Flash" },
  { id: "agnes-image-2.5-flash", label: "Agnes Image 2.5 Flash" },
  { id: "agnes-image-2.0-flash", label: "Agnes Image 2.0 Flash" },
];

const VIDEO_MODELS = [
  { id: "agnes-video-v2.0", label: "Agnes Video V2.0" },
  { id: "agnes-video-2.5-flash", label: "Agnes Video 2.5 Flash" },
];

const IMAGE_SIZES = [
  { label: "1024 × 1024", value: "1024x1024" },
  { label: "1024 × 768", value: "1024x768" },
  { label: "768 × 1024", value: "768x1024" },
  { label: "1280 × 720", value: "1280x720" },
  { label: "720 × 1280", value: "720x1280" },
];

const VIDEO_PRESETS = [
  { label: "约 3 秒", numFrames: 81, frameRate: 24 },
  { label: "约 5 秒", numFrames: 121, frameRate: 24 },
  { label: "约 10 秒", numFrames: 241, frameRate: 24 },
];

const VIDEO_RESOLUTIONS = [
  { label: "854 × 480（16:9）", width: 854, height: 480 },
  { label: "1280 × 720（16:9）", width: 1280, height: 720 },
  { label: "480 × 854（9:16）", width: 480, height: 854 },
  { label: "720 × 1280（9:16）", width: 720, height: 1280 },
];

const IMAGES_KEY = "nexus.agnes.images.v1";
const VIDEOS_KEY = "nexus.agnes.videos.v1";
const INFLIGHT_KEY = "nexus.agnes.inflight.v1";

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

const AgnesStudio = ({ embedded = false }: { embedded?: boolean }) => {
  const [mode, setMode] = useState<AgnesMode>("text2img");
  const [prompt, setPrompt] = useState("");
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0].id);
  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].id);
  const [imageSize, setImageSize] = useState(IMAGE_SIZES[0].value);
  const [videoPreset, setVideoPreset] = useState(VIDEO_PRESETS[0]);
  const [videoResolution, setVideoResolution] = useState(VIDEO_RESOLUTIONS[0]);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [images, setImages] = useState<ImageItem[]>(() => loadJSON<ImageItem[]>(IMAGES_KEY, []));
  const [videos, setVideos] = useState<VideoItem[]>(() => loadJSON<VideoItem[]>(VIDEOS_KEY, []));
  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 持久化历史
  useEffect(() => {
    saveJSON(IMAGES_KEY, images);
  }, [images]);
  useEffect(() => {
    saveJSON(VIDEOS_KEY, videos);
  }, [videos]);

  // 恢复未完成的视频轮询
  useEffect(() => {
    const saved = loadJSON<InFlightVideo | null>(INFLIGHT_KEY, null);
    if (saved?.videoId) {
      setMode(saved.mode);
      setPrompt(saved.prompt);
      if (saved.imagePreview) setImagePreview(saved.imagePreview);
      setGenerating(true);
      setStage("正在生成视频，请稍候...");
      startPolling(saved);
    }
    return () => stopPolling();
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (inflight: InFlightVideo) => {
    stopPolling();
    let attempts = 0;
    const maxAttempts = 120; // 约 10 分钟

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const resp = await fetch(`/api/agnes/video/status/${encodeURIComponent(inflight.videoId)}?model=${encodeURIComponent(videoModel)}`);
        const data = await resp.json();

        if (!resp.ok || !data.success) {
          stopPolling();
          setGenerating(false);
          setStage("");
          removeKey(INFLIGHT_KEY);
          setErrorMsg(data.error || "状态查询失败");
          return;
        }

        if (data.status === "completed" || data.status === "done") {
          stopPolling();
          const item: VideoItem = {
            id: `agnes-video-${Date.now()}`,
            mode: inflight.mode,
            prompt: inflight.prompt,
            videoUrl: data.videoUrl,
            imageUrl: inflight.imagePreview,
            createdAt: Date.now(),
          };
          setVideos((prev) => [item, ...prev]);
          setCurrentVideo(item);
          setGenerating(false);
          setStage("");
          removeKey(INFLIGHT_KEY);
          return;
        }

        if (data.status === "failed" || data.status === "error") {
          stopPolling();
          setGenerating(false);
          setStage("");
          removeKey(INFLIGHT_KEY);
          setErrorMsg(data.error || "视频生成失败");
          return;
        }

        setStage(`正在生成视频中... ${data.progress ? `${Math.round(data.progress)}%` : ""}`);

        if (attempts >= maxAttempts) {
          stopPolling();
          setGenerating(false);
          setStage("");
          removeKey(INFLIGHT_KEY);
          setErrorMsg("生成超时，请在历史记录中稍后再刷新");
        }
      } catch {
        // 轮询失败继续
      }
    }, 5000);
  };

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

  const isImageMode = mode === "text2img" || mode === "img2img";

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setErrorMsg("请输入描述");
      return;
    }
    if (mode === "img2img" && !image) {
      setErrorMsg("请上传参考图片");
      return;
    }
    if (mode === "img2video" && !image) {
      setErrorMsg("请上传起始图片");
      return;
    }

    setGenerating(true);
    setErrorMsg("");

    try {
      if (isImageMode) {
        setStage("正在生成图片...");
        const formData = new FormData();
        formData.append("mode", mode);
        formData.append("model", imageModel);
        formData.append("prompt", prompt.trim());
        formData.append("size", imageSize);
        formData.append("response_format", "url");
        if (image) formData.append("files", image);

        const resp = await fetch("/api/agnes/image/generate", {
          method: "POST",
          body: formData,
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
          throw new Error(data.error || "图片生成失败");
        }
        const item: ImageItem = {
          id: `agnes-img-${Date.now()}`,
          mode: mode as "text2img" | "img2img",
          prompt: prompt.trim(),
          imageUrl: data.imageUrl,
          createdAt: Date.now(),
        };
        setImages((prev) => [item, ...prev]);
        setPrompt("");
        setStage("");
      } else {
        setStage("正在提交视频任务...");
        const formData = new FormData();
        formData.append("mode", mode);
        formData.append("model", videoModel);
        formData.append("prompt", prompt.trim());
        formData.append("width", String(videoResolution.width));
        formData.append("height", String(videoResolution.height));
        formData.append("num_frames", String(videoPreset.numFrames));
        formData.append("frame_rate", String(videoPreset.frameRate));
        if (image) formData.append("files", image);

        const resp = await fetch("/api/agnes/video/generate", {
          method: "POST",
          body: formData,
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
          throw new Error(data.error || "视频任务提交失败");
        }

        const inflight: InFlightVideo = {
          videoId: data.videoId,
          taskId: data.taskId,
          prompt: prompt.trim(),
          mode: mode as "text2video" | "img2video",
          imagePreview,
        };
        saveJSON(INFLIGHT_KEY, inflight);
        setStage("正在生成视频，通常需要 1-3 分钟...");
        startPolling(inflight);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "生成失败，请稍后重试");
      setGenerating(false);
      setStage("");
      stopPolling();
      removeKey(INFLIGHT_KEY);
    }
  };

  const handleDownload = async (url: string, name: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  };

  const containerClass = embedded
    ? "relative z-10 mx-auto max-w-5xl px-4 pb-16"
    : "relative z-10 mx-auto max-w-5xl px-4 py-12";

  return (
    <div className={containerClass}>
      <div className="border-glow rounded-[2rem] bg-card/60 p-6 backdrop-blur-xl sm:p-8">
        {/* 标题 */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Agnes AI 创作</h2>
            <p className="text-xs text-muted-foreground">
              免费多模态 API：文生图、图生图、文生视频、图生视频
            </p>
          </div>
        </div>

        {/* 模式切换 */}
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {MODE_TABS.map((t) => {
            const Icon = t.icon;
            const active = mode === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  setMode(t.key);
                  setErrorMsg("");
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium transition-all ${
                  active
                    ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-white shadow-md shadow-cyan-500/20"
                    : "border border-white/10 bg-white/5 text-muted-foreground hover:border-white/25 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* 图片上传（图生图 / 图生视频） */}
        {(mode === "img2img" || mode === "img2video") && (
          <div
            onClick={() => fileRef.current?.click()}
            className="group relative mb-4 flex min-h-[180px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-white/15 bg-black/20 transition-colors hover:border-cyan-400/50 hover:bg-black/30"
          >
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="预览" className="absolute inset-0 h-full w-full object-cover" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImage(null);
                    setImagePreview("");
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                >
                  <X className="h-4 w-4" />
                </button>
                <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur-sm">
                  点击更换图片
                </span>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <UploadCloud className="h-8 w-8 text-cyan-300" />
                <p className="text-sm font-medium text-white">点击上传图片</p>
                <p className="text-xs text-muted-foreground">PNG / JPG，参考图会用于生成</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
        )}

        {/* 模型 / 尺寸选择 */}
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          {isImageMode ? (
            <>
              <div>
                <label className="mb-2 block text-xs font-medium text-white/80">模型</label>
                <select
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-cyan-400/50 focus:outline-none"
                >
                  {IMAGE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-white/80">尺寸</label>
                <select
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-cyan-400/50 focus:outline-none"
                >
                  {IMAGE_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-2 block text-xs font-medium text-white/80">视频模型</label>
                <select
                  value={videoModel}
                  onChange={(e) => setVideoModel(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-cyan-400/50 focus:outline-none"
                >
                  {VIDEO_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-white/80">分辨率</label>
                <select
                  value={videoResolution.label}
                  onChange={(e) => setVideoResolution(VIDEO_RESOLUTIONS.find((r) => r.label === e.target.value) || VIDEO_RESOLUTIONS[0])}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-cyan-400/50 focus:outline-none"
                >
                  {VIDEO_RESOLUTIONS.map((r) => (
                    <option key={r.label} value={r.label}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-2 block text-xs font-medium text-white/80">时长</label>
                <div className="flex flex-wrap gap-2">
                  {VIDEO_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setVideoPreset(p)}
                      className={`rounded-xl px-4 py-2 text-xs font-medium transition-all ${
                        videoPreset.label === p.label
                          ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-white shadow-md shadow-cyan-500/20"
                          : "border border-white/10 bg-white/5 text-muted-foreground hover:border-white/25 hover:text-white"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 提示词 */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            mode === "text2img"
              ? "例如：一只在赛博朋克城市里发光的紫色狐狸，霓虹灯，雨夜"
              : mode === "img2img"
                ? "描述你想基于参考图生成的画面，例如：把人物变成机甲风格，金属质感"
                : mode === "text2video"
                  ? "例如：一只狐狸在冬日山林中奔跑，镜头平稳跟随，自然光线"
                  : "例如：人物转头看向镜头，背景光线缓缓流动，画面平滑运镜"
          }
          rows={3}
          className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
        />

        {/* 生成按钮 */}
        <button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="btn-neon group mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isImageMode ? "生成中..." : stage || "提交中..."}
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
              {isImageMode ? "生成图片" : "生成视频"}
            </>
          )}
        </button>

        {/* 错误提示 */}
        <AnimatePresence>
          {errorMsg && (
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
      </div>

      {/* 图片结果 */}
      {isImageMode && images.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">图片作品</h3>
            <button onClick={() => setImages([])} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-red-300">
              <Trash2 className="h-3.5 w-3.5" />
              清空历史
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                layout
                className="group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-black/20"
              >
                <img src={item.imageUrl} alt={item.prompt} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <p className="line-clamp-2 text-xs text-white/90">{item.prompt}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(item.imageUrl, `${item.id}.png`)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                      title="下载"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setImages((prev) => prev.filter((i) => i.id !== item.id))}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-red-500/30"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <AiBadge label="NEXUS AI 生成" className="absolute left-2 top-2 z-10 pointer-events-none" />
                <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-white/80 backdrop-blur-sm">
                  {item.mode === "text2img" ? "文生图" : "图生图"}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* 视频结果 */}
      {!isImageMode && (
        <>
          <AnimatePresence>
            {currentVideo && !generating && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="border-glow mt-6 overflow-hidden rounded-3xl"
              >
                <video src={currentVideo.videoUrl} controls autoPlay loop className="aspect-video w-full bg-black" />
                <div className="p-5">
                  <p className="text-sm font-medium text-white">视频已生成</p>
                  <AiBadge label="NEXUS AI 生成" className="mt-1" />
                  <p className="mt-1 text-xs text-muted-foreground">{currentVideo.prompt}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleDownload(currentVideo.videoUrl, `${currentVideo.id}.mp4`)}
                      className="btn-neon inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 text-xs font-semibold text-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载视频
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {videos.length > 0 && (
            <div className="mt-8">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">视频作品</h3>
                <button onClick={() => setVideos([])} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-red-300">
                  <Trash2 className="h-3.5 w-3.5" />
                  清空历史
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {videos.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setCurrentVideo(v)}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-card text-left transition-colors hover:border-cyan-400/40"
                  >
                    <div className="relative aspect-video overflow-hidden bg-black">
                      {v.imageUrl ? (
                        <img src={v.imageUrl} alt={v.prompt} className="h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-50" />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-cyan-600/30 via-violet-600/20 to-fuchsia-600/30" />
                      )}
                      <AiBadge label="NEXUS AI 生成" className="absolute left-2 top-2 z-10 pointer-events-none" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
                          <Play className="h-5 w-5 fill-current" />
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
        </>
      )}
    </div>
  );
};

export default AgnesStudio;
