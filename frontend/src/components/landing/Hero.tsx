import { useRef } from "react";
import { motion, useScroll } from "framer-motion";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import FluidBackground from "./FluidBackground";
import Logo3D from "./Logo3D";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const Hero = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  // 全局滚动进度用于微调流体速度/方向
  const { scrollYProgress } = useScroll();

  return (
    <section id="top" ref={sectionRef} className="relative flex min-h-screen flex-col items-center justify-start overflow-hidden bg-background pt-24 pb-16 sm:flex-row sm:items-center sm:justify-center sm:pt-24 sm:pb-0">
      {/* 科技流体背景：持续流动 + 滚动微调 */}
      <FluidBackground progress={scrollYProgress} />

      {/* 3D 可交互公司 Logo */}
      <div className="relative z-10 w-full max-w-5xl px-6 pt-4 sm:w-1/2 sm:max-w-2xl sm:pt-8">
        <Logo3D />
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 w-full max-w-5xl px-6 text-center sm:w-1/2 sm:max-w-2xl"
      >
        {/* Badge */}
        <motion.div variants={item} className="mb-8 flex justify-center">
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
            新一代数字体验工作室
            <span className="ml-1 rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
              2026
            </span>
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={item}
          className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl"
        >
          <span className="text-gradient-white">用科技，塑造</span>
          <br />
          <span className="text-gradient-neon text-glow animate-shimmer">非凡的数字体验</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={item}
          className="mx-auto mt-7 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          NEXUS LAB 是一支专注于品牌体验、界面设计与前沿技术融合的创意团队。
          我们为敢于想象的品牌，构建打动人心的数字产品。
        </motion.p>

        {/* CTAs */}
        <motion.div variants={item} className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#work"
            className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-7 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 btn-neon"
          >
            查看作品
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="#features"
            className="glass inline-flex items-center gap-2 rounded-2xl px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
              <Play className="h-3 w-3 fill-current" />
            </span>
            了解我们
          </a>
        </motion.div>

        {/* Trust hint */}
        <motion.p variants={item} className="mt-12 text-xs tracking-widest text-muted-foreground/60 uppercase">
          已为 120+ 品牌打造数字体验
        </motion.p>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 1 }}
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
      >
        <div className="flex h-9 w-6 items-start justify-center rounded-full border border-white/20 p-1.5">
          <motion.span
            animate={{ y: [0, 12, 0], opacity: [1, 0, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="h-2 w-1 rounded-full bg-cyan-300"
          />
        </div>
      </motion.div>
    </section>
  );
};

export default Hero;
