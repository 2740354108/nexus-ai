#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadKnowledge, queryKnowledge, type KnowledgeDoc } from "./knowledge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = join(__dirname, "..", "knowledge");

const CAPABILITIES = `NEXUS AI 是一个独立 AI 应用，当前支持的能力：
1. 智能对话（可接 OpenRouter 或本地模型，支持工具调用与调用另一个模型）
2. 生图 / 生视频（可直连用户自己的 ComfyUI）
3. 写代码并网页在线预览
4. 自动化办公（接用户自建 HTTP 技术栈 + 飞书回传）
5. 自带密钥 / 本地部署，数据可不出门`;

// 启动时一次性载入知识库（你往 knowledge/ 丢文件，重启本服务即可生效）
let docs: KnowledgeDoc[] = [];
try {
  docs = loadKnowledge(KNOWLEDGE_DIR);
} catch {
  docs = [];
}

const server = new McpServer({
  name: "nexus-ai",
  version: "0.1.0",
});

// 工具 1：查询本地知识库
server.tool(
  "query_nexus_knowledge",
  "查询 NEXUS AI 本地知识库中的业务资料。当用户问到 NEXUS AI 相关的公司业务、项目、文档内容时使用。",
  { query: z.string().describe("要查找的关键词或问题") },
  async ({ query }) => {
    const result = queryKnowledge(docs, query);
    return { content: [{ type: "text", text: result }] };
  }
);

// 工具 2：返回 NEXUS AI 能力清单
server.tool(
  "nexus_capabilities",
  "返回 NEXUS AI 当前支持的功能清单，用于了解这个应用能做什么。",
  {},
  async () => {
    return { content: [{ type: "text", text: CAPABILITIES }] };
  }
);

// 工具 3：通过 NEXUS AI 配置的模型对话（环境变量提供地址/模型/密钥）
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

const transport = new StdioServerTransport();
await server.connect(transport);
// 注意：stdio 模式下 stdout 是 MCP 通信通道，千万不要在这里 console.log
