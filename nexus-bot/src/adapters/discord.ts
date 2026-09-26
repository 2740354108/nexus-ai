import { Client, GatewayIntentBits, Events, Message } from 'discord.js';
import type { BotAdapter } from '../types';
import { handleIncoming } from '../gateway';

// Discord 适配器：使用 discord.js 处理网关连接、心跳、重连。
// 需要在 https://discord.com/developers/applications 创建 Bot 并邀请进服务器。

export function createDiscordAdapter(token: string): BotAdapter {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  client.on(Events.MessageCreate, async (message: Message) => {
    // 忽略机器人自己的消息与其他 bot
    if (message.author.bot) return;
    // 只在被 @ 提及，或在私聊时回复
    const isMentioned = message.mentions.has(client.user?.id || '');
    const isDM = message.channel.isDMBased();
    if (!isMentioned && !isDM) return;

    const text = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!text) return;

    await handleIncoming({
      platform: 'discord',
      userId: message.author.id,
      userName: message.author.username,
      text,
      chatId: `discord:${message.channel.isDMBased() ? 'dm:' + message.author.id : 'ch:' + message.channel.id}`,
      reply: async (t: string) => {
        const safe = t.length > 1900 ? t.slice(0, 1900) + '…' : t;
        await message.reply(safe);
      },
    });
  });

  return {
    name: 'discord',
    start: async () => {
      await client.login(token);
      console.log('[discord] 已登录:', client.user?.tag);
    },
    stop: async () => {
      client.destroy();
    },
  };
}
