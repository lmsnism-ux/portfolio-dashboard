# 배포 가이드

이 저장소의 현재 기준 배포 구조는 **GitHub Pages 프론트엔드 + Railway 백엔드**입니다.

```text
[GitHub Pages]
    React/Vite/PWA 정적 파일
        |
        | VITE_API_BASE
        v
[Railway]
    FastAPI 백엔드 + portfolio.json + history.db
```

## 1. 백엔드: Railway

### 1-1. Railway 프로젝트 준비

1. Railway에서 새 프로젝트를 만듭니다.
2. 이 GitHub 저장소를 연결합니다.
3. 서비스 루트는 저장소 루트 그대로 둡니다.
4. `railway.json`과 `nixpacks.toml`의 start command가 `backend/main.py`를 실행합니다.

### 1-2. 필수 환경변수

```text
PORTFOLIO_JSON_B64=<portfolio.json을 base64로 인코딩한 값>
ALLOWED_ORIGINS=https://lmsnism-ux.github.io
TZ=Asia/Seoul
```

쓰기 기능을 외부에서도 사용할 경우 다음 값도 설정합니다.

```text
PORTFOLIO_API_KEY=<원하는 긴 키>
READ_REQUIRE_AUTH=1
```

개인 앱(`#/app`) 로그인 화면에 같은 값을 입력하면 백엔드가 12시간 세션을 발급합니다. 마스터 키 자체는 브라우저에 저장하지 않습니다.

### 1-3. 데이터 영속화 권장

기본 파일은 백엔드 실행 디렉터리에 저장됩니다.

- `portfolio.json`
- `history.db`
- `price_cache.json`
- `backups/`

장기 운영에서는 Railway Volume을 붙이고 아래 환경변수를 지정하는 구성을 권장합니다.

```text
PORTFOLIO_DATA_DIR=/data
```

Volume이 없으면 재배포/재기동 시 파일이 사라질 수 있습니다. 이 경우 `PORTFOLIO_JSON_B64`로 초기 데이터는 복구되지만, 체결 기록과 히스토리 DB는 유지되지 않습니다.

### 1-4. GitHub Actions 배포

`.github/workflows/deploy-backend.yml`은 `main` 브랜치에 백엔드 관련 변경이 push되면 Railway CLI로 배포합니다.

GitHub Secrets에 아래 값을 등록해야 합니다.

```text
RAILWAY_TOKEN
RAILWAY_SERVICE_ID
```

수동 배포도 가능합니다.

```bash
npm i -g @railway/cli
railway login
railway up --service <service-id> --detach
```

## 2. 프론트엔드: GitHub Pages

### 2-1. GitHub Pages 설정

저장소 Settings → Pages에서 Source를 **GitHub Actions**로 설정합니다.

### 2-2. 필수 Secret

GitHub Secrets에 운영 백엔드 주소를 등록합니다.

```text
VITE_API_BASE=https://<your-railway-service>.up.railway.app
```

`.github/workflows/deploy.yml`은 빌드 시 아래 값을 사용합니다.

```text
VITE_BASE_PATH=/portfolio-dashboard/
```

### 2-3. 배포 확인

```text
https://lmsnism-ux.github.io/portfolio-dashboard/
```

확인할 항목:

- 첫 화면 총자산이 표시되는지
- 공개 첫 화면에 샘플 포트폴리오가 표시되고 실제 API를 호출하지 않는지
- `#/app`에서 세션 로그인 후 총자산이 표시되는지
- `/api/portfolio` 데이터가 반영되는지
- 가격 갱신 버튼이 API 키 설정 후 동작하는지
- PWA 설치 후 모바일 홈 화면에서 열리는지

## 3. 품질 체크

`.github/workflows/quality.yml`은 push, pull request, 수동 실행에서 아래 검증을 수행합니다.

```bash
cd frontend
npm ci
npm run lint
npm run build
cd ..
python -m unittest discover -s backend/tests
```

로컬에서도 같은 명령으로 배포 전 확인할 수 있습니다.

## 4. 운영 메모

- 가격/환율은 외부 웹/API에 의존하므로 일시적으로 지수 카드가 비어 있을 수 있습니다. 프론트는 이 경우 `지수 연결 확인` 상태를 보여줍니다.
- Render 배포 파일(`render.yaml`)은 대안 배포용으로 남겨둘 수 있지만, 현재 자동 배포 기준은 Railway입니다.
- `start.sh`는 macOS/Linux 로컬 실행 보조 스크립트입니다. Windows에서는 README의 PowerShell 명령을 사용하세요.
