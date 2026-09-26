import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import LoginModal from "@/components/landing/LoginModal";

type LoginModalContextValue = {
  /** 打开全局唯一的登录/注册弹窗 */
  openLogin: () => void;
  /** 关闭弹窗 */
  closeLogin: () => void;
};

const LoginModalContext = createContext<LoginModalContextValue>({
  openLogin: () => {},
  closeLogin: () => {},
});

/**
 * 全局唯一的登录 / 注册入口。
 *
 * 全站只保留这一个弹窗：导航栏、聊天遇到未登录、我的空间等任何地方，
 * 都通过 `useLoginModal().openLogin()` 唤醒同一个弹窗，避免出现多个重复的登录入口。
 * 登录成功后写入的 token 与后端 /api/relay/* 共用同一套账号，因此登录即自动解锁每日免费额度。
 *
 * 必须挂载在 AuthProvider 内部（弹窗依赖登录上下文）。
 */
export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openLogin = useCallback(() => setOpen(true), []);
  const closeLogin = useCallback(() => setOpen(false), []);

  return (
    <LoginModalContext.Provider value={{ openLogin, closeLogin }}>
      {children}
      <LoginModal open={open} onClose={closeLogin} />
    </LoginModalContext.Provider>
  );
}

export const useLoginModal = () => useContext(LoginModalContext);
