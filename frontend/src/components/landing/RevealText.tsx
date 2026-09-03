import type { CSSProperties } from "react";
import { motion } from "framer-motion";

export type RevealPart = {
  text: string;
  /** 该段文字额外的类名，例如渐变色 */
  className?: string;
  /** 该段文字额外的行内样式 */
  style?: CSSProperties;
};

type RevealTextProps = {
  /** 按视觉顺序排列的文字分段，支持给某一段单独上渐变色 */
  parts: RevealPart[];
  className?: string;
  /** 起始延迟（秒） */
  delay?: number;
  /** 每个字之间的间隔（秒） */
  stagger?: number;
};

/**
 * 逐字揭示标题：每个字从下方遮罩里推出，配合渐变扫描。
 * 中文没有空格，因此按「字」而不是按词切分。
 */
const RevealText = ({
  parts,
  className = "",
  delay = 0,
  stagger = 0.035,
}: RevealTextProps) => {
  let cursor = 0;

  return (
    <span className={className}>
      {parts.map((part, pi) =>
        Array.from(part.text).map((ch, ci) => {
          const i = cursor++;
          return (
            <span
              key={`${pi}-${ci}`}
              className="inline-block overflow-hidden pb-[0.14em] -mb-[0.14em] align-bottom"
            >
              <motion.span
                className={`inline-block ${part.className ?? ""}`}
                initial={{ y: "110%", opacity: 0 }}
                whileInView={{ y: "0%", opacity: 1 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{
                  duration: 0.55,
                  delay: delay + i * stagger,
                  ease: [0.16, 1, 0.3, 1] as const,
                }}
              >
                {ch === " " ? "\u00A0" : ch}
              </motion.span>
            </span>
          );
        })
      )}
    </span>
  );
};

export default RevealText;
