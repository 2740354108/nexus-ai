import http from "node:http";
import { CONFIG } from './config';
import { createTelegramAdapter } from './adapters/telegram';

// 兜底：防止未捕获异常 / 未处理 Promise 拒绝导致整个机器人静默退出
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] 未处理的 Promise 拒绝:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] 未捕获异常（进程继续运行）:', err);
});
import { createDiscordAdapter } from './adapters/discord';
import { createWeComAdapter } from './adapters/wecom';
import { createWeChatMpAdapter } from './adapters/wechatMp';
import { createQQAdapter } from './adapters/qq';
import { createOneBotAdapter } from './adapters/onebot';
import type { BotAdapter } from './types';

async function main(): Promise<void> {
  console.log('=== NEXUS BOT 启动 ===');

  // 健康检查 HTTP 服务：让进程管理器（.cloudstudio）能通过端口检测存活并自动拉起。
  // 该端口不会对外提供业务功能，仅返回 200 表示机器人进程在跑。
  const healthPort = Number(process.env.BOT_HEALTH_PORT) || 3939;
  const healthServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ts: Date.now() }));
  });
  healthServer.on("error", (e) => console.error("[bot] 健康检查端口占用/异常:", (e as Error).message));
  healthServer.listen(healthPort, () => {
    console.log(`[bot] 健康检查服务已启动，监听端口 ${healthPort}`);
  });

  // 机器人已统一走后端大脑，模型与 Key 都在后端配置，所以这里不再检查 OPENROUTER_API_KEY
  // —— 后端换成 DeepSeek / 智谱 / OpenAI 等平台，机器人一样能用。
  console.log(`[bot] 大脑地址：${process.env.NEXUS_API_BASE || 'http://localhost:3000/api/ai/v1'}`);

  const p = CONFIG.platforms;
  const adapters: BotAdapter[] = [];

  if (p.telegram.enabled && p.telegram.token) adapters.push(createTelegramAdapter(p.telegram.token));
  if (p.discord.enabled && p.discord.token) adapters.push(createDiscordAdapter(p.discord.token));
  if (p.wecom.enabled) adapters.push(createWeComAdapter());
  if (p.wechatMp.enabled) adapters.push(createWeChatMpAdapter());
  if (p.qq.enabled && p.qq.appid && p.qq.token) adapters.push(createQQAdapter());
  if (p.onebot.enabled && p.onebot.wsUrl) adapters.push(createOneBotAdapter());

  // 微信（ClawBot / iLink）通道：独立的扫码登录 + 长轮询循环，单独启动不阻塞其它平台。
  const enableWeixin = process.env.ENABLE_WEIXIN === 'true' || process.argv.includes('--weixin');
  if (enableWeixin) {
    console.log('[weixin] 微信通道已启用，正在启动扫码登录…');
    import('./weixin')
      .then((m) => m.startWeixin())
      .catch((e) => console.error('[weixin] 启动失败:', e));
  }

  if (adapters.length === 0 && !enableWeixin) {
    console.warn(
      '没有任何平台被启用。请在 .env 中设置 ENABLE_<平台>=true 并填好对应凭证。'
    );
  }

  for (const a of adapters) {
    try {
      await a.start();
    } catch (e) {
      console.error(`平台 ${a.name} 启动失败:`, e);
    }
  }

  console.log(`已启动 ${adapters.length} 个平台适配器。按 Ctrl+C 停止。`);

  process.on('SIGINT', async () => {
    console.log('\n正在停止…');
    for (const a of adapters) await a.stop?.();
    healthServer.close();
    process.exit(0);
  });

  // 进程管理器 killProcessByPort 发 SIGTERM，需优雅退出以免残留
  process.on('SIGTERM', async () => {
    console.log('\n[SIGTERM] 正在停止…');
    try { for (const a of adapters) await a.stop?.(); } catch {}
    healthServer.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('启动异常:', e);
  process.exit(1);
});
