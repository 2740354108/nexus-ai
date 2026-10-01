// 极简 MCP 客户端（零依赖，仅用 Node 内置模块）
// 支持两种 transport：
//   - stdio：本地启动子进程，按行解析 JSON-RPC（官方 SDK 默认风格）
//   - http：远程 Streamable HTTP（无状态模式，直接 JSON 响应）
// 只实现三件事：initialize / tools/list / tools/call
import { spawn } from 'child_process'
import https from 'https'
import http from 'http'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname } from 'path'

// 配置文件：与 CLI 的 ~/.nexusai/config.json 同目录，前后端共享
const _homedir = homedir()
const _CONFIG_DIR = (_homedir ? _homedir + '/.nexusai' : './.nexusai')
export const MCP_CONFIG_FILE = process.env.NEXUS_MCP_CONFIG || _CONFIG_DIR + '/mcp-servers.json'

// ---------- stdio 客户端 ----------
class StdioMcp {
  constructor(cfg) {
    this.cfg = cfg
    this.proc = null
    this.id = 0
    this.pending = new Map()
    this.buf = ''
  }
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.proc = spawn(this.cfg.command, this.cfg.args || [], {
          env: { ...process.env, ...(this.cfg.env || {}) },
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (e) {
        return reject(e)
      }
      const onErr = (d) => {
        // 仅用于排查，不污染 stdout
        const s = d.toString()
        if (s.trim()) process.stderr.write('[mcp:' + this.cfg.name + '] ' + s)
      }
      this.proc.stderr.on('data', onErr)
      this.proc.stdout.on('data', (d) => this._onData(d))
      this.proc.on('error', (e) => reject(e))
      this.proc.on('exit', (code) => {
        if (this.pending.size) reject(new Error('MCP 进程退出 code=' + code))
      })
      Promise.race([
        this._request('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'nexusai', version: '1.0.0' },
        }),
        new Promise((_, r) => setTimeout(() => r(new Error('initialize 超时')), 15000)),
      ])
        .then(() => {
          this._notify('notifications/initialized', {})
          resolve()
        })
        .catch(reject)
    })
  }
  _onData(d) {
    this.buf += d.toString()
    let i
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim()
      this.buf = this.buf.slice(i + 1)
      if (!line) continue
      let msg
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
  _request(method, params) {
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
        this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      } catch (e) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(e)
      }
    })
  }
  _notify(method, params) {
    try {
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
    } catch {}
  }
  async listTools() {
    const r = await this._request('tools/list', {})
    return (r && r.tools) || []
  }
  async callTool(name, args) {
    return await this._request('tools/call', { name, arguments: args || {} })
  }
  close() {
    try {
      this.proc.kill()
    } catch {}
  }
}

// ---------- http 客户端（Streamable HTTP，无状态） ----------
class HttpMcp {
  constructor(cfg) {
    this.cfg = cfg
    this.base = (cfg.url || '').replace(/\/+$/, '')
    this.headers = cfg.headers || {}
  }
  _post(bodyObj) {
    const body = JSON.stringify(bodyObj)
    const u = new URL(this.base + '/mcp')
    const lib = u.protocol === 'https:' ? https : http
    return new Promise((resolve, reject) => {
      const req = lib.request(
        u,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            ...this.headers,
          },
        },
        (res) => {
          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => {
            let txt = data
            // 兼容 SSE 响应（取最后一个 data: 行）
            if (data.includes('event:') || /^\s*data:/m.test(data)) {
              const lines = data.split('\n').filter((l) => l.startsWith('data:'))
              txt = lines.length ? lines[lines.length - 1].slice(5).trim() : data
            }
            try {
              const json = JSON.parse(txt)
              if (json.error) reject(new Error(json.error.message || JSON.stringify(json.error)))
              else resolve(json)
            } catch (e) {
              reject(new Error('MCP HTTP 解析失败: ' + data.slice(0, 200)))
            }
          })
        }
      )
      req.on('error', reject)
      req.setTimeout(20000, () => req.destroy(new Error('MCP HTTP 超时')))
      req.write(body)
      req.end()
    })
  }
  async connect() {
    // 无状态模式：直接探测连通性，业务请求可独立发送
    await this._post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'nexusai', version: '1.0.0' } },
    })
  }
  async listTools() {
    const r = await this._post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    return (r && r.result && r.result.tools) || (r && r.tools) || []
  }
  async callTool(name, args) {
    const r = await this._post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args || {} } })
    return (r && r.result) || r || {}
  }
  close() {}
}

function writeDefaultConfig() {
  try {
    mkdirSync(dirname(MCP_CONFIG_FILE), { recursive: true })
    const sample = {
      _note:
        'NEXUS AI 多 MCP 配置。列出要连接的多个 MCP server，可独立 enabled 开/关。' +
        'transport=stdio 表示本地用 command+args 启动子进程；transport=http 表示连远程网址。' +
        '工具名会自动加上 server 前缀（如 filesystem__read_file）。连接失败只会警告、不影响聊天。',
      servers: [
        {
          name: 'filesystem',
          enabled: false,
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: {},
        },
        {
          name: 'example-http',
          enabled: false,
          transport: 'http',
          url: 'https://your-mcp.example.com/mcp',
          headers: { Authorization: 'Bearer YOUR_TOKEN' },
        },
      ],
    }
    writeFileSync(MCP_CONFIG_FILE, JSON.stringify(sample, null, 2))
  } catch {}
}

// 加载并连接所有启用的 server。返回 { servers: 已连列表, failed: 失败列表 }
export async function loadMcpServers() {
  if (!existsSync(MCP_CONFIG_FILE)) writeDefaultConfig()
  let cfg
  try {
    cfg = JSON.parse(readFileSync(MCP_CONFIG_FILE, 'utf8'))
  } catch {
    cfg = { servers: [] }
  }
  const list = (cfg.servers || []).filter((s) => s && s.enabled !== false && s.name)
  const servers = []
  const failed = []
  for (const s of list) {
    try {
      const client = s.transport === 'http' ? new HttpMcp(s) : new StdioMcp(s)
      await client.connect()
      const tools = await client.listTools()
      servers.push({ name: s.name, transport: s.transport, client, tools })
    } catch (e) {
      failed.push({ name: s.name, error: e.message || String(e) })
    }
  }
  return { servers, failed }
}

// 转成 OpenAI 工具表（带 server 前缀，避免重名）
export function toOpenAiTools(servers) {
  const out = []
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

// 按全名调用某个 MCP 工具，返回纯文本结果
export async function callMcpToolByName(servers, fullName, args) {
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
  const text = content.map((c) => (c && (c.text != null ? c.text : c.data != null ? c.data : JSON.stringify(c)))).join('\n')
  return text || '(工具无输出)'
}
