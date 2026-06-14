import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { RotateCcw, CalendarDays, Info } from 'lucide-react';
import { fetchHistory, triggerBackfill } from '../api';
import { fmtKRW, fmtPct, colorClass, applyDisplayToggles, classifyHolding, type Exchange } from '../utils';
import type { HistoryPoint, PortfolioSummary } from '../types';

type Range = 'WEEK' | 'CM' | 'PM' | '3M' | 'YTD' | 'ALL' | 'CUSTOM';

const RANGES: { key: Range; label: string; days: number }[] = [
  // 'WEEK' = 이번주 월요일 ~ 오늘 (이전엔 'TODAY'였으나 실제 의미는 "이번주 누적")
  { key: 'WEEK', label: '이번주', days: 7 },
  { key: 'CM', label: '당월', days: 0 },
  { key: 'PM', label: '전월', days: 0 },
  { key: '3M', label: '3개월', days: 92 },
  { key: 'YTD', label: '올해', days: 0 },
  { key: 'ALL', label: '전체', days: 0 },
];

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
  /** Header와 동일한 토글 상태 — MiniStat이 표시값을 일치시키기 위해 필요 */
  dcOn: boolean;
  realEstateOn: boolean;
  loanOn: boolean;
}

interface TooltipPayload<T> {
  payload: T;
}

interface ToolTipBoxProps {
  active?: boolean;
  payload?: TooltipPayload<HistoryPoint>[];
  hideAssets: boolean;
}

const ToolTipBox = ({ active, payload, hideAssets }: ToolTipBoxProps) => {
  if (!active || !payload?.length) return null;
  const p: HistoryPoint = payload[0].payload as HistoryPoint;
  return (
    <div className="bg-toss-card border border-toss-border rounded-xl px-3 py-2.5 shadow-[var(--shadow-toss-pop)]">
      <p className="text-[11px] text-toss-text-tertiary mb-1">{p.date}</p>
      <p className="num text-sm font-bold text-toss-text-primary">
        {hideAssets ? '••••••' : fmtKRW(p.total_value_krw)}
      </p>
      {p.total_profit_pct !== null && (
        <p className={`num text-xs mt-0.5 ${colorClass(p.total_profit_pct)}`}>
          누적 {p.total_profit_pct >= 0 ? '+' : ''}
          {p.total_profit_pct.toFixed(2)}%
        </p>
      )}
    </div>
  );
};

interface MiniStatProps {
  label: string;
  diff: number | null;
  pct: number | null;
  hideAssets: boolean;
  /** 사용자 호버용 짧은 설명 — 데이터 소스/계산 기준 명시 */
  hint?: string;
}

const MiniStat = ({ label, diff, pct, hideAssets, hint }: MiniStatProps) => (
  <div className="bg-toss-bg rounded-2xl p-3.5" title={hint}>
    <div className="flex items-center gap-1 mb-2">
      <p className="text-[10px] font-medium text-toss-text-tertiary tracking-wide uppercase">{label}</p>
      {hint && <Info size={9} className="text-toss-text-tertiary/60" />}
    </div>
    {diff !== null ? (
      <>
        <p className={`num text-[15px] font-bold leading-tight ${colorClass(diff)}`}>
          {diff >= 0 ? '+' : ''}{hideAssets ? '••••' : fmtKRW(diff)}
        </p>
        <p className={`num text-[11px] mt-0.5 font-medium ${colorClass(pct)}`}>
          {fmtPct(pct)}
        </p>
      </>
    ) : (
      <p className="num text-[15px] font-bold text-toss-text-tertiary">-</p>
    )}
  </div>
);

function getRangeCutoff(key: Range, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (key === 'WEEK') {
    // 이번주 월요일부터 오늘까지 (누적 변동)
    const dow = now.getDay();
    const daysFromMon = dow === 0 ? 6 : dow - 1;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMon);
    return { from: monday, to: null };
  }
  if (key === 'CM') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null };
  }
  if (key === 'PM') {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0),
    };
  }
  if (key === 'CUSTOM') {
    return {
      from: customFrom ? new Date(customFrom) : null,
      to: customTo ? new Date(customTo) : null,
    };
  }
  if (key === 'ALL') return { from: null, to: null };
  if (key === 'YTD') return { from: new Date(now.getFullYear(), 0, 1), to: null };
  const r = RANGES.find(x => x.key === key)!;
  return { from: new Date(now.getTime() - r.days * 86400000), to: null };
}

