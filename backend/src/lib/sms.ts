/**
 * 短信验证码发送模块。
 *
 * 开发模式（未配置 SMS_PROVIDER）：不真正发短信，只把验证码打印到后端日志，
 * 并在返回值里带上 devCode，供前端（开发环境）直接展示，方便测试。
 *
 * 正式上线：在 backend/.env 配置 SMS_PROVIDER（如 tencent / aliyun）及对应密钥，
 * 并在此接入腾讯云 / 阿里云短信 SDK 真实发送（接口签名不变）。
 */
const DEV_MODE = !process.env.SMS_PROVIDER

export interface SmsResult {
  devCode?: string
}

export function isDevSmsMode(): boolean {
  return DEV_MODE
}

export async function sendSmsCode(to: string, code: string): Promise<SmsResult> {
  if (DEV_MODE) {
    console.log(`[DEV] 短信验证码 -> ${to} : ${code}`)
    return { devCode: code }
  }
  // 生产模式：在此接入腾讯云 / 阿里云短信 SDK，例如：
  // const client = new TencentCloudSmsClient(...)
  // await client.send({ phone: to, templateId: ..., params: [code] })
  throw new Error('SMS provider 未配置：请配置 SMS_PROVIDER 及对应密钥')
}
