import type { PortfolioSummary } from './types';

/**
 * 사용자 토글(퇴직연금/부동산/대출)을 적용한 표시값을 한 번에 계산한다.
 * Header와 HistoryChart가 같은 기준의 "오늘 등락 / 누적 수익"을 보여주기 위한 공통 계산.
 */
export interface DisplayTotals {
  total: number;          // 표시 총자산 (KRW)
  dayChg: number;         // 표시 오늘 등락 (KRW) — 직전 영업일 종가 대비 실시간
  dayPct: number;         // 표시 오늘 등락률 (%)
  profit: number;         // 표시 누적 수익 (KRW)
  profitPct: number;      // 표시 누적 수익률 (%)
  investCost: number;     // 표시 누적 원가 (KRW)
}

export function applyDisplayToggles(
  data: PortfolioSummary,
  opts: { dcOn: boolean; realEstateOn: boolean; loanOn: boolean },
): DisplayTotals {
  const dcKrw    = data.dc_value_krw      ?? 0;
  const dcDayChg = data.dc_day_change_krw ?? 0;
  const dcProfit = (data.dc_value_krw ?? 0) - (data.dc_cost_krw ?? 0);
  const dcCost   = data.dc_cost_krw       ?? 0;

  const reEquityRaw = data.real_estate_equity_krw ?? 0;
  const reCostRaw   = data.real_estate_cost_krw   ?? 0;
  const reLoan      = data.real_estate_loan_krw   ?? 0;

  let reAdjustValue = 0;
  let reAdjustCost  = 0;
  if (!opts.realEstateOn) {
    reAdjustValue = -reEquityRaw;
    reAdjustCost  = -reCostRaw;
  } else if (!opts.loanOn) {
    reAdjustValue = reLoan;
    reAdjustCost  = reLoan;
  }

  const dcExclude  = opts.dcOn ? 0 : dcKrw;
  const total      = data.total_value_krw - dcExclude + reAdjustValue;
  const dayChg     = data.total_day_change_krw - (opts.dcOn ? 0 : dcDayChg);
  const profit     = data.total_profit_krw - (opts.dcOn ? 0 : dcProfit) + (reAdjustValue - reAdjustCost);
  const investCost = data.total_cost_krw - (opts.dcOn ? 0 : dcCost) + reAdjustCost;
  const profitPct  = investCost > 0 ? (profit / investCost) * 100 : (data.total_profit_pct ?? 0);
  const prevTotal  = total - dayChg;
  const dayPct     = prevTotal > 0 ? (dayChg / prevTotal) * 100 : (data.total_day_change_pct ?? 0);

  return { total, dayChg, dayPct, profit, profitPct, investCost };
}

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

/**
 * 종목 가격이 stale한지 판정. fetched_at(ISO) 가 threshold 이상 지난 경우 true.
 * 한국장 점심 휴장이나 외국 시장 휴장 등을 고려해 보수적으로 6시간 권장.
 */
export const STALE_PRICE_THRESHOLD_HOURS = 6;
export function isPriceStale(
  fetchedAt: string | null | undefined,
  thresholdHours: number = STALE_PRICE_THRESHOLD_HOURS,
): boolean {
  if (!fetchedAt) return false;
  const ts = new Date(fetchedAt).getTime();
  if (Number.isNaN(ts)) return false;
  const hoursAgo = (Date.now() - ts) / 3_600_000;
  return hoursAgo > thresholdHours;
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
 * KST 기준 [요일, 분(0~1439)] 반환.
 * 사용자 로컬 timezone과 무관하게 동작 (예전 코드는 한국 외 timezone에서 오작동).
 */
function _kstNow(now: Date): { dow: number; minutes: number; hh: number; mm: number } {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  return {
    dow: kst.getUTCDay(),
    hh: kst.getUTCHours(),
    mm: kst.getUTCMinutes(),
    minutes: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
  };
}

/**
 * 한국장: 평일 09:00~15:30 KST
 * 미국장: KST 22:30~익일 05:00 (서머타임 / 동절기 단순화)
 *   - 한국 토요일(dow=6): 금요일 미장 마감(=토요일 05:00 KST) 후 → 휴장
 *   - 한국 일요일(dow=0): 종일 미장 휴장
 *   - 한국 월요일 0~05시(dow=1): 일요일 새벽 → 미장 휴장
 */
export function getMarketStatus(exchange: Exchange, now: Date = new Date()): MarketStatus {
  const { dow, minutes } = _kstNow(now);

  if (exchange === 'KR') {
    const open = 9 * 60;        // 09:00
    const close = 15 * 60 + 30; // 15:30
    if (dow === 0 || dow === 6) {
      return { exchange, state: 'closed', label: '주말 휴장', timeLabel: '평일 09:00 ~ 15:30 (KST)' };
    }
    if (minutes < open)  return { exchange, state: 'pre',  label: '장 시작 전', timeLabel: '09:00 개장 (KST)' };
    if (minutes > close) return { exchange, state: 'post', label: '장 마감',    timeLabel: '15:30 마감 (KST)' };
    return { exchange, state: 'open', label: '진행중', timeLabel: '15:30 마감 (KST)' };
  }

  // 미국장
  const openMin  = 22 * 60 + 30;  // 22:30
  const closeMin = 5 * 60;        // 05:00 (익일)

  // 한국 일요일 종일: 미장 휴장
  if (dow === 0) {
    return { exchange, state: 'closed', label: '주말 휴장', timeLabel: '평일 22:30 ~ 익일 05:00 (KST)' };
  }
  // 한국 토요일: 05시 이전이면 금요일 미장의 연장으로 보고 closed 표시 (이미 마감)
  // 05시 이후도 모두 휴장
  if (dow === 6) {
    return { exchange, state: 'closed', label: '주말 휴장', timeLabel: '평일 22:30 ~ 익일 05:00 (KST)' };
  }
  // 한국 월요일 0~05시: 일요일 새벽 → 미장 없음
  if (dow === 1 && minutes < closeMin) {
    return { exchange, state: 'closed', label: '주말 휴장', timeLabel: '오늘 22:30 개장 (KST)' };
  }

  // 평일 (화~금) 새벽 0~05시: 전일 미장 진행 중
  if (minutes < closeMin) {
    return { exchange, state: 'open', label: '진행중', timeLabel: '오늘 05:00 마감 (KST)' };
  }
  // 평일 (월~금) 22:30 이후: 오늘 미장 시작
  if (minutes >= openMin) {
    return { exchange, state: 'open', label: '진행중', timeLabel: '익일 05:00 마감 (KST)' };
  }
  // 평일 낮 (05:00 ~ 22:30): 장 마감
  return { exchange, state: 'post', label: '장 마감', timeLabel: '오늘 22:30 개장 (KST)' };
}
