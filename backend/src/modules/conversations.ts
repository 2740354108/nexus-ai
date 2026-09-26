import { Router } from 'express'
import { randomUUID } from 'crypto'
import { authMiddleware, AuthenticatedRequest } from './auth'
import { query, queryOne } from '../lib/db'

export const conversationsRouter = Router()
conversationsRouter.use(authMiddleware)

/** 每个登录用户拥有自己的会话表，按 user_id 隔离 */
async function ensureSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      messages TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`,
    [],
    'write',
  )
}
ensureSchema().catch((e) => console.error('[conversations] 建表失败:', e))

/** 列出当前用户的所有会话（不含消息体，仅摘要） */
conversationsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const uid = req.user!.uid
  const { rows } = await query(
    'SELECT id, title, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100',
    [uid],
    'write',
  )
  res.json({ success: true, data: rows })
})

/** 读取单个会话的完整消息 */
conversationsRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  const uid = req.user!.uid
  const row = await queryOne<{ id: string; title: string; messages: string }>(
    'SELECT id, title, messages FROM conversations WHERE id = $1 AND user_id = $2',
    [req.params.id, uid],
    'write',
  )
  if (!row) return res.status(404).json({ error: '会话不存在' })
  let messages: any[] = []
  try {
    messages = JSON.parse(row.messages || '[]')
  } catch {
    messages = []
  }
  res.json({ success: true, data: { id: row.id, title: row.title, messages } })
})

/** 新建或更新会话（upsert）：前端传 id 则更新，否则新建 */
conversationsRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const uid = req.user!.uid
  const { id, title, messages } = req.body
  const cid = typeof id === 'string' && id ? id : randomUUID()
  const titleStr = typeof title === 'string' ? title.slice(0, 200) : ''
  const msgsStr = JSON.stringify(Array.isArray(messages) ? messages : [])
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
    [cid, uid],
    'write',
  )
  if (existing) {
    await query(
      'UPDATE conversations SET title = $1, messages = $2, updated_at = now() WHERE id = $3 AND user_id = $4',
      [titleStr, msgsStr, cid, uid],
      'write',
    )
  } else {
    await query(
      'INSERT INTO conversations (id, user_id, title, messages, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())',
      [cid, uid, titleStr, msgsStr],
      'write',
    )
  }
  res.json({ success: true, id: cid })
})

/** 删除会话 */
conversationsRouter.delete('/:id', async (req: AuthenticatedRequest, res) => {
  const uid = req.user!.uid
  await query(
    'DELETE FROM conversations WHERE id = $1 AND user_id = $2',
    [req.params.id, uid],
    'write',
  )
  res.json({ success: true })
})
