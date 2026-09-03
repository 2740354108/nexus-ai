import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import SpotlightCard from "./SpotlightCard";
import RevealText from "./RevealText";

const TESTIMONIALS = [
  {
    quote:
      "NEXUS LAB 团队的专业度和执行力令人惊叹，他们真正理解我们的品牌，并把它带到了全新的高度。",
    name: "高维",
    role: "Aurora 联合创始人",
    initial: "高",
    gradient: "from-cyan-400 to-blue-500",
    spotlight: "rgba(34, 211, 238, 0.20)",
  },
  {
    quote:
      "从产品策略到上线交付，整个过程透明高效。数据增长远超我们的预期，是一次非常愉快的合作。",
    name: "高维",
    role: "Helix 产品总监",
    initial: "高",
    gradient: "from-violet-400 to-purple-500",
    spotlight: "rgba(167, 139, 250, 0.20)",
  },
  {
    quote:
      "他们把复杂的技术需求，变成了优雅流畅的用户体验。是我们合作过的最具创意和技术实力的团队。",
    name: "高维",
    role: "Orbital CEO",
    initial: "高",
    gradient: "from-fuchsia-400 to-pink-500",
    spotlight: "rgba(232, 121, 249, 0.18)",
  },
];

const Testimonials = () => {
  return (
    <section id="testimonials" className="relative py-24 sm:py-32">
      <div className="glow-violet pointer-events-none absolute left-1/2 top-0 h-[20rem] w-[36rem] -translate-x-1/2 rounded-full opacity-30 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-sm font-semibold tracking-[0.2em] text-cyan-300 uppercase"
          >
            客户之声
          </motion.span>
          <h2 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            <RevealText
              delay={0.1}
              parts={[
                { text: "他们选择" },
                { text: "与我们同行", className: "text-gradient-neon" },
              ]}
            />
          </h2>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={`${t.name}-${i}`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.12 }}
            >
              <SpotlightCard
                glow={t.spotlight}
                className="border-glow h-full rounded-3xl p-7"
              >
                <Quote className="mb-5 h-8 w-8 text-cyan-400/50 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:text-cyan-300" />
                <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                  “{t.quote}”
                </p>

                {/* 分隔线：悬停时展开 */}
                <span className="mt-6 block h-px w-10 bg-gradient-to-r from-cyan-400/60 to-transparent transition-all duration-500 group-hover:w-full" />

                <div className="mt-6 flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${t.gradient} text-base font-semibold text-white transition-transform duration-300 group-hover:scale-110`}
                  >
                    {t.initial}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
