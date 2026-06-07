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
