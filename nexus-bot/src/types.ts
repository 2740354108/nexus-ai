// 统一消息类型与适配器接口：所有平台进来都翻译成这个形状，出去再转回平台格式。

export interface IncomingMessage {
  /** 平台标识，例如 telegram / discord / wecom / wechat_mp / qq */
  platform: string;
  /** 平台内的用户唯一标识 */
  userId: string;
  /** 便于展示的用户名 */
  userName?: string;
  /** 用户发来的文本 */
  text: string;
  /**
   * 可选：用户发来的图片（base64 data URL，如 data:image/png;base64,...）。
   * 存在时机器人会把它连同文本一起发给 NEXUS 视觉模型识图。
   */
  imageDataUrl?: string;
  /**
   * 会话标识。同一会话（私聊=用户，群聊=群）共享上下文。
   * 建议各适配器拼接 platform 前缀，避免跨平台串台。
   */
  chatId: string;
  /** 把回复发回该会话 */
  reply: (text: string) => Promise<void>;
}

export interface BotAdapter {
  name: string;
  start: () => Promise<void>;
  stop?: () => Promise<void>;
}
