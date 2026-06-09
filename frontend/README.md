# Frontend

React + TypeScript + Vite 기반 포트폴리오 대시보드 프론트엔드입니다.

## 실행

```bash
npm ci
npm run dev
```

개발 서버는 기본적으로 `http://localhost:5173`에서 열리고, `/api` 요청은 `http://localhost:8000` 백엔드로 프록시됩니다.

## 빌드

```bash
npm run lint
npm run build
```

GitHub Pages 배포 시에는 루트 경로를 맞추기 위해 `VITE_BASE_PATH=/portfolio-dashboard/`를 사용합니다.

```bash
VITE_BASE_PATH=/portfolio-dashboard/ npm run build
```

운영 백엔드 주소는 `VITE_API_BASE`로 지정합니다.

```bash
VITE_API_BASE=https://your-api.up.railway.app npm run build
```
