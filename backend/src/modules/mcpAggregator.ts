// 后端极简 MCP 聚合（零额外依赖，纯 Node 内置 + 手写 JSON-RPC）
// 与 CLI 的 mcp-client.mjs 对称：读同一份 ~/.nexusai/mcp-servers.json，
// 支持 stdio（本地子进程）与 http（远程 Streamable HTTP）两种 server。
// 默认配置里所有 server 都是 disabled，因此不连接任何东西、对线上零影响。
import { spawn, ChildProcess } from 'child_process'
import https from 'https'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'

const CONFIG_FILE =
  process.env.NEXUS_MCP_CONFIG || path.join(os.homedir(), '.nexusai', 'mcp-servers.json')

interface McpCfg {
  name: string
  enabled?: boolean
  transport?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

// ---------------- stdio ----------------
class StdioMcp {
  private proc: ChildProcess
  private id = 0
  private pending = new Map<number, { resolve: any; reject: any; timer: any }>()
  private buf = ''
  constructor(private cfg: McpCfg) {
    this.proc = spawn(cfg.command!, cfg.args || [], {
      env: { ...process.env, ...(cfg.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.proc.stdout!.on('data', (d: Buffer) => this.onData(d))
    this.proc.on('error', () => {})
  }
  private onData(d: Buffer) {
    this.buf += d.toString()
    let i: number
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim()
      this.buf = this.buf.slice(i + 1)
      if (!line) continue
      let msg: any
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id)
        clearTimeout(timer)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    }
  }
  private req(method: string, params: any): Promise<any> {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error('MCP 请求超时: ' + method))
        }
      }, 20000)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      } catch (e) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(e)
      }
    })
  }
  private notify(method: string, params: any) {
    try {
      this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
    } catch {}
  }
  async connect() {
    await this.req('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'nexus-backend', version: '1.0.0' },
    })
    this.notify('notifications/initialized', {})
  }
  async listTools() {
    const r = await this.req('tools/list', {})
    return (r && r.tools) || []
  }
  async callTool(name: string, args: any) {
    return this.req('tools/call', { name, arguments: args || {} })
  }
  close() {
    try {
      this.proc.kill()
    } catch {}
  }
}

// ---------------- http ----------------
class HttpMcp {
  constructor(private cfg: McpCfg) {}
  private base() {
    return (this.cfg.url || '').replace(/\/+$/, '')
  }
  private post(bodyObj: any): Promise<any> {
    const url = new URL(this.base() + '/mcp')
    const lib = url.protocol === 'https:' ? https : http
    return new Promise((resolve, reject) => {
      const req = lib.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            ...(this.cfg.headers || {}),
          },
        },
        (res) => {
          let data = ''
          res.on('data', (c: any) => (data += c))
          res.on('end', () => {
            let txt = data
            if (data.includes('event:') || /^\s*data:/m.test(data)) {
              const lines = data.split('\n').filter((l) => l.startsWith('data:'))
              txt = lines.length ? lines[lines.length - 1].slice(5).trim() : data
            }
            try {
              const json = JSON.parse(txt)
              if (json.error) reject(new Error(json.error.message || JSON.stringify(json.error)))
              else resolve(json)
            } catch {
              reject(new Error('MCP HTTP 解析失败: ' + data.slice(0, 200)))
            }
          })
        }
      )
      req.on('error', reject)
      req.setTimeout(20000, () => req.destroy(new Error('MCP HTTP 超时')))
      req.write(JSON.stringify(bodyObj))
      req.end()
    })
  }
  async connect() {
    await this.post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'nexus-backend', version: '1.0.0' } },
    })
  }
  async listTools() {
    const r = await this.post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    return (r && r.result && r.result.tools) || (r && r.tools) || []
  }
  async callTool(name: string, args: any) {
    const r = await this.post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args || {} } })
    return (r && r.result) || r || {}
  }
  close() {}
}

function writeDefaultConfig() {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
    const sample = {
      _note:
        'NEXUS AI 多 MCP 配置（前后端共享）。列出要连接的多个 MCP server，可独立 enabled 开/关。' +
        'transport=stdio 本地启动子进程；transport=http 连远程网址。工具名自动加 server 前缀。',
      servers: [
        { name: 'filesystem', enabled: false, transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'], env: {} },
        { name: 'example-http', enabled: false, transport: 'http', url: 'https://your-mcp.example.com/mcp', headers: { Authorization: 'Bearer YOUR_TOKEN' } },
      ],
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(sample, null, 2))
  } catch {}
}

export async function loadMcpServers(): Promise<{ servers: any[]; failed: any[] }> {
  if (!fs.existsSync(CONFIG_FILE)) writeDefaultConfig()
  let cfg: any
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    cfg = { servers: [] }
  }
  const list: McpCfg[] = (cfg.servers || []).filter((s) => s && s.enabled !== false && s.name)
  const servers: any[] = []
  const failed: any[] = []
  for (const s of list) {
    try {
      const client = s.transport === 'http' ? new HttpMcp(s) : new StdioMcp(s)
      await client.connect()
      const tools = await client.listTools()
      servers.push({ name: s.name, transport: s.transport, client, tools })
    } catch (e: any) {
      failed.push({ name: s.name, error: e?.message || String(e) })
    }
  }
  return { servers, failed }
}

export function toOpenAiTools(servers: any[]): any[] {
  const out: any[] = []
  for (const s of servers) {
    for (const t of s.tools || []) {
      out.push({
        type: 'function',
        function: {
          name: s.name + '__' + t.name,
          description: '[' + s.name + '] ' + (t.description || ''),
          parameters: t.inputSchema || { type: 'object', properties: {} },
        },
      })
    }
  }
  return out
}

export async function callMcpToolByName(servers: any[], fullName: string, args: any): Promise<string> {
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      args = {}
    }
  }
  const idx = fullName.indexOf('__')
  const serverName = idx >= 0 ? fullName.slice(0, idx) : fullName
  const toolName = idx >= 0 ? fullName.slice(idx + 2) : fullName
  const s = servers.find((c) => c.name === serverName)
  if (!s) throw new Error('未知 MCP server: ' + serverName)
  const res = await s.client.callTool(toolName, args)
  const content = (res && res.content) || []
  return content.map((c: any) => (c && (c.text != null ? c.text : c.data != null ? c.data : JSON.stringify(c)))).join('\n') || '(工具无输出)'
}

let _cache: { at: number; tools: any[]; servers: any[] } | null = null

// 带 60s 缓存的聚合入口；缓存期内复用已连接的 stdio 子进程
export async function getMcp(): Promise<{ tools: any[]; servers: any[] }> {
  const now = Date.now()
  if (_cache && now - _cache.at < 60_000) return _cache
  if (_cache) {
    for (const s of _cache.servers) {
      try {
        s.client.close()
      } catch {}
    }
  }
  const { servers } = await loadMcpServers()
  _cache = { at: now, tools: toOpenAiTools(servers), servers }
  return _cache
}
