import type { BotAdapter } from '../types';
import { handleIncoming } from '../gateway';

// Telegram 适配器：使用官方 Bot API 的轮询（getUpdates）模式。
// 优点：本地就能跑，不需要公网服务器。缺点：同一 token 不能同时开多个实例。

export function createTelegramAdapter(token: string): BotAdapter {
  const api = `https://api.telegram.org/bot${token}`;
  let offset = 0;
  let running = false;

  async function sendMessage(chatId: number | string, text: string): Promise<void> {
    // Telegram 单条消息上限 4096 字符，超出截断（简单处理）。
    const safe = text.length > 4000 ? text.slice(0, 4000) + '…' : text;
    await fetch(`${api}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: safe, parse_mode: undefined }),
    });
  }

  async function poll(): Promise<void> {
    while (running) {
      try {
        const res = await fetch(`${api}/getUpdates?offset=${offset}&timeout=30`, {
          // 长轮询，30s 超时
        });
        const data: any = await res.json();
        if (data.ok) {
          for (const upd of data.result as any[]) {
            offset = upd.update_id + 1;
            const msg = upd.message;
            if (msg?.text && !msg.text.startsWith('/start')) {
              await handleIncoming({
                platform: 'telegram',
                userId: String(msg.from.id),
                userName: msg.from.username || msg.from.first_name,
                text: msg.text,
                chatId: `telegram:${msg.chat.id}`,
                reply: (t: string) => sendMessage(msg.chat.id, t),
              });
            } else if (msg?.text === '/start') {
              await sendMessage(msg.chat.id, '👋 我是 NEXUS BOT，直接发消息给我就行。输入 /reset 可清空对话记忆。');
            }
          }
        }
      } catch (err) {
        console.error('[telegram] 轮询异常，5s 后重试:', err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  return {
    name: 'telegram',
    start: async () => {
      running = true;
      console.log('[telegram] 启动轮询…');
      poll();
    },
    stop: async () => {
      running = false;
    },
  };
}
