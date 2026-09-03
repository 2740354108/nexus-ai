import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

/**
 * 可交互的 3D 立体 Logo。
 * - 鼠标/手指拖拽即可旋转
 * - 空闲时缓慢自转
 * - 多层文字叠加制造厚度
 */
const Logo3D = () => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const rawX = useMotionValue(8);
  const rawY = useMotionValue(-12);
  const rotX = useSpring(rawX, { stiffness: 90, damping: 18 });
  const rotY = useSpring(rawY, { stiffness: 90, damping: 18 });

  // 光泽层随旋转轻微反向移动，增强立体感
  const sheenX = useTransform(rotY, (v) => `${50 + v * 0.6}%`);
  const sheenY = useTransform(rotX, (v) => `${50 - v * 0.6}%`);

  const handlePan = (_: unknown, info: { delta: { x: number; y: number } }) => {
    const nextY = rotY.get() + info.delta.x * 0.45;
    const nextX = Math.max(-45, Math.min(45, rotX.get() - info.delta.y * 0.45));
    rawY.set(nextY);
    rawX.set(nextX);
  };

  const handlePanEnd = () => setDragging(false);

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto mb-6 cursor-grab select-none active:cursor-grabbing sm:mb-8"
      style={{ perspective: "900px" }}
    >
      <motion.div
        className="relative"
        style={{
          transformStyle: "preserve-3d",
          rotateX: rotX,
          rotateY: rotY,
        }}
        onPanStart={() => setDragging(true)}
        onPan={handlePan}
        onPanEnd={handlePanEnd}
        animate={
          dragging
            ? undefined
            : {
                rotateY: [null, 360],
              }
        }
        transition={
          dragging
            ? undefined
            : {
                rotateY: { duration: 28, repeat: Infinity, ease: "linear" },
              }
        }
        drag={false}
      >
        {/* 3D 厚度层：NEXUS（实心挤出，正面亮、侧身青→紫） */}
        <div className="relative text-center">
          {Array.from({ length: 18 }).map((_, i) => {
            const isFront = i === 0;
            const mid = Math.ceil(18 / 2);
            const sideColor =
              i === 0
                ? "bg-gradient-to-br from-white via-cyan-200 to-violet-300 bg-clip-text text-transparent"
                : i < mid
                  ? "text-cyan-400"
                  : "text-violet-500";
            return (
              <span
                key={`nex-${i}`}
                aria-hidden={!isFront}
                className={`absolute inset-0 block text-5xl font-black tracking-tighter sm:text-7xl lg:text-9xl ${sideColor}`}
                style={{
                  transform: `translateZ(${-i * 3}px)`,
                  opacity: isFront ? 1 : 0.92,
                  textShadow:
                    i === 0
                      ? "0 0 38px rgba(34,211,238,0.5), 0 0 80px rgba(139,92,246,0.3)"
                      : "none",
                }}
              >
                NEXUS
              </span>
            );
          })}
          <span className="invisible block text-5xl font-black tracking-tighter sm:text-7xl lg:text-9xl">
            NEXUS
          </span>
        </div>

        {/* 3D 厚度层：LAB */}
        <div className="relative -mt-2 text-center sm:-mt-4">
          {Array.from({ length: 14 }).map((_, i) => {
            const isFront = i === 0;
            const mid = Math.ceil(14 / 2);
            const sideColor =
              i === 0
                ? "bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent"
                : i < mid
                  ? "text-cyan-300"
                  : "text-violet-400";
            return (
              <span
                key={`lab-${i}`}
                aria-hidden={!isFront}
                className={`absolute inset-0 block text-xl font-bold tracking-[0.2em] sm:tracking-[0.35em] sm:text-4xl lg:text-5xl ${sideColor}`}
                style={{
                  transform: `translateZ(${-i * 2.4}px)`,
                  opacity: isFront ? 1 : 0.92,
                  textShadow:
                    i === 0
                      ? "0 0 22px rgba(139,92,246,0.4), 0 0 44px rgba(34,211,238,0.25)"
                      : "none",
                }}
              >
                LAB
              </span>
            );
          })}
          <span className="invisible block text-xl font-bold tracking-[0.2em] sm:tracking-[0.35em] sm:text-4xl lg:text-5xl">
            LAB
          </span>
        </div>

        {/* 玻璃底板（带厚度与倒角，增强立体基座感） */}
        <div
          className="absolute inset-0 -z-10 rounded-3xl border border-white/15 bg-white/10 backdrop-blur-md"
          style={{
            transform: "translateZ(-26px) scale(1.08, 1.18)",
            boxShadow:
              "0 40px 90px -24px rgba(0,0,0,0.7), 0 8px 24px -8px rgba(124,58,237,0.35), inset 0 4px 0 rgba(255,255,255,0.18)",
          }}
        />

        {/* 光泽扫光层 */}
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-3xl opacity-40"
          style={{
            background: `radial-gradient(circle at ${sheenX.get()} ${sheenY.get()}, rgba(255,255,255,0.22), transparent 45%)`,
            transform: "translateZ(2px)",
          }}
        />
      </motion.div>

      {/* 拖拽提示 */}
      <p className="mt-4 text-center text-[10px] tracking-widest text-white/30 uppercase">
        拖拽旋转
      </p>
    </div>
  );
};

export default Logo3D;
