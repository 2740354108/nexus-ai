import React from 'react'
import { useAuth } from './AuthContext'

export type HistoryKind = 'image' | 'video' | 'music' | 'code' | 'text'

export interface HistoryRecord {
  id: number
  kind: HistoryKind
  title: string
  content?: string
  thumb?: string
  created_at: string
}

async function api(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
      ...options?.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`)
  }
  return data
}

/** 保存一条生成记录（登录后可用）。 */
export async function saveHistory(
  token: string,
  record: { kind: HistoryKind; title: string; content?: string; thumb?: string }
): Promise<number | undefined> {
  const data = await api('/histories', token, {
    method: 'POST',
    body: JSON.stringify(record),
  })
  return data.id
}

/** 读取当前用户的生成记录。 */
export async function listHistories(
  token: string,
  kind?: HistoryKind
): Promise<HistoryRecord[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : ''
  const data = await api(`/histories${qs}`, token, { method: 'GET' })
  return data.data || []
}

/** 删除一条生成记录。 */
export async function deleteHistory(token: string, id: number): Promise<void> {
  await api(`/histories/${id}`, token, { method: 'DELETE' })
}

/** React hook：读取当前用户的历史记录。 */
export function useHistories(kind?: HistoryKind) {
  const { token, user } = useAuth()
  const [records, setRecords] = React.useState<HistoryRecord[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!user || !token) {
      setRecords([])
      return
    }
    setLoading(true)
    listHistories(token, kind)
      .then(setRecords)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user, token, kind])

  return { records, loading, error, refresh: () => listHistories(token, kind).then(setRecords) }
}
