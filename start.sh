#!/bin/bash
# 포트폴리오 대시보드 실행 스크립트
# PC + 모바일(같은 WiFi) 동시 접근 가능

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 포트폴리오 대시보드 시작 ==="

# LAN IP 추출 (Mac)
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")

# 백엔드 실행 (0.0.0.0:8000 — LAN 노출)
echo "[1/2] 백엔드 서버 시작 (포트 8000)..."
cd "$PROJECT_DIR/backend"
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "  백엔드 PID: $BACKEND_PID"

sleep 2

# 프론트엔드 실행 (vite host=true)
echo "[2/2] 프론트엔드 개발 서버 시작 (포트 5173)..."
cd "$PROJECT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
echo "  프론트엔드 PID: $FRONTEND_PID"

echo ""
echo "✅ PC에서 접속:     http://localhost:5173"
if [ -n "$LAN_IP" ]; then
  echo "📱 모바일에서 접속: http://$LAN_IP:5173"
  echo "   (같은 WiFi에 연결되어 있어야 합니다)"
fi
echo "🔧 API 서버:        http://localhost:8000"
echo ""
echo "종료하려면 Ctrl+C"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
