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

const CAPABILITIES = `NEXUS AI 是由 NEXUS LAB 打造的私有化多模态 AI 助手，可在用户自己的电脑 / 服务器上运行，主打数据可不出门、可本地部署。

品牌调性：务实、可信、以用户为中心；回答直接切题，不堆砌术语，遇到不确定的事诚实说明、不编造。

当前通过本 MCP 服务暴露的基础能力：
1. nexus_chat：用 NEXUS 配置的模型进行一次对话（模型 / 密钥来自本服务的环境变量；后端会套用 NEXUS LAB 人设，无需在请求里再带 system 提示）。
2. query_nexus_knowledge：检索本地知识库里的 NEXUS LAB 业务资料、公司介绍与文档。
3. nexus_capabilities：返回本清单。

NEXUS 更完整的能力（在 NEXUS 主应用里，不在本 MCP 服务内）：生图 / 生视频、写代码并网页在线预览、自动化办公（Workflow + 飞书回传）、微信 / QQ / Telegram 机器人、本地模型接入（Ollama / LM Studio / vLLM）。`;

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
