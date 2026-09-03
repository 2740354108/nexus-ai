import { Link } from "react-router-dom";
import { Zap } from "lucide-react";

const COLUMNS = [
  {
    title: "服务",
    links: [
      { label: "品牌设计", to: null },
      { label: "界面开发", to: null },
      { label: "产品策略", to: null },
      { label: "AI 应用", to: null },
      { label: "增长优化", to: null },
    ],
  },
  {
    title: "公司",
    links: [
      { label: "关于我们", to: null },
      { label: "团队", to: null },
      { label: "招贤纳士", to: null },
      { label: "新闻动态", to: null },
      { label: "联系我们", to: null },
    ],
  },
  {
    title: "资源",
    links: [
      { label: "案例研究", to: null },
      { label: "设计博客", to: null },
      { label: "开源项目", to: null },
      { label: "帮助中心", to: "/help" },
    ],
  },
];

const Footer = () => {
  return (
    <footer className="relative border-t border-white/5 bg-black/30">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <a href="#top" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/30">
                <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
              </span>
              <span className="text-lg font-bold tracking-tight text-white">
                NEXUS<span className="text-gradient-neon ml-1">LAB</span>
              </span>
            </a>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">
              用科技与创意，为敢于想象的品牌打造非凡的数字体验。
            </p>
            <div className="mt-6 flex items-center gap-3">
              {["微博", "微信", "抖音", "领英"].map((s) => (
                <a
                  key={s}
                  href="#top"
                  className="glass flex h-9 w-9 items-center justify-center rounded-lg text-xs font-medium text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
                >
                  {s}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-white">{col.title}</h4>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link
                        to={link.to}
                        className="text-sm text-muted-foreground transition-colors hover:text-cyan-300"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href="#top"
                        className="text-sm text-muted-foreground transition-colors hover:text-cyan-300"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 text-xs text-muted-foreground sm:flex-row">
          <p>© 2026 NEXUS LAB. 保留所有权利。</p>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="transition-colors hover:text-white">隐私政策</Link>
            <Link to="/terms" className="transition-colors hover:text-white">服务条款</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
