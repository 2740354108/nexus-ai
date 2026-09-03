import type { CapacitorConfig } from '@capacitor/cli';

// NEXUS AI — Android 应用配置
// 说明：server.url 指向线上「移动端应用」，保证 App 内容与网站 /app 完全一致。
// ⚠️ 上架前请把它换成你的正式部署地址（沙盒链接会随沙盒关闭而失效）。
const config: CapacitorConfig = {
  appId: 'com.nexuslab.ai',
  appName: 'NEXUS AI',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // 线上移动端应用入口（含聊天 / 创作 / 我的）
    url: 'https://af0c248dcf9096818.app.workbuddy.link/app',
  },
};

export default config;
