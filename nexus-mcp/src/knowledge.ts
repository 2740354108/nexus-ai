import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export type KnowledgeDoc = {
  name: string;
  path: string;
  text: string;
};

const SUPPORTED = [".md", ".txt", ".markdown"];

/** 递归读取 knowledge 目录下所有支持的文本文件 */
export function loadKnowledge(dir: string): KnowledgeDoc[] {
  if (!existsSync(dir)) return [];
  const docs: KnowledgeDoc[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      const ext = entry.toLowerCase().slice(entry.lastIndexOf("."));
      if (SUPPORTED.includes(ext)) {
        try {
          docs.push({ name: entry, path: full, text: readFileSync(full, "utf8") });
        } catch {
          /* 忽略无法读取的文件 */
        }
      }
    }
  };
  walk(dir);
  return docs;
}

/**
 * 极简关键词检索：按词频打分，返回最相关的若干片段。
 * 不依赖向量库，够小、够用；以后要更准可换成本地嵌入检索。
 */
export function queryKnowledge(docs: KnowledgeDoc[], query: string, limit = 3): string {
  if (docs.length === 0) {
    return "（知识库为空：把资料放进 knowledge/ 目录后，这里就能被查到）";
  }
  const qWords = query
    .toLowerCase()
    .split(/[\s，。、,.\n]+/)
    .filter((w) => w.length >= 1);

  const scored = docs.map((doc) => {
    const lower = doc.text.toLowerCase();
    let score = 0;
    for (const w of qWords) {
      if (!w) continue;
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = lower.match(new RegExp(escaped, "g"));
      score += matches ? matches.length : 0;
    }
    for (const w of qWords) {
      if (doc.name.toLowerCase().includes(w)) score += 5;
    }
    return { doc, score };
  });

  const hits = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (hits.length === 0) {
    return "（没在知识库里找到相关内容，可换个说法，或把相关资料放进 knowledge/ 目录）";
  }
  return hits
    .map((h, i) => `【资料 ${i + 1}】${h.doc.name}\n${h.doc.text.slice(0, 2000)}`)
    .join("\n\n---\n\n");
}
