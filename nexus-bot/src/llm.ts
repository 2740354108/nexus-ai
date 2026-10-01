import { callNexus } from './nexus';

// 所有平台统一走 NEXUS 大脑（见 ./nexus.ts）。
// 保留 chat() 作为网关层的统一入口，方便以后挂知识库 / 工具。
export async function chat(
  chatId: string,
  userText: string,
  imageDataUrl?: string,
  platform?: string
): Promise<string> {
  return callNexus(chatId, userText, imageDataUrl, platform);
}
