import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion";
import { Menu, X, Zap } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useLoginModal } from "@/components/LoginModalProvider";

const NAV_LINKS = [
  { label: "能力", href: "#features" },
  { label: "作品", href: "#work" },
  { label: "数据", href: "#stats" },
  { label: "AI 体验", href: "/ai" },
  { label: "应用", href: "/app" },
  { label: "团队", href: "#testimonials" },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { openLogin } = useLoginModal();

  // 顶部阅读进度条
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-0 z-50"
    >
      {/* 阅读进度条 */}
      <motion.div
        style={{ scaleX: progress }}
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500"
      />

      <div
        className={`mx-auto flex max-w-7xl items-center justify-between px-5 transition-all duration-300 lg:px-8 ${
          scrolled ? "my-3" : "my-5"
        }`}
      >
        <div
          className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 transition-all duration-300 ${
            scrolled ? "glass shadow-lg shadow-black/30" : "bg-transparent border border-transparent"
          }`}
        >
          {/* Logo */}
          <a href="#top" className="flex items-center gap-2.5">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/30">
              <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-bold tracking-tight text-white">
              NEXUS
              <span className="text-gradient-neon ml-1">LAB</span>
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) =>
              link.href.startsWith("/") ? (
                <Link
                  key={link.href}
                  to={link.href}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </a>
              )
            )}
          </nav>

          {/* CTA + auth + mobile toggle */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="hidden items-center gap-3 md:flex">
                <Link
                  to="/space"
                  className="text-sm text-white/80 transition-colors hover:text-white"
                >
                  我的空间
                </Link>
                <button
                  onClick={() => signOut()}
                  className="text-sm text-muted-foreground transition-colors hover:text-white"
                >
                  退出
                </button>
              </div>
            ) : (
              <button
                onClick={() => openLogin()}
                className="hidden rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 md:inline-flex"
              >
                登录 / 注册
              </button>
            )}
            <a
              href="#contact"
              className="hidden rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 md:inline-flex btn-neon"
            >
              开启合作
            </a>
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/5 md:hidden"
              aria-label="菜单"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="mx-5 glass rounded-2xl p-3 md:hidden"
          >
            {NAV_LINKS.map((link) =>
              link.href.startsWith("/") ? (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </a>
              )
            )}
            {user ? (
              <>
                <Link
                  to="/space"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5"
                >
                  我的空间
                </Link>
                <button
                  onClick={() => {
                    setOpen(false);
                    signOut();
                  }}
                  className="block w-full rounded-lg px-4 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-white"
                >
                  退出登录
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setOpen(false);
                  openLogin();
                }}
                className="block w-full rounded-lg px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/5"
              >
                登录 / 注册
              </button>
            )}
            <a
              href="#contact"
              onClick={() => setOpen(false)}
              className="mt-2 block rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-center text-sm font-semibold text-white"
            >
              开启合作
            </a>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default Navbar;
