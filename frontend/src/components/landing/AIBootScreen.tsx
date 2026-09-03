import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Zap } from "lucide-react";

/** 启动屏阶段文案，按进度依次点亮 */
const BOOT_STAGES = [
  "初始化神经网络…",
  "加载模型权重…",
  "校准推理引擎…",
  "连接 AI 工具链…",
  "就绪",
];

/** 启动屏总时长（毫秒） */
const TOTAL_MS = 2000;

type AIBootScreenProps = {
  /** 动画走完后回调，父级据此卸载启动屏 */
  onDone: () => void;
};

/**
 * AI 专区启动加载屏
 *
 * 进入 /ai 时覆盖在最上层，背后的页面照常渲染加载。
 * 全部动效只用 transform / opacity，避免触发重排导致闪烁。
 */
const AIBootScreen = ({ onDone }: AIBootScreenProps) => {
  const [progress, setProgress] = useState(0);
  const reduce = useReducedMotion();

  // 用 ref 持有回调，避免父组件重渲染导致动画重启
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current();
    };

    // 系统开启「减少动效」时不做动画，快速放行
    if (reduce) {
      setProgress(100);
      timer = setTimeout(finish, 400);
      return () => clearTimeout(timer);
    }

    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / TOTAL_MS, 1);
      // 先快后慢，末尾有自然的收敛感
      const eased = 1 - Math.pow(1 - p, 2.2);
      setProgress(Math.round(eased * 100));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [reduce]);

  const stageIdx = Math.min(
    BOOT_STAGES.length - 1,
    Math.floor((progress / 100) * BOOT_STAGES.length)
  );

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#05060d]"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* 透视网格地面：向观察者推进 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 overflow-hidden">
        <div className="boot-grid" />
      </div>

      {/* 中央静态光晕（不参与动画，避免模糊层重绘） */}
      <div className="glow-cyan pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl" />
      <div className="glow-violet pointer-events-none absolute left-1/2 top-1/2 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl" />

      {/* 扫描线：自上而下扫过整屏 */}
      <div className="boot-scan pointer-events-none" />

      {/* 声呐光环：错峰向外扩散 */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="boot-ring pointer-events-none"
          style={{ animationDelay: `${i * 0.9}s` }}
        />
      ))}

      {/* 轨道：两圈反向旋转的光点 */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[18rem] w-[18rem] -translate-x-1/2 -translate-y-1/2">
        <div className="boot-orbit" style={{ animationDuration: "6s" }}>
          <span
            className="boot-orbit-dot"
            style={{
              background: "#67e8f9",
              boxShadow: "0 0 12px 2px rgba(103,232,249,0.8)",
            }}
          />
        </div>
        <div
          className="boot-orbit boot-orbit-inner"
          style={{ animationDuration: "4s", animationDirection: "reverse" }}
        >
          <span
            className="boot-orbit-dot"
            style={{
              background: "#c4b5fd",
              boxShadow: "0 0 12px 2px rgba(196,181,253,0.8)",
            }}
          />
        </div>
      </div>

      {/* 中央内容 */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        {/* 图标核心 */}
        <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/30">
          <Zap className="h-8 w-8 text-white" strokeWidth={2.5} />
          <span className="absolute -inset-2 rounded-[20px] border border-cyan-400/25" />
        </div>

        {/* 标题：轻微故障抖动 */}
        <div className="boot-glitch text-2xl font-black tracking-tight text-white sm:text-3xl">
          NEXUS <span className="text-gradient-neon">AI</span>
        </div>
        <p className="mt-2 text-[11px] font-medium tracking-[0.3em] text-cyan-300/70 uppercase">
          System Boot
        </p>

        {/* 进度条 */}
        <div className="mt-9 w-64 sm:w-80">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
              style={{
                width: `${progress}%`,
                boxShadow: "0 0 12px rgba(34,211,238,0.6)",
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px]">
            <span className="boot-flicker text-muted-foreground">
              {BOOT_STAGES[stageIdx]}
            </span>
            <span className="tabular-nums font-semibold text-cyan-300">
              {progress}%
            </span>
          </div>
        </div>
      </div>

      {/* HUD 四角取景框 */}
      <span className="boot-hud boot-hud-tl" />
      <span className="boot-hud boot-hud-tr" style={{ animationDelay: "0.5s" }} />
      <span className="boot-hud boot-hud-bl" style={{ animationDelay: "1s" }} />
      <span className="boot-hud boot-hud-br" style={{ animationDelay: "1.5s" }} />
    </motion.div>
  );
};

export default AIBootScreen;
