import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { listHistories, deleteHistory, HistoryRecord } from "@/lib/database";
import { ArrowLeft, Zap, Trash2, Image as ImageIcon, Music4, Clapperboard, Code2, MessageSquare, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type RecordItem = HistoryRecord;

const KIND_META: Record<string, { label: string; icon: typeof ImageIcon; color: string }> = {
  image: { label: "图片", icon: ImageIcon, color: "text-cyan-400" },
  video: { label: "视频", icon: Clapperboard, color: "text-violet-400" },
  music: { label: "音乐", icon: Music4, color: "text-fuchsia-400" },
  code: { label: "代码", icon: Code2, color: "text-emerald-400" },
  chat: { label: "对话", icon: MessageSquare, color: "text-amber-400" },
};

const SpacePage = () => {
  const { user, loading, token, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<RecordItem[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user || !token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, token]);

  const load = async () => {
    setState("loading");
    try {
      const data = await listHistories(token);
      setItems(data);
    } catch (e: any) {
      toast.error(e?.message || "加载失败");
    } finally {
      setState("done");
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteHistory(token, id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      toast.error("删除失败");
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      toast.success("账号已注销");
      setConfirmDel(false);
    } catch (e: any) {
      toast.error(e?.message || "注销失败，请重试");
    } finally {
      setDeleting(false);
    }
  };

  // 未登录
  if (!loading && !user) {
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
        <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-muted-foreground">
            <FolderOpen className="h-9 w-9" />
          </div>
          <h1 className="text-2xl font-bold text-white">「我的空间」需要登录</h1>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            登录后即可在这里查看和保存你生成过的图片、视频、音乐与代码。不登录也能正常使用全部 AI 功能。
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            返回首页体验 AI 功能
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/30">
              <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-base font-bold tracking-tight text-white">
              NEXUS<span className="text-gradient-neon ml-1">LAB</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5 text-muted-foreground hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
          </div>
        </div>
      </header>

      <main className="pt-28 pb-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">我的空间</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              这里保存着你登录后收藏的生成作品，仅你本人可见
            </p>
          </div>

          {state === "loading" && (
            <p className="text-center text-sm text-muted-foreground">加载中...</p>
          )}

          {state === "done" && items.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-card/40 p-12 text-center">
              <FolderOpen className="mb-4 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                还没有保存任何作品。去 AI 专区生成内容后，点击「保存到我的空间」即可收藏。
              </p>
              <Link
                to="/ai"
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110"
              >
                前往 AI 专区
              </Link>
            </div>
          )}

          {items.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const meta = KIND_META[item.kind] || KIND_META.chat;
                const Icon = meta.icon;
                return (
                  <div
                    key={item.id}
                    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-card/40 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                      <span className="text-xs font-medium text-white">{meta.label}</span>
                      <button
                        onClick={() => remove(item.id)}
                        className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/20 hover:text-red-300"
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {item.thumb && (item.kind === "image" || item.kind === "video") ? (
                      <img
                        src={item.thumb}
                        alt={item.title}
                        className="mt-3 aspect-video w-full rounded-xl object-cover"
                      />
                    ) : null}

                    <p className="mt-3 line-clamp-2 text-sm text-white/90">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString("zh-CN")}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* 注销账号（满足应用商店账号删除合规要求） */}
          <div className="mt-12 rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-center">
            <p className="text-sm text-red-300/90">
              注销后，账号及全部生成历史将被永久删除，且无法恢复
            </p>
            {!confirmDel ? (
              <button
                onClick={() => setConfirmDel(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-500/40 px-5 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15"
              >
                注销账号
              </button>
            ) : (
              <div className="mt-3 flex items-center justify-center gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                >
                  {deleting ? "注销中..." : "确认注销"}
                </button>
                <button
                  onClick={() => setConfirmDel(false)}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/10"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SpacePage;
