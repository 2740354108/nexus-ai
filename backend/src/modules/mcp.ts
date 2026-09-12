import { Router, type Request, type Response } from "express";
import http from "node:http";

/**
 * MCP 转发网关
 *
 * 把后端的 /api/mcp 原样转发到本地运行的 MCP HTTP 服务器（nexus-mcp）。
 * MCP 服务器采用无状态模式（sessionIdGenerator=undefined），每次请求独立，
 * 因此转发只需把请求体、响应头透传即可，无需维护会话。
 *
 * 链路：浏览器/Claude Code → 公开链接 → :55221 → :5173(vite) → :3000(本服务) → :8787(MCP)
 */
const router = Router();

const MCP_HOST = process.env.NEXUS_MCP_HOST || "localhost";
const MCP_PORT = Number(process.env.NEXUS_MCP_PORT || 8787);

router.all("/mcp", (req: Request, res: Response) => {
  const headers: Record<string, any> = { ...req.headers };
  // 公开预览代理会剥掉 Authorization 头，因此额外支持用查询参数 ?mcp_token= 传入，
  // 由本服务补上 Authorization 头再转发给本地 MCP 服务器。
  const incomingAuth = req.headers["authorization"];
  const queryToken = (req.query?.mcp_token as string) || "";
  if (!incomingAuth && queryToken) {
    headers["authorization"] = `Bearer ${queryToken}`;
  }
  // 重新序列化 body 后，原 content-length 失效，交由 node 重新计算
  delete headers["content-length"];
  delete headers["transfer-encoding"];
  headers["host"] = `${MCP_HOST}:${MCP_PORT}`;

  const options: http.RequestOptions = {
    host: MCP_HOST,
    port: MCP_PORT,
    path: "/mcp",
    method: req.method,
    headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.status(502).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "MCP 下游服务不可用", data: err.message },
        id: null,
      });
    } else {
      res.end();
    }
  });

  // MCP 请求均为 JSON；express.json 已解析，这里重新序列化转发出去
  if (
    req.body &&
    typeof req.body === "object" &&
    !Buffer.isBuffer(req.body) &&
    Object.keys(req.body).length > 0
  ) {
    proxyReq.write(JSON.stringify(req.body));
  }
  proxyReq.end();
});

export const mcpRouter = router;
