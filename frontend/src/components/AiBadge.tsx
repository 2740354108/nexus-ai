import { Sparkles } from "lucide-react";

export function AiBadge({ label = "AI 生成", className = "" }: { label?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-cyan-200 ring-1 ring-cyan-400/30 backdrop-blur-sm ${className}`}
    >
      <Sparkles className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
