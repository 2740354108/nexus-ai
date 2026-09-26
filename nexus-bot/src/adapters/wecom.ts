import http from 'node:http';
import crypto from 'node:crypto';
import type { BotAdapter } from '../types';
import { handleIncoming } from '../gateway';
import { CONFIG } from '../config';

// 企业微信适配器：
//  - 群机器人 webhook：可单向发送（最简单，无需公网）
//  - 企业应用回调：可双向对话（需公网 + 管理后台配置接收地址）
// 消息采用 AES-256-CBC 加密，与公众号同套算法。

function sha1(...parts: string[]): string {
  return crypto.createHash('sha1').update(parts.sort().join('')).digest('hex');
}
function aesKeyBuf(key: string): Buffer {
  return Buffer.from(key + '=', 'base64');
}
function pkcs7Unpad(buf: Buffer): Buffer {
  const pad = buf[buf.length - 1];
  return buf.subarray(0, buf.length - pad);
}
function decrypt(encodingAesKey: string, encrypted: string): { xml: string; receiveId: string } {
  const key = aesKeyBuf(encodingAesKey);
  const iv = key.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]);
  const unpadded = pkcs7Unpad(decrypted);
  const contentLen = unpadded.readUInt32BE(16);
  const xml = unpadded.subarray(20, 20 + contentLen).toString('utf8');
  const receiveId = unpadded.subarray(20 + contentLen).toString('utf8');
  return { xml, receiveId };
}
function parseXmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

let tokenCache: { token: string; expire: number } | null = null;
async function getAccessToken(corpid: string, secret: string): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expire > now) return tokenCache.token;
  const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpid}&corpsecret=${secret}`);
  const data: any = await res.json();
  if (data.errcode !== 0) throw new Error('企业微信获取 token 失败: ' + data.errmsg);
  tokenCache = { token: data.access_token, expire: now + (data.expires_in - 300) * 1000 };
  return data.access_token;
}

export function createWeComAdapter(): BotAdapter {
  const cfg = CONFIG.platforms.wecom;
  let server: http.Server | null = null;

  async function sendAppMessage(toUser: string, text: string): Promise<void> {
    const token = await getAccessToken(cfg.corpid, cfg.secret);
    await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ touser: toUser, msgtype: 'text', agentid: Number(cfg.agentid), text: { content: text } }),
    });
  }

  return {
    name: 'wecom',
    start: async () => {
      if (cfg.webhookUrl) {
        console.log('[wecom] 群机器人 webhook 已就绪（可用于发送消息）');
      }
      if (!cfg.corpid || !cfg.secret || !cfg.token || !cfg.aesKey) {
        console.log('[wecom] 未配置企业应用回调参数，仅 webhook 发送可用');
        return;
      }
      server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const timestamp = url.searchParams.get('timestamp') || '';
        const nonce = url.searchParams.get('nonce') || '';

        if (req.method === 'GET') {
          const msgSig = url.searchParams.get('msg_signature') || '';
          const echostr = url.searchParams.get('echostr') || '';
          if (sha1(cfg.token, timestamp, nonce, echostr) !== msgSig) {
            res.writeHead(403);
            res.end('bad signature');
            return;
          }
          const { xml } = decrypt(cfg.aesKey, echostr);
          res.writeHead(200);
          res.end(xml);
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          for await (const chunk of req) body += chunk;
          const encrypt = parseXmlTag(body, 'Encrypt');
          const msgSig = url.searchParams.get('msg_signature') || '';
          if (!encrypt || sha1(cfg.token, timestamp, nonce, encrypt) !== msgSig) {
            res.writeHead(403);
            res.end('bad signature');
            return;
          }
          // 立即响应，避免 5s 超时；异步处理并主动推送回复
          res.writeHead(200);
          res.end('success');
          const { xml } = decrypt(cfg.aesKey, encrypt);
          const content = parseXmlTag(xml, 'Content');
          const from = parseXmlTag(xml, 'FromUserName');
          if (content && from) {
            await handleIncoming({
              platform: 'wecom',
              userId: from,
              userName: from,
              text: content,
              chatId: `wecom:${from}`,
              reply: (t: string) => sendAppMessage(from, t),
            });
          }
          return;
        }
        res.writeHead(405);
        res.end();
      });
      server.listen(cfg.callbackPort, () =>
        console.log(`[wecom] 企业应用回调服务监听 :${cfg.callbackPort}`)
      );
    },
    stop: async () => {
      server?.close();
    },
  };
}
