/**
 * Pollinations 图像生成（直连，无需密钥即可使用）。
 * 返回可直接作为 <img src> 使用的图片地址，因此不受跨域限制影响。
 */
export function buildPollinationsUrl(opts: {
  prompt: string;
  width: number;
  height: number;
  token?: string;
  seed?: number;
}): string {
  const encoded = encodeURIComponent(opts.prompt);
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000_000);

  const params = new URLSearchParams({
    width: String(opts.width),
    height: String(opts.height),
    seed: String(seed),
    nologo: "true",
    model: "flux",
    safe: "false",
  });

  if (opts.token) params.set("token", opts.token);

  return `https://image.pollinations.ai/prompt/${encoded}?${params.toString()}`;
}
