/**
 * ComfyUI 直连客户端。
 * 应用可直连用户自己电脑上跑的 ComfyUI（局域网地址），
 * 走官方 HTTP 接口：提交工作流 → 轮询进度 → 取回结果。
 * 不经过任何中间服务器，也不消耗我们的算力。
 */

const CLIENT_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `nexus-${Math.random().toString(36).slice(2)}`;

const normalize = (u: string) => (u || "").trim().replace(/\/+$/, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ComfyFile = { filename: string; subfolder?: string; type?: string };

/* ---------- 基础探测 ---------- */

/** 测试地址是否能连上（读一次系统状态） */
export async function comfyHealth(base: string): Promise<{ ok: boolean; msg: string }> {
  const b = normalize(base);
  if (!b) return { ok: false, msg: "还没有填 ComfyUI 地址" };
  try {
    const resp = await fetch(`${b}/system_stats`);
    if (!resp.ok) return { ok: false, msg: `连上了但返回异常（${resp.status}）` };
    return { ok: true, msg: "已连上你的 ComfyUI" };
  } catch (e: any) {
    return {
      ok: false,
      msg: `${e?.message || "连接失败"}。请确认 ComfyUI 正在运行，且手机与电脑在同一 WiFi 下。`,
    };
  }
}

/** 读取某个节点的定义（用于拿到模型列表、可选参数） */
async function objectInfo(base: string, node: string): Promise<any | null> {
  try {
    const resp = await fetch(`${normalize(base)}/object_info/${encodeURIComponent(node)}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.[node] ?? null;
  } catch {
    return null;
  }
}

/** 从节点定义里取出某个下拉项的候选值 */
function optionsOf(info: any, input: string): string[] {
  const spec = info?.input?.required?.[input] ?? info?.input?.optional?.[input];
  if (!Array.isArray(spec)) return [];
  const first = spec[0];
  if (Array.isArray(first)) return first.map(String);
  if (first === "COMBO" && Array.isArray(spec[1]?.options)) return spec[1].options.map(String);
  return [];
}

/** 从候选值里挑一个：优先命中关键词，否则取第一个 */
function pick(list: string[], keywords: string[], fallback = ""): string {
  for (const k of keywords) {
    const hit = list.find((x) => x.toLowerCase().includes(k.toLowerCase()));
    if (hit) return hit;
  }
  return list[0] ?? fallback;
}

/* ---------- 模型清单（直接读用户机器上的实际文件） ---------- */

export const listCheckpoints = async (base: string) =>
  optionsOf(await objectInfo(base, "CheckpointLoaderSimple"), "ckpt_name");

export const listUnets = async (base: string) =>
  optionsOf(await objectInfo(base, "UNETLoader"), "unet_name");

export const listVaes = async (base: string) =>
  optionsOf(await objectInfo(base, "VAELoader"), "vae_name");

export const listClipVision = async (base: string) =>
  optionsOf(await objectInfo(base, "CLIPVisionLoader"), "clip_name");

export const listClips = async (base: string) =>
  optionsOf(await objectInfo(base, "CLIPLoader"), "clip_name");

/* ---------- 提交与取回 ---------- */

async function uploadImage(base: string, file: File): Promise<string> {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("overwrite", "true");
  const resp = await fetch(`${normalize(base)}/upload/image`, { method: "POST", body: fd });
  if (!resp.ok) throw new Error(`图片上传失败（${resp.status}）`);
  const data = await resp.json();
  return data?.subfolder ? `${data.subfolder}/${data.name}` : String(data?.name);
}

async function submitGraph(base: string, graph: Record<string, unknown>): Promise<string> {
  const resp = await fetch(`${normalize(base)}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: graph, client_id: CLIENT_ID }),
  });
  const data = await resp.json().catch(() => ({}) as any);
  if (!resp.ok) {
    throw new Error(data?.error?.message || data?.error || `提交失败（${resp.status}）`);
  }
  const nodeErrors = data?.node_errors || {};
  const first = Object.values<any>(nodeErrors)[0];
  if (first) {
    const detail = first?.errors?.[0]?.message || first?.errors?.[0]?.details || "";
    throw new Error(`工作流校验失败：${detail || JSON.stringify(first)}`);
  }
  return String(data.prompt_id);
}

