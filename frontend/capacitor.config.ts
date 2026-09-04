import type { CapacitorConfig } from '@capacitor/cli';

// NEXUS AI — Android 应用配置（离线独立应用）
// 说明：不再配置 server.url，页面资源随构建打包进安装包（android/app/src/main/assets/public）。
// 因此应用启动即加载本地内容：不依赖任何线上地址，断网也能打开。
const config: CapacitorConfig = {
  appId: 'com.nexuslab.ai',
  appName: 'NEXUS AI',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    // 允许混合内容：部分自建服务（如局域网 ComfyUI）走 http
    allowMixedContent: true,
  },
};

export default config;
