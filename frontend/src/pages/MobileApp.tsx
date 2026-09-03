import { useState } from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Sparkles,
  User,
  Image as ImageIcon,
  Clapperboard,
  Music4,
  Zap,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import AIStudio from "@/components/landing/AIStudio";
import MusicStudio from "@/components/landing/MusicStudio";
import VideoStudio from "@/components/landing/VideoStudio";
import ImageStudio from "@/components/landing/ImageStudio";
import AgnesStudio from "@/components/landing/AgnesStudio";
import SpacePage from "@/pages/SpacePage";

type MainTab = "chat" | "create" | "me";
type CreateTab = "image" | "video" | "music" | "agnes";

const CREATE_TABS: { key: CreateTab; label: string; icon: typeof ImageIcon }[] = [
  { key: "image", label: "绘图", icon: ImageIcon },
  { key: "video", label: "视频", icon: Clapperboard },
  { key: "music", label: "音乐", icon: Music4 },
  { key: "agnes", label: "Agnes", icon: Sparkles },
];

const NAV: { key: MainTab; label: string; icon: typeof MessageSquare }[] = [
  { key: "chat", label: "聊天", icon: MessageSquare },
  { key: "create", label: "创作", icon: Sparkles },
  { key: "me", label: "我的", icon: User },
];

/**
 * 手机端优先的应用外壳：底部 Tab 导航（聊天 / 创作 / 我的），
 * 全部复用现有后端与 AI 工作室组件。桌面端以手机框形式居中展示。
 */
const MobileApp = () => {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<MainTab>("chat");
  const [createTab, setCreateTab] = useState<CreateTab>("image");

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-[#0a0a12] text-foreground relative border-x border-white/5">
      {/* 顶部品牌栏 */}
      <header className="flex shrink-0 items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/30">
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-base font-bold tracking-tight text-white">
            NEXUS<span className="text-gradient-neon ml-1">LAB</span>
          </span>
        </div>
        {user && (
          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            退出
          </button>
        )}
      </header>

      {/* 内容区 */}
      <main className="relative flex-1 overflow-y-auto overflow-x-hidden">
        {tab === "chat" && <AIStudio embedded defaultMode="chat" />}

        {tab === "create" && (
          <div>
            {/* 创作子导航 */}
            <div className="sticky top-0 z-20 flex gap-2 border-b border-white/5 bg-[#0a0a12]/90 px-4 py-2.5 backdrop-blur">
              {CREATE_TABS.map((t) => {
                const Icon = t.icon;
                const active = createTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setCreateTab(t.key)}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium transition-colors ${
                      active
                        ? "bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                        : "bg-white/5 text-muted-foreground hover:text-white"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {createTab === "image" && <ImageStudio embedded />}
            {createTab === "video" && <VideoStudio embedded />}
            {createTab === "music" && <MusicStudio embedded />}
            {createTab === "agnes" && <AgnesStudio embedded />}
          </div>
        )}

        {tab === "me" && (
          <div className="px-4 py-2">
            {user ? (
              <SpacePage />
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                  <User className="h-7 w-7 text-muted-foreground" />
                </span>
                <p className="text-sm text-muted-foreground">登录后可查看你的 AI 作品</p>
                <Link
                  to="/"
                  className="btn-neon inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-2.5 text-sm font-semibold text-white"
                >
                  去登录
                </Link>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 底部 Tab 导航 */}
      <nav className="flex shrink-0 border-t border-white/10 bg-[#0c0c16]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = tab === n.key;
          return (
            <button
              key={n.key}
              onClick={() => setTab(n.key)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-cyan-300" : "text-muted-foreground hover:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "drop-shadow-[0_0_6px_rgba(103,232,249,0.6)]" : ""}`} />
              {n.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default MobileApp;