async function waitOutputs(
  base: string,
  promptId: string,
  timeoutMs: number,
  onStage?: (s: string) => void,
): Promise<ComfyFile[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(2000);
    let entry: any;
    try {
      const resp = await fetch(`${normalize(base)}/history/${promptId}`);
      if (!resp.ok) continue;
      entry = (await resp.json())?.[promptId];
    } catch {
      continue;
    }
    if (!entry) {
      onStage?.("排队中…");
      continue;
    }
    const status = entry.status || {};
    if (status.status_str === "error" || status.completed === false) {
      const raw = Array.isArray(status.messages) ? status.messages : [];
      const detail = raw
        .map((m: any) => {
          const body = Array.isArray(m) ? m[1] : m;
          return body?.error?.message || body?.message || "";
        })
        .filter(Boolean)
        .join("；");
      throw new Error(detail || "生成出错，请到 ComfyUI 界面查看具体报错");
    }
    const outputs: Record<string, any> = entry.outputs || {};
    for (const nodeOut of Object.values<any>(outputs)) {
      const files = nodeOut?.gifs || nodeOut?.images || nodeOut?.videos;
      if (Array.isArray(files) && files.length) return files as ComfyFile[];
    }
    onStage?.("生成中…");
  }
  throw new Error("生成超时，请到 ComfyUI 界面查看实际进度");
}

async function fetchOutputUrl(base: string, file: ComfyFile): Promise<string> {
  const qs = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder || "",
    type: file.type || "output",
  });
  const resp = await fetch(`${normalize(base)}/view?${qs.toString()}`);
  if (!resp.ok) throw new Error(`读取生成结果失败（${resp.status}）`);
  return URL.createObjectURL(await resp.blob());
}

/* ---------- 画图（文生图） ---------- */

export async function generateComfyImage(opts: {
  base: string;
  checkpoint: string;
  prompt: string;
  negative?: string;
  width: number;
  height: number;
  steps?: number;
  onStage?: (s: string) => void;
}): Promise<string> {
  const b = normalize(opts.base);
  if (!b) throw new Error("请先在「我的 → AI 接口设置」里填写 ComfyUI 地址");
  if (!opts.checkpoint) throw new Error("请先在「我的 → AI 接口设置」里选择画图底模");

  const ksampler = await objectInfo(b, "KSampler");
  const samplers = optionsOf(ksampler, "sampler_name");
  const schedulers = optionsOf(ksampler, "scheduler");

  // Flux / SD3 一类模型不需要反向提示词，采样参数也不同
  const isFlux = /flux|sd3/i.test(opts.checkpoint);
  const steps = opts.steps ?? (isFlux ? 20 : 24);
  const cfg = isFlux ? 1 : 7;
  const seed = Math.floor(Math.random() * 0xffffffff);

  const graph = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: opts.checkpoint } },
    "2": {
      class_type: "EmptyLatentImage",
      inputs: { width: opts.width, height: opts.height, batch_size: 1 },
    },
    "3": { class_type: "CLIPTextEncode", inputs: { text: opts.prompt, clip: ["1", 1] } },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: isFlux ? "" : opts.negative || "", clip: ["1", 1] },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: pick(
          samplers,
          isFlux ? ["euler", "dpmpp_2m"] : ["euler_ancestral", "dpmpp_2m", "euler"],
          "euler",
        ),
        scheduler: pick(schedulers, isFlux ? ["simple", "normal"] : ["normal", "karras"], "normal"),
        denoise: 1,
        model: ["1", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["2", 0],
      },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "nexus_ai", images: ["6", 0] },
    },
  };

  opts.onStage?.("已提交到你的 ComfyUI…");
  const promptId = await submitGraph(b, graph);
  const files = await waitOutputs(b, promptId, 6 * 60 * 1000, opts.onStage);
  return fetchOutputUrl(b, files[0]);
}

/* ---------- 视频（文生视频 / 图生视频，WAN 系列） ---------- */

