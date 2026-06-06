import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { RotateCcw } from 'lucide-react';
import { fetchHistory, triggerBackfill } from '../api';
import { fmtKRW, colorClass } from '../utils';
import type { HistoryPoint } from '../types';

type Range = '1M' | '3M' | '6M' | 'YTD' | '1Y';
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: '1M', label: '1개월', days: 31 },
  { key: '3M', label: '3개월', days: 92 },
  { key: '6M', label: '6개월', days: 183 },
  { key: 'YTD', label: '올해', days: 0 },
  { key: '1Y', label: '1년', days: 365 },
];

interface Props {
  hideAssets: boolean;
}

const ToolTipBox = ({ active, payload, hideAssets }: any) => {
  if (!active || !payload?.length) return null;
  const p: HistoryPoint = payload[0].payload;
  return (
    <div className="bg-toss-card border border-toss-border rounded-xl px-3 py-2 shadow-[var(--shadow-toss-pop)]">
      <p className="text-xs text-toss-text-tertiary">{p.date}</p>
      <p className="num text-sm font-bold text-toss-text-primary">
        {hideAssets ? '••••••' : fmtKRW(p.total_value_krw)}
      </p>
      {p.total_profit_pct !== null && (
        <p className={`num text-xs ${colorClass(p.total_profit_pct)}`}>
          누적 {p.total_profit_pct >= 0 ? '+' : ''}
          {p.total_profit_pct.toFixed(2)}%
        </p>
      )}
    </div>
  );
};

export default function HistoryChart({ hideAssets }: Props) {
  const [range, setRange] = useState<Range>('1M');
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: () => fetchHistory(365),
    refetchInterval: 30 * 60 * 1000,
  });

  const backfillMutation = useMutation({
    mutationFn: () => triggerBackfill(30),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });

  const filtered = useMemo(() => {
    if (!items) return [];
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

  const periodChange = useMemo(() => {
    if (!first || !last || first === last) return null;
    const diff = last.total_value_krw - first.total_value_krw;
    const pct = first.total_value_krw ? (diff / first.total_value_krw) * 100 : 0;
    return { diff, pct };
  }, [first, last]);

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-toss-text-secondary">자산 추이</h2>
          {periodChange ? (
            <p className="num text-xs mt-1 text-toss-text-tertiary">
              이 기간{' '}
              <span className={colorClass(periodChange.diff)}>
                {periodChange.diff >= 0 ? '+' : ''}
                {hideAssets ? '••••' : fmtKRW(periodChange.diff)} ({periodChange.pct >= 0 ? '+' : ''}
                {periodChange.pct.toFixed(2)}%)
              </span>
            </p>
          ) : last ? (
            <p className="num text-xs mt-1 text-toss-text-tertiary">
              현재 {hideAssets ? '••••' : fmtKRW(last.total_value_krw)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
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
          <div className="flex bg-toss-bg rounded-full p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-2.5 py-1 text-xs rounded-full transition-all ${
                  range === r.key
                    ? 'bg-toss-card text-toss-text-primary font-semibold shadow-sm'
                    : 'text-toss-text-tertiary hover:text-toss-text-secondary'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-[200px] sm:h-[240px] -mx-2">
        {isLoading ? (
          <div className="h-full skeleton rounded-xl" />
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-2">
            <p className="text-sm text-toss-text-secondary">아직 기록된 데이터가 없어요</p>
            <button
              onClick={() => backfillMutation.mutate()}
              disabled={backfillMutation.isPending}
              className="text-xs text-toss-blue font-semibold px-3 py-1.5 bg-toss-blue-soft rounded-full"
            >
              {backfillMutation.isPending ? '계산 중...' : '과거 30일 추이 가져오기'}
            </button>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filtered} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3182F6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#3182F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-toss-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--color-toss-text-tertiary)' }}
                tickFormatter={(v) => v.slice(5)}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
              />
              <YAxis
                hide={hideAssets}
                tick={{ fontSize: 10, fill: 'var(--color-toss-text-tertiary)' }}
                tickFormatter={(v) => `${(v / 1_0000_0000).toFixed(1)}억`}
                tickLine={false}
                axisLine={false}
                width={48}
                domain={['dataMin', 'dataMax']}
              />
              <Tooltip content={<ToolTipBox hideAssets={hideAssets} />} />
              <Area
                type="monotone"
                dataKey="total_value_krw"
                stroke="#3182F6"
                strokeWidth={2.5}
                fill="url(#histGrad)"
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                dot={filtered.length === 1 ? { r: 5, fill: '#3182F6', strokeWidth: 0 } : false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
