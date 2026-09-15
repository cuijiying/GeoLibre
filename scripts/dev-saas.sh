#!/usr/bin/env bash
# 一键启动本地 SaaS 开发环境：
#   1) geolibre_server_api 后端  -> http://127.0.0.1:8123 （SQLite + 本地对象存储）
#   2) geolibre-desktop 前端     -> http://localhost:5173 （.env.local 已启用 native 登录门）
# 浏览器访问 http://localhost:5173 即可看到登录/注册界面。
# Ctrl+C 退出时后端一并停止。数据落在系统临时目录，可随时删除重来。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="/c/Users/14220/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
DATA_WIN="C:/Users/14220/AppData/Local/Temp/geolibre-dev"
PORT="${GEOLIBRE_DEV_API_PORT:-8123}"

if [ ! -f "$PY" ]; then
  echo "[dev-saas] 未找到后端 venv: $PY"
  echo "[dev-saas] 请先执行: cd backend/geolibre_server_api && python -m pip install -e ."
  exit 1
fi

mkdir -p "$(cygpath -u "$DATA_WIN" 2>/dev/null || echo "$DATA_WIN")/objects"

# 清理上一次残留的 8123 监听进程
if command -v netstat >/dev/null 2>&1; then
  stale=$(netstat -ano | grep "LISTENING" | grep ":$PORT" | awk '{print $NF}' | sort -u | head -1 || true)
  if [ -n "${stale:-}" ]; then
    echo "[dev-saas] 清理残留进程 PID=$stale（端口 $PORT）"
    taskkill //PID "$stale" //F >/dev/null 2>&1 || true
    sleep 1
  fi
fi

echo "[dev-saas] 启动后端 API: http://127.0.0.1:$PORT （数据目录: $DATA_WIN）"
GEOLIBRE_DATABASE_URL="sqlite:///$DATA_WIN/dev.db" \
GEOLIBRE_STORAGE_PATH="$DATA_WIN/objects" \
GEOLIBRE_HOST=127.0.0.1 \
GEOLIBRE_PORT="$PORT" \
GEOLIBRE_PUBLIC_URL="http://127.0.0.1:$PORT" \
"$PY" -c "from geolibre_server_api.main import run; run()" &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "[dev-saas] 后端就绪"
    break
  fi
  sleep 0.5
done

echo "[dev-saas] 启动前端: http://localhost:5173 （native 登录门已启用）"
cd "$ROOT"
npm run dev
