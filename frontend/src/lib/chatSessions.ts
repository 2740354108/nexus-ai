import { useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { loadChatHistory, saveChatHistory, clearChatHistory } from './chatHistory'

export type StoredMessage = {
  role: 'user' | 'assistant'
  content: string
  image?: string
}

export type SessionSummary = {
  id: string
  title: string
  updated_at?: string
}

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

/** 列出当前用户的会话（仅摘要） */
export async function listSessions(token: string): Promise<SessionSummary[]> {
  try {
    const r = await fetch('/api/conversations', { headers: authHeaders(token) })
    const d = await r.json().catch(() => null)
    if (d?.success) return d.data || []
  } catch {
    /* 网络失败：返回空，后续回落本机 */
  }
  return []
}

/** 读取单个会话完整消息 */
export async function getSession(
  token: string,
  id: string,
): Promise<{ id: string; title: string; messages: StoredMessage[] }> {
  try {
    const r = await fetch(`/api/conversations/${id}`, { headers: authHeaders(token) })
    const d = await r.json().catch(() => null)
    if (d?.success) return d.data
  } catch {
    /* ignore */
  }
  return { id, title: '', messages: [] }
}

/** 新建或更新会话（upsert） */
export async function saveSession(
  token: string,
  id: string,
  title: string,
  messages: StoredMessage[],
): Promise<string> {
  try {
    const r = await fetch('/api/conversations', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ id, title, messages }),
    })
    const d = await r.json().catch(() => null)
    return d?.id || id
  } catch {
    return id
  }
}

/** 删除会话 */
export async function deleteSession(token: string, id: string): Promise<void> {
  try {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE', headers: authHeaders(token) })
  } catch {
    /* ignore */
  }
}

/**
 * 统一对话状态：登录走云端（按账号隔离、可多会话），未登录走本机 localStorage。
 */
export function useCloudChat() {
  const { token, user } = useAuth()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [ready, setReady] = useState(false)

  // 初始加载：登录拉云端最近会话，未登录拉本机
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (user && token) {
        const list = await listSessions(token)
        if (cancelled) return
        setSessions(list)
        if (list.length) {
          const full = await getSession(token, list[0].id)
          if (cancelled) return
          setActiveId(full.id)
          setMessages(full.messages)
        }
      } else {
        const h = await loadChatHistory()
        if (cancelled) return
        setMessages(h)
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [user, token])

  // 消息变化后防抖保存
  useEffect(() => {
    if (!ready) return
    const cleaned = messages.filter((m) => m.content.trim().length > 0)
    if (!cleaned.length) return
    const t = setTimeout(() => {
      void (async () => {
        const title = (cleaned.find((m) => m.role === 'user')?.content || '新对话').slice(0, 40)
        if (user && token) {
          const id = await saveSession(token, activeId || '', title, cleaned)
          setActiveId(id)
          setSessions((prev) => {
            const ex = prev.find((s) => s.id === id)
            return ex
              ? prev.map((s) => (s.id === id ? { ...s, title } : s))
              : [{ id, title }, ...prev]
          })
        } else {
          await saveChatHistory(cleaned)
        }
      })()
    }, 500)
    return () => clearTimeout(t)
  }, [messages, ready, user, token, activeId])

  async function switchTo(id: string) {
    if (id === activeId) return
    const full = await getSession(token!, id)
    setActiveId(full.id)
    setMessages(full.messages)
  }

  function newSession() {
    setActiveId(null)
    setMessages([])
  }

  async function remove(id: string) {
    if (user && token) await deleteSession(token, id)
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      if (id === activeId) {
        if (next.length) void switchTo(next[0].id)
        else {
          setActiveId(null)
          setMessages([])
        }
      }
      return next
    })
    if (!(user && token)) await clearChatHistory()
  }

  return {
    token,
    user,
    sessions,
    activeId,
    messages,
    setMessages,
    ready,
    newSession,
    switchTo,
    remove,
  }
}
