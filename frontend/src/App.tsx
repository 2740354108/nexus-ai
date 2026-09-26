import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatedRoutes } from "@/components/AnimatedRoutes";
import { PageTransition } from "@/components/PageTransition";
import Index from "./pages/Index";
import AIPage from "./pages/AIPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import HelpCenter from "./pages/HelpCenter";
import SpacePage from "./pages/SpacePage";
import MobileApp from "./pages/MobileApp";
import AppSettings from "./pages/AppSettings";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "@/lib/AuthContext";
import { LoginModalProvider } from "@/components/LoginModalProvider";

/**
 * Configure TanStack Query client with optimized defaults
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data considered fresh for 1 minute
      staleTime: 60 * 1000,
      // Cache data for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Retry failed requests once
      retry: 1,
      // Don't refetch on window focus by default
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect by default
      refetchOnReconnect: false,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});

/**
 * 原生应用启动后直接进入手机端界面（而不是电脑版首页）；
 * 网页端行为保持不变。
 */
const NativeEntry = () => {
  if (Capacitor.isNativePlatform() && window.location.pathname === "/") {
    return <Navigate to="/app" replace />;
  }
  return <Index />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <AuthProvider>
            <LoginModalProvider>
            <AnimatedRoutes>
              <Route path="/" data-genie-title="Home Page" data-genie-key="Home" element={<PageTransition transition="slide-up"><NativeEntry /></PageTransition>} />
              {/* 独立 AI 体验页 */}
              <Route path="/ai" data-genie-title="NEXUS AI" data-genie-key="AI" element={<PageTransition transition="slide-up"><AIPage /></PageTransition>} />
              {/* 手机端应用外壳（底部 Tab 导航） */}
              <Route path="/app" data-genie-title="NEXUS 应用" data-genie-key="App" element={<PageTransition transition="slide-up"><MobileApp /></PageTransition>} />
              {/* 法律条款页 */}
              <Route path="/privacy" data-genie-title="隐私政策" data-genie-key="Privacy" element={<PageTransition transition="fade"><PrivacyPolicy /></PageTransition>} />
              <Route path="/terms" data-genie-title="服务条款" data-genie-key="Terms" element={<PageTransition transition="fade"><TermsOfService /></PageTransition>} />
              {/* 帮助中心 */}
              <Route path="/help" data-genie-title="帮助中心" data-genie-key="Help" element={<PageTransition transition="fade"><HelpCenter /></PageTransition>} />
              {/* 登录用户的个人空间 */}
              <Route path="/space" data-genie-title="我的空间" data-genie-key="Space" element={<PageTransition transition="fade"><SpacePage /></PageTransition>} />
              {/* TCB 登录回调（OAuth 用，邮箱登录不走这里） */}
              <Route path="/auth/callback" data-genie-title="登录中" data-genie-key="Auth" element={<AuthCallback />} />
              {/* 应用内 AI 接口设置（自带密钥 / 接自己的服务） */}
              <Route path="/app/settings" data-genie-title="AI 接口设置" data-genie-key="Settings" element={<PageTransition transition="fade"><AppSettings /></PageTransition>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" data-genie-key="NotFound" data-genie-title="Not Found" element={<PageTransition transition="fade"><NotFound /></PageTransition>} />
            </AnimatedRoutes>
            </LoginModalProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App
