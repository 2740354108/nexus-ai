import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, Zap, Bot, MessageSquare, Code2, Music4, Clapperboard, Image, Sparkles } from "lucide-react";
import AIStudio from "@/components/landing/AIStudio";
import MusicStudio from "@/components/landing/MusicStudio";
import VideoStudio from "@/components/landing/VideoStudio";
import ImageStudio from "@/components/landing/ImageStudio";
import AgnesStudio from "@/components/landing/AgnesStudio";
import AIBootScreen from "@/components/landing/AIBootScreen";

type AITab = "chat" | "code" | "music" | "video" | "image" | "agnes";

const TABS: { key: AITab; label: string; icon: typeof Bot; desc: string }[] = [
  { key: "chat", label: "智能对话", icon: MessageSquare, desc: "和 NEXUS AI 聊聊任何想法，即刻响应" },
  { key: "code", label: "代码生成", icon: Code2, desc: "描述需求，AI 直接写出可用代码" },
  { key: "music", label: "AI 音乐", icon: Music4, desc: "一句话灵感，生成一首完整曲目" },
  { key: "video", label: "图生视频", icon: Clapperboard, desc: "上传一张图，让它动起来" },
  { key: "image", label: "AI 绘图", icon: Image, desc: "描述画面，AI 生成对应图片" },
  { key: "agnes", label: "Agnes AI", icon: Sparkles, desc: "免费多模态：文生图、图生图、文生视频、图生视频" },
];

/* 星点：伪随机分布、错峰闪烁（纯 opacity/transform 动画，性能友好） */
const STARS = Array.from({ length: 32 }, (_, i) => ({
  left: `${(i * 41 + 17) % 100}%`,
  top: `${(i * 59 + 11) % 100}%`,
  size: i % 5 === 0 ? 3 : 2,
  delay: `${((i * 0.37) % 3).toFixed(2)}s`,
  duration: `${3 + (i % 4)}s`,
  cyan: i % 3 === 0,
}));

/* 流星：五条不同轨迹错时划过 */
const METEORS = [
  { top: "6%", right: "-6%", delay: "0.5s", duration: "9s", size: "9rem" },
  { top: "24%", right: "16%", delay: "4s", duration: "11s", size: "12rem" },
  { top: "1%", right: "38%", delay: "7.5s", duration: "10s", size: "8rem" },
  { top: "14%", right: "-12%", delay: "2.2s", duration: "12s", size: "14rem" },
  { top: "33%", right: "30%", delay: "9.8s", duration: "13s", size: "10rem" },
];

/* 声呐光环：三圈错峰向外扩散 */
const RINGS = [{ delay: "0s" }, { delay: "1.2s" }, { delay: "2.4s" }];

/* 上升光尘：像萤火/余烬从底部升起，负延迟让首屏就满天飞 */
const MOTES = Array.from({ length: 14 }, (_, i) => ({
  left: `${((i * 71 + 9) % 96) + 2}%`,
  top: `${92 + (i % 4) * 9}%`,
  size: i % 3 === 0 ? 5 : 3,
  duration: `${11 + (i % 5) * 3}s`,
  delay: `${-((i * 1.7) % 12).toFixed(1)}s`,
  drift: `${(i % 2 === 0 ? 1 : -1) * (2 + (i % 3))}vw`,
  color:
    i % 3 === 0 ? "rgba(103,232,249,0.9)" : i % 3 === 1 ? "rgba(196,181,253,0.85)" : "rgba(255,255,255,0.8)",
}));

/* 轨道层级：三圈光环（外/中/内），不同转速与光点颜色 */
const ORBITS = [
  { inset: "0rem", duration: "28s", reverse: false, color: "#67e8f9", glow: "rgba(103,232,249,0.75)" },
  { inset: "3.5rem", duration: "18s", reverse: true, color: "#c4b5fd", glow: "rgba(196,181,253,0.75)" },
  { inset: "6.5rem", duration: "10s", reverse: false, color: "#ffffff", glow: "rgba(255,255,255,0.7)" },
];

/**
 * 独立 AI 体验区：对话 / 代码 / 音乐 / 图生视频 / 绘图 / Agnes 多模态 六合一工具套件。
 * 不占用主页空间，顶部有返回主页按钮。
 *
 * 视觉特效：固定氛围背景（网格 + 漂浮光晕 + 中央大光球）、
 * 玻璃拟态标签栏 + 滑动光标（layoutId 共享布局动画）、
 * 标题流光、呼吸脉冲徽章、内容模糊切换。
 */
