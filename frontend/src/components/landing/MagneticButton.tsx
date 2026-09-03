import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useSpring } from "framer-motion";

type MagneticButtonProps = {
  children: ReactNode;
  className?: string;
  href?: string;
  target?: string;
  rel?: string;
  /** 吸附强度：0 为不动，0.35 为轻微跟手 */
  strength?: number;
  onClick?: () => void;
};

/**
 * 磁性按钮：鼠标靠近时按钮轻微跟随光标位移，悬停时有一道掠光扫过。
 * 仅使用 transform，不触发重排。
 */
const MagneticButton = ({
  children,
  className = "",
  href = "#contact",
  target,
  rel,
  strength = 0.32,
  onClick,
}: MagneticButtonProps) => {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduce = useReducedMotion();

  const x = useSpring(0, { stiffness: 200, damping: 18, mass: 0.5 });
  const y = useSpring(0, { stiffness: 200, damping: 18, mass: 0.5 });

  const handleMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el || reduce) return;
    const rect = el.getBoundingClientRect();
    x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
    y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.a
      ref={ref}
      href={href}
      target={target}
      rel={rel}
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      style={{ x, y }}
      className={`group relative inline-flex items-center overflow-hidden ${className}`}
    >
      {/* 掠光 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
      />
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </motion.a>
  );
};

export default MagneticButton;
