import { useRef } from "react";
import { useScroll, useTransform, motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import RevealText from "./RevealText";
import MagneticButton from "./MagneticButton";

const CASES = [
  {
    title: "Aurora 智能出行",
    tag: "品牌 & 应用",
    desc: "端到端品牌与数字体验。",
    gradient: "from-cyan-500 via-blue-500 to-violet-600",
    badge: "案例研究",
    accent: "rgba(34, 211, 238, 0.45)",
  },
  {
    title: "Helix 数据平台",
    tag: "产品 & 工程",
    desc: "企业级数据实时洞察。",
    gradient: "from-violet-500 via-fuchsia-500 to-pink-600",
    badge: "产品设计",
    accent: "rgba(167, 139, 250, 0.45)",
  },
  {
    title: "Orbital 电商",
    tag: "增长 & 转化",
    desc: "转化率提升 38%。",
    gradient: "from-emerald-500 via-teal-500 to-cyan-600",
    badge: "增长项目",
    accent: "rgba(52, 211, 153, 0.45)",
  },
];

const Work = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  return (
    <section id="work" className="relative bg-background pt-24 sm:pt-32">
      <div className="glow-cyan pointer-events-none absolute -left-24 top-40 h-[24rem] w-[24rem] rounded-full opacity-30 blur-3xl" />

      {/* 标题区 */}
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <motion.span
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-sm font-semibold tracking-[0.2em] text-cyan-300 uppercase"
            >
              精选作品
            </motion.span>
            <h2 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              <RevealText
                delay={0.1}
                parts={[
                  { text: "我们引以为傲的" },
                  { text: "杰作", className: "text-gradient-neon" },
                ]}
              />
            </h2>
          </div>
          <motion.a
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            href="#contact"
            className="glass inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            查看全部案例
            <ArrowUpRight className="h-4 w-4" />
          </motion.a>
        </div>
      </div>

      {/* 粘性缩放堆叠 */}
      <div
        ref={containerRef}
        className="relative mx-auto mt-10 h-[165vh] max-w-7xl px-6"
      >
        {CASES.map((item, index) => {
          const offset = index * 0.18;
          // 当前卡片滚动到焦点时略微放大，增强聚焦感
          const scale = useTransform(
            scrollYProgress,
            [offset, offset + 0.14, offset + 0.28],
            [0.92, 1, 0.97]
          );
          // 焦点卡片微微上浮，营造层次
          const y = useTransform(
            scrollYProgress,
            [offset, offset + 0.14, offset + 0.28],
            [24, 0, -8]
          );

          return (
            <motion.div
              key={item.title}
              style={{
                scale,
                y,
                top: `${4 + index * 1.6}rem`,
                willChange: "transform",
              }}
              className="group sticky mx-auto w-full max-w-5xl overflow-hidden rounded-[28px] border-2 border-white/10 bg-card shadow-2xl shadow-purple-900/20 transition-colors duration-500 hover:border-white/25"
            >
              {/* 掠光：悬停时整卡扫过一道光 */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 z-10 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-[1200ms] ease-out group-hover:translate-x-full"
              />

              <a
                href="#contact"
                className="flex items-center gap-5 p-5 sm:gap-7 sm:p-6"
              >
                {/* 渐变视觉（带流动高光） */}
                <div
                  className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br ${item.gradient} sm:h-28 sm:w-28`}
                >
                  <div className="absolute inset-0 bg-grid opacity-30" />
                  {/* 流动高光 */}
                  <span
                    aria-hidden
                    className="absolute inset-0 animate-[shimmer-slide_3.5s_linear_infinite] opacity-70"
                    style={{
                      backgroundImage:
                        "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)",
                      backgroundSize: "200% 100%",
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-9 w-9 rounded-xl border border-white/30 bg-white/10 backdrop-blur-sm transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12 sm:h-11 sm:w-11" />
                  </div>
                  {/* 外溢光晕 */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-4 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(closest-side, ${item.accent}, transparent)`,
                    }}
                  />
                  <span className="absolute left-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                    {item.badge}
                  </span>
                </div>

                {/* 内容 */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium tracking-wide text-cyan-300 uppercase">
                    {item.tag}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-white sm:text-xl">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.desc}
                  </p>
                </div>

                <span className="hidden shrink-0 items-center gap-2 rounded-full border-2 border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition-colors group-hover:border-white/35 group-hover:bg-white/10 group-hover:text-white sm:inline-flex">
                  查看
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5" />
                </span>

                {/* 大编号 */}
                <span className="hidden text-4xl font-black text-white/10 transition-all duration-500 group-hover:text-white/25 sm:block">
                  0{index + 1}
                </span>
              </a>
            </motion.div>
          );
        })}

        {/* 收尾全屏卡片：从底部滑入盖住堆叠，衔接下一区，消除空白 */}
        <div className="sticky top-0 z-20 mx-auto flex h-screen w-full max-w-5xl items-center justify-center overflow-hidden rounded-[28px] border-2 border-white/10 bg-[#0c0c16]">
          {/* 背景装饰 */}
          <div className="glow-cyan pointer-events-none absolute -left-20 top-1/4 h-[20rem] w-[20rem] rounded-full opacity-40 blur-3xl" />
          <div className="glow-violet pointer-events-none absolute -right-20 bottom-1/4 h-[20rem] w-[20rem] rounded-full opacity-40 blur-3xl" />
          <div className="absolute inset-0 bg-grid opacity-20" />

          <div className="relative px-8 text-center">
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-cyan-300 uppercase"
            >
              <Sparkles className="h-3.5 w-3.5" />
              下一步
            </motion.span>
            <h3 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              <RevealText
                delay={0.1}
                parts={[
                  { text: "想要这样的" },
                  { text: "作品", className: "text-gradient-neon" },
                  { text: "？" },
                ]}
              />
            </h3>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              从一句灵感到完整的数字体验，NEXUS LAB 帮你实现。上面三个案例，都始于一次对话。
            </p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="mt-8"
            >
              <MagneticButton
                href="#contact"
                className="rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-8 py-3.5 text-sm font-semibold text-white transition-[filter] duration-300 hover:brightness-110 btn-neon"
              >
                聊聊你的项目
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5" />
              </MagneticButton>
            </motion.div>

            <p className="mt-6 text-xs text-muted-foreground/60">
              继续下滑，了解我们的团队与口碑
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Work;
