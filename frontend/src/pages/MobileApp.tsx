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
  KeyRound,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { isOpenRouter, useSettings } from "@/lib/settings";
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
  const { settings } = useSettings();
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
          <div className="space-y-3 px-4 py-3">
            {/* AI 接口设置：自带密钥 / 接自己的服务，核心入口，始终可见 */}
            <Link
              to="/app/settings"
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition-colors hover:border-cyan-500/40"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/20 to-violet-500/20">
                  <KeyRound className="h-4 w-4 text-cyan-300" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">AI 接口设置</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {isOpenRouter(settings.chatApiBase)
                      ? settings.openrouterKey
                        ? "云端 · 对话就绪"
                        : "云端 · 填密钥后可用"
                      : "已接自己的服务 · 对话就绪"}
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-white/30" />
            </Link>

            {user ? (
              <SpacePage />
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  应用为离线独立模式，AI 功能使用你自己的密钥或自己部署的服务，无需登录即可使用。
                </p>
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
