import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music4,
  Sparkles,
  Play,
  Pause,
  Loader2,
  Wand2,
  Heart,
  Download,
  RefreshCw,
} from "lucide-react";
import { synthesizeSong } from "@/lib/musicEngine";

/* ------------------------------------------------------------------ */
/*  真实 API 调用 — 通过后端代理调用 MiniMax 音乐生成                   */
/* ------------------------------------------------------------------ */

type Song = {
  id: string;
  title: string;
  prompt: string;
  style: string;
  duration: number;
  audioUrl: string;
  createdAt: number;
  source?: "api" | "local";
};

const STYLE_TAGS = [
  "流行", "电子", "摇滚", "古风", "说唱", "轻音乐", "R&B", "民谣",
];

const GENRE_PROMPTS: Record<string, string> = {
  "流行": "Pop, upbeat, catchy melody, bright and energetic",
  "电子": "Electronic, futuristic, cyberpunk vibe, synth-driven",
  "摇滚": "Rock, energetic, powerful guitar riffs, driving drums",
  "古风": "Chinese traditional style, bamboo flute and guzheng, serene and poetic",
  "说唱": "Hip-hop rap, strong beat, rhythmic flow, confident attitude",
  "轻音乐": "Light music, warm piano, gentle and healing, morning mood",
  "R&B": "R&B, smooth and soulful, emotional, mellow groove",
  "民谣": "Folk, acoustic guitar, storytelling, warm and nostalgic",
};

