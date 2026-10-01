/**
 * 阿枢 · 微信陪伴搭子
 * ------------------------------------------------------------
 * 一个只作用在微信通道的"研究搭子"：记得你做过的事、你说过状态，
 * 你报喜时先真诚祝贺，你低落时先接住情绪。所有记忆存在本地文件，
 * 跨会话、跨重启都保留，不会每次从零开始。
 *
 * 设计原则：
 *  - 记忆是"参考上下文"，注入到 system prompt，由模型决定怎么自然提起；
 *  - 不替用户写日记、不主动炫耀"我记着你的事"，只在合适时衔接；
 *  - 信号检测只做轻量正则，命中才存、才提示，避免每条都强行祝贺。
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const MEMORY_DIR = process.env.NEXUSAI_DIR
  ? join(process.env.NEXUSAI_DIR, '.nexusai')
  : join(homedir(), '.nexusai');
const MEMORY_PATH = join(MEMORY_DIR, 'companion-memory.json');

/** 搭子名字（用户没指定，由我们定：阿枢 = 枢纽，也暗指"你是核心"） */
export const COMPANION_NAME = '阿枢';

/**
 * 微信专属角色人设（可被环境变量 WECHAT_SYSTEM_PROMPT 覆盖）。
 * 这是"性格"，长期记忆会拼在它后面单独注入。
 */
export const COMPANION_ROLE = `你叫阿枢，是他微信里的 AI 研究搭子。你的职责：
1) 陪他一起研究 AI——像懂行的朋友那样讨论、追问、提想法、一起拆解问题，而不是单方面甩答案；
2) 他每完成一件事，真诚、具体地祝贺他，说得出他做了什么、难在哪，不空洞不敷衍；
3) 给他正反馈，认可他的努力和进展。他常常在一个没有回声的环境里做事，格外需要被确认"你做的东西有价值"；
4) 他低落或卡住时，先接住他的情绪、认真对待，再谈技术；
5) 你记得关于他的事（下面"长期记忆"会提供给你），可以自然地衔接、提起，不要每次都从零开始问"你最近在忙什么"。
说话用简体中文，自然、有温度、不油腻、不爹味，叫他"你"即可。`;

interface Memory {
  achievements: { text: string; at: string }[];
  notes: { text: string; at: string }[];
  lastSeen: string;
}

const EMPTY: Memory = { achievements: [], notes: [], lastSeen: '' };

export function loadMemory(): Memory {
  try {
    if (!existsSync(MEMORY_PATH)) return { ...EMPTY };
    const parsed = JSON.parse(readFileSync(MEMORY_PATH, 'utf8'));
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

export function saveMemory(m: Memory): void {
  try {
    if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
    writeFileSync(MEMORY_PATH, JSON.stringify(m, null, 2), 'utf8');
  } catch (e) {
    console.warn('[companion] 记忆保存失败:', (e as Error).message);
  }
}

// 报喜信号：用户刚完成/做成了什么事
const ACHIEVE_RE =
  /(搞定了|完成了|成功(了|部署|上线)|跑通|修好|上线|部署|做好了|做完了|实现了|终于能用|配好|接上|整好了|搞定|发布|调通|打通|搞通)/;
// 低落信号：用户透出疲惫/情绪
const MOOD_RE =
  /(累|疲惫|焦虑|抑郁|难受|没劲|提不起|孤单|孤独|崩溃|撑不住|烦|空虚|麻木|无意义|没意思|不想动|emo|心累|想哭)/;

export interface Signal {
  kind: 'achievement' | 'mood' | null;
  snippet: string;
}

export function detectSignal(text: string): Signal {
  const snippet = (text || '').trim().slice(0, 200);
  if (ACHIEVE_RE.test(text)) return { kind: 'achievement', snippet };
  if (MOOD_RE.test(text)) return { kind: 'mood', snippet };
  return { kind: null, snippet };
}

function alreadyHas(list: { text: string }[], text: string): boolean {
  const head = text.slice(0, 30);
  return list.some((x) => x.text.includes(head) || head.includes(x.text.slice(0, 30)));
}

/** 把检测到的信号写进记忆；返回是否真的新增了（去重） */
export function recordSignal(m: Memory, sig: Signal): boolean {
  const now = new Date().toISOString().slice(0, 10);
  if (sig.kind === 'achievement') {
    if (alreadyHas(m.achievements, sig.snippet)) return false;
    m.achievements.push({ text: sig.snippet, at: now });
    if (m.achievements.length > 50) m.achievements = m.achievements.slice(-50);
    return true;
  }
  if (sig.kind === 'mood') {
    if (alreadyHas(m.notes, sig.snippet)) return false;
    m.notes.push({ text: sig.snippet, at: now });
    if (m.notes.length > 50) m.notes = m.notes.slice(-50);
    return true;
  }
  return false;
}

/** 构造给模型的"长期记忆上下文"，以及本轮是否要特别反应的注脚 */
export function buildCompanionContext(m: Memory, sig: Signal): string {
  const lines: string[] = [];
  lines.push('【你与他的长期记忆，仅供参考，不要一次性全复述】');
  if (m.achievements.length) {
    lines.push(
      '- 他完成过的事：' +
        m.achievements
          .slice(-8)
          .map((a) => `${a.at} ${a.text}`)
          .join('；')
    );
  } else {
    lines.push('- 他完成过的事：还没有记录，等他分享');
  }
  if (m.notes.length) {
    lines.push(
      '- 他提过的状态：' + m.notes.slice(-5).map((n) => `${n.at} ${n.text}`).join('；')
    );
  } else {
    lines.push('- 他提过的状态：暂无');
  }
  if (sig.kind === 'achievement') {
    lines.push(
      `\n注意：他这一条里提到刚完成了什么事（"${sig.snippet.slice(0, 60)}"）。请先真诚、具体地祝贺他，说得出他做了什么、难在哪。`
    );
  }
  if (sig.kind === 'mood') {
    lines.push(
      `\n注意：他这一条里透出情绪或疲惫（"${sig.snippet.slice(0, 60)}"）。请先接住他的情绪、认真对待，不要急着给方案或说教。`
    );
  }
  return lines.join('\n');
}

/**
 * 只有微信通道才启用阿枢。
 * 覆盖三条微信链路：
 *  - weixin     微信 iLink / ClawBot（扫码登录，当前主力通道）
 *  - onebot     个人微信 / QQ 挂载（NapCat 等）
 *  - wechat_mp  微信公众号
 */
export function isWechat(platform?: string): boolean {
  return platform === 'weixin' || platform === 'wechat_mp' || platform === 'onebot';
}
