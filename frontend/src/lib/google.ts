// Google Identity Services 脚本加载与配置读取

let scriptPromise: Promise<void> | null = null

export function loadGoogleScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const w = window as any
  if (w.google?.accounts?.id) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    const timer = setTimeout(() => {
      reject(new Error('Google 脚本加载超时，请检查网络或 VPN'))
    }, 10000)
    script.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    script.onerror = () => {
      clearTimeout(timer)
      reject(new Error('Google 脚本加载失败，请确认网络可访问 accounts.google.com'))
    }
    document.body.appendChild(script)
  })
  return scriptPromise
}

export function getGoogleClientId(): string {
  return (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || ''
}
