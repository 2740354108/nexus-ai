import { useEffect, useRef } from "react";
import type { MotionValue } from "framer-motion";

/**
 * 科技感背景（Canvas 实时绘制）：
 *  - 数字雨：绿色 0/1/十六进制代码自上而下流淌（黑客帝国风格）
 *  - 电路板：青色网格走线 + 沿线路奔走的发光数据脉冲 + 节点闪烁
 * 滚动时加速流动，静止时持续缓动。全部为轻量像素绘制，移动端不卡。
 */
const FluidBackground = ({ progress }: { progress: MotionValue<number> }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = window.innerWidth;
    let h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(1, 1400 / Math.max(w, h));

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * scale * dpr);
      canvas.height = Math.floor(h * scale * dpr);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      buildCircuit();
    };

    // ===== 数字雨 =====
    const fontSize = 16;
    let columns = 0;
    let drops: number[] = [];
    const glyphs = "011010110010110100101101001011010010110110010".split("");

    // ===== 电路板 =====
    type Wire = { pts: { x: number; y: number }[]; horiz: boolean };
    let wires: Wire[] = [];
    type Pulse = { wire: number; t: number; speed: number };
    let pulses: Pulse[] = [];
    let nodes: { x: number; y: number; ph: number }[] = [];

    const rng = (seedRef: { s: number }) => {
      seedRef.s = (seedRef.s * 1103515245 + 12345) & 0x7fffffff;
      return seedRef.s / 0x7fffffff;
    };
    const seed = { s: 20260827 };

    const buildCircuit = () => {
      wires = [];
      nodes = [];
      const step = 86;
      const cols = Math.ceil(w / step) + 1;
      const rows = Math.ceil(h / step) + 1;
      // 竖向走线
      for (let i = 0; i < cols; i++) {
        if (rng(seed) > 0.55) {
          const x = i * step + rng(seed) * 18 - 9;
          wires.push({ horiz: false, pts: [{ x, y: 0 }, { x, y: h }] });
        }
      }
      // 横向走线
      for (let j = 0; j < rows; j++) {
        if (rng(seed) > 0.58) {
          const y = j * step + rng(seed) * 18 - 9;
          wires.push({ horiz: true, pts: [{ x: 0, y }, { x: w, y }] });
        }
      }
      // 交叉节点
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (rng(seed) > 0.93) {
            nodes.push({
              x: i * step + rng(seed) * 18 - 9,
              y: j * step + rng(seed) * 18 - 9,
              ph: rng(seed) * Math.PI * 2,
            });
          }
        }
      }
      // 脉冲：挑一部分走线放数据流
      pulses = [];
      const pick = Math.floor(wires.length * 0.35);
      for (let k = 0; k < pick; k++) {
        const idx = Math.floor(rng(seed) * wires.length);
        pulses.push({ wire: idx, t: rng(seed), speed: 0.0025 + rng(seed) * 0.004 });
      }

      columns = Math.floor(w / fontSize);
      drops = new Array(columns).fill(0).map(() => Math.floor(rng(seed) * (h / fontSize)));
    };

    resize();

    let raf = 0;
    let visible = true;
    let frame = 0;

    const draw = () => {
      if (!visible) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const p = progress.get();
      const speedBoost = 1 + p * 2.2;
      frame += reduce ? 0 : 1;

      // 拖尾：近黑暗底，制造余晖
      ctx.fillStyle = "rgba(3,6,12,0.12)";
      ctx.fillRect(0, 0, w, h);

      // --- 电路板走线（极淡）---
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(34,211,238,0.07)";
      ctx.beginPath();
      wires.forEach((wire) => {
        ctx.moveTo(wire.pts[0].x, wire.pts[0].y);
        ctx.lineTo(wire.pts[1].x, wire.pts[1].y);
      });
      ctx.stroke();

      // --- 节点闪烁 ---
      nodes.forEach((n) => {
        const a = 0.25 + Math.sin(frame * 0.05 + n.ph) * 0.22;
        ctx.fillStyle = `rgba(139,92,246,${Math.max(0.05, a)})`;
        ctx.fillRect(n.x - 2, n.y - 2, 4, 4);
      });

      // --- 数据脉冲沿走线奔走 ---
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(34,211,238,0.9)";
      pulses.forEach((pl) => {
        pl.t += pl.speed * speedBoost * (reduce ? 0 : 1);
        if (pl.t > 1) pl.t -= 1;
        const wire = wires[pl.wire];
        if (!wire) return;
        const x = wire.pts[0].x + (wire.pts[1].x - wire.pts[0].x) * pl.t;
        const y = wire.pts[0].y + (wire.pts[1].y - wire.pts[0].y) * pl.t;
        ctx.fillStyle = "rgba(190,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      // --- 数字雨 ---
      ctx.font = `${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textBaseline = "top";
      const fall = reduce ? 0 : 1;
      for (let c = 0; c < columns; c++) {
        const x = c * fontSize;
        const y = drops[c] * fontSize;
        const g = glyphs[Math.floor(Math.random() * glyphs.length)];
        // 头部亮（近白绿）
        ctx.fillStyle = "rgba(200,255,210,0.95)";
        ctx.fillText(g, x, y);
        // 紧随其后的一颗暗绿，增强层次
        ctx.fillStyle = "rgba(34,197,94,0.55)";
        ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], x, y - fontSize);

        drops[c] += fall * speedBoost;
        if (y > h && Math.random() > 0.975) drops[c] = 0;
      }

      raf = requestAnimationFrame(draw);
    };

    draw();

    const onVisibility = () => {
      visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
    };
  }, [progress]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="bg-grid absolute inset-0 opacity-30" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
};

export default FluidBackground;