/** 从 prompt 提取一个简短标题 */
function extractTitle(prompt: string): string {
  const cleaned = prompt.replace(/[,，。.！!？?]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.slice(0, 3).join("") || "AI 之作";
}

type GenerateResult = { song: Song; source: "api" | "local" };

/**
 * 生成歌曲：优先调用后端 AI 接口（Suno/MiniMax 等），
 * 不可用或无额度时自动降级到浏览器本地合成引擎（零成本）。
 */
async function generateSong(
  prompt: string,
  style: string
): Promise<GenerateResult> {
  // 1) 尝试后端 AI 接口（HuggingFace 首次加载模型可能需 10-30 秒，故采用较长的超时）
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    const resp = await fetch("/api/music/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `${GENRE_PROMPTS[style] ? GENRE_PROMPTS[style] + ', ' : ''}${prompt}`.trim(),
        isInstrumental: false,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const data = await resp.json();
    if (resp.ok && data.success && data.audioUrl) {
      return {
        song: {
          id: `song-${Date.now()}`,
          title: extractTitle(prompt),
          prompt,
          style,
          duration: data.duration || 30,
          audioUrl: data.audioUrl,
          createdAt: Date.now(),
        },
        source: "api",
      };
    }
    // 无额度/未配置 → 降级本地合成
  } catch {
    // 网络错误/超时 → 降级本地合成
  }

  // 2) 本地合成引擎
  const local = await synthesizeSong(prompt, style);
  return {
    song: {
      id: `song-${Date.now()}`,
      title: local.title,
      prompt,
      style,
      duration: local.duration,
      audioUrl: local.audioUrl,
      createdAt: Date.now(),
    },
    source: "local",
  };
}

/* ------------------------------------------------------------------ */
/*  波形可视化组件                                                     */
/* ------------------------------------------------------------------ */

function Waveform({
  active,
  bars = 48,
}: {
  active: boolean;
  bars?: number;
}) {
  return (
    <div className="flex h-10 items-center gap-[3px]">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-gradient-to-t from-cyan-400 to-violet-400"
          animate={
            active
              ? { height: [4, 20 + Math.random() * 16, 4] }
              : { height: 4 }
          }
          transition={{
            duration: 0.6 + Math.random() * 0.4,
            repeat: active ? Infinity : 0,
            delay: i * 0.03,
            ease: "easeInOut",
          }}
          style={{ height: 4 }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------  */
/*  单首歌曲卡片                                                        */
/* ------------------------------------------------------------------ */

function SongCard({
  song,
  isCurrent,
  isPlaying,
  onPlay,
}: {
  song: Song;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: (song: Song) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4 }}
      className={`border-glow group relative flex items-center gap-4 rounded-2xl p-4 transition-all ${
        isCurrent ? "ring-1 ring-cyan-400/50" : ""
      }`}
    >
      {/* 播放按钮 */}
      <button
        onClick={() => onPlay(song)}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-white shadow-lg shadow-cyan-500/30 transition-transform hover:scale-105"
        aria-label={isCurrent && isPlaying ? "暂停" : "播放"}
      >
        {isCurrent && isPlaying ? (
          <Pause className="h-5 w-5 fill-current" />
        ) : (
          <Play className="h-5 w-5 fill-current" />
        )}
      </button>

      {/* 歌曲信息 + 波形 */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="truncate text-sm font-semibold text-white">{song.title}</h4>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
            {song.style}
          </span>
          <span
            className={`hidden rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline ${
              song.source === "api"
                ? "bg-violet-400/15 text-violet-300"
                : "bg-emerald-400/15 text-emerald-300"
            }`}
          >
            {song.source === "api" ? "AI 歌曲" : "本地引擎"}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{song.prompt}</p>
        <div className="mt-2 hidden sm:block">
          <Waveform active={isCurrent && isPlaying} bars={32} />
        </div>
      </div>

      {/* 操作 + 时长 */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">
          {Math.floor(song.duration / 60)}:{String(song.duration % 60).padStart(2, "0")}
        </span>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          aria-label="收藏"
        >
          <Heart className="h-4 w-4" />
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          aria-label="下载"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  主区块组件                                                         */
/* ------------------------------------------------------------------ */

const MusicStudio = ({ embedded = false }: { embedded?: boolean }) => {
  const [prompt, setPrompt] = useState("");
  const [activeStyle, setActiveStyle] = useState("电子");
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 初始化 audio 元素
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.loop = false;
    const onEnded = () => setIsPlaying(false);
    audioRef.current.addEventListener("ended", onEnded);
    return () => {
      audioRef.current?.removeEventListener("ended", onEnded);
      audioRef.current?.pause();
    };
  }, []);

  const playSong = useCallback(
    (song: Song) => {
      if (!audioRef.current) return;
      if (currentSong?.id === song.id) {
        // 同一首：切换播放/暂停
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          audioRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      } else {
        // 切歌
        audioRef.current.src = song.audioUrl;
        audioRef.current.play().catch(() => {});
        setCurrentSong(song);
        setIsPlaying(true);
      }
    },
    [currentSong, isPlaying]
  );

  const [errorMsg, setErrorMsg] = useState("");
  const [notice, setNotice] = useState("");

  const handleGenerate = async () => {
    const finalPrompt = prompt.trim() || GENRE_PROMPTS[activeStyle];
    setGenerating(true);
    setErrorMsg("");
    setNotice("");
    setStage("正在理解你的创意...");

    // 阶段性进度提示（真实生成耗时较长）
    const timers = [
      setTimeout(() => setStage("谱写旋律中..."), 1500),
      setTimeout(() => setStage("编排和声与节奏..."), 4000),
      setTimeout(() => setStage("混音与后期处理..."), 8000),
      setTimeout(() => setStage("即将完成，请稍候..."), 14000),
    ];

    try {
      const { song, source } = await generateSong(finalPrompt, activeStyle);
      timers.forEach(clearTimeout);

      setSongs((prev) => [{ ...song, source }, ...prev]);
      setCurrentSong({ ...song, source });
      setStage("");

      // 降级到本地引擎时明确告知，避免用户误以为这是 AI 生成的
      if (source === "local") {
        setNotice(
          "云端 AI 音乐服务暂时不可用，本次由本地引擎合成（音色较简单）。稍后重试会自动走回 AI 通道。"
        );
      }

      // 自动播放新生成的歌曲
      if (audioRef.current) {
        audioRef.current.src = song.audioUrl;
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    } catch (err: any) {
      timers.forEach(clearTimeout);
      setErrorMsg(err?.message || "生成失败，请稍后重试");
      setNotice("");
      setStage("");
    } finally {
      setGenerating(false);
    }
  };

  const togglePlay = () => {
    if (!currentSong || !audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  return (
    <section id="studio" className={`relative overflow-hidden border-y border-white/5 bg-black/30 ${embedded ? "py-10" : "py-24 sm:py-32"}`}>
      {/* 背景光晕 */}
      <div className="glow-cyan absolute -left-24 top-10 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-30" />
      <div className="glow-violet absolute -right-20 bottom-10 h-[26rem] w-[26rem] rounded-full blur-3xl opacity-30" />

      <div className="relative mx-auto max-w-5xl px-6">
        {/* 标题（嵌入模式隐藏，由套件页提供标签） */}
        {!embedded && (
          <div className="mx-auto max-w-2xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-cyan-300 uppercase"
          >
            <Music4 className="h-3.5 w-3.5" />
            AI 音乐工作室
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl"
          >
            用一句话，<span className="text-gradient-neon">谱写你的歌</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-5 text-base leading-relaxed text-muted-foreground"
          >
            描述你心中的旋律，AI 将为你创作独一无二的乐曲。试试看，灵感即刻成歌。
          </motion.p>
        </div>
        )}

        {/* 输入区 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className={`border-glow rounded-3xl p-6 sm:p-8 ${embedded ? "mt-2" : "mt-12"}`}
        >
          {/* 风格标签 */}
          <div className="mb-5 flex flex-wrap gap-2">
            {STYLE_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  setActiveStyle(tag);
                  if (!prompt.trim()) setPrompt(GENRE_PROMPTS[tag]);
                }}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                  activeStyle === tag
                    ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-white shadow-lg shadow-cyan-500/30"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* 提示词输入 */}
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`描述你想要的歌曲，例如：${GENRE_PROMPTS[activeStyle]}`}
              rows={3}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 pr-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
              disabled={generating}
            />
          </div>

          {/* 生成按钮 */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              <Sparkles className="mr-1 inline h-3 w-3" />
              当前风格：<span className="text-cyan-300">{activeStyle}</span>
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-7 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 btn-neon"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  生成歌曲
                </>
              )}
            </button>
          </div>

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
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20">
                    <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{stage}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      AI 正在创作中，通常需要 15-30 秒，请耐心等待
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
                        initial={{ width: "5%" }}
                        animate={{ width: ["5%", "85%"] }}
                        transition={{ duration: 20, ease: "easeInOut" }}
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
                  生成失败：{errorMsg}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 降级提示（非失败） */}
          <AnimatePresence>
            {notice && !generating && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                  {notice}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* 当前播放栏 */}
        <AnimatePresence>
          {currentSong && !generating && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="border-glow mt-6 flex items-center gap-4 rounded-2xl p-4 sm:p-5"
            >
              <button
                onClick={togglePlay}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-white shadow-lg shadow-cyan-500/40 transition-transform hover:scale-105"
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6 fill-current" />
                ) : (
                  <Play className="h-6 w-6 fill-current" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-white">
                    {currentSong.title}
                  </h3>
                  <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                    {currentSong.style}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {currentSong.prompt}
                </p>
                <div className="mt-2">
                  <Waveform active={isPlaying} bars={56} />
                </div>
              </div>
              <button
                onClick={handleGenerate}
                className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white sm:flex"
                aria-label="重新生成"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 生成历史 */}
        {songs.length > 0 ? (
          <div className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide text-white">
                作品列表
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {songs.length} 首
                </span>
              </h3>
            </div>
            <div className="grid gap-3">
              <AnimatePresence mode="popLayout">
                {songs.map((song) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    isCurrent={currentSong?.id === song.id}
                    isPlaying={isPlaying && currentSong?.id === song.id}
                    onPlay={playSong}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed border-white/10 py-12 text-center">
            <Music4 className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              还没有作品，输入你的创意，生成第一首 AI 音乐吧
            </p>
          </div>
        )}

        {/* 提示 */}
        <p className="mt-8 text-center text-xs text-muted-foreground/60">
          由 ACMusic / ACE-Step 云端驱动 · 约 15-30 秒成曲 · 建议用英文描述获得更佳效果 · 备用引擎自动兜底
        </p>
      </div>
    </section>
  );
};

export default MusicStudio;
