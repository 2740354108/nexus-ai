/**
 * 验证码邮件发送模块。
 *
 * 当 backend/.env 配置了 SMTP_HOST 时，走真实 SMTP 发送（QQ / 163 / 企业邮箱均可）。
 * 未配置 SMTP_HOST 时退回开发模式：只把验证码打印到后端日志，并返回 devCode 供前端展示。
 * 真实发送若失败，也会退回 devCode，保证注册流程不被卡住。
 */
import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = Number(process.env.SMTP_PORT || 465)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER || ''

const DEV_MODE = !SMTP_HOST

export interface SendResult {
  devCode?: string
}

export function isDevMailMode(): boolean {
  return DEV_MODE
}

function buildTransporter() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 走 SSL；其他端口走 STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
}

export async function sendVerificationEmail(to: string, code: string): Promise<SendResult> {
  if (DEV_MODE) {
    console.log(`[DEV] 验证码邮件 -> ${to} : ${code}`)
    return { devCode: code }
  }

  try {
    const transporter = buildTransporter()
    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject: 'NEXUS LAB 邮箱验证码',
      text: `你的 NEXUS LAB 验证码是 ${code}，10 分钟内有效。如非本人操作请忽略。`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0b0b14;color:#e8e8f0;border-radius:12px">
  <h2 style="color:#7c5cff;margin:0 0 16px">NEXUS LAB</h2>
  <p style="font-size:15px;line-height:1.6">你好，你的邮箱验证码如下：</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#fff;background:#1a1a2e;padding:16px 24px;border-radius:8px;text-align:center;margin:16px 0">${code}</div>
  <p style="font-size:13px;color:#9aa">该验证码 10 分钟内有效。如非本人操作，请忽略本邮件。</p>
</div>`,
    })
    console.log(`[MAIL] 验证码已发送至 ${to}`)
    return {}
  } catch (err) {
    console.error('[MAIL] 发送失败，退回开发模式显示验证码：', err)
    return { devCode: code }
  }
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<SendResult> {
  if (DEV_MODE) {
    console.log(`[DEV] 密码重置邮件 -> ${to} : ${code}`)
    return { devCode: code }
  }
  try {
    const transporter = buildTransporter()
    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject: 'NEXUS LAB 密码重置验证码',
      text: `你的 NEXUS LAB 密码重置验证码是 ${code}，10 分钟内有效。如非本人操作请忽略。`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0b0b14;color:#e8e8f0;border-radius:12px">
  <h2 style="color:#7c5cff;margin:0 0 16px">NEXUS LAB</h2>
  <p style="font-size:15px;line-height:1.6">你好，你正在重置 NEXUS LAB 账号密码，验证码如下：</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#fff;background:#1a1a2e;padding:16px 24px;border-radius:8px;text-align:center;margin:16px 0">${code}</div>
  <p style="font-size:13px;color:#9aa">该验证码 10 分钟内有效。如非本人操作，请忽略本邮件。</p>
</div>`,
    })
    console.log(`[MAIL] 密码重置邮件已发送至 ${to}`)
    return {}
  } catch (err) {
    console.error('[MAIL] 发送失败，退回开发模式显示验证码：', err)
    return { devCode: code }
  }
}
