#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import { loadKnowledge, queryKnowledge, type KnowledgeDoc } from "./knowledge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = join(__dirname, "..", "knowledge");

const CAPABILITIES = `NEXUS AI 是一个独立 AI 应用，当前支持的能力：
1. 智能对话（可接 OpenRouter 或本地模型，支持工具调用与调用另一个模型）
2. 生图 / 生视频（可直连用户自己的 ComfyUI）
3. 写代码并网页在线预览
4. 自动化办公（接用户自建 HTTP 技术栈 + 飞书回传）
5. 自带密钥 / 本地部署，数据可不出门`;

// 启动时一次性载入知识库（你往 knowledge/ 丢文件，重启服务即可生效）
let docs: KnowledgeDoc[] = [];
try {
  docs = loadKnowledge(KNOWLEDGE_DIR);
} catch {
  docs = [];
}

/** 把工具注册到任意一个 McpServer 实例上（本地/云端复用同一套工具） */
function registerTools(server: McpServer) {
  server.tool(
    "query_nexus_knowledge",
    "查询 NEXUS AI 本地知识库中的业务资料。当用户问到 NEXUS AI 相关的公司业务、项目、文档内容时使用。",
    { query: z.string().describe("要查找的关键词或问题") },
    async ({ query }) => {
      return { content: [{ type: "text", text: queryKnowledge(docs, query) }] };
    }
  );

  server.tool(
    "nexus_capabilities",
    "返回 NEXUS AI 当前支持的功能清单，用于了解这个应用能做什么。",
    {},
    async () => {
      return { content: [{ type: "text", text: CAPABILITIES }] };
    }
  );

  server.tool(
    "nexus_chat",
    "通过 NEXUS AI 配置的模型进行一次对话。模型地址/名称/密钥来自环境变量 NEXUS_CHAT_BASE_URL / NEXUS_CHAT_MODEL / NEXUS_CHAT_API_KEY。",
    { message: z.string().describe("发给模型的内容") },
    async ({ message }) => {
      const base = process.env.NEXUS_CHAT_BASE_URL;
      const model = process.env.NEXUS_CHAT_MODEL;
      const key = process.env.NEXUS_CHAT_API_KEY || "";
      if (!base || !model) {
        return {
          content: [
            {
              type: "text",
              text: "（未配置 NEXUS_CHAT_BASE_URL / NEXUS_CHAT_MODEL 环境变量，无法调用模型。可在 .env 里填好）",
            },
          ],
        };
      }
      try {
        const endpoint = base.replace(/\/+$/, "") + "/chat/completions";
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: message }],
            stream: false,
          }),
        });
        const data = await resp.json();
        const text =
          data?.choices?.[0]?.message?.content ||
          data?.choices?.[0]?.text ||
          JSON.stringify(data).slice(0, 1000);
        return { content: [{ type: "text", text: String(text) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `调用失败：${e?.message || e}` }] };
      }
    }
  );
}

const TRANSPORT = (process.env.TRANSPORT || "stdio").toLowerCase();

if (TRANSPORT === "http") {
  // ===== 云端模式：HTTP（Streamable HTTP），可被远程 Claude Code 调用 =====
  const port = Number(process.env.PORT || 8787);
  const token = process.env.MCP_TOKEN || "";

  const httpServer = createServer(async (req, res) => {
    // CORS（允许跨域与远程调用）
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, mcp-session-id, Accept, Accept-Encoding"
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // 密钥校验
    if (token) {
      const auth = req.headers["authorization"] || "";
      if (!auth.startsWith("Bearer ") || auth.slice(7) !== token) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "unauthorized" }, id: null }));
        return;
      }
    }

    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      let body: any;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "parse error" }, id: null }));
        return;
      }
      // 无状态模式：每个请求用独立 server + transport 实例，部署最简单
      const server = new McpServer({ name: "nexus-ai", version: "0.1.0" });
      registerTools(server);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    // GET/DELETE 在无状态模式下暂不需要，返回 405
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }));
  });

  httpServer.listen(port, () => {
    // 走 stderr，避免污染 stdout
    console.error(`[nexus-mcp] HTTP 模式已启动，监听 :${port}${token ? "（已启用密钥）" : "（未设密钥，公网请勿裸奔）"}`);
  });
} else {
  // ===== 本地模式：stdio（Claude Code 本地进程直连）=====
  const server = new McpServer({ name: "nexus-ai", version: "0.1.0" });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 注意：stdio 模式下 stdout 是 MCP 通信通道，千万不要在这里 console.log
}
