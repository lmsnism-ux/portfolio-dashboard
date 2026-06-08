export function fmtKRW(val: number): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '-';
  const abs = Math.abs(val);
  if (abs >= 1_0000_0000) return `${(val / 1_0000_0000).toFixed(2)}억원`;
  if (abs >= 10000) return `${Math.round(val / 10000).toLocaleString('ko-KR')}만원`;
  return `${val.toLocaleString('ko-KR')}원`;
}

export function fmtKRWFull(val: number): string {
  return `${val.toLocaleString('ko-KR')}원`;
}

export function fmtPct(val: number | null): string {
  if (val === null || val === undefined) return '-';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

export function fmtChange(val: number | null): string {
  if (val === null || val === undefined) return '-';
  const sign = val > 0 ? '+' : '';
  return `${sign}${fmtKRW(val)}`;
}

/** 한국식: 상승 = 빨강(toss-up), 하락 = 파랑(toss-down) */
export function colorClass(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return 'text-toss-text-tertiary';
  return val > 0 ? 'text-toss-up' : 'text-toss-down';
}

export function bgColorClass(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return '';
  return val > 0 ? 'bg-toss-up-soft' : 'bg-toss-down-soft';
}

const CHART_COLORS = [
  '#5B9CF6', '#F5A623', '#1BC47D', '#E96AFF', '#FF6B6B',
  '#FFD93D', '#4FC3F7', '#FF9F43', '#A29BFE', '#FD79A8',
  '#00CEC9', '#6C5CE7', '#55EFC4', '#FDCB6E', '#E17055',
];

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export function relativeTime(isoStr: string | null): string {
  if (!isoStr) return '알 수 없음';
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export function fmtAbsTime(isoStr: string | null): string {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * 계좌 분류 단일 진입점 — type과 name을 함께 보고 카테고리·정렬 순서를 결정한다.
 * Header / HoldingsList / App.tsx에서 중복되던 로직을 통합.
 *
 * 우선순위: 연금저축 → DC/퇴직 → IRP/연금 → 주식·ISA → 적금·예금 → 기타
 *  - '삼성증권 IRP'처럼 '증권' 단어가 포함돼도 IRP로 분류되도록 IRP 먼저 체크
 */
export type AccountCategory = '투자' | '개인연금' | '퇴직연금' | '저축' | '기타';

export function categorizeAccount(type: string, name = ''): AccountCategory {
  const s = `${type} ${name}`;
  if (/연금저축/i.test(s)) return '개인연금';
  if (/DC|퇴직|확정기여|확정급여|DB형/i.test(s)) return '퇴직연금';
  if (/IRP|연금/i.test(s)) return '개인연금';
  if (/주식|ISA|CMA|기본계좌|증권/i.test(s)) return '투자';
  if (/적금|예금|저축/i.test(s)) return '저축';
  return '기타';
}

export const CATEGORY_ORDER: AccountCategory[] = ['투자', '개인연금', '퇴직연금', '저축', '기타'];

/** 장기 보유 계좌(연금 + 퇴직) 판별 — GoalCard / Header DC 토글에서 사용 */
export function isLongTermAccount(type: string): boolean {
  return /IRP|DC|퇴직|연금|연금저축/i.test(type);
}

export function isRetirementAccount(type: string): boolean {
  return /DC|퇴직/i.test(type);
}

// ── 시장(거래소) 분류 ──────────────────────────────────────
// 같은 시점에 "한국장은 휴장 / 미국장은 진행 중" 인 경우, 보유 종목의 가격 정보 시점이 다르다.
// 따라서 거래 시장(KR vs US)을 명확히 구분해 표시한다.

export type Exchange = 'KR' | 'US';

/**
 * 종목 세부 분류.
 * - us_direct:           해외 직투 ETF/주식 (USD 결제, 미국장 거래)
 * - kr_listed_overseas:  국내 상장 해외 ETF (KRW 결제, 한국장 거래, 추종 자산은 해외)
 * - kr_domestic:         국내 ETF/주식 (KRW 결제, 한국장 거래, 추종 자산도 국내)
 * - mixed_tdf:           TDF/혼합형 등 글로벌 분산 자산
 * - cash:                현금/예수금/예금 — 시장 구분 없음
 */
export type HoldingClass =
  | 'us_direct'
  | 'kr_listed_overseas'
  | 'kr_domestic'
  | 'mixed_tdf'
  | 'cash';

export interface HoldingClassification {
  exchange: Exchange;       // KR or US
  category: HoldingClass;
  /** UI 표시용 짧은 라벨 */
  shortLabel: string;
  /** 색상 토큰 (Tailwind class용 prefix) */
  accentColor: string;
}

interface HoldingLike {
  name: string;
  ticker?: string | null;
  currency?: string;
  region?: string;
  asset_class?: string;
  is_snapshot?: boolean;
}

export function classifyHolding(h: HoldingLike): HoldingClassification {
  const cls = h.asset_class ?? '';
  const region = h.region ?? '';
  const isUsdPrice = h.currency === 'USD';

  // 현금·예금
  if (/현금|예금|예수금/.test(cls) || (h.is_snapshot && !h.ticker)) {
    return {
      exchange: isUsdPrice ? 'US' : 'KR',
      category: 'cash',
      shortLabel: '현금·예금',
      accentColor: '#9CA3AF',
    };
  }

  // TDF·혼합형
  if (/혼합|TDF/i.test(cls)) {
    return {
      exchange: 'KR',
      category: 'mixed_tdf',
      shortLabel: 'TDF·혼합형',
      accentColor: '#F5A623',
    };
  }

  // 해외 직투 (USD 결제)
  if (isUsdPrice) {
    return {
      exchange: 'US',
      category: 'us_direct',
      shortLabel: '해외 직투',
      accentColor: '#8B5CF6',
    };
  }

  // KRW 결제: region이 국내가 아니면 국내 상장 해외 ETF
  if (region && region !== '국내') {
    return {
      exchange: 'KR',
      category: 'kr_listed_overseas',
      shortLabel: '국내상장 해외 ETF',
      accentColor: '#3182F6',
    };
  }

  return {
    exchange: 'KR',
    category: 'kr_domestic',
    shortLabel: '국내 ETF',
    accentColor: '#10B981',
  };
}

// ── 시장 시간 (KST 기준) ────────────────────────────────────

export interface MarketStatus {
  exchange: Exchange;
  /** 'open' | 'closed' (주말/시간외) | 'pre' (정규장 전) | 'post' (정규장 후) */
  state: 'open' | 'closed' | 'pre' | 'post';
  label: string;       // "진행중" | "휴장" | "장 마감" | "장 시작 전"
  timeLabel: string;   // "09:00 ~ 15:30 (KST)" 등 보조 설명
}

/**
 * 한국장: 평일 09:00~15:30 KST
 * 미국장: 평일 09:30~16:00 ET (서머타임이면 KST 22:30~05:00, 동절기 23:30~06:00)
 *   — 단순화를 위해 KST 22:30~06:00 을 'open' 으로 본다 (날짜 경계 처리).
 */
export function getMarketStatus(exchange: Exchange, now: Date = new Date()): MarketStatus {
  // KST = UTC+9. 브라우저 로컬 시간을 KST로 변환
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kst = new Date(utcMs + 9 * 60 * 60 * 1000);
  const dow = kst.getUTCDay(); // 0=Sun, 6=Sat
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  if (exchange === 'KR') {
    const open = 9 * 60;        // 09:00
    const close = 15 * 60 + 30; // 15:30
    if (dow === 0 || dow === 6) {
      return { exchange, state: 'closed', label: '휴장', timeLabel: '평일 09:00 ~ 15:30 (KST)' };
    }
    if (minutes < open) return { exchange, state: 'pre', label: '장 시작 전', timeLabel: `09:00 개장 (KST)` };
    if (minutes > close) return { exchange, state: 'post', label: '장 마감', timeLabel: `15:30 마감 (KST)` };
    return { exchange, state: 'open', label: '진행중', timeLabel: '15:30 마감 (KST)' };
  }

  // 미국장 (단순화: KST 22:30~05:00 익일을 'open' 으로 간주)
  // dow 기준: 미장 정규장은 한국시간 화~토 새벽까지 (월요일 미장은 화요일 새벽)
  const openMin  = 22 * 60 + 30;        // 22:30
  const closeMin = 5 * 60;              // 05:00 (익일)

  const isWeekendKST = (dow === 0 || dow === 6);
  // 일요일 새벽 또는 토요일 저녁은 미장 휴장
  if (isWeekendKST) {
    if (dow === 6 && minutes < closeMin) {
      // 토요일 새벽은 금요일 미장 마감 이후 시점 → closed
      return { exchange, state: 'closed', label: '휴장', timeLabel: '평일 22:30 ~ 익일 05:00 (KST)' };
    }
    return { exchange, state: 'closed', label: '휴장', timeLabel: '평일 22:30 ~ 익일 05:00 (KST)' };
  }
  // 월요일 0시~05시: 일요일 새벽 = 미장 휴장
  if (dow === 1 && minutes < closeMin) {
    return { exchange, state: 'closed', label: '휴장', timeLabel: '평일 22:30 ~ 익일 05:00 (KST)' };
  }

  if (minutes >= openMin || minutes < closeMin) {
    return { exchange, state: 'open', label: '진행중', timeLabel: '익일 05:00 마감 (KST)' };
  }
  if (minutes < openMin && minutes >= closeMin + 60) {
    // 일 중 휴식 시간 (05:00~22:30)
    return { exchange, state: 'post', label: '장 마감', timeLabel: '오늘 22:30 개장 (KST)' };
  }
  return { exchange, state: 'pre', label: '장 시작 전', timeLabel: '22:30 개장 (KST)' };
}
