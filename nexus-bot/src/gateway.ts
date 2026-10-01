import type { IncomingMessage } from './types';
import { chat } from './llm';
import { resetNexus } from './nexus';

// 消息网关：所有平台的消息都先到这里，统一调对话核心，再回包。
// 以后接知识库 / 工具调用，也只需改这一层。

export async function handleIncoming(msg: IncomingMessage): Promise<void> {
  const tag = `[${msg.platform}] ${msg.userName || msg.userId}`;
  try {
    // 简单指令：清空上下文
    if (msg.text.trim() === '/reset' || msg.text.trim() === '重置对话') {
      resetNexus(msg.chatId);
      await msg.reply('已清空本轮对话记忆。');
      return;
    }
    const reply = await chat(msg.chatId, msg.text, msg.imageDataUrl, msg.platform);
    await msg.reply(reply);
  } catch (err) {
    console.error(`${tag} 处理失败:`, err);
    await msg.reply('出错了：' + (err instanceof Error ? err.message : String(err)));
  }
}
