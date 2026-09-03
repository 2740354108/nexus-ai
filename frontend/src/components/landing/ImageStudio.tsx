import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { saveHistory } from "@/lib/database";
import { AiBadge } from "../AiBadge";
import { toast } from "sonner";
import {
  Download,
  Trash2,
  Image as ImageIcon,
  Loader2,
  X,
  Sparkles,
} from "lucide-react";

const STORAGE_KEY = "nexus-ai-images";

const STYLE_PRESETS: Record<string, { label: string; suffix: string }> = {
  none: { label: "原图", suffix: "" },
  realistic: {
    label: "写实",
    suffix: "photorealistic, highly detailed, 8k uhd, professional photography",
  },
  anime: {
    label: "动漫",
    suffix: "anime style, vibrant colors, clean line art, detailed illustration",
  },
  cyberpunk: {
    label: "赛博",
    suffix: "cyberpunk, neon lights, futuristic city, synthwave atmosphere",
  },
  oil: {
    label: "油画",
    suffix: "oil painting, rich brushstrokes, classical art style, canvas texture",
  },
  pixel: {
    label: "像素",
    suffix: "pixel art, retro game style, 8-bit, dithering",
  },
  fantasy: {
    label: "奇幻",
    suffix: "epic fantasy, dramatic lighting, cinematic composition, highly detailed",
  },
};

const RESOLUTIONS = [
  { label: "512", w: 512, h: 512 },
  { label: "768", w: 768, h: 768 },
  { label: "1024", w: 1024, h: 1024 },
];

type ImageItem = {
  id: string;
  prompt: string;
  style: string;
  imageUrl: string;
  width: number;
  height: number;
  createdAt: number;
};

const ImageStudio = ({ embedded = false }: { embedded?: boolean }) => {
  const [prompt, setPrompt] = useState("");
  const [activeStyle, setActiveStyle] = useState("none");
  const [activeRes, setActiveRes] = useState(RESOLUTIONS[1]);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selected, setSelected] = useState<ImageItem | null>(null);
  const { user, token } = useAuth();
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleSave = async (item: ImageItem) => {
    if (!user || !token) {
      toast("请先登录后再收藏到我的空间");
      return;
    }
    setSavingId(item.id);
    try {
      await saveHistory(token, {
        kind: "image",
        title: item.prompt || "AI 绘图",
        content: item.imageUrl,
        thumb: item.imageUrl,
      });
      toast.success("已保存到我的空间");
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    } finally {
      setSavingId(null);
    }
  };

  // 从本地恢复历史
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setImages(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // 保存历史
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
  }, [images]);

  const handleGenerate = async () => {
    const finalPrompt = prompt.trim();
    if (!finalPrompt) {
      setErrorMsg("请先输入想生成的画面描述");
      return;
    }
    setGenerating(true);
    setErrorMsg("");

    try {
      const suffix = STYLE_PRESETS[activeStyle]?.suffix || "";
      const stylePrompt = suffix ? `${finalPrompt}, ${suffix}` : finalPrompt;

      const resp = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: stylePrompt,
          style: activeStyle,
          width: activeRes.w,
          height: activeRes.h,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success || !data.imageUrl) {
        throw new Error(data.error || "图片生成失败");
      }

      const item: ImageItem = {
        id: `img-${Date.now()}`,
        prompt: finalPrompt,
        style: activeStyle,
        imageUrl: data.imageUrl,
        width: data.width,
        height: data.height,
        createdAt: Date.now(),
      };
      setImages((prev) => [item, ...prev]);
      setPrompt("");
    } catch (err: any) {
      setErrorMsg(err?.message || "生成失败，请稍后重试");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (item: ImageItem) => {
    try {
      const resp = await fetch(item.imageUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexus-ai-${item.id}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(item.imageUrl, "_blank");
    }
  };

  const handleDelete = (id: string) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
    if (selected?.id === id) setSelected(null);
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
            <ImageIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">AI 绘图</h2>
            <p className="text-xs text-muted-foreground">
              输入画面描述，Pollinations 免费出图
            </p>
          </div>
        </div>

        {/* 输入区 */}
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-white/90">
              画面描述
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder="例如：一只在赛博朋克城市里发光的紫色狐狸，霓虹灯，雨夜..."
              rows={3}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
            />
          </div>

          {/* 风格预设 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white/90">
              风格
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(STYLE_PRESETS).map(([key, { label }]) => (
                <button
                  key={key}
                  onClick={() => setActiveStyle(key)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                    activeStyle === key
                      ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-white shadow-md shadow-cyan-500/20"
                      : "border border-white/10 bg-white/5 text-muted-foreground hover:border-white/25 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 分辨率 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white/90">
              尺寸
            </label>
            <div className="flex flex-wrap gap-2">
              {RESOLUTIONS.map((r) => (
                <button
                  key={r.label}
                  onClick={() => setActiveRes(r)}
                  className={`rounded-xl px-4 py-2 text-xs font-medium transition-all ${
                    activeRes.label === r.label
                      ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-white shadow-md shadow-cyan-500/20"
                      : "border border-white/10 bg-white/5 text-muted-foreground hover:border-white/25 hover:text-white"
                  }`}
                >
                  {r.w} × {r.h}
                </button>
              ))}
            </div>
          </div>

          {/* 生成按钮 */}
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="btn-neon group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在生成中...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
                生成图片
              </>
            )}
          </button>
        </div>

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

      {/* 画廊 */}
      {images.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">我的作品</h3>
            <button
              onClick={() => setImages([])}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-red-300"
            >
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
                <img
                  src={item.imageUrl}
                  alt={item.prompt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                {/* 遮罩操作 */}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <p className="line-clamp-2 text-xs text-white/90">{item.prompt}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => handleSave(item)}
                      disabled={savingId === item.id}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 py-1.5 text-xs text-white backdrop-blur-sm transition-all hover:brightness-110 disabled:opacity-60"
                    >
                      {savingId === item.id ? "保存中" : "收藏"}
                    </button>
                    <button
                      onClick={() => setSelected(item)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/10 py-1.5 text-xs text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                    >
                      查看
                    </button>
                    <button
                      onClick={() => handleDownload(item)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                      title="下载"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-red-500/30"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <AiBadge label="NEXUS AI 生成" className="absolute left-2 top-2 z-10 pointer-events-none" />
                <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-white/80 backdrop-blur-sm">
                  {STYLE_PRESETS[item.style]?.label || item.style}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* 大图弹窗 */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl"
            >
              <button
                onClick={() => setSelected(null)}
                className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={selected.imageUrl}
                alt={selected.prompt}
                className="max-h-[70vh] w-full object-contain"
              />
              <div className="border-t border-white/10 p-4">
                <p className="text-sm text-white">{selected.prompt}</p>
                <AiBadge label="NEXUS AI 生成" className="mt-2" />
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => handleDownload(selected)}
                    className="btn-neon inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 text-xs font-semibold text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载原图
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {selected.width} × {selected.height}
                  </span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ImageStudio;
