import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion, useSpring } from "framer-motion";

type SpotlightCardProps = {
  children: ReactNode;
  className?: string;
  /** 跟随鼠标的柔光颜色，建议用 rgba 形式 */
  glow?: string;
  /** 最大倾斜角度（度） */
  tilt?: number;
};

/**
 * 聚光灯卡片：鼠标移入时跟随光斑 + 描边高光 + 轻微 3D 倾斜。
 * 只使用 transform / opacity，走 GPU 合成，不触发重排，避免闪烁。
 */
const SpotlightCard = ({
  children,
  className = "",
  glow = "rgba(34, 211, 238, 0.20)",
  tilt = 7,
}: SpotlightCardProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const reduce = useReducedMotion();

  const rotateX = useSpring(0, { stiffness: 210, damping: 20, mass: 0.6 });
  const rotateY = useSpring(0, { stiffness: 210, damping: 20, mass: 0.6 });

  useEffect(() => {
    if (!active) {
      rotateX.set(0);
      rotateY.set(0);
    }
  }, [active, rotateX, rotateY]);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || reduce) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    el.style.setProperty("--mx", `${(px * 100).toFixed(2)}%`);
    el.style.setProperty("--my", `${(py * 100).toFixed(2)}%`);
    rotateY.set((px - 0.5) * tilt * 2);
    rotateX.set((0.5 - py) * tilt * 2);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1000,
        willChange: "transform",
      }}
      className={`group relative ${className}`}
    >
      {/* 跟随鼠标的柔光 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background: `radial-gradient(360px circle at var(--mx, 50%) var(--my, 50%), ${glow}, transparent 62%)`,
        }}
      />

      {/* 跟随鼠标的描边高光（用 mask 只保留 1px 边框） */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] p-px transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background: `radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.5), transparent 60%)`,
          WebkitMask:
            "linear-gradient(#000,#000) content-box, linear-gradient(#000,#000)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#000,#000) content-box, linear-gradient(#000,#000)",
          maskComposite: "exclude",
        }}
      />

      <div className="relative">{children}</div>
    </motion.div>
  );
};

export default SpotlightCard;
