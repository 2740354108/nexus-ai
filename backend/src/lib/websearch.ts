// 联网搜索：默认使用 DuckDuckGo（免 API Key，开箱即用），
// 也可在环境变量中配置 Tavily / Brave / 自建 SearxNG 以获得更稳定的结果。
// 所有 provider 失败时一律返回空数组，绝不影响正常对话。

export type SearchResult = { title: string; url: string; snippet: string }

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function cleanUrl(u: string): string {
  // DuckDuckGo 重定向链接中提取真实地址
  const m = u.match(/[?&]uddg=([^&]+)/)
  if (m) {
    try {
      return decodeURIComponent(m[1])
    } catch {
      /* ignore */
    }
  }
  if (u.startsWith('//')) return 'https:' + u
  return u
}

async function searchDuckDuckGo(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal,
  })
  if (!resp.ok) throw new Error(`DDG ${resp.status}`)
  const html = await resp.text()
  const links = [
    ...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g),
  ]
  const snippets = [
    ...html.matchAll(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g),
  ]
  const results: SearchResult[] = []
  for (let i = 0; i < Math.min(links.length, 5); i++) {
    const title = stripHtml(links[i][2])
    const url = cleanUrl(links[i][1])
    const snippet = snippets[i] ? stripHtml(snippets[i][1]) : ''
    if (title) results.push({ title, url, snippet })
  }
  return results
}

async function searchTavily(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const key = process.env.TAVILY_API_KEY
  if (!key) throw new Error('TAVILY_API_KEY 未配置')
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, query, max_results: 5, search_depth: 'basic' }),
    signal,
  })
  if (!resp.ok) throw new Error(`Tavily ${resp.status}`)
  const data: any = await resp.json()
  return (data.results || [])
    .slice(0, 5)
    .map((r: any) => ({ title: r.title || '', url: r.url || '', snippet: r.content || '' }))
}

async function searchBrave(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const key = process.env.BRAVE_API_KEY
  if (!key) throw new Error('BRAVE_API_KEY 未配置')
  const resp = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
    { headers: { Accept: 'application/json', 'X-Subscription-Token': key }, signal }
  )
  if (!resp.ok) throw new Error(`Brave ${resp.status}`)
  const data: any = await resp.json()
  return (data.web?.results || [])
    .slice(0, 5)
    .map((r: any) => ({ title: r.title || '', url: r.url || '', snippet: r.description || '' }))
}

async function searchSearxng(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const base = (process.env.SEARXNG_URL || '').replace(/\/+$/, '')
  if (!base) throw new Error('SEARXNG_URL 未配置')
  const resp = await fetch(`${base}/search?q=${encodeURIComponent(query)}&format=json`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!resp.ok) throw new Error(`SearXNG ${resp.status}`)
  const data: any = await resp.json()
  return (data.results || [])
    .slice(0, 5)
    .map((r: any) => ({ title: r.title || '', url: r.url || '', snippet: r.content || '' }))
}

export async function webSearch(query: string): Promise<SearchResult[]> {
  const provider = (process.env.AI_SEARCH_PROVIDER || 'duckduckgo').toLowerCase()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    switch (provider) {
      case 'tavily':
        return await searchTavily(query, controller.signal)
      case 'brave':
        return await searchBrave(query, controller.signal)
      case 'searxng':
        return await searchSearxng(query, controller.signal)
      default:
        return await searchDuckDuckGo(query, controller.signal)
    }
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** 把搜索结果拼成可注入 system 的文本（空结果返回空串） */
export function buildWebContext(results: SearchResult[]): string {
  if (!results || results.length === 0) return ''
  const body = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join('\n\n')
    .slice(0, 4000)
  return `\n\n【实时联网检索资料】（以下为网络搜索结果，请在回答中适当引用来源，无法确认的内容请说明）\n${body}`
}
