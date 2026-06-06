# 배포 가이드 (PC 꺼져도 모바일에서 외부 접속)

목표: PC를 꺼도 모바일에서 인터넷만 있으면 대시보드를 조회. **편집(PATCH)은 보수적으로 — 자세한 내용은 아래 "한계" 참고.**

## 구성

```
[Cloudflare Pages 또는 Vercel]   ← 프론트엔드 (정적, 무료)
        │
        ▼ fetch
[Render.com 무료 web service]    ← FastAPI 백엔드
```

---

## 1. 백엔드 — Render.com

### 1-1. portfolio.json을 base64로 변환 (시드용)

PC에서:

```bash
cd /Users/sharn/portfolio-dashboard/backend
base64 -i portfolio.json | pbcopy    # 클립보드에 복사 (macOS)
# 또는
base64 -i portfolio.json
```

### 1-2. Render 가입 후 GitHub 연결

1. https://render.com 가입 (GitHub 로그인 권장)
2. 이 프로젝트를 GitHub repo에 push
3. Render 대시보드 → **New → Blueprint** → 이 repo 선택 → `render.yaml` 자동 인식
4. 환경변수 입력:
   - `PORTFOLIO_JSON_B64`: 위 base64 문자열 붙여넣기
   - `ALLOWED_ORIGINS`: 프론트 도메인 (예: `https://my-portfolio.pages.dev`) — 1-3 끝나고 입력

5. **Deploy** 클릭 → ~3분

### 1-3. 백엔드 URL 확보

Render가 부여한 URL (예: `https://portfolio-dashboard-api.onrender.com`)을 메모.

브라우저로 `<URL>/api/health` 열어서 `{"status":"ok"}` 확인.

### 1-4. 자동 슬립 대응 (무료 tier)

Render 무료는 **15분 무요청 시 슬립**(첫 호출 30초 콜드스타트).
- 깨우려면: GitHub Actions cron으로 5분마다 ping하거나
- UptimeRobot.com 무료 등록 — 5분 간격 health check (가장 쉬움)

---

## 2. 프론트엔드 — Cloudflare Pages

### 2-1. 프론트 빌드

```bash
cd /Users/sharn/portfolio-dashboard/frontend
echo "VITE_API_BASE=https://portfolio-dashboard-api.onrender.com" > .env.production
npm run build
```

### 2-2. Cloudflare Pages 배포

1. https://dash.cloudflare.com → Pages → **Create application → Connect to Git**
2. repo 선택 → 빌드 설정:
   - Build command: `npm run build`
   - Output: `dist`
   - Root: `frontend`
   - 환경변수: `VITE_API_BASE` = 1-3에서 메모한 URL

3. 배포 → `https://<프로젝트>.pages.dev` 부여

### 2-3. Render `ALLOWED_ORIGINS` 갱신

Render 대시보드 → portfolio-dashboard-api → Environment →
`ALLOWED_ORIGINS=https://<프로젝트>.pages.dev` 저장 → 자동 재배포.

### 2-4. 모바일에서 홈 화면에 추가

iOS Safari로 `https://<프로젝트>.pages.dev` 접속 → 공유 → 홈 화면에 추가.
**PWA 캐시 덕분에 데이터 갱신 없이도 마지막 캐시 화면이 즉시 뜸**.

---

## 한계 (꼭 알아두세요)

### ⚠️ Render 무료는 disk가 없음

→ portfolio.json을 PATCH로 수정해도 **재배포/재기동 시 환경변수의 base64로 되돌아갑니다.**

권장 운영:
- **편집은 PC(LAN)에서 수행** → portfolio.json이 git에 commit/push되거나 base64를 다시 환경변수에 붙여넣기
- 배포본은 **읽기 전용**으로 사용

영구 저장을 원하면 옵션:
1. Render **Persistent Disk** ($1/mo 추가) — `render.yaml`에 `disk` 섹션 추가
2. Cloudflare D1 / Supabase 등 외부 DB로 portfolio 이전 (큰 작업)
3. Fly.io 무료 tier + Volume (재배포 필요)

### ⚠️ history.db도 휘발

`/api/history` 데이터는 매 콜드스타트 후 backfill이 자동 실행되어 30일분이 복구됩니다.
즉, 다시 보일 때 약 1~2분 지연.

---

## 빠른 점검 체크리스트

- [ ] `https://<백엔드>/api/health` → `{"status":"ok"}`
- [ ] `https://<백엔드>/api/portfolio` → JSON 응답
- [ ] `https://<프론트>` → 토스 디자인 로딩
- [ ] `https://<프론트>` 에서 데이터 표시
- [ ] 모바일 홈 화면 추가 후 풀스크린 동작
- [ ] WiFi 끄고 LTE에서도 접속 가능
