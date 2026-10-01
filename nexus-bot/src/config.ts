import dotenv from 'dotenv';

dotenv.config();

function bool(v: string | undefined): boolean {
  return v === 'true' || v === '1' || v === 'yes';
}

// 说明：机器人已统一走后端大脑（/api/ai/v1），不再直连模型厂商，
// 因此这里没有 openrouterKey / model —— 模型与密钥一律在后端 backend/.env 里配。
export const CONFIG = {
  systemPrompt: process.env.BOT_SYSTEM_PROMPT || '',
  wechatSystemPrompt: process.env.WECHAT_SYSTEM_PROMPT || '',
  historyLimit: Number(process.env.BOT_HISTORY_LIMIT || '20'),

  platforms: {
    telegram: { enabled: bool(process.env.ENABLE_TELEGRAM), token: process.env.TELEGRAM_BOT_TOKEN || '' },
    discord: { enabled: bool(process.env.ENABLE_DISCORD), token: process.env.DISCORD_BOT_TOKEN || '' },
    wecom: {
      enabled: bool(process.env.ENABLE_WECOM),
      webhookUrl: process.env.WECOM_WEBHOOK_URL || '',
      corpid: process.env.WECOM_CORPID || '',
      agentid: process.env.WECOM_AGENTID || '',
      secret: process.env.WECOM_SECRET || '',
      token: process.env.WECOM_TOKEN || '',
      aesKey: process.env.WECOM_AES_KEY || '',
      callbackPort: Number(process.env.WECOM_CALLBACK_PORT || '8788'),
    },
    wechatMp: {
      enabled: bool(process.env.ENABLE_WECHAT_MP),
      appid: process.env.WX_MP_APPID || '',
      secret: process.env.WX_MP_SECRET || '',
      token: process.env.WX_MP_TOKEN || '',
      aesKey: process.env.WX_MP_AES_KEY || '',
      port: Number(process.env.WX_MP_PORT || '8789'),
    },
    qq: {
      enabled: bool(process.env.ENABLE_QQ),
      appid: process.env.QQ_BOT_APPID || '',
      token: process.env.QQ_BOT_TOKEN || '',
      secret: process.env.QQ_BOT_SECRET || '',
    },
    onebot: {
      enabled: bool(process.env.ENABLE_ONEBOT),
      wsUrl: process.env.ONEBOT_WS_URL || 'ws://127.0.0.1:3001',
      token: process.env.ONEBOT_TOKEN || '',
      botQq: process.env.ONEBOT_BOT_QQ || '',
      botName: process.env.ONEBOT_BOT_NAME || '',
      allowGroups: (process.env.ONEBOT_ALLOW_GROUPS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
  },
};
