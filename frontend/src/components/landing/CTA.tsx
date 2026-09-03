import { motion } from "framer-motion";
import { ArrowRight, MessageCircle } from "lucide-react";
import RevealText from "./RevealText";
import MagneticButton from "./MagneticButton";

const CTA = () => {
  return (
    <section id="contact" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }}
          className="border-glow relative overflow-hidden rounded-[2.5rem] p-10 text-center sm:p-16"
        >
          {/* Inner glow */}
          <div className="glow-cyan pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full blur-3xl" />
          <div className="glow-violet pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full blur-3xl" />
          {/* 网格底纹 */}
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.12]" />

          <div className="relative">
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              现在开放合作
            </motion.span>

            <h2 className="mt-6 text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              <span className="block">
                <RevealText
                  delay={0.15}
                  parts={[{ text: "准备好，与我们一起" }]}
                />
              </span>
              <span className="block">
                <RevealText
                  delay={0.35}
                  parts={[
                    {
                      text: "创造下一个奇迹",
                      className: "text-gradient-neon",
                      style: {
                        textShadow:
                          "0 0 48px oklch(0.72 0.18 220 / 0.7), 0 0 80px oklch(0.68 0.20 300 / 0.45)",
                      },
                    },
                  ]}
                />
              </span>
            </h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mx-auto mt-6 max-w-xl text-base text-muted-foreground"
            >
              无论你正处于创意构思还是产品成熟阶段，我们都乐于倾听你的想法，并分享如何帮助你实现。
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.6 }}
              className="mt-10 flex flex-wrap items-center justify-center gap-4"
            >
              <MagneticButton
                href="https://work.weixin.qq.com/ca/cawcde9ef3b67e4d38"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-8 py-4 text-sm font-semibold text-white transition-[filter] duration-300 hover:brightness-110 btn-neon"
              >
                <MessageCircle className="h-4 w-4" />
                预约免费咨询
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </MagneticButton>

              <MagneticButton
                href="#work"
                strength={0.22}
                className="glass rounded-2xl px-8 py-4 text-sm font-semibold text-white transition-colors duration-300 hover:bg-white/10"
              >
                再次看看作品
              </MagneticButton>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTA;
