import http from 'node:http';
import crypto from 'node:crypto';
import type { BotAdapter } from '../types';
import { handleIncoming } from '../gateway';
import { CONFIG } from '../config';

// 微信公众号 / 服务号适配器：
//  - 在公众号后台配置"服务器地址"指向本机公网回调
//  - 接收用户消息（AES 解密 + 验签），通过"客服消息"接口异步回复

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
async function getAccessToken(appid: string, secret: string): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expire > now) return tokenCache.token;
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`
  );
  const data: any = await res.json();
  if (data.errcode) throw new Error('公众号获取 token 失败: ' + data.errmsg);
  tokenCache = { token: data.access_token, expire: now + (data.expires_in - 300) * 1000 };
  return data.access_token;
}

export function createWeChatMpAdapter(): BotAdapter {
  const cfg = CONFIG.platforms.wechatMp;
  let server: http.Server | null = null;

  async function sendCustomerService(toUser: string, text: string): Promise<void> {
    const token = await getAccessToken(cfg.appid, cfg.secret);
    await fetch(`https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ touser: toUser, msgtype: 'text', text: { content: text } }),
    });
  }

  return {
    name: 'wechat_mp',
    start: async () => {
      if (!cfg.appid || !cfg.secret || !cfg.token || !cfg.aesKey) {
        console.log('[wechat_mp] 未配置完整参数（appid/secret/token/aesKey），跳过');
        return;
      }
      server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const timestamp = url.searchParams.get('timestamp') || '';
        const nonce = url.searchParams.get('nonce') || '';
        const signature = url.searchParams.get('signature') || '';

        if (req.method === 'GET') {
          // 公众号验证：sha1(token, timestamp, nonce)
          if (sha1(cfg.token, timestamp, nonce) !== signature) {
            res.writeHead(403);
            res.end('bad signature');
            return;
          }
          res.writeHead(200);
          res.end(url.searchParams.get('echostr') || '');
          return;
        }

        if (req.method === 'POST') {
          const msgSig = url.searchParams.get('msg_signature') || '';
          let body = '';
          for await (const chunk of req) body += chunk;
          const encrypt = parseXmlTag(body, 'Encrypt');
          if (!encrypt || sha1(cfg.token, timestamp, nonce, encrypt) !== msgSig) {
            res.writeHead(403);
            res.end('bad signature');
            return;
          }
          res.writeHead(200);
          res.end('success');
          const { xml } = decrypt(cfg.aesKey, encrypt);
          const content = parseXmlTag(xml, 'Content');
          const from = parseXmlTag(xml, 'FromUserName');
          const openid = parseXmlTag(xml, 'FromUserName');
          if (content && from) {
            await handleIncoming({
              platform: 'wechat_mp',
              userId: from,
              userName: from,
              text: content,
              chatId: `wechat_mp:${openid}`,
              reply: (t: string) => sendCustomerService(from, t),
            });
          }
          return;
        }
        res.writeHead(405);
        res.end();
      });
      server.listen(cfg.port, () => console.log(`[wechat_mp] 回调服务监听 :${cfg.port}`));
    },
    stop: async () => {
      server?.close();
    },
  };
}
