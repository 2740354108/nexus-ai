/**
 * 支付适配器（PayPal.me 个人收款跳转）
 *
 * 未接入微信/支付宝商户（需营业执照），改用个人 PayPal.me 链接收款：
 * - 下单时按汇率把套餐的人民币价格换算成美元
 * - 生成跳转链接 https://paypal.me/<handle>/<usd>USD，用户在新标签页完成付款
 * - 付款后回站点点「我已支付」手动激活（个人收款无 IPN 回调，手动确认最稳）
 *
 * 收款账号与汇率通过环境变量配置：
 *   PAYPAL_ME_HANDLE    PayPal.me 用户名（默认 29102212a）
 *   CNY_TO_USD_RATE     人民币兑美元汇率（默认 7.2）
 */

export type PayChannel = 'paypal'

export interface CreatePaymentInput {
  channel: PayChannel
  orderId: string
  amountCents: number
  subject: string
  /** PayPal 付款后回跳地址（仅用于用户手动返回站点，无服务端回调） */
  returnUrl?: string
}

export interface CreatePaymentResult {
  outTradeNo: string
  qrCode: string
  payUrl: string
  mock: boolean
  returnUrl?: string
}

const PAYPAL_ME_HANDLE = (process.env.PAYPAL_ME_HANDLE || '29102212a').replace(/[^A-Za-z0-9]/g, '')
const CNY_TO_USD_RATE = Number(process.env.CNY_TO_USD_RATE) || 7.2

/** 是否已配置真实收款（PayPal.me 始终视为已配置，直接跳转） */
export function isRealPaymentConfigured(_channel: PayChannel): boolean {
  return true
}

/** 人民币「分」换算成美元，保留两位 */
export function cnyCentsToUsd(cents: number): number {
  const usd = (cents / 100) / CNY_TO_USD_RATE
  return Math.round(usd * 100) / 100
}

/** 生成 PayPal.me 收款链接，金额预填到 URL */
export function buildPaypalUrl(usd: number): string {
  return `https://paypal.me/${PAYPAL_ME_HANDLE}/${usd}USD`
}

/**
 * 创建支付单：返回 PayPal.me 跳转链接（mock=false，前端直接打开新标签页）。
 */
export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const usd = cnyCentsToUsd(input.amountCents)
  const payUrl = buildPaypalUrl(usd)
  return {
    outTradeNo: `NX${Date.now()}${Math.floor(Math.random() * 1000)}`,
    qrCode: payUrl,
    payUrl,
    mock: false,
    returnUrl: input.returnUrl,
  }
}
