import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, HelpCircle, Mail, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

type QA = { q: string; a: string };

const CATEGORIES: { id: string; label: string; faqs: QA[] }[] = [
  {
    id: "basics",
    label: "基础使用",
    faqs: [
      {
        q: "NEXUS LAB 是什么？",
        a: "NEXUS LAB 是一个集品牌设计、界面开发、产品策略与 AI 创作能力于一体的数字体验平台。在「AI 专区」中，你可以与 AI 对话、生成代码、创作音乐、绘制图片以及将图片转为视频，无需切换多个工具。",
      },
      {
        q: "如何进入 AI 专区？",
        a: "在官网首页点击「进入 AI 专区」按钮即可。首次进入会有一个简短的开场动画，随后即可使用全部 AI 工具。",
      },
      {
        q: "使用这些功能需要付费吗？",
        a: "目前网站集成的 AI 能力（包括文生图、文生视频、全能参考等）均接入免费开放的接口，你可以免费体验。部分高级或高分辨率需求可能会受第三方接口限流影响。",
      },
    ],
  },
  {
    id: "ai-tools",
    label: "AI 创作工具",
    faqs: [
      {
        q: "生成的内容可以商用吗？",
        a: "你使用本平台生成的内容，其权利归属以对应产品的说明为准。在用于商业用途前，请确认所使用的底层模型授权范围，并遵守「服务条款」中的相关内容。",
      },
      {
        q: "为什么图片生成需要一段时间？",
        a: "AI 绘图需要服务器进行计算，通常几秒内返回。若同时请求过多或第三方接口繁忙，可能会出现排队，请稍作等待或稍后重试。",
      },
      {
        q: "图生视频 / 文生视频为什么比图片慢？",
        a: "视频生成属于异步任务，平台会在后台持续生成，并在完成后自动显示结果。生成时长取决于视频长度和分辨率，请保持页面打开直到状态变为「已完成」。",
      },
      {
        q: "AI 生成的代码能直接运行吗？",
        a: "可以。在「代码生成」中，生成结果带有「运行」按钮，支持 HTML、JavaScript、React/JSX 等代码的实时预览。对于 AI 拆分的多段代码，可使用「合并运行」一次性执行。",
      },
    ],
  },
  {
    id: "account",
    label: "账户与隐私",
    faqs: [
      {
        q: "我的数据会被如何使用？",
        a: "我们仅将你的信息用于提供与改进服务。详细的收集、使用与保护措施请参阅「隐私政策」。",
      },
      {
        q: "如何删除我的数据或注销账户？",
        a: "你有权访问、更正、删除个人信息或注销账户。如需处理，请通过页面底部的联系邮箱与我们联系。",
      },
    ],
  },
];

const HelpCenter = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const toggle = (key: string) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/30">
              <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-base font-bold tracking-tight text-white">
              NEXUS<span className="text-gradient-neon ml-1">LAB</span>
            </span>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5 text-muted-foreground hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
        </div>
      </header>

      <main className="pt-28 pb-24">
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-12 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <HelpCircle className="h-7 w-7" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              帮助中心
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              常见问题与解答 · 更新于 2026 年 9 月 2 日
            </p>
          </div>

          <div className="space-y-12">
            {CATEGORIES.map((cat) => (
              <section key={cat.id} className="scroll-mt-28">
                <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-white">
                  {cat.label}
                </h2>
                <div className="space-y-3">
                  {cat.faqs.map((item, idx) => {
                    const key = `${cat.id}-${idx}`;
                    const isOpen = !!open[key];
                    return (
                      <div
                        key={key}
                        className="overflow-hidden rounded-xl border border-white/5 bg-card/40"
                      >
                        <button
                          onClick={() => toggle(key)}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/5"
                        >
                          <span className="text-sm font-medium text-white">{item.q}</span>
                          <span
                            className={`ml-2 shrink-0 text-cyan-400 transition-transform ${isOpen ? "rotate-45" : ""}`}
                          >
                            +
                          </span>
                        </button>
                        {isOpen && (
                          <div className="border-t border-white/5 px-5 py-4">
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {item.a}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-12 rounded-2xl border border-cyan-500/15 bg-cyan-500/5 p-6 text-center sm:p-8">
            <p className="text-sm text-muted-foreground">没有找到你的问题？</p>
            <a
              href="mailto:2740354108@qq.com"
              className="mt-3 inline-flex items-center gap-2 text-base font-semibold text-cyan-300 transition-colors hover:text-cyan-200"
            >
              <Mail className="h-4 w-4" />
              2740354108@qq.com
            </a>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 text-sm text-muted-foreground sm:flex-row">
            <p>© 2026 NEXUS LAB. 保留所有权利。</p>
            <div className="flex items-center gap-6">
              <Link to="/privacy" className="transition-colors hover:text-white">
                隐私政策
              </Link>
              <Link to="/terms" className="transition-colors hover:text-white">
                服务条款
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default HelpCenter;
