#!/usr/bin/env bash
# NEXUS AI 调用封装（零依赖：只用 curl + node）
#
# 用法：
#   nexus.sh health
#   nexus.sh chat  "用一句话介绍你自己"
#   nexus.sh image "赛博朋克风格的猫" [输出文件.png]
#   nexus.sh music "轻快的钢琴曲"     [输出文件.json]
#
# 目标地址默认 http://localhost:3000，可用环境变量覆盖：
#   NEXUS_API_BASE=http://192.168.1.10:3000 nexus.sh health
# 若服务端开启了公开中继（AI_BOT_TOKEN），再带上令牌：
#   NEXUS_API_TOKEN=<站长令牌或登录后的 JWT> nexus.sh chat "你好"

set -euo pipefail

BASE="${NEXUS_API_BASE:-http://localhost:3000}"
BASE="${BASE%/}"

# 可选鉴权头；bash 3.2 下空数组展开会报错，故用 +"${...}" 形式
TOKEN="${NEXUS_API_TOKEN:-}"
AUTH=()
if [ -n "$TOKEN" ]; then AUTH=(-H "Authorization: Bearer $TOKEN"); fi

die() { echo "错误：$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "需要 curl"
command -v node >/dev/null 2>&1 || die "需要 node"

# 用 node 做 JSON 字符串转义，避免引号/中文出问题
jstr() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"; }

# 从 stdin 读取 JSON，提取指定字段（用点号路径，如 choices.0.message.content）
jget() {
  node -e '
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      let j;
      try { j = JSON.parse(s); } catch { console.log(s); process.exit(0); }
      const v = process.argv[1].split(".").reduce((o, k) => (o == null ? o : o[k]), j);
      if (v === undefined || v === null) {
        console.error(JSON.stringify(j, null, 2));
      } else if (typeof v === "string") {
        console.log(v);
      } else {
        console.log(JSON.stringify(v, null, 2));
      }
    });
  ' "$1"
}

precheck() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/api/health" || true)"
  [ "$code" = "200" ] || die "NEXUS 后端($BASE)没有响应。请先运行：nexusai serve  或  nexusai up"
}

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; }

cmd="${1:-}"
[ -n "$cmd" ] || { usage; exit 1; }
shift || true

case "$cmd" in
  health)
    precheck
    curl -sS "$BASE/api/health"; echo
    ;;

  chat)
    [ $# -ge 1 ] || die '用法：nexus.sh chat "内容"'
    precheck
    curl -sS "$BASE/api/ai/v1/chat/completions" \
      -H 'Content-Type: application/json' \
      ${AUTH[@]+"${AUTH[@]}"} \
      -d "{\"messages\":[{\"role\":\"user\",\"content\":$(jstr "$1")}],\"stream\":false}" \
      | jget 'choices.0.message.content'
    ;;

  image)
    [ $# -ge 1 ] || die '用法：nexus.sh image "提示词" [输出文件.png]'
    precheck
    out="${2:-nexus-image.png}"
    url="$(curl -sS "$BASE/api/image/generate" \
      -H 'Content-Type: application/json' \
      ${AUTH[@]+"${AUTH[@]}"} \
      -d "{\"prompt\":$(jstr "$1")}" | jget 'imageUrl')"
    case "$url" in
      /api/*) curl -sS "$BASE$url" -o "$out"; echo "已保存：$out" ;;
      *) die "生成失败：$url" ;;
    esac
    ;;

  music)
    [ $# -ge 1 ] || die '用法：nexus.sh music "提示词" [输出文件.json]'
    precheck
    out="${2:-nexus-music.json}"
    curl -sS "$BASE/api/music/generate" \
      -H 'Content-Type: application/json' \
      ${AUTH[@]+"${AUTH[@]}"} \
      -d "{\"prompt\":$(jstr "$1")}" | tee "$out" | jget 'success'
    echo "原始响应已保存：$out"
    ;;

  *)
    usage
    exit 1
    ;;
esac
