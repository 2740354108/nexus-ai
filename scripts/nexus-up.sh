#!/usr/bin/env bash
# ============================================================================
# NEXUS 常驻守护脚本
# ----------------------------------------------------------------------------
# 作用：在服务器 / 云电脑上后台启动并守护 backend + nexus-bot，
#       任一进程崩溃都自动重启，确保 QQ / 微信机器人一直在线、不再"连不上后端"。
#
# 用法：
#   ./nexus-up.sh start      后台启动（默认，最常用）
#   ./nexus-up.sh stop       停止全部
#   ./nexus-up.sh restart    重启
#   ./nexus-up.sh status     查看是否在跑 + 进程号
#   ./nexus-up.sh foreground 前台运行（给 systemd 用，不要手动调）
#   ./nexus-up.sh backend    仅守护后端（内部）
#   ./nexus-up.sh bot        仅守护机器人（内部）
#
# 依赖：项目已 pnpm install；backend/.env 配好 AI_API_KEY。
# ============================================================================
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME="$ROOT/.nexus-runtime"
LOG_DIR="$RUNTIME/logs"
mkdir -p "$LOG_DIR"

BACKEND_LOG="$LOG_DIR/backend.log"
BOT_LOG="$LOG_DIR/bot.log"

ts() { date '+%F %T'; }

# ---- 后端保活循环 ----
run_backend() {
  while true; do
    echo "[$(ts)] backend 启动" >> "$BACKEND_LOG"
    ( cd "$ROOT/backend" && exec pnpm exec tsx src/index.ts >> "$BACKEND_LOG" 2>&1 )
    code=$?
    echo "[$(ts)] backend 退出(code=$code)，2s 后重启" >> "$BACKEND_LOG"
    sleep 2
  done
}

# ---- 机器人保活循环 ----
run_bot() {
  while true; do
    echo "[$(ts)] bot 启动" >> "$BOT_LOG"
    ( cd "$ROOT/nexus-bot" && exec pnpm exec tsx src/index.ts >> "$BOT_LOG" 2>&1 )
    code=$?
    echo "[$(ts)] bot 退出(code=$code)，2s 后重启" >> "$BOT_LOG"
    sleep 2
  done
}

start_daemon() {
  nohup "$0" backend >/dev/null 2>&1 &
  nohup "$0" bot >/dev/null 2>&1 &
  echo "NEXUS 常驻已启动（后台运行）。"
  echo "  后端日志  : $BACKEND_LOG"
  echo "  机器人日志: $BOT_LOG"
  echo "  查看状态  : $0 status"
  echo "  停止      : $0 stop"
}

stop_daemon() {
  pkill -f "$SCRIPT_DIR/nexus-up.sh backend" 2>/dev/null
  pkill -f "$SCRIPT_DIR/nexus-up.sh bot" 2>/dev/null
  pkill -f "backend/src/index.ts" 2>/dev/null
  pkill -f "nexus-bot/src/index.ts" 2>/dev/null
  sleep 1
  echo "已停止 NEXUS 常驻进程。"
}

status_daemon() {
  echo "== NEXUS 常驻状态 =="
  if pgrep -f "$SCRIPT_DIR/nexus-up.sh backend" >/dev/null 2>&1; then
    echo "  后端守护 : 运行中"
  else
    echo "  后端守护 : 未运行"
  fi
  if pgrep -f "$SCRIPT_DIR/nexus-up.sh bot" >/dev/null 2>&1; then
    echo "  机器人守护: 运行中"
  else
    echo "  机器人守护: 未运行"
  fi
  echo "-- 后端进程 --"
  pgrep -fl "backend/src/index.ts" 2>/dev/null || echo "  无"
  echo "-- 机器人进程 --"
  pgrep -fl "nexus-bot/src/index.ts" 2>/dev/null || echo "  无"
}

case "${1:-start}" in
  backend)    run_backend ;;
  bot)        run_bot ;;
  foreground) run_backend & run_bot & wait ;;
  start)      start_daemon ;;
  stop)       stop_daemon ;;
  restart)    stop_daemon; sleep 1; start_daemon ;;
  status)     status_daemon ;;
  *)          echo "用法: $0 {start|stop|restart|status|foreground}"; exit 1 ;;
esac
