import { useEffect, useRef, useState, type ReactNode } from "react";
import { AiBadge } from "../AiBadge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Send,
  Code2,
  MessageSquare,
  Copy,
  Check,
  Sparkles,
  Loader2,
  User,
  Layers,
} from "lucide-react";
import CodeRunner from "./CodeRunner";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const LANGS = ["TypeScript", "React", "Python", "Java", "Go", "SQL", "HTML/CSS"];

const SUGGESTIONS = [
  "你们 NEXUS LAB 能做哪些事？",
  "用大白话解释一下什么是大语言模型",
  "帮我写一个网站需要准备什么？",
];

/* ---------- 轻量 Markdown 渲染（代码块 + 粗体 + 行内代码） ---------- */

const copyText = async (t: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
};

const CodeBlock = ({ lang, code }: { lang: string; code: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a14]">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="text-[11px] font-medium tracking-wide text-cyan-300/80">{lang}</span>
        <div className="flex items-center gap-1.5">
          <CodeRunner code={code} lang={lang} />
          <button
            onClick={async () => {
              const ok = await copyText(code);
              if (ok) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-white/90">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const renderInline = (text: string): ReactNode[] => {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <code
          key={key++}
          className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-cyan-200"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
};

const TextBody = ({ text }: { text: string }) => {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) =>
        line.trim() === "" ? (
          <div key={i} className="h-1.5" />
        ) : (
          <p key={i} className="leading-relaxed text-white/85">
            {renderInline(line)}
          </p>
        ),
      )}
    </div>
  );
};

const extractCodeBlocks = (
  content: string,
): Array<{ lang: string; code: string }> => {
  const blocks: Array<{ lang: string; code: string }> = [];
  const regex = /```(\w*)\n?([\s\S]*?)(?:```|$)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content))) {
    blocks.push({ lang: m[1] || "code", code: m[2] });
  }
  return blocks;
};

const isRunnableLang = (lang: string) => {
  const l = lang.toLowerCase();
  const runnables = [
    "html",
    "css",
    "js",
    "javascript",
    "ts",
    "typescript",
    "jsx",
    "tsx",
    "react",
    "html/css",
  ];
  return runnables.includes(l);
};

