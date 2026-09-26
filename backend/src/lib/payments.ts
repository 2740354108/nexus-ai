/**
 * 支付适配器（微信支付 / 支付宝）
 *
 * 沙盒环境无法对接真实支付通道，这里先用「模拟支付」占位：
 * - 下单时返回一张模拟收银台链接
 * - 真实收款只需在 .env 配好商户号与密钥，并实现下方 marked 区域即可点亮
 *
 * 回调/回跳地址：自动跟随用户当前访问的公网域名（Cloud Studio 公开链接 / ngrok / 云服务器）
 * 拼接，无需手动改代码。也可用环境变量 PAYMENT_PUBLIC_BASE_URL 强制指定。
 *
 * 设计要点：业务层 (billing.ts) 只关心 { qrCode, payUrl, mock, notifyUrl, returnUrl }，
 * 不关心背后是微信还是支付宝，便于后续横向扩展更多通道。
 */

export type PayChannel = 'wechat' | 'alipay'

export interface CreatePaymentInput {
  channel: PayChannel
  orderId: string
  amountCents: number
  subject: string
  /** 支付宝/微信异步通知地址（公网可访问） */
  notifyUrl?: string
  /** 支付完成后回跳地址 */
  returnUrl?: string
}

export interface CreatePaymentResult {
  outTradeNo: string
  qrCode: string
  payUrl: string
  mock: boolean
  notifyUrl?: string
  returnUrl?: string
}

// 真实配置从环境变量读取；未配置则走模拟通道
const WECHAT_MCH_ID = process.env.WECHAT_MCH_ID || ''
const ALIPAY_APP_ID = process.env.ALIPAY_APP_ID || ''

export function isRealPaymentConfigured(channel: PayChannel): boolean {
  if (channel === 'wechat') return !!WECHAT_MCH_ID
  if (channel === 'alipay') return !!ALIPAY_APP_ID
  return false
}

/**
 * 取公网根地址：优先环境变量 PAYMENT_PUBLIC_BASE_URL，
 * 否则从请求头自动推断（适配 Cloud Studio 公开链接 / ngrok / 云服务器）。
 */
export function getPublicBaseUrl(req?: any): string {
  const envBase = process.env.PAYMENT_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '')
  if (envBase) return envBase
  const host = req?.headers?.host || req?.hostname
  if (!host) return ''
  const proto =
    (req?.headers?.['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
    (req?.secure ? 'https' : 'http')
  return `${proto}://${host}`
}

/**
 * 创建支付单。
 * - 真实支付：返回可跳转的支付宝收银台链接（page.wap），mock=false
 * - 模拟支付：返回本地模拟收银台链接，mock=true
 */
export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const outTradeNo = `NX${Date.now()}${Math.floor(Math.random() * 1000)}`

  // ============================================================
  // 真实支付实现位置（点亮真实收款时在此补充）：
  // - 微信：调用「统一下单」API（https://api.mch.weixin.qq.com/pay/unifiedorder）
  //   用 WECHAT_MCH_ID + APIv3 密钥 + 证书签名，拿到 code_url 作为 qrCode
  // - 支付宝：调用「alipay.trade.page.pay」(电脑) / 「alipay.trade.wap.pay」(手机)
  //   传入 notify_url=input.notifyUrl, return_url=input.returnUrl，
  //   拿到重定向 URL 作为 payUrl 返回，并把 mock 置为 false
  // 拿到真实结果后直接返回即可。
  // ============================================================

  if (isRealPaymentConfigured(input.channel)) {
    // TODO: 调用真实通道，替换为真实返回（payUrl 指向支付宝收银台）
    // return { outTradeNo, qrCode: realUrl, payUrl: realUrl, mock: false, notifyUrl, returnUrl }
  }

  // 模拟支付：返回一个本地可访问的模拟收银台链接，开发期点开即视为已付
  const payUrl = `/mock-pay?order=${encodeURIComponent(input.orderId)}&channel=${input.channel}`
  return {
    outTradeNo,
    qrCode: payUrl,
    payUrl,
    mock: true,
    notifyUrl: input.notifyUrl,
    returnUrl: input.returnUrl,
  }
}

/**
 * 支付回调校验（占位）。真实实现需校验微信/支付宝的签名与回传参数。
 * 返回是否支付成功。
 */
export async function verifyPaymentCallback(
  channel: PayChannel,
  _payload: Record<string, any>
): Promise<{ success: boolean; outTradeNo?: string }> {
  // 真实实现：用商户平台公钥验签，确认金额与订单号一致
  if (isRealPaymentConfigured(channel)) {
    // TODO: 验签逻辑
    return { success: false }
  }
  return { success: false }
}
