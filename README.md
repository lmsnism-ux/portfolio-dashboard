# Portfolio Dashboard

개인 전 계좌 자산을 한 화면에서 보는 포트폴리오 대시보드입니다. FastAPI 백엔드가 가격/환율/히스토리를 계산하고, React 프론트엔드가 총자산, 수익률, 계좌별 보유 종목, 자동매수, 리밸런싱, IRP 한도, 부동산/현금 자산을 보여줍니다.

기본 URL에서 실제 자산 대시보드가 바로 열립니다.

## 주요 기능

- 총자산, 당일 등락, 누적 수익, USD/KRW 환율 요약
- 검색 가능한 계좌별 보유 종목 목록과 바로 수정
- 계좌별/자산군별/지역별 비중 차트
- 기간별 자산 추이와 핵심 위험 지표
- 자동매수 예정 내역과 브라우저 알림
- 보유 종목 추가/수정/삭제, 계좌 순서 변경
- 매수/매도 체결 기록과 평단 재계산
- IRP ETF 한도 모니터링
- PWA 설치와 모바일 홈 화면 실행
- 입출금 보정 TWR/MWR, 최대낙폭, 변동성, S&P 500 비교
- 집중도·세금·현금·목표를 이용한 오늘의 확인 항목
- 입출금 장부와 투자 판단 기록

## 구조

```text
backend/
  main.py                  FastAPI 엔드포인트
  portfolio_calculator.py  포트폴리오 평가/수익률 계산
  price_fetcher.py         가격/환율 조회와 캐시
  history_store.py         일별 자산 스냅샷
  trade_store.py           체결 기록 저장/집계
frontend/
  src/                     React + TypeScript UI
  vite.config.ts           GitHub Pages/PWA 빌드 설정
.github/workflows/
  deploy.yml               GitHub Pages 프론트 배포
  deploy-backend.yml       Render 백엔드 배포
  quality.yml              lint/build/unit test
```

## 로컬 실행

백엔드는 `portfolio.json`이 필요합니다. 실제 파일을 쓰기 전에는 `backend/portfolio.example.json`을 복사해서 시작할 수 있습니다.

```bash
cp backend/portfolio.example.json backend/portfolio.json
python -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend
```

다른 터미널에서 프론트엔드를 실행합니다.

```bash
cd frontend
npm ci
npm run dev
```

Windows PowerShell에서는 복사 명령만 아래처럼 바꾸면 됩니다.

```powershell
Copy-Item backend\portfolio.example.json backend\portfolio.json
```

의존성 설치가 끝난 뒤에는 PowerShell 보조 스크립트로 두 서버를 함께 띄울 수 있습니다.

```powershell
.\start.ps1
```

## 검증

```bash
cd frontend
npm run lint
npm run build
cd ..
python -m unittest discover -s backend/tests
```

## 배포

현재 저장소 기준 배포 흐름은 다음과 같습니다.

- 프론트엔드: GitHub Pages (`.github/workflows/deploy.yml`)
- 백엔드: Render (`.github/workflows/deploy-backend.yml`)
- 품질 체크: GitHub Actions (`.github/workflows/quality.yml`)

자세한 설정은 [DEPLOY.md](DEPLOY.md)를 확인하세요.

## 데이터 저장

기본 저장소는 파일 기반입니다.

- `portfolio.json`: 계좌/보유 종목/목표/부동산/현금 설정
- `history.db`: 스냅샷, 거래, 입출금과 투자 판단 기록
- `price_cache.json`: 가격/환율 캐시

## 인증 구조

- 자산 조회는 로그인 없이 바로 사용할 수 있습니다.
- 추가·수정·삭제가 필요할 때 입력한 마스터 키는 저장하지 않습니다.
- 키가 맞으면 백엔드가 12시간 세션을 발급하고, 프론트는 해당 탭의 `sessionStorage`에 세션만 보관합니다.
- 로그아웃 또는 401 응답 시 세션이 제거됩니다.

장기 운영에서는 `PORTFOLIO_DATA_DIR`를 Render Disk 같은 영구 디스크로 지정하는 구성이 가장 단순합니다.
