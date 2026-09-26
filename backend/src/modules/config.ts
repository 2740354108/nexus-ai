import { Router } from 'express'
import { query, queryOne } from '../lib/db'
import { authMiddleware, AuthenticatedRequest } from './auth'

/**
 * 云端用户配置（多租户隔离核心）
 *
 * 之前用户的密钥 / 技术栈 / MCP / 飞书等配置都存在前端本地（localStorage），
 * 换设备即丢失、卖家也无法按账号区分与管理。
 * 这里把配置落到云端 user_configs 表，按 user_id 强隔离：
 * - 每位买家拥有独立配置空间，互不可见、互不串数据
 * - 卖家（你）可在后台为指定账号预置默认值
 */
export const configRouter = Router()

/** 启动时确保云端配置表存在（幂等） */
export async function ensureConfigSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS user_configs (
      user_id TEXT PRIMARY KEY,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`,
    [],
    'migrate'
  )
}

// 读取当前账号的云端配置
configRouter.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const row = await queryOne<{ config: any }>(
    'SELECT config FROM user_configs WHERE user_id = $1',
    [req.user!.uid],
    'read'
  )
  res.json({ success: true, config: row?.config || {} })
})

// 全量覆盖保存当前账号的云端配置
configRouter.put('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const config = req.body?.config
  if (typeof config !== 'object' || config === null) {
    return res.status(400).json({ error: 'config 必须是对象' })
  }
  const exists = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM user_configs WHERE user_id = $1',
    [req.user!.uid],
    'read'
  )
  if (exists) {
    await query(
      'UPDATE user_configs SET config = $2::jsonb, updated_at = now() WHERE user_id = $1',
      [req.user!.uid, JSON.stringify(config)],
      'write'
    )
  } else {
    await query(
      'INSERT INTO user_configs (user_id, config) VALUES ($1, $2::jsonb)',
      [req.user!.uid, JSON.stringify(config)],
      'write'
    )
  }
  res.json({ success: true, config })
})

// 局部合并更新（PATCH 语义，避免覆盖未传入字段）
configRouter.patch('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const patch = req.body?.config
  if (typeof patch !== 'object' || patch === null) {
    return res.status(400).json({ error: 'config 必须是对象' })
  }
  const row = await queryOne<{ config: any }>(
    'SELECT config FROM user_configs WHERE user_id = $1',
    [req.user!.uid],
    'read'
  )
  const merged = { ...(row?.config || {}), ...patch }
  if (row) {
    await query(
      'UPDATE user_configs SET config = $2::jsonb, updated_at = now() WHERE user_id = $1',
      [req.user!.uid, JSON.stringify(merged)],
      'write'
    )
  } else {
    await query(
      'INSERT INTO user_configs (user_id, config) VALUES ($1, $2::jsonb)',
      [req.user!.uid, JSON.stringify(merged)],
      'write'
    )
  }
  res.json({ success: true, config: merged })
})
