import React, { createContext, useContext, useEffect, useState } from 'react'

export type UserProfile = {
  uid: string
  email: string
  name: string
  avatar_url: string
  provider: string
  emailVerified: boolean
  phone?: string
  phoneVerified?: boolean
} | null

type AuthContextType = {
  user: UserProfile
  loading: boolean
  token: string
  /** 邮箱+密码注册，返回邮箱与开发模式验证码（不自动登录，需后续验证） */
  registerWithEmail: (email: string, password: string) => Promise<{ email: string; devCode?: string }>
  /** 邮箱验证码校验并登录 */
  verifyEmail: (email: string, code: string) => Promise<void>
  /** 重新发送验证码 */
  resendCode: (email: string) => Promise<{ devCode?: string }>
  /** 申请密码重置：向邮箱发送重置验证码 */
  forgotPassword: (email: string) => Promise<{ devCode?: string }>
  /** 用验证码重置密码 */
  resetPassword: (email: string, code: string, password: string) => Promise<void>
  /** 邮箱+密码登录，返回是否已验证邮箱 */
  signInWithEmailPassword: (email: string, password: string) => Promise<{ emailVerified: boolean }>
  /** 发送手机短信验证码，返回开发模式验证码 */
  sendSmsCode: (phone: string) => Promise<{ devCode?: string }>
  /** 手机号验证码登录 / 注册 */
  loginWithPhone: (phone: string, code: string) => Promise<void>
  /** Google 一键登录：传入 Google 返回的 id_token，合并到本站账号 */
  signInWithGoogle: (idToken: string) => Promise<void>
  /** 登出 */
  signOut: () => Promise<void>
  /** 注销账号：彻底删除本人及全部关联数据 */
  deleteAccount: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  token: '',
  registerWithEmail: async () => ({ email: '' }),
  verifyEmail: async () => {},
  resendCode: async () => ({}),
  signInWithEmailPassword: async () => ({ emailVerified: false }),
  sendSmsCode: async () => ({}),
  loginWithPhone: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  forgotPassword: async () => ({}),
  resetPassword: async () => {},
  deleteAccount: async () => {},
})

const TOKEN_KEY = 'nexus_token'
const USER_KEY = 'nexus_user'

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  const text = await res.text().catch(() => '')
  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }
  if (!res.ok) {
    throw new Error(data?.error || `请求失败（${res.status}）`)
  }
  return data
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile>(null)
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY)
    const savedUser = localStorage.getItem(USER_KEY)
    if (!savedToken) {
      setLoading(false)
      return
    }
    // 先用本地保存的 token 立即恢复登录态，避免后端短暂不可用时被误判为未登录
    setToken(savedToken)
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch {
        setUser(null)
      }
    }
    setLoading(false)

    // 后台静默校验：仅当 token 确实无效（401）才清除；网络/服务抖动一律保留本地登录态
    fetch(`/api/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` } })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) {
            setUser(null)
            setToken('')
            localStorage.removeItem(TOKEN_KEY)
            localStorage.removeItem(USER_KEY)
          }
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (!data) return
        const profile: UserProfile = {
          uid: data.uid,
          email: data.email,
          name: data.name || '',
          avatar_url: data.avatar_url || '',
          provider: data.phoneVerified ? 'phone' : 'email',
          emailVerified: !!data.emailVerified,
          phone: data.phone || '',
          phoneVerified: !!data.phoneVerified,
        }
        setUser(profile)
        localStorage.setItem(USER_KEY, JSON.stringify(profile))
      })
      .catch(() => {
        /* 网络或服务暂时不可用：保留本地登录态，下次再校验 */
      })
  }, [])

  const persist = (data: any) => {
    const u = data?.user
    if (!u || !u.uid) {
      throw new Error('登录失败：服务器返回的数据异常，请检查网络或服务器地址后重试')
    }
    if (!data?.token) {
      throw new Error('登录失败：未获取到登录凭证，请稍后重试')
    }
    const profile: UserProfile = {
      uid: u.uid,
      email: u.email,
      name: u.name || '',
      avatar_url: u.avatar_url || '',
      provider: u.provider || (u.phoneVerified ? 'phone' : 'email'),
      emailVerified: !!u.emailVerified,
      phone: u.phone || '',
      phoneVerified: !!u.phoneVerified,
    }
    setToken(data.token)
    setUser(profile)
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(profile))
  }

  const registerWithEmail = async (email: string, password: string) => {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    return { email: data.email || email, devCode: data.devCode }
  }

  const verifyEmail = async (email: string, code: string) => {
    const data = await api('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    })
    persist(data)
  }

  const resendCode = async (email: string) => {
    const data = await api('/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
    return { devCode: data.devCode }
  }

  const signInWithEmailPassword = async (email: string, password: string) => {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    persist(data)
    return { emailVerified: !!data.emailVerified }
  }

  const sendSmsCode = async (phone: string) => {
    const data = await api('/auth/send-sms', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    })
    return { devCode: data.devCode }
  }

  const loginWithPhone = async (phone: string, code: string) => {
    const data = await api('/auth/phone-login', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    })
    persist(data)
  }

  const signInWithGoogle = async (idToken: string) => {
    const data = await api('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    })
    persist(data)
  }

  const signOut = async () => {
    try {
      await api('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } finally {
      setUser(null)
      setToken('')
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  }

  const forgotPassword = async (email: string) => {
    const data = await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
    return { devCode: data.devCode }
  }

  const resetPassword = async (email: string, code: string, password: string) => {
    await api('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, password }),
    })
  }

  const deleteAccount = async () => {
    await api('/auth/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    setUser(null)
    setToken('')
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        token,
        registerWithEmail,
        verifyEmail,
        resendCode,
        signInWithEmailPassword,
        sendSmsCode,
        loginWithPhone,
        signInWithGoogle,
        signOut,
        forgotPassword,
        resetPassword,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
