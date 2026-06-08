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
