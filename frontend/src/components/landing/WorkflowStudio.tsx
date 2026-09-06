import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Workflow,
  Send,
  Server,
  Loader2,
  Feather,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { useSettings } from "@/lib/settings";
import { runWorkflow, pushToFeishu } from "@/lib/providers/workflowClient";

/** 快速填入的办公自动化示例 */
const TEMPLATES = [
  "把今天飞书群的要点整理成一份日报",
  "根据本周记录生成周报初稿",
  "把客户问题分类，并起草标准回复",
];

type RunItem = { task: string; result: string; time: string; feishu?: boolean };

/**
 * 自动化办公：把任务发给用户自己部署的技术栈（如 Hermes + 本地模型 + 飞书回传），
 * 实时显示进度与结果，跑完可一键回传飞书。
 */
const WorkflowStudio = () => {
  const { settings } = useSettings();
  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");
  const [pushFeishu, setPushFeishu] = useState(true);
  const [pushState, setPushState] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<RunItem[]>([]);

  const configured = !!settings.workflowUrl;

  const run = async () => {
    if (running || !task.trim()) return;
    setRunning(true);
    setOutput("");
    setStatus("正在把任务发给你的技术栈…");
    setPushState(null);
    let full = "";
    await runWorkflow({
      baseUrl: settings.workflowUrl,
      apiKey: settings.workflowKey,
      task: task.trim(),
      handlers: {
        onToken: (c) => {
          full += c;
          setOutput(full);
        },
        onStatus: (s) => setStatus(s),
        onError: (e) => {
          setStatus(e);
          setRunning(false);
        },
        onDone: (f) => {
          full = f;
          setOutput(full);
          const item: RunItem = {
            task: task.trim(),
            result: full,
            time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
          };
          if (pushFeishu && settings.feishuWebhook) {
            setStatus("任务完成，正在回传飞书…");
            pushToFeishu({
              webhook: settings.feishuWebhook,
              content: `任务：${task.trim()}\n\n结果：\n${full.slice(0, 3000)}`,
            }).then((r) => {
              item.feishu = r.ok;
              setPushState({ ok: r.ok, text: r.text });
              setStatus(r.ok ? "任务完成 · 已回传飞书" : `任务完成 · 飞书回传失败：${r.text}`);
            });
          } else {
            setStatus("任务完成");
          }
          setHistory((h) => [item, ...h].slice(0, 8));
          setRunning(false);
        },
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <header className="shrink-0 px-4 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/20 to-sky-500/20">
            <Workflow className="h-4 w-4 text-amber-300" />
          </span>
          <div>
            <h1 className="text-base font-bold text-white">自动化办公</h1>
            <p className="text-[11px] text-muted-foreground">把任务交给你自己部署的技术栈</p>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6">
        {!configured && (
          <Link
            to="/app/settings"
            className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-3 transition-colors hover:border-amber-500/50"
          >
            <span className="flex items-center gap-2.5">
              <Server className="h-4 w-4 text-amber-400" />
              <span>
                <span className="block text-sm font-medium text-white">还没连接技术栈</span>
                <span className="block text-[11px] text-muted-foreground">去填写你自己的服务地址</span>
              </span>
            </span>
            <Feather className="h-4 w-4 text-white/30" />
          </Link>
        )}

        {/* 任务输入 */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <label className="text-xs font-medium text-white">你要它做什么</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="例如：读取今天飞书群里关于项目 A 的讨论，整理成一份给老板的日报"
            rows={4}
            className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-xs leading-relaxed text-white placeholder:text-white/25 outline-none transition-colors focus:border-amber-500/50"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTask(t)}
                className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] text-white/60 transition-colors hover:border-amber-500/40 hover:text-white"
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* 回传飞书开关 */}
        <button
          type="button"
          onClick={() => setPushFeishu((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition-colors"
        >
          <span className="flex items-center gap-2.5">
            <Feather className="h-4 w-4 text-sky-400" />
            <span className="text-left">
              <span className="block text-sm font-medium text-white">完成后回传飞书</span>
              <span className="block text-[11px] text-muted-foreground">
                {settings.feishuWebhook ? "已配置 · 结果自动推到飞书群" : "未配置 webhook · 去设置页填写"}
              </span>
            </span>
          </span>
          <span
            className={`relative h-5 w-9 rounded-full transition-colors ${
              pushFeishu && settings.feishuWebhook ? "bg-amber-500" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                pushFeishu && settings.feishuWebhook ? "left-4" : "left-0.5"
              }`}
            />
          </span>
        </button>

        {/* 运行按钮 */}
        <button
          type="button"
          onClick={run}
          disabled={running || !task.trim() || !configured}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-sky-500 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {running ? "执行中…" : "运行任务"}
        </button>

        {/* 状态 + 输出 */}
        {status && (
          <div className="flex items-center gap-1.5 text-[11px] text-white/60">
            <Clock className="h-3 w-3" />
            {status}
          </div>
        )}
        {output && (
          <section className="rounded-xl border border-white/10 bg-black/30 p-3.5">
            <label className="text-[11px] text-white/50">结果</label>
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-white/90">{output}</p>
            {pushState && (
              <p
                className={`mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                  pushState.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
                }`}
              >
                {pushState.ok ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                {pushState.text}
              </p>
            )}
          </section>
        )}

        {/* 历史 */}
        {history.length > 0 && (
          <section className="space-y-2">
            <label className="text-[11px] text-white/50">最近运行</label>
            {history.map((h, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/85">{h.task}</span>
                  <span className="shrink-0 text-[10px] text-white/35">{h.time}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-white/55">
                  {h.result || "（无文本输出）"}
                </p>
                {h.feishu && (
                  <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-sky-400">
                    <Feather className="h-3 w-3" /> 已回传飞书
                  </span>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
};

export default WorkflowStudio;
