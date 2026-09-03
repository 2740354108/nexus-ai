const BRANDS = [
  "AURORA", "VOLTRA", "HELIX", "NOVA", "ORBITAL",
  "PULSE", "STELLAR", "KAIROS", "ATLAS", "VECTOR",
];

const MASK =
  "[mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]";

/** 单行跑马灯：direction 控制左右方向，dim 控制是否为次要行 */
const Row = ({
  items,
  direction = "left",
  dim = false,
}: {
  items: string[];
  direction?: "left" | "right";
  dim?: boolean;
}) => (
  <div className={`relative overflow-hidden ${MASK}`}>
    <div
      className={`flex w-max gap-14 hover:[animation-play-state:paused] ${
        direction === "left" ? "animate-marquee" : "animate-marquee-reverse"
      }`}
    >
      {[...items, ...items].map((brand, i) => (
        <span
          key={i}
          className={`whitespace-nowrap font-bold tracking-widest transition-colors duration-300 ${
            dim
              ? "text-lg text-white/10 hover:text-white/50"
              : "text-2xl text-white/25 hover:text-white/80"
          }`}
        >
          {brand}
        </span>
      ))}
    </div>
  </div>
);

const LogoMarquee = () => {
  return (
    <section className="relative overflow-hidden border-y border-white/5 bg-black/20 py-12">
      {/* 两侧柔光，避免整段过于死板 */}
      <div className="glow-cyan pointer-events-none absolute -left-20 top-1/2 h-40 w-72 -translate-y-1/2 rounded-full opacity-20 blur-3xl" />
      <div className="glow-violet pointer-events-none absolute -right-20 top-1/2 h-40 w-72 -translate-y-1/2 rounded-full opacity-20 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6">
        <p className="mb-8 text-center text-xs font-medium tracking-[0.25em] text-muted-foreground/70 uppercase">
          与我们一起创造未来的品牌
        </p>

        <div className="space-y-4">
          <Row items={BRANDS} direction="left" />
          <Row items={[...BRANDS].reverse()} direction="right" dim />
        </div>
      </div>
    </section>
  );
};

export default LogoMarquee;
