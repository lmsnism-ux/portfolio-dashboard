import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { RotateCcw } from 'lucide-react';
import { fetchHistory, triggerBackfill } from '../api';
import { fmtKRW, fmtPct, colorClass } from '../utils';
import type { HistoryPoint, PortfolioSummary } from '../types';

type Range = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

const RANGES: { key: Range; label: string; days: number }[] = [
  { key: '1M', label: '1개월', days: 31 },
  { key: '3M', label: '3개월', days: 92 },
  { key: '6M', label: '6개월', days: 183 },
  { key: 'YTD', label: '올해', days: 0 },
  { key: '1Y', label: '1년', days: 365 },
  { key: 'ALL', label: '전체', days: 0 },
];

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
}

const ToolTipBox = ({ active, payload, hideAssets }: any) => {
  if (!active || !payload?.length) return null;
  const p: HistoryPoint = payload[0].payload;
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
}

const MiniStat = ({ label, diff, pct, hideAssets }: MiniStatProps) => (
  <div className="bg-toss-bg rounded-2xl p-3.5">
    <p className="text-[10px] font-medium text-toss-text-tertiary tracking-wide uppercase mb-2">{label}</p>
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

export default function HistoryChart({ data, hideAssets }: Props) {
  const [range, setRange] = useState<Range>('1M');
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

  // 각 탭에 얼마나 데이터가 있는지 계산
  // 'full' = 선택 기간 전체에 데이터 있음, 'partial' = 일부, 'no-extra' = 범위가 전체 보유 데이터를 초과함
  const tabDataStatus = useMemo(() => {
    const result: Record<string, 'full' | 'partial' | 'no-extra'> = {};
    if (!items?.length) {
      RANGES.forEach(r => { result[r.key] = 'no-extra'; });
      return result;
    }
    const earliest = items[0].date;
    RANGES.forEach(r => {
      if (r.key === 'ALL') { result[r.key] = 'full'; return; }
      const now = new Date();
      let cutoff: Date;
      if (r.key === 'YTD') cutoff = new Date(now.getFullYear(), 0, 1);
      else cutoff = new Date(now.getTime() - r.days * 86400000);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      if (earliest <= cutoffStr) result[r.key] = 'full';
      else result[r.key] = 'no-extra';
    });
    return result;
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (range === 'ALL') return items;
    const now = new Date();
    let cutoff: Date;
    if (range === 'YTD') {
      cutoff = new Date(now.getFullYear(), 0, 1);
    } else {
      const r = RANGES.find((x) => x.key === range)!;
      cutoff = new Date(now.getTime() - r.days * 86400000);
    }
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return items.filter((p) => p.date >= cutoffStr);
  }, [items, range]);

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

    const beforeMonth = items.filter((p) => p.date < monthStartStr);
    const monthBase = beforeMonth[beforeMonth.length - 1] ?? items[0];

    const beforeYear = items.filter((p) => p.date < yearStartStr);
    const yearBase = beforeYear[beforeYear.length - 1] ?? items[0];

    const monthDiff = lastPoint.total_value_krw - monthBase.total_value_krw;
    const monthPct = monthBase.total_value_krw
      ? (monthDiff / monthBase.total_value_krw) * 100
      : null;

    const yearDiff = lastPoint.total_value_krw - yearBase.total_value_krw;
    const yearPct = yearBase.total_value_krw
      ? (yearDiff / yearBase.total_value_krw) * 100
      : null;

    return { monthDiff, monthPct, yearDiff, yearPct };
  }, [items]);

  const availableDays = items?.length ?? 0;

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] overflow-hidden">
      {/* 투자 수익 요약 */}
      <div className="px-5 pt-5 pb-4 border-b border-toss-border">
        <p className="text-[11px] font-semibold text-toss-text-tertiary tracking-widest uppercase mb-3">
          투자 수익 확인
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <MiniStat
            label="오늘"
            diff={data.total_day_change_krw}
            pct={data.total_day_change_pct}
            hideAssets={hideAssets}
          />
          <MiniStat
            label="이번달"
            diff={profitStats?.monthDiff ?? null}
            pct={profitStats?.monthPct ?? null}
            hideAssets={hideAssets}
          />
          <MiniStat
            label="올해"
            diff={profitStats?.yearDiff ?? null}
            pct={profitStats?.yearPct ?? null}
            hideAssets={hideAssets}
          />
          <MiniStat
            label="누적 수익"
            diff={data.total_profit_krw}
            pct={data.total_profit_pct}
            hideAssets={hideAssets}
          />
        </div>
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
                <span
                  className={`num text-xs font-bold px-2 py-0.5 rounded-full ${
                    periodChange.diff >= 0
                      ? 'bg-toss-up-soft text-toss-up'
                      : 'bg-toss-down-soft text-toss-down'
                  }`}
                >
                  {fmtPct(periodChange.pct)}
                </span>
              </div>
            ) : last ? (
              <p className="num text-sm text-toss-text-tertiary">
                현재 {hideAssets ? '••••' : fmtKRW(last.total_value_krw)}
              </p>
            ) : null}
            {first && last && (
              <p className="text-[10px] text-toss-text-tertiary mt-1">
                {first.date.slice(5)} ~ {last.date.slice(5)} ({filtered.length}일)
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => backfillMutation.mutate()}
              disabled={backfillMutation.isPending}
              className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95 transition-all disabled:opacity-50"
              title="과거 30일 다시 계산"
            >
              <RotateCcw
                size={14}
                className={`text-toss-text-tertiary ${backfillMutation.isPending ? 'animate-spin' : ''}`}
              />
            </button>

            {/* 기간 탭 — 데이터가 부족한 탭은 dim 처리 */}
            <div className="flex bg-toss-bg rounded-full p-0.5 gap-0.5">
              {RANGES.map((r) => {
                const st = tabDataStatus[r.key] ?? 'no-extra';
                const isActive = range === r.key;
                const hasData = st === 'full';
                return (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    className={`relative px-2.5 py-1 text-[11px] rounded-full transition-all font-medium ${
                      isActive
                        ? 'bg-toss-blue text-white shadow-sm'
                        : hasData
                          ? 'text-toss-text-secondary hover:text-toss-text-primary'
                          : 'text-toss-text-tertiary/50 hover:text-toss-text-tertiary'
                    }`}
                  >
                    {r.label}
                    {/* 데이터 부족 탭에 작은 점 표시 */}
                    {!hasData && !isActive && r.key !== 'ALL' && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 데이터 부족 안내 — 선택한 기간보다 보유 데이터가 적을 때 */}
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
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filtered} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5B9CF6" stopOpacity={0.35} />
                    <stop offset="60%" stopColor="#5B9CF6" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="#5B9CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--color-toss-border)"
                  strokeDasharray="4 4"
                  vertical={false}
                  strokeOpacity={0.6}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--color-toss-text-tertiary)' }}
                  tickFormatter={(v) => v.slice(5)}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                />
                <YAxis
                  hide={hideAssets}
                  tick={{ fontSize: 10, fill: 'var(--color-toss-text-tertiary)' }}
                  tickFormatter={(v) => {
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
                  stroke="#5B9CF6"
                  strokeWidth={2.5}
                  fill="url(#histGrad)"
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: '#5B9CF6' }}
                  dot={filtered.length === 1 ? { r: 5, fill: '#5B9CF6', strokeWidth: 0 } : false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