const MarkdownView = ({ content }: { content: string }) => {
  const segments: Array<
    { type: "text"; text: string } | { type: "code"; lang: string; code: string }
  > = [];
  const regex = /```(\w*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content))) {
    if (m.index > last) segments.push({ type: "text", text: content.slice(last, m.index) });
    segments.push({ type: "code", lang: m[1] || "code", code: m[2] });
    last = regex.lastIndex;
  }
  if (last < content.length) segments.push({ type: "text", text: content.slice(last) });

  return (
    <div>
      {segments.map((seg, i) =>
        seg.type === "code" ? (
          <CodeBlock key={i} lang={seg.lang} code={seg.code} />
        ) : (
          seg.text.trim() && <TextBody key={i} text={seg.text} />
        ),
      )}
    </div>
  );
};

/* ---------- 主组件 ---------- */

const AIStudio = ({ embedded = false, defaultMode = "chat" }: { embedded?: boolean; defaultMode?: "chat" | "code" }) => {
  const [tab, setTab] = useState<"chat" | "code">(defaultMode);
  const [configured, setConfigured] = useState<boolean | null>(null);

  // 对话状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");

  // 代码状态
  const [lang, setLang] = useState("TypeScript");
  const [codeInput, setCodeInput] = useState("");
  const [codeResult, setCodeResult] = useState("");
  const [coding, setCoding] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setConfigured(!!d.configured))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, sending]);

  /** 流式调用 AI：消费 SSE，逐字回调 token */
  const streamAI = (
    mode: "chat" | "code",
    msgs: ChatMessage[],
    handlers: {
      onToken: (t: string) => void;
      onModel?: (m: string) => void;
      onError: (e: string) => void;
    },
  ) => {
    const onToken = handlers.onToken;
    const onModel = handlers.onModel;
    const onError = handlers.onError;

    return (async () => {
      let resp: globalThis.Response;
      try {
        resp = await fetch("/api/ai/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, messages: msgs }),
        });
      } catch (e: any) {
        onError("网络异常，请稍后重试");
        return;
      }
      if (!resp.ok || !resp.body) {
        let msg = "请求失败，请稍后重试";
        try {
          const d = await resp.json();
          msg = d.error || msg;
        } catch {
          /* ignore */
        }
        onError(msg);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let event = "";
      let data = "";

      const dispatch = () => {
        if (!event) return;
        try {
          if (event === "token") {
            const parsed = JSON.parse(data);
            if (typeof parsed.token === "string") onToken(parsed.token);
          } else if (event === "model") onModel?.(JSON.parse(data).model);
          else if (event === "error") onError(JSON.parse(data).error);
        } catch {
          /* ignore malformed */
        }
        event = "";
        data = "";
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
          else if (line.trim() === "") dispatch();
        }
      }
      dispatch();
    })();
  };

  const sendChat = async (override?: string) => {
    const text = (override ?? chatInput).trim();
    if (!text || sending) return;
    setChatError("");
    setSending(true);
    setChatInput("");

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    // 先放一条空的助手消息占位，随后逐字填充
    setMessages([...next, { role: "assistant", content: "" }]);
    const assistantIndex = next.length;

    await streamAI("chat", next.slice(-12), {
      onToken: (t) => {
        setMessages((prev) => {
          const copy = [...prev];
          const cur = copy[assistantIndex]?.content ?? "";
          copy[assistantIndex] = { role: "assistant", content: cur + t };
          return copy;
        });
      },
      onError: (e) => setChatError(e),
    });
    setSending(false);
  };

  const generateCode = async () => {
    if (!codeInput.trim() || coding) return;
    setCodeError("");
    setCodeResult("");
    setCoding(true);
    await streamAI("code", [
      { role: "user", content: `编程语言/技术栈：${lang}\n\n需求：${codeInput.trim()}` },
    ], {
      onToken: (t) => setCodeResult((prev) => prev + t),
      onError: (e) => setCodeError(e),
    });
    setCoding(false);
  };

  return (
    <section
      id="ai-studio"
      className={`relative overflow-hidden border-y border-white/5 bg-black/20 ${embedded ? "py-6" : "py-24 sm:py-32"}`}
    >
      {/* 背景光晕 */}
      <div className="glow-cyan absolute -left-24 top-10 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-30" />
      <div className="glow-violet absolute -right-20 bottom-10 h-[26rem] w-[26rem] rounded-full blur-3xl opacity-30" />

      <div className="relative mx-auto max-w-5xl px-6">
        {/* 标题（嵌入模式隐藏，由套件页提供标签） */}
        {!embedded && (
        <div className="mx-auto max-w-2xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-cyan-300 uppercase"
          >
            <Bot className="h-3.5 w-3.5" />
            AI 智能体
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl"
          >
            会聊天，更会<span className="text-gradient-neon">写代码</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-5 text-base leading-relaxed text-muted-foreground"
          >
            基于大模型的智能助手，随时为你答疑解惑，把你描述的需求直接变成可运行的代码。
          </motion.p>
        </div>
        )}

        {/* 未配置提示 */}
        {configured === false && (
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-5 py-4 text-center text-sm text-cyan-200/90">
            <Sparkles className="mr-2 inline h-4 w-4" />
            AI 引擎接入中——配置好 API Key 后即可启用，敬请期待
          </div>
        )}

        {/* 主体卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className={`border-glow rounded-3xl p-6 sm:p-8 ${embedded ? "mt-0" : "mt-12"}`}
        >
          {/* 标签切换（嵌入模式隐藏，由套件页提供） */}
          {!embedded && (
          <div className="mx-auto flex w-fit rounded-full border border-white/10 bg-black/30 p-1">
            <button
              onClick={() => setTab("chat")}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all ${
                tab === "chat"
                  ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-white shadow-lg shadow-cyan-500/20"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              智能对话
            </button>
            <button
              onClick={() => setTab("code")}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all ${
                tab === "code"
                  ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-white shadow-lg shadow-cyan-500/20"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              <Code2 className="h-4 w-4" />
              代码生成
            </button>
          </div>
          )}

          <AnimatePresence mode="wait">
            {tab === "chat" ? (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className={embedded ? "" : "mt-6"}
              >
                {/* 消息列表 */}
                <div className="flex h-[380px] flex-col gap-4 overflow-y-auto rounded-2xl border border-white/5 bg-black/30 p-4 sm:p-5">
                  {messages.length === 0 && !sending && (
                    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20">
                        <Bot className="h-8 w-8 text-cyan-300" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        有什么想问的？选一个开始，或直接输入
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {SUGGESTIONS.map((s) => (
                          <button
                            key={s}
                            onClick={() => sendChat(s)}
                            className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs text-white/80 transition-colors hover:border-cyan-400/40 hover:text-white"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          msg.role === "user"
                            ? "bg-white/10"
                            : "bg-gradient-to-br from-cyan-400/30 to-violet-500/30"
                        }`}
                      >
                        {msg.role === "user" ? (
                          <User className="h-4 w-4 text-white/70" />
                        ) : (
                          <Bot className="h-4 w-4 text-cyan-300" />
                        )}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                          msg.role === "user"
                            ? "rounded-tr-sm bg-gradient-to-r from-cyan-500/80 to-violet-500/80 text-white"
                            : "rounded-tl-sm border border-white/10 bg-black/40"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          msg.content ? (
                            <div>
                              <MarkdownView content={msg.content} />
                              <div className="mt-1.5 flex justify-end">
                                <AiBadge label="NEXUS AI 生成" />
                              </div>
                            </div>
                          ) : (
                            <span className="flex items-center gap-1.5 py-1">
                              {[0, 1, 2].map((d) => (
                                <span
                                  key={d}
                                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300/80"
                                  style={{ animationDelay: `${d * 150}ms` }}
                                />
                              ))}
                            </span>
                          )
                        ) : (
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  <div ref={chatEndRef} />
                </div>

                {chatError && (
                  <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
                    {chatError}
                  </p>
                )}

                {/* 输入区 */}
                <div className="mt-4 flex items-end gap-3">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChat();
                      }
                    }}
                    placeholder="输入你的问题，Enter 发送，Shift+Enter 换行"
                    rows={2}
                    className="flex-1 resize-none rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                    disabled={sending}
                  />
                  <button
                    onClick={() => sendChat()}
                    disabled={sending || !chatInput.trim()}
                    className="group inline-flex h-[52px] items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 btn-neon"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    )}
                    发送
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="code"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className={embedded ? "" : "mt-6"}
              >
                {/* 语言选择 */}
                <div className="flex flex-wrap gap-2">
                  {LANGS.map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                        lang === l
                          ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-white shadow-lg shadow-cyan-500/20"
                          : "border border-white/10 bg-black/30 text-muted-foreground hover:border-cyan-400/40 hover:text-white"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                {/* 需求输入 */}
                <textarea
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="描述你的需求，例如：写一个防抖函数 / 用 Python 批量重命名文件夹里的图片 / 一个带分页的 SQL 查询"
                  rows={3}
                  className="mt-4 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white placeholder:text-muted-foreground/60 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                  disabled={coding}
                />

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={generateCode}
                    disabled={coding || !codeInput.trim()}
                    className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-7 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 btn-neon"
                  >
                    {coding ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        生成代码
                      </>
                    )}
                  </button>
                </div>

                {codeError && (
                  <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
                    {codeError}
                  </p>
                )}

                {/* 生成结果 */}
                <AnimatePresence>
                  {codeResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300">
                            <Code2 className="h-3.5 w-3.5" />
                            AI 生成结果 · {lang}
                          </span>
                          <AiBadge label="NEXUS AI 生成" />
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const merged = extractCodeBlocks(codeResult)
                              .filter((b) => isRunnableLang(b.lang))
                              .map((b) => b.code)
                              .join("\n\n");
                            return merged ? (
                              <CodeRunner code={merged} lang={lang}>
                                <Layers className="h-3 w-3" />
                                合并运行
                              </CodeRunner>
                            ) : null;
                          })()}
                          <button
                            onClick={async () => {
                              const ok = await copyText(codeResult);
                              if (ok) {
                                setCopiedAll(true);
                                setTimeout(() => setCopiedAll(false), 1600);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
                          >
                            {copiedAll ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                已复制
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                复制全部
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      <MarkdownView content={codeResult} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="mt-8 text-center text-xs text-muted-foreground/60">
          由大语言模型驱动 · 支持多轮对话与上下文理解 · 回答仅供参考
        </p>
      </div>
    </section>
  );
};

export default AIStudio;