const AIPage = () => {
  const [active, setActive] = useState<AITab>("chat");
  // 启动加载屏：覆盖在最上层，背后页面照常加载
  const [booting, setBooting] = useState(true);
  const activeTab = TABS.find((t) => t.key === active) ?? TABS[0];
  const contentRef = useRef<HTMLDivElement>(null);

  const switchTab = (key: AITab) => {
    setActive(key);
  };

  /* 鼠标聚光灯：桌面端光晕跟随（弹簧平滑，仅动 transform） */
  const mx = useMotionValue(-800);
  const my = useMotionValue(-800);
  const sx = useSpring(mx, { stiffness: 55, damping: 18, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 55, damping: 18, mass: 0.6 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mx.set(e.clientX);
      my.set(e.clientY);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [mx, my]);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* ===== 启动加载屏：进入 AI 专区时的科技感 boot 动画，结束后自动淡出 ===== */}
      <AnimatePresence>
        {booting && <AIBootScreen onDone={() => setBooting(false)} />}
      </AnimatePresence>

      {/* ===== 氛围背景层：固定于视口，滚动时光晕与网格常驻 ===== */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden
        style={{ transform: "translateZ(0)", willChange: "transform" }}
      >
        {/* 旋转极光网：青紫渐变缓慢旋转，撑起页面气场 */}
        {/* 父容器负责居中定位，子元素只做旋转，避免 transform 冲突 */}
        <div className="absolute left-1/2 top-[22%] h-[64rem] w-[64rem] -translate-x-1/2 -translate-y-1/2">
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            transition={{ opacity: { duration: 1 }, rotate: { duration: 24, repeat: Infinity, ease: "linear" } }}
            className="h-full w-full rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(139,92,246,0.28) 0deg, transparent 80deg, rgba(6,182,212,0.22) 160deg, transparent 240deg, rgba(124,58,237,0.28) 320deg, transparent 360deg)",
              filter: "blur(44px)",
              willChange: "transform",
            }}
          />
        </div>
        {/* 中央巨型光晕：照亮标题区域 */}
        <div className="glow-violet absolute left-1/2 top-[22%] h-[52rem] w-[52rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-50" />
        <div className="glow-cyan absolute left-1/2 top-[24%] h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-40" />
        {/* 漂浮光晕：左右呼吸游动 */}
        <div className="glow-cyan animate-float-slow absolute -left-48 top-12 h-[38rem] w-[38rem] rounded-full blur-3xl opacity-50" />
        <div className="glow-blue animate-float-slower absolute -right-48 top-[32%] h-[34rem] w-[34rem] rounded-full blur-3xl opacity-45" />
        <div className="glow-violet animate-float-slow absolute bottom-[-14rem] left-[6%] h-[32rem] w-[32rem] rounded-full blur-3xl opacity-40" />
        {/* 高对比度科技感网格：比全局更亮，确保可见 */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, oklch(1 0 0 / 0.08) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 0.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse 85% 65% at 50% 28%, black 18%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(ellipse 85% 65% at 50% 28%, black 18%, transparent 78%)",
          }}
        />
        {/* 顶部微光，不再压暗背景 */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-violet-900/10 to-transparent" />
        {/* 声呐脉冲光环：从中心一圈圈荡开 */}
        {RINGS.map((r, i) => (
          <span key={`ring-${i}`} className="ai-ring" style={{ animationDelay: r.delay }} />
        ))}
        {/* 深空星点：错峰闪烁 */}
        {STARS.map((s, i) => (
          <span
            key={`star-${i}`}
            className="ai-star"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              animationDelay: s.delay,
              animationDuration: s.duration,
              boxShadow: s.cyan ? "0 0 6px rgba(103,232,249,0.9)" : "0 0 6px rgba(255,255,255,0.8)",
            }}
          />
        ))}
        {/* 流星：亮头划过天际 */}
        {METEORS.map((m, i) => (
          <span
            key={`meteor-${i}`}
            className="ai-meteor"
            style={{
              top: m.top,
              right: m.right,
              width: m.size,
              animationDelay: m.delay,
              animationDuration: m.duration,
            }}
          />
        ))}
        {/* AI 核心轨道：虚线光环 + 环绕光点，像原子绕核 */}
        <div className="absolute left-1/2 top-[22%] h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2">
          {ORBITS.map((o, i) => (
            <div
              key={`orbit-${i}`}
              className="ai-orbit-ring"
              style={{
                inset: o.inset,
                animationDuration: o.duration,
                animationDirection: o.reverse ? "reverse" : "normal",
              }}
            >
              <span
                className="ai-orbit-dot"
                style={{ background: o.color, boxShadow: `0 0 14px 3px ${o.glow}` }}
              />
            </div>
          ))}
        </div>
        {/* 上升光尘：萤火般的微粒从底部缓缓升起 */}
        {MOTES.map((m, i) => (
          <span
            key={`mote-${i}`}
            className="ai-mote"
            style={
              {
                left: m.left,
                top: m.top,
                width: m.size,
                height: m.size,
                background: m.color,
                boxShadow: `0 0 10px 1px ${m.color}`,
                animationDuration: m.duration,
                animationDelay: m.delay,
                "--drift": m.drift,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* 鼠标聚光灯：桌面端紫青光晕跟随移动（移动端自动隐藏） */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[5] hidden h-[30rem] w-[30rem] rounded-full md:block"
        style={{
          x: sx,
          y: sy,
          marginLeft: "-15rem",
          marginTop: "-15rem",
          background:
            "radial-gradient(closest-side, rgba(139,92,246,0.14), rgba(6,182,212,0.07) 45%, transparent 72%)",
        }}
      />

      {/* 顶部导航栏 */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto mt-3 max-w-7xl px-5 lg:px-8">
          <div className="glass flex w-full items-center justify-between rounded-2xl px-4 py-3 shadow-lg shadow-black/30">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/30">
                <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
              </span>
              <span className="text-lg font-bold tracking-tight text-white">
                NEXUS
                <span className="text-gradient-neon ml-1">LAB</span>
              </span>
            </Link>

            <Link
              to="/"
              className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              返回主页
            </Link>
          </div>
        </div>
      </header>

      {/* ===== 顶部引导区 ===== */}
      <section className="relative z-10 overflow-hidden pt-28 pb-2">
        {/* 开场光束：进页时斜扫一次 */}
        <div className="ai-beam" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-6 text-center">
          {/* 入场冲击波：两圈光环从标题中心炸开 */}
          <div className="ai-shockwave" aria-hidden />
          <div className="ai-shockwave ai-shockwave-2" aria-hidden />
          {/* 标题背后聚光灯：缓慢呼吸的光斑 */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
            <div
              className="ai-spotlight glow-cyan"
              style={{ height: "18rem", width: "18rem", animationDelay: "0s" }}
              aria-hidden
            />
            <div
              className="ai-spotlight glow-violet"
              style={{ height: "14rem", width: "14rem", animationDelay: "1.2s" }}
              aria-hidden
            />
          </div>
          <span className="relative inline-block">
            {/* HUD 四角括号：科幻取景框，四角依次脉冲 */}
            <span className="ai-hud ai-hud-tl" aria-hidden />
            <span className="ai-hud ai-hud-tr" style={{ animationDelay: "0.3s" }} aria-hidden />
            <span className="ai-hud ai-hud-bl" style={{ animationDelay: "0.6s" }} aria-hidden />
            <span className="ai-hud ai-hud-br" style={{ animationDelay: "0.9s" }} aria-hidden />
            <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-cyan-300 uppercase"
          >
            {/* 呼吸脉冲点：暗示"随时可用" */}
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            NEXUS AI · 专属体验区
          </motion.span>
          </span>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl"
          >
            一站式 <span className="text-gradient-neon text-glow">AI 工具套件</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground"
          >
            对话、写代码、创作音乐、生成图片、让图片动起来、Agnes 多模态创作——六个 AI 工具，一个地方搞定。体验完随时返回主页。
          </motion.p>
        </div>
      </section>

      {/* ===== 四标签切换：玻璃容器 + 滑动光标 ===== */}
      <div className="relative z-10 mx-auto mt-8 max-w-5xl px-6">
        {/* 标签栏：静态渐变描边，不再旋转，避免持续闪烁 */}
        <div
          className="relative mx-auto w-fit max-w-full rounded-2xl p-[1.5px]"
          style={{
            background: "linear-gradient(135deg, rgba(34,211,238,0.55), rgba(139,92,246,0.55), rgba(34,211,238,0.55))",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 30px rgba(6,182,212,0.06)",
          }}
        >
          <div className="relative flex flex-wrap justify-center gap-1.5 rounded-[14px] border border-white/5 bg-slate-900/60 p-1.5 backdrop-blur-xl">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                className={`relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors duration-200 ${
                  isActive ? "text-white" : "text-muted-foreground hover:text-white"
                }`}
              >
                {/* 滑动指示光标：在标签之间平滑游走 */}
                {isActive && (
                  <motion.span
                    layoutId="ai-tab-pill"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 shadow-md shadow-cyan-500/20"
                  />
                )}
                <Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10 hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
          </div>
        </div>

        {/* 当前标签一句话说明：切换时轻动效 */}
        <div className="mt-4 flex h-5 items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={active}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="text-sm text-muted-foreground"
            >
              {activeTab.desc}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      {/* ===== 内容区：轻量淡入切换（去掉 blur 避免移动端闪烁） ===== */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          ref={contentRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.26, ease: "easeOut" }}
          className="relative z-10"
        >
          {active === "chat" && <AIStudio embedded defaultMode="chat" />}
          {active === "code" && <AIStudio embedded defaultMode="code" />}
          {active === "music" && <MusicStudio embedded />}
          {active === "video" && <VideoStudio embedded />}
          {active === "image" && <ImageStudio embedded />}
          {active === "agnes" && <AgnesStudio embedded />}
        </motion.div>
      </AnimatePresence>

      {/* ===== 底部返回 ===== */}
      <section className="relative z-10 py-16 text-center">
        <div className="glow-violet pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-45" />
        <Link
          to="/"
          className="btn-neon group relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-500 px-7 py-3.5 text-sm font-semibold text-white transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          返回主页 · 继续了解我们
        </Link>
      </section>
    </div>
  );
};

export default AIPage;
