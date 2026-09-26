@echo off
chcp 65001 >nul
title NEXUS 本地启动器
echo ============================================================
echo   NEXUS AI 本地启动（Windows）
echo   将打开 3 个命令行窗口：后端 / 前端 / 机器人
echo   关闭某个窗口即可停止对应服务
echo ============================================================
echo.

REM ===== 按需修改：你的 PostgreSQL 连接串 =====
REM 格式：postgresql://用户名:密码@主机:端口/数据库名
REM 默认用户 postgres，数据库名 nexus（需先用 createdb 或 pgAdmin 创建）
set NEXUS_DB_URL=postgresql://postgres:你的密码@localhost:5432/nexus

REM 机器人健康检查端口（保持 3939）
set NEXUS_BOT_PORT=3939

start "NEXUS-Backend" cmd /k "cd /d %~dp0backend && set DB_MODE=local && set DATABASE_URL=%NEXUS_DB_URL% && pnpm dev"
start "NEXUS-Frontend" cmd /k "cd /d %~dp0frontend && set VITE_DEPLOY_MODE=local && pnpm dev"
start "NEXUS-Bot" cmd /k "cd /d %~dp0nexus-bot && set PORT=%NEXUS_BOT_PORT% && pnpm start"

echo 已启动三个服务窗口：
echo   - 网页：   http://localhost:5173
echo   - 后端：   http://localhost:3000/api
echo   - 机器人： http://localhost:%NEXUS_BOT_PORT% （健康检查）
echo.
echo 提示：首次运行请先在每个目录执行 pnpm install；
echo       并确保 PostgreSQL 已创建名为 nexus 的数据库。
echo.
pause
