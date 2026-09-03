import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

const STATS = [
  { value: 120, suffix: "+", label: "服务品牌", accent: "rgba(34, 211, 238, 0.28)" },
  { value: 98, suffix: "%", label: "客户满意度", accent: "rgba(167, 139, 250, 0.28)" },
  { value: 15, suffix: "年", label: "行业经验", accent: "rgba(96, 165, 250, 0.28)" },
  { value: 40, suffix: "+", label: "行业奖项", accent: "rgba(52, 211, 153, 0.28)" },
];

const Counter = ({ value, suffix }: { value: number; suffix: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const duration = 1600;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  return (
    <span ref={ref} className="text-gradient-neon text-5xl font-extrabold sm:text-6xl">
      {display}
      {suffix}
    </span>
  );
};

const Stats = () => {
  return (
    <section
      id="stats"
      className="relative overflow-hidden border-y border-white/5 bg-black/20 py-20"
    >
      <div className="glow-blue pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 gap-10 text-center lg:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="group relative flex flex-col items-center"
            >
              {/* 悬停时数字背后的柔光 */}
              <span
                aria-hidden
                className="pointer-events-none absolute -top-8 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{
                  background: `radial-gradient(closest-side, ${s.accent}, transparent)`,
                }}
              />

              <Counter value={s.value} suffix={s.suffix} />

              {/* 下划线：进入视口时展开 */}
              <motion.span
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.4 + i * 0.1, ease: [0.16, 1, 0.3, 1] as const }}
                className="mt-4 block h-px w-16 origin-left bg-gradient-to-r from-cyan-400/70 to-transparent"
              />

              <span className="mt-3 text-sm font-medium tracking-wide text-muted-foreground transition-colors duration-300 group-hover:text-white/80">
                {s.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
