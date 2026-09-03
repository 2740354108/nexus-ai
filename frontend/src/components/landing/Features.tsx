import { motion } from "framer-motion";
import {
  Palette,
  Code2,
  Rocket,
  Cpu,
  Globe2,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import SpotlightCard from "./SpotlightCard";
import RevealText from "./RevealText";

const FEATURES = [
  {
    icon: Palette,
    title: "品牌视觉设计",
    desc: "从标志、色彩到视觉语言，构建具有辨识度与生命力的品牌形象。",
    gradient: "from-cyan-400 to-blue-500",
    glow: "group-hover:shadow-cyan-500/30",
    accent: "rgba(34, 211, 238, 0.35)",
    spotlight: "rgba(34, 211, 238, 0.20)",
  },
  {
    icon: Code2,
    title: "前沿界面开发",
    desc: "以 React 与最新技术栈，将设计像素级还原为流畅、可交互的产品。",
    gradient: "from-violet-400 to-purple-500",
    glow: "group-hover:shadow-violet-500/30",
    accent: "rgba(167, 139, 250, 0.35)",
    spotlight: "rgba(167, 139, 250, 0.20)",
  },
  {
    icon: Rocket,
    title: "产品策略与增长",
    desc: "用数据驱动决策，帮助产品从 0 到 1 并实现规模化增长。",
    gradient: "from-fuchsia-400 to-pink-500",
    glow: "group-hover:shadow-fuchsia-500/30",
    accent: "rgba(232, 121, 249, 0.34)",
    spotlight: "rgba(232, 121, 249, 0.18)",
  },
  {
    icon: Cpu,
    title: "人工智能应用",
    desc: "将 AI 能力融入产品体验，创造真正智能化的解决方案。",
    gradient: "from-blue-400 to-cyan-500",
    glow: "group-hover:shadow-blue-500/30",
    accent: "rgba(96, 165, 250, 0.35)",
    spotlight: "rgba(96, 165, 250, 0.20)",
  },
  {
    icon: Globe2,
    title: "全球化数字体验",
    desc: "跨越语言与文化，为全球用户打造无门槛的优质体验。",
    gradient: "from-emerald-400 to-teal-500",
    glow: "group-hover:shadow-emerald-500/30",
    accent: "rgba(52, 211, 153, 0.34)",
    spotlight: "rgba(52, 211, 153, 0.18)",
  },
  {
    icon: ShieldCheck,
    title: "安全与可靠性",
    desc: "以企业级标准保障产品的安全、稳定与性能表现。",
    gradient: "from-amber-400 to-orange-500",
    glow: "group-hover:shadow-amber-500/30",
    accent: "rgba(251, 191, 36, 0.34)",
    spotlight: "rgba(251, 191, 36, 0.18)",
  },
];

const Features = () => {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="glow-violet pointer-events-none absolute right-0 top-20 h-[26rem] w-[26rem] rounded-full opacity-40 blur-3xl" />

      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-sm font-semibold tracking-[0.2em] text-cyan-300 uppercase"
          >
            我们擅长什么
          </motion.span>

          <h2 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            <RevealText
              delay={0.1}
              parts={[
                { text: "全栈能力，" },
                { text: "驱动想象", className: "text-gradient-neon" },
              ]}
            />
          </h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-5 text-base leading-relaxed text-muted-foreground"
          >
            从策略到设计，从技术到增长，我们用一体化能力陪伴你的品牌走向卓越。
          </motion.p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: (i % 3) * 0.12 }}
            >
              <SpotlightCard
                glow={f.spotlight}
                className={`border-glow h-full cursor-default rounded-3xl p-7 transition-shadow duration-300 hover:shadow-2xl ${f.glow}`}
              >
                {/* 序号 */}
                <span className="pointer-events-none absolute right-6 top-5 text-xs font-bold tracking-widest text-white/10">
                  0{i + 1}
                </span>

                {/* 图标 + 悬停光晕 */}
                <div className="relative mb-6 inline-flex">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-3 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(closest-side, ${f.accent}, transparent)`,
                    }}
                  />
                  <div
                    className={`relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${f.gradient} shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6`}
                  >
                    <f.icon className="h-7 w-7 text-white" strokeWidth={2} />
                  </div>
                </div>

                <h3 className="text-xl font-semibold text-white">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>

                <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-white/0 transition-colors duration-300 group-hover:text-cyan-300">
                  了解更多
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5" />
                </span>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