export default function HistoryChart({ data, hideAssets, dcOn, realEstateOn, loanOn }: Props) {
  const [range, setRange] = useState<Range>('WEEK');
  const [showCustom, setShowCustom] = useState(false);

  // Header와 동일 기준으로 표시값 계산 — MiniStat 4칸이 토글을 따르도록 일관성 확보
  const display = useMemo(
    () => applyDisplayToggles(data, { dcOn, realEstateOn, loanOn }),
    [data, dcOn, realEstateOn, loanOn],
  );
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: () => fetchHistory(730),
    refetchInterval: 30 * 60 * 1000,
  });

  const backfillMutation = useMutation({
    mutationFn: () => triggerBackfill(30),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
  });

  const tabDataStatus = useMemo(() => {
    const result: Record<string, 'full' | 'no-extra'> = {};
    if (!items?.length) {
      RANGES.forEach(r => { result[r.key] = 'no-extra'; });
      return result;
    }
    const earliest = items[0].date;
    RANGES.forEach(r => {
      if (r.key === 'ALL' || r.key === 'CUSTOM') { result[r.key] = 'full'; return; }
      if (r.key === 'WEEK') {
        const { from: mon } = getRangeCutoff('WEEK', '', '');
        const monStr = mon!.toISOString().slice(0, 10);
        result[r.key] = earliest <= monStr ? 'full' : 'no-extra';
        return;
      }
      const { from } = getRangeCutoff(r.key, '', '');
      if (!from) { result[r.key] = 'full'; return; }
      const cutoffStr = from.toISOString().slice(0, 10);
      result[r.key] = earliest <= cutoffStr ? 'full' : 'no-extra';
    });
    return result;
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const { from, to } = getRangeCutoff(range, customFrom, customTo);
    if (!from) return items;
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to ? to.toISOString().slice(0, 10) : '9999-99-99';
    return items.filter(p => p.date >= fromStr && p.date <= toStr);
  }, [items, range, customFrom, customTo]);

  const [first, last] = useMemo(() => {
    if (!filtered.length) return [null, null] as const;
    return [filtered[0], filtered[filtered.length - 1]] as const;
  }, [filtered]);

  const dataShortfall = tabDataStatus[range] === 'no-extra' && range !== 'ALL';

  const periodChange = useMemo(() => {
    if (!first || !last || first === last) return null;
    const diff = last.total_value_krw - first.total_value_krw;
    const pct = first.total_value_krw ? (diff / first.total_value_krw) * 100 : 0;
    return { diff, pct };
  }, [first, last]);

  const profitStats = useMemo(() => {
    if (!items || items.length < 2) return null;
    const now = new Date();
    const monthStartStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const yearStartStr = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const lastPoint = items[items.length - 1];

    const beforeMonth = items.filter(p => p.date < monthStartStr);
    const monthBase = beforeMonth[beforeMonth.length - 1] ?? items[0];

    const beforeYear = items.filter(p => p.date < yearStartStr);
    const yearBase = beforeYear[beforeYear.length - 1] ?? items[0];

    const monthDiff = lastPoint.total_value_krw - monthBase.total_value_krw;
    const monthPct = monthBase.total_value_krw ? (monthDiff / monthBase.total_value_krw) * 100 : null;

    const yearDiff = lastPoint.total_value_krw - yearBase.total_value_krw;
    const yearPct = yearBase.total_value_krw ? (yearDiff / yearBase.total_value_krw) * 100 : null;

    return { monthDiff, monthPct, yearDiff, yearPct };
  }, [items]);

  const RANGE_LABEL: Partial<Record<Range, string>> = {
    WEEK: '이번주', CM: '당월', PM: '전월', '3M': '3개월', YTD: '올해', ALL: '전체', CUSTOM: '선택 기간',
  };

  // 기간에 따라 오늘 변동 or 전체 수익 기여 종목 표시
  const useProfit = range === 'ALL';
  const contributors = useMemo(() => {
    const map = new Map<string, { name: string; changeKrw: number; changePct: number | null; exchange: Exchange }>();
    data.accounts.flatMap(a => a.holdings).forEach(h => {
      const change = useProfit ? h.profit_krw : h.day_change_krw;
      const pct = useProfit ? h.profit_pct : h.day_change_pct;
      if (change === null || change === 0) return;
      const ex = map.get(h.name);
      if (ex) {
        map.set(h.name, { ...ex, changeKrw: ex.changeKrw + change, changePct: null });
      } else {
        map.set(h.name, { name: h.name, changeKrw: change, changePct: pct, exchange: classifyHolding(h).exchange });
      }
    });
    // 한국장/미국장 양쪽이 표시될 수 있도록 8개까지
    return [...map.values()]
      .sort((a, b) => Math.abs(b.changeKrw) - Math.abs(a.changeKrw))
      .slice(0, 8);
  }, [data.accounts, useProfit]);

  // 한국장/미국장 분리
  const contributorGroups = useMemo(() => {
    const kr = contributors.filter(c => c.exchange === 'KR');
    const us = contributors.filter(c => c.exchange === 'US');
    return [
      { key: 'KR', flag: '🇰🇷', label: '한국장', items: kr },
      { key: 'US', flag: '🇺🇸', label: '미국장', items: us },
    ].filter(g => g.items.length > 0);
  }, [contributors]);

  const annualStats = useMemo(() => {
    if (!items || items.length < 2) return [];
    const currentYear = new Date().getFullYear();
    const results: Array<{ year: number; pct: number | null; diff: number; partial: boolean }> = [];
    for (let year = currentYear - 2; year <= currentYear; year++) {
      const yearStart = `${year}-01-01`;
      const beforeYear = items.filter(p => p.date < yearStart);
      const inYear = items.filter(p => p.date >= yearStart && p.date <= `${year}-12-31`);
      if (!inYear.length) continue;
      const base = beforeYear[beforeYear.length - 1] ?? inYear[0];
      const last = inYear[inYear.length - 1];
      if (base === last) continue;
      const diff = last.total_value_krw - base.total_value_krw;
      const pct = base.total_value_krw ? (diff / base.total_value_krw) * 100 : null;
      results.push({ year, diff, pct, partial: year === currentYear || beforeYear.length === 0 });
    }
    return results;
  }, [items]);

  const availableDays = items?.length ?? 0;

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] overflow-hidden">
      {/* 투자 수익 요약 */}
      <div className="px-5 pt-5 pb-4 border-b border-toss-border">
        <div className="flex items-center gap-1.5 mb-3">
          <p className="text-[11px] font-semibold text-toss-text-tertiary tracking-widest uppercase">
            투자 수익 확인
          </p>
          <span
            className="text-xs text-toss-text-tertiary/70 inline-flex items-center gap-1"
            title="‘오늘’은 직전 영업일 종가 대비 실시간 등락이고, ‘이번달/올해’는 일별 스냅샷 차이입니다. 측정 기준이 달라 같은 날 다른 값일 수 있어요."
          >
            <Info size={9} />
            <span>측정 기준</span>
          </span>
        </div>
        {(() => {
          return (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <MiniStat
                  label="오늘"
                  diff={display.dayChg}
                  pct={display.dayPct}
                  hideAssets={hideAssets}
                  hint="직전 영업일 종가 대비 실시간 변동 (보유 종목 + 환율). 토글 적용."
                />
                <MiniStat
                  label="이번달"
                  diff={profitStats?.monthDiff ?? null}
                  pct={profitStats?.monthPct ?? null}
                  hideAssets={hideAssets}
                  hint="이번달 첫 영업일 스냅샷 대비 마지막 스냅샷. 일별 1회 기록값 비교."
                />
                <MiniStat
                  label="올해"
                  diff={profitStats?.yearDiff ?? null}
                  pct={profitStats?.yearPct ?? null}
                  hideAssets={hideAssets}
                  hint="올해 첫 영업일 스냅샷 대비 마지막 스냅샷."
                />
                <MiniStat
                  label="누적 수익"
                  diff={display.profit}
                  pct={display.profitPct}
                  hideAssets={hideAssets}
                  hint="현재 평가가치 − 매입 원가. 토글(퇴직연금/부동산/대출) 적용."
                />
              </div>
              {annualStats.length > 0 && (
                <div className="mt-4 pt-4 border-t border-toss-border/50">
                  <p className="text-xs font-semibold text-toss-text-tertiary tracking-widest uppercase mb-2">연도별 수익</p>
                  <div className="flex gap-2">
                    {annualStats.map(s => (
                      <div key={s.year} className="flex-1 bg-toss-bg rounded-xl px-3 py-2.5">
                        <p className="text-[10px] text-toss-text-tertiary mb-1">
                          {s.year}{s.partial ? '년 (진행중)' : '년'}
                        </p>
                        <p className={`num text-sm font-bold ${colorClass(s.pct ?? 0)}`}>
                          {s.pct !== null ? `${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%` : '-'}
                        </p>
                        {!hideAssets && s.diff !== 0 && (
                          <p className={`num text-[10px] mt-0.5 ${colorClass(s.diff)}`}>
                            {s.diff >= 0 ? '+' : ''}{fmtKRW(s.diff)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* 기간별 수익분석 차트 */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold text-toss-text-tertiary tracking-widest uppercase mb-1.5">
              기간별 수익분석
            </p>
            {periodChange ? (
              <div className="flex items-baseline gap-2">
                <span className={`num text-2xl font-extrabold tracking-tight ${colorClass(periodChange.diff)}`}>
                  {periodChange.diff >= 0 ? '+' : ''}
                  {hideAssets ? '••••••' : fmtKRW(periodChange.diff)}
                </span>
                <span className={`num text-xs font-bold px-2 py-0.5 rounded-full ${
                  periodChange.diff >= 0 ? 'bg-toss-up-soft text-toss-up' : 'bg-toss-down-soft text-toss-down'
                }`}>
                  {fmtPct(periodChange.pct)}
                </span>
              </div>
            ) : range === 'WEEK' ? (
              // 이번주 스냅샷이 1개뿐(=월요일=오늘)인 초기 상태에선 백엔드 실시간 day_change로 폴백
              <div className="flex items-baseline gap-2">
                <span className={`num text-2xl font-extrabold tracking-tight ${colorClass(display.dayChg)}`}>
                  {display.dayChg >= 0 ? '+' : ''}
                  {hideAssets ? '••••••' : fmtKRW(display.dayChg)}
                </span>
                <span className={`num text-xs font-bold px-2 py-0.5 rounded-full ${
                  display.dayPct >= 0 ? 'bg-toss-up-soft text-toss-up' : 'bg-toss-down-soft text-toss-down'
                }`}>
                  {fmtPct(display.dayPct)}
                </span>
              </div>
            ) : last ? (
              <p className="num text-sm text-toss-text-tertiary">현재 {hideAssets ? '••••' : fmtKRW(last.total_value_krw)}</p>
            ) : null}
            {range === 'WEEK' ? (
              <p className="text-[10px] text-toss-text-tertiary mt-1">월요일 ~ 오늘 누적 (일별 스냅샷)</p>
            ) : first && last && (
              <p className="text-[10px] text-toss-text-tertiary mt-1">
                {first.date.slice(5)} ~ {last.date.slice(5)} ({filtered.length}일)
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end min-w-0">
            <button
              onClick={() => backfillMutation.mutate()}
              disabled={backfillMutation.isPending}
              aria-label="과거 30일 재계산"
              className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95 transition-all disabled:opacity-50 shrink-0"
            >
              <RotateCcw size={14} className={`text-toss-text-tertiary ${backfillMutation.isPending ? 'animate-spin' : ''}`} />
            </button>

            {/* 기간 탭 — 모바일에서 가로 스크롤 */}
            <div role="tablist" aria-label="조회 기간" className="flex bg-toss-bg rounded-full p-0.5 gap-0.5 overflow-x-auto scrollbar-none min-w-0 max-w-full">
              {RANGES.map((r) => {
                const st = tabDataStatus[r.key] ?? 'no-extra';
                const isActive = range === r.key;
                const hasData = st === 'full';
                return (
                  <button
                    key={r.key}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setRange(r.key);
                      if (r.key !== 'CUSTOM') setShowCustom(false);
                    }}
                    className={`relative shrink-0 min-h-10 px-3 text-xs rounded-full transition-all font-medium ${
                      isActive
                        ? 'bg-toss-blue text-white shadow-sm'
                        : hasData
                          ? 'text-toss-text-secondary hover:text-toss-text-primary'
                          : 'text-toss-text-tertiary/50 hover:text-toss-text-tertiary'
                    }`}
                  >
                    {r.label}
                    {!hasData && !isActive && r.key !== 'ALL' && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
              {/* 직접 기간 설정 버튼 */}
              <button
                role="tab"
                aria-selected={range === 'CUSTOM'}
                onClick={() => { setRange('CUSTOM'); setShowCustom(true); }}
                className={`relative shrink-0 min-h-10 px-3 text-xs rounded-full transition-all font-medium flex items-center gap-1 ${
                  range === 'CUSTOM'
                    ? 'bg-toss-blue text-white shadow-sm'
                    : 'text-toss-text-secondary hover:text-toss-text-primary'
                }`}
              >
                <CalendarDays size={10} aria-hidden="true" />
                직접
              </button>
            </div>
          </div>
        </div>

        {/* 직접 기간 입력 */}
        {showCustom && (
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="text-[11px] bg-toss-bg border border-toss-border rounded-lg px-2 py-1.5 text-toss-text-primary focus:outline-none focus:border-toss-blue"
            />
            <span className="text-[11px] text-toss-text-tertiary">~</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="text-[11px] bg-toss-bg border border-toss-border rounded-lg px-2 py-1.5 text-toss-text-primary focus:outline-none focus:border-toss-blue"
            />
          </div>
        )}

        {/* 데이터 부족 안내 */}
        {dataShortfall && availableDays > 0 && (
          <div className="mb-3 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-[11px] text-amber-400 leading-relaxed">
              현재 <span className="font-bold">{availableDays}일</span> 데이터만 있어요.
              선택한 기간보다 짧아 차트가 동일하게 보입니다.
            </p>
            <button
              onClick={() => backfillMutation.mutate()}
              disabled={backfillMutation.isPending}
              className="shrink-0 text-[10px] font-semibold text-amber-400 border border-amber-400/40 px-2.5 py-1 rounded-full hover:bg-amber-400/10 active:scale-95 transition-all"
            >
              {backfillMutation.isPending ? '계산 중...' : '30일 추가'}
            </button>
          </div>
        )}

        <div className="h-[180px] sm:h-[220px] -mx-1">
          {isLoading ? (
            <div className="h-full skeleton rounded-xl" />
          ) : filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
              <p className="text-sm text-toss-text-secondary">이 기간의 데이터가 없어요</p>
              <button
                onClick={() => backfillMutation.mutate()}
                disabled={backfillMutation.isPending}
                className="text-xs text-toss-blue font-semibold px-4 py-2 bg-toss-blue-soft rounded-full transition-all active:scale-95"
              >
                {backfillMutation.isPending ? '계산 중...' : '과거 30일 추이 가져오기'}
              </button>
            </div>
          ) : (() => {
            // 기간 손익 부호에 따라 색상 결정 (한국식: 상승=빨강, 하락=파랑)
            const diff = periodChange?.diff ?? (range === 'WEEK' ? display.dayChg : 0);
            const isPos = diff >= 0;
            const stroke = isPos ? '#F04452' : '#5B9CF6';
            return (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={filtered} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                      <stop offset="60%" stopColor={stroke} stopOpacity={0.08} />
                      <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-toss-border)" strokeDasharray="4 4" vertical={false} strokeOpacity={0.6} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--color-toss-text-tertiary)' }}
                    tickFormatter={v => v.slice(5)}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                  />
                  <YAxis
                    hide={hideAssets}
                    tick={{ fontSize: 11, fill: 'var(--color-toss-text-tertiary)' }}
                    tickFormatter={v => {
                      const abs = Math.abs(v);
                      if (abs >= 1_0000_0000) return `${(v / 1_0000_0000).toFixed(1)}억`;
                      return `${Math.round(v / 10000)}만`;
                    }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    domain={['dataMin', 'dataMax']}
                  />
                  <Tooltip content={<ToolTipBox hideAssets={hideAssets} />} />
                  <Area
                    type="monotone"
                    dataKey="total_value_krw"
                    stroke={stroke}
                    strokeWidth={2.5}
                    fill="url(#histGrad)"
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: stroke }}
                    dot={filtered.length === 1 ? { r: 5, fill: stroke, strokeWidth: 0 } : false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            );
          })()}
        </div>

        {/* 기간별 수익 기여 종목 */}
        {contributors.length > 0 && (
          <div className="mt-4 pt-4 border-t border-toss-border/50">
            <div className="flex items-center gap-2 mb-2.5">
              <p className="text-[10px] font-semibold text-toss-text-tertiary tracking-widest uppercase">
                {RANGE_LABEL[range] ?? '선택 기간'} 수익 기여 종목
              </p>
              {!useProfit && range !== 'CM' && (
                <span className="text-[9px] text-toss-text-tertiary bg-toss-bg px-1.5 py-0.5 rounded-full">
                  오늘 기준
                </span>
              )}
              {useProfit && (
                <span className="text-[9px] text-toss-text-tertiary bg-toss-bg px-1.5 py-0.5 rounded-full">
                  매입 이후 누적
                </span>
              )}
            </div>
            <div className="space-y-2.5">
              {contributorGroups.map(group => (
                <div key={group.key}>
                  <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
                    <span className="text-[12px] leading-none" aria-hidden>{group.flag}</span>
                    <span className="text-[10px] font-semibold text-toss-text-secondary">{group.label}</span>
                    <span className="text-[9px] text-toss-text-tertiary">{group.items.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {group.items.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 bg-toss-bg rounded-xl px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-toss-text-secondary truncate">{c.name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`num text-[12px] font-bold ${colorClass(c.changeKrw)}`}>
                            {c.changeKrw >= 0 ? '+' : ''}
                            {hideAssets ? '••••' : fmtKRW(c.changeKrw)}
                          </p>
                          {c.changePct !== null && (
                            <p className={`num text-[10px] ${colorClass(c.changePct)}`}>
                              ({c.changePct >= 0 ? '+' : ''}{c.changePct.toFixed(2)}%)
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
