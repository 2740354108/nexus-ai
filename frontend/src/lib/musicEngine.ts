/**
 * 浏览器本地音乐合成引擎（零成本兜底方案）
 * 当云端 AI 音乐服务（Suno / MiniMax / ACE-Step 等）不可用或无额度时，
 * 由本引擎用 Web Audio API 现场合成一段短旋律，编码为 WAV 返回。
 */

export type SynthResult = {
  title: string;
  duration: number;
  audioUrl: string;
};

type StyleConfig = {
  root: number; // 根音频率 (Hz)
  scale: number[]; // 音阶半音偏移
  tempo: number; // BPM
  wave: OscillatorType; // 振荡器波形
  cutoff: number; // 低通滤波截止频率
};

const STYLE_MAP: Record<string, StyleConfig> = {
  流行: { root: 261.63, scale: [0, 2, 4, 7, 9, 12], tempo: 120, wave: "triangle", cutoff: 4500 },
  电子: { root: 220.0, scale: [0, 3, 5, 7, 10, 12], tempo: 128, wave: "sawtooth", cutoff: 6000 },
  摇滚: { root: 196.0, scale: [0, 2, 3, 5, 7, 10], tempo: 140, wave: "square", cutoff: 5500 },
  古风: { root: 293.66, scale: [0, 2, 4, 7, 9], tempo: 96, wave: "sine", cutoff: 3500 },
  说唱: { root: 174.61, scale: [0, 3, 5, 7, 10], tempo: 100, wave: "square", cutoff: 4000 },
  轻音乐: { root: 329.63, scale: [0, 2, 4, 7, 9, 12], tempo: 84, wave: "sine", cutoff: 3000 },
  "R&B": { root: 246.94, scale: [0, 3, 5, 7, 10, 12], tempo: 92, wave: "triangle", cutoff: 4000 },
  民谣: { root: 293.66, scale: [0, 2, 4, 7, 9], tempo: 88, wave: "triangle", cutoff: 3200 },
};

const DEFAULT_CFG: StyleConfig = {
  root: 261.63,
  scale: [0, 2, 4, 7, 9, 12],
  tempo: 110,
  wave: "triangle",
  cutoff: 4500,
};

/** 简易确定性伪随机，保证同一 prompt 生成稳定的旋律 */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 将一段音符序列渲染为单声道 Float32 PCM */
function renderMelody(cfg: StyleConfig, totalBeats: number, rng: () => number): { samples: Float32Array; sampleRate: number } {
  const sampleRate = 44100;
  const beatDur = 60 / cfg.tempo;
  const totalSamples = Math.ceil(totalBeats * beatDur * sampleRate);
  const samples = new Float32Array(totalSamples);

  // 每个 beat 一个音符，偶尔加连音
  let cursor = 0;
  let beatIndex = 0;
  while (cursor < totalSamples) {
    const noteIdx = Math.floor(rng() * cfg.scale.length);
    const octave = Math.random() < 0.25 ? 12 : 0;
    const freq = cfg.root * Math.pow(2, (cfg.scale[noteIdx] + octave) / 12);

    // 时值：0.5 / 1 / 1.5 beat
    const durChoices = [0.5, 1, 1, 1.5];
    const dur = durChoices[Math.floor(rng() * durChoices.length)] * beatDur;
    const len = Math.min(Math.floor(dur * sampleRate), totalSamples - cursor);

    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      // 简单的 ADSR 包络，避免爆音
      const attack = 0.01;
      const release = 0.08;
      let env = 1;
      if (t < attack) env = t / attack;
      else if (t > dur - release) env = Math.max(0, (dur - t) / release);
      const env2 = env * env; // 平滑

      // 主音 + 轻微泛音
      const main = Math.sin(2 * Math.PI * freq * t);
      const harm = Math.sin(2 * Math.PI * freq * 2 * t) * 0.25;
      let v = (main + harm) * 0.5 * env2;

      // 低通风格衰减（按截止频率粗略模拟）
      if (cfg.cutoff < 4000) v *= 0.85;

      // 低频鼓点（每 4 拍一次）
      if (beatIndex % 4 === 0 && t < 0.12) {
        const kick = Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t * 30) * 0.6;
        v += kick;
      }
      samples[cursor + i] += v * 0.6;
    }

    cursor += len;
    beatIndex++;
  }

  // 整体归一化，留一点余量
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak > 0) {
    const gain = 0.9 / peak;
    for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  }

  return { samples, sampleRate };
}

/** 将单声道 PCM 编码为 16-bit WAV Blob */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // 单声道
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // channels = 1
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/** 生成标题：从 prompt 取前几个字，否则用风格命名 */
function buildTitle(prompt: string, style: string): string {
  const cleaned = prompt.replace(/[,，。.！!？?]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const head = words.slice(0, 4).join(" ");
  return head || `${style}小调`;
}

export async function synthesizeSong(prompt: string, style: string): Promise<SynthResult> {
  const cfg = STYLE_MAP[style] || DEFAULT_CFG;
  const rng = makeRng(hashString(`${style}|${prompt}`));

  const totalBeats = 32; // 约 16-20 秒
  const { samples, sampleRate } = renderMelody(cfg, totalBeats, rng);
  const wav = encodeWav(samples, sampleRate);
  const audioUrl = URL.createObjectURL(wav);
  const duration = Math.round((samples.length / sampleRate) * 10) / 10;

  return {
    title: buildTitle(prompt, style),
    duration,
    audioUrl,
  };
}
