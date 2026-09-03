import { motion } from "framer-motion";
import { Bot, ArrowRight, MessageSquare, Code2, Music4, Clapperboard, Image } from "lucide-react";
import MagneticButton from "./MagneticButton";

const CHIPS = [
  { icon: MessageSquare, label: "智能对话", tone: "text-cyan-300" },
  { icon: Code2, label: "代码生成", tone: "text-violet-300" },
  { icon: Music4, label: "AI 音乐", tone: "text-fuchsia-300" },
  { icon: Image, label: "AI 绘图", tone: "text-emerald-300" },
  { icon: Clapperboard, label: "图生视频", tone: "text-blue-300" },
];

const AIEntryBanner = () => {
  return (
    <section className="relative overflow-hidden border-b border-white/5 bg-black/30 py-16 sm:py-20">
      {/* 背景光晕 */}
      <div className="glow-violet pointer-events-none absolute left-1/4 top-0 h-[20rem] w-[30rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl" />
      <div className="glow-cyan pointer-events-none absolute bottom-0 right-0 h-[18rem] w-[24rem] rounded-full opacity-30 blur-3xl" />

      <div className="relative mx-auto max-w-5xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-cyan-300 uppercase">
            <Bot className="h-3.5 w-3.5" />
            AI 体验
          </span>

          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            亲自体验一下 <span className="text-gradient-neon">NEXUS AI</span>
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            聊天、写代码、作曲、画图、做视频——不占任何空间，随时点开，随时返回。
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <MagneticButton
              href="/ai"
              className="rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-8 py-3.5 text-sm font-semibold text-white transition-[filter] duration-300 hover:brightness-110 btn-neon"
            >
              <Bot className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
              立即体验 NEXUS AI
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </MagneticButton>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            {CHIPS.map((c, i) => (
              <motion.span
                key={c.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: 0.15 + i * 0.08 }}
                whileHover={{ y: -3 }}
                className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 transition-colors duration-300 hover:border-white/25 hover:bg-white/5"
              >
                <c.icon className={`h-3 w-3 ${c.tone}`} />
                {c.label}
              </motion.span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default AIEntryBanner;
