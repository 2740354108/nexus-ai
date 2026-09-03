import { Router } from 'express'
import { authMiddleware, AuthenticatedRequest } from './auth'
import { query, queryOne } from '../lib/db'

export const historiesRouter = Router()

historiesRouter.use(authMiddleware)

historiesRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const { kind } = req.query
  const uid = req.user!.uid
  const sql = kind
    ? 'SELECT id, kind, title, content, thumb, created_at FROM histories WHERE user_id = $1 AND kind = $2 ORDER BY created_at DESC LIMIT 200'
    : 'SELECT id, kind, title, content, thumb, created_at FROM histories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200'
  const params = kind ? [uid, kind] : [uid]
  const { rows } = await query(sql, params, 'write')
  res.json({ success: true, data: rows })
})

historiesRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const { kind, title, content, thumb } = req.body
  if (!kind || !title) {
    return res.status(400).json({ error: 'kind 和 title 必填' })
  }
  const result = await queryOne<{ id: number }>(
    'INSERT INTO histories (user_id, kind, title, content, thumb) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [req.user!.uid, kind, title, content || '', thumb || ''],
    'write'
  )
  res.json({ success: true, id: result?.id })
})

historiesRouter.delete('/:id', async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid id' })
  }
  await query(
    'DELETE FROM histories WHERE id = $1 AND user_id = $2',
    [id, req.user!.uid],
    'write'
  )
  res.json({ success: true })
})