export async function generateComfyVideo(opts: {
  base: string;
  unet: string;
  vae?: string;
  clip?: string;
  clipVision?: string;
  mode: "t2v" | "i2v";
  imageFile?: File | null;
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  frames?: number;
  steps?: number;
  fps?: number;
  onStage?: (s: string) => void;
}): Promise<string> {
  const b = normalize(opts.base);
  if (!b) throw new Error("请先在「我的 → AI 接口设置」里填写 ComfyUI 地址");
  if (!opts.unet) throw new Error("请先在「我的 → AI 接口设置」里选择视频模型");
  if (opts.mode === "i2v" && !opts.imageFile) throw new Error("图生视频请先选择一张图片");

  // 视频合成节点来自 ComfyUI-VideoHelperSuite，缺了就没法导出 mp4
  const vhs = await objectInfo(b, "VHS_VideoCombine");
  if (!vhs) {
    throw new Error(
      "你的 ComfyUI 缺少 VHS_VideoCombine 节点，请在 ComfyUI 里安装 ComfyUI-VideoHelperSuite 后重启",
    );
  }
  if (opts.mode === "i2v") {
    const i2v = await objectInfo(b, "WanImageToVideo");
    if (!i2v) throw new Error("你的 ComfyUI 版本没有 WanImageToVideo 节点，请更新到最新版 ComfyUI");
  }

  const vaeList = await listVaes(b);
  const clipList = await listClips(b);
  const clipTypes = optionsOf(await objectInfo(b, "CLIPLoader"), "type");
  const ksampler = await objectInfo(b, "KSampler");
  const samplers = optionsOf(ksampler, "sampler_name");
  const schedulers = optionsOf(ksampler, "scheduler");

  const vaeName = opts.vae || pick(vaeList, ["wan", "ae"], "");
  const clipName = opts.clip || pick(clipList, ["umt5", "t5", "wan"], "");
  const clipType = pick(clipTypes, ["wan", "sd3"], "wan");
  if (!vaeName) throw new Error("找不到 VAE，请在设置里手动选择，或把 VAE 放进 ComfyUI 的 models/vae");
  if (!clipName) throw new Error("找不到文本编码器，请把 umt5（T5）放到 ComfyUI 的 models/clip");

  const width = opts.width ?? 512;
  const height = opts.height ?? 512;
  const frames = opts.frames ?? 33;
  const steps = opts.steps ?? 20;
  const fps = opts.fps ?? 16;
  const seed = Math.floor(Math.random() * 0xffffffff);

  const graph: Record<string, any> = {
    "1": { class_type: "UNETLoader", inputs: { unet_name: opts.unet, weight_dtype: "default" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: clipName, type: clipType, device: "default" } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: opts.prompt, clip: ["2", 0] } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: opts.negative || "", clip: ["2", 0] } },
    "5": { class_type: "VAELoader", inputs: { vae_name: vaeName } },
  };

  // 图生视频：先上传首帧，再用 WanImageToVideo 生成初始隐变量
  if (opts.mode === "i2v" && opts.imageFile) {
    opts.onStage?.("上传首帧图片…");
    const imageName = await uploadImage(b, opts.imageFile);
    graph["6"] = { class_type: "LoadImage", inputs: { image: imageName } };
    graph["7"] = {
      class_type: "WanImageToVideo",
      inputs: {
        positive: ["3", 0],
        negative: ["4", 0],
        vae: ["5", 0],
        start_image: ["6", 0],
        width,
        height,
        length: frames,
        batch_size: 1,
      },
    };
    // 视觉编码器可选，填了效果通常更好
    if (opts.clipVision) {
      graph["11"] = { class_type: "CLIPVisionLoader", inputs: { clip_name: opts.clipVision } };
      graph["12"] = {
        class_type: "CLIPVisionEncode",
        inputs: { clip_vision: ["11", 0], image: ["6", 0] },
      };
      graph["7"].inputs.clip_vision_output = ["12", 0];
    }
  } else {
    graph["6"] = {
      class_type: "EmptyLatentImage",
      inputs: { width, height, length: frames, batch_size: 1 },
    };
  }

  // WAN 常用 ModelSamplingSD3 校正噪声调度，有就加上
  const hasMsSd3 = !!(await objectInfo(b, "ModelSamplingSD3"));
  if (hasMsSd3) {
    graph["13"] = {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["1", 0], sampling: "eps", shift: 8 },
    };
  }

  graph["8"] = {
    class_type: "KSampler",
    inputs: {
      seed,
      steps,
      cfg: 5,
      sampler_name: pick(samplers, ["uni_pc", "euler", "dpmpp_2m"], "euler"),
      scheduler: pick(schedulers, ["simple", "normal"], "simple"),
      denoise: 1,
      model: hasMsSd3 ? ["13", 0] : ["1", 0],
      positive: ["3", 0],
      negative: ["4", 0],
      latent_image: opts.mode === "i2v" ? ["7", 0] : ["6", 0],
    },
  };
  graph["9"] = { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["5", 0] } };

  const formats = optionsOf(vhs, "format");
  const pixFmts = optionsOf(vhs, "pix_fmt");
  graph["10"] = {
    class_type: "VHS_VideoCombine",
    inputs: {
      images: ["9", 0],
      frame_rate: fps,
      loop_count: 0,
      filename_prefix: "nexus_ai",
      format: pick(formats, ["h264-mp4", "mp4", "webm"], "video/h264-mp4"),
      pix_fmt: pick(pixFmts, ["yuv420p"], "yuv420p"),
      crf: 19,
      save_metadata: true,
      pingpong: false,
      save_output: true,
    },
  };

  opts.onStage?.("已提交到你的 ComfyUI，视频通常需要几分钟…");
  const promptId = await submitGraph(b, graph);
  const files = await waitOutputs(b, promptId, 20 * 60 * 1000, opts.onStage);
  return fetchOutputUrl(b, files[0]);
}
