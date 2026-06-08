import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { fetchHistory } from '../api';
import { fmtKRW, colorClass } from '../utils';
import type { HistoryPoint } from '../types';

const MONTH_LABELS = ['1','2','3','4','5','6','7','8','9','10','11','12'];

interface MonthlyStat {
  year: number;
  month: number;
  pct: number | null;
  diff: number | null;        // 월말 - 월초 (KRW)
  endValue: number | null;    // 월말 평가금액
}

function computeMonthlyStats(items: HistoryPoint[]): MonthlyStat[] {
  if (items.length < 2) return [];
  const byMonth: Record<string, HistoryPoint[]> = {};
  items.forEach(p => {
    const ym = p.date.slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = [];
    byMonth[ym].push(p);
  });
  const months = Object.keys(byMonth).sort();
  return months.map((ym, idx) => {
    const [y, m] = ym.split('-').map(Number);
    const pts = byMonth[ym];
    const lastPt = pts[pts.length - 1];
    const prevYm = months[idx - 1];
    if (!prevYm) return { year: y, month: m, pct: null, diff: null, endValue: lastPt.total_value_krw };
    const prevPts = byMonth[prevYm];
    const basePt = prevPts[prevPts.length - 1];
    if (!basePt.total_value_krw) return { year: y, month: m, pct: null, diff: null, endValue: lastPt.total_value_krw };
    const diff = lastPt.total_value_krw - basePt.total_value_krw;
    const pct = (diff / basePt.total_value_krw) * 100;
    return { year: y, month: m, pct, diff, endValue: lastPt.total_value_krw };
  });
}

export default function ProfitHeatmap() {
  const [open, setOpen] = useState(false);
  const [showAmount, setShowAmount] = useState(true);

  const { data: items } = useQuery({
    queryKey: ['history'],
    queryFn: () => fetchHistory(730),
    refetchInterval: 30 * 60 * 1000,
  });

  const stats = useMemo(() => items ? computeMonthlyStats(items) : [], [items]);
  const years = useMemo(() => [...new Set(stats.map(s => s.year))].sort(), [stats]);
  const byKey = useMemo(() => {
    const m: Record<string, MonthlyStat> = {};
    stats.forEach(s => { m[`${s.year}-${s.month}`] = s; });
    return m;
  }, [stats]);

  const ytdByYear = useMemo(() => {
    const m: Record<number, { diff: number; pct: number | null }> = {};
    years.forEach(y => {
      const monthsOfYear = stats.filter(s => s.year === y && s.diff !== null);
      const diff = monthsOfYear.reduce((s, x) => s + (x.diff ?? 0), 0);
      const firstWithBase = stats.find(s => s.year === y);
      const idx = firstWithBase ? stats.indexOf(firstWithBase) : -1;
      const baseValue = idx > 0 ? stats[idx - 1].endValue : (firstWithBase?.endValue ?? null);
      const pct = baseValue && baseValue > 0 ? (diff / baseValue) * 100 : null;
      m[y] = { diff, pct };
    });
    return m;
  }, [stats, years]);

  if (!items || items.length < 14) return null;

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-5 py-4"
      >
        <div className="w-7 h-7 rounded-full bg-toss-blue-soft flex items-center justify-center shrink-0">
          <TrendingUp size={15} className="text-toss-blue" />
        </div>
        <h3 className="text-sm font-semibold text-toss-text-primary flex-1 text-left">월별 수익 히트맵</h3>
        {open
          ? <ChevronUp size={16} className="text-toss-text-tertiary" />
          : <ChevronDown size={16} className="text-toss-text-tertiary" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-toss-border/60 pt-4 space-y-3">
          {/* 토글: % vs 금액 */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-toss-text-tertiary">월별 수익률(전월 대비)</p>
            <div className="flex bg-toss-bg rounded-full p-0.5 gap-0.5">
              {(['%', '금액'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setShowAmount(mode === '금액')}
                  className={`px-2.5 py-0.5 text-[11px] rounded-full font-medium transition-all ${
                    (mode === '금액') === showAmount
                      ? 'bg-toss-blue text-white shadow-sm'
                      : 'text-toss-text-tertiary hover:text-toss-text-secondary'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* 히트맵 본문 */}
          <div className="overflow-x-auto">
            <div className="min-w-[480px]">
              {/* 월 헤더 */}
              <div className="flex gap-1 mb-1.5 pl-10 pr-16">
                {MONTH_LABELS.map(m => (
                  <div key={m} className="flex-1 text-[11px] font-medium text-toss-text-tertiary text-center">{m}월</div>
                ))}
              </div>
              {/* 연도별 행 */}
              {years.map(year => {
                const yearTotal = ytdByYear[year];
                return (
                  <div key={year} className="flex items-center gap-1 mb-1">
                    <span className="text-[12px] font-semibold text-toss-text-tertiary w-9 shrink-0">{year}</span>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                      const key = `${year}-${m}`;
                      const stat = byKey[key];
                      if (!stat) return <div key={m} className="flex-1 h-12 rounded-md bg-toss-bg/20" />;
                      if (stat.pct === null) return <div key={m} className="flex-1 h-12 rounded-md bg-toss-bg/40" />;

                      const pct = stat.pct;
                      const intensity = Math.min(1, Math.abs(pct) / 5);
                      const isPos = pct >= 0;
                      const bg = isPos
                        ? `rgba(240,68,82,${0.15 + intensity * 0.55})`
                        : `rgba(91,156,246,${0.15 + intensity * 0.55})`;
                      const txt = isPos ? 'text-toss-up' : 'text-toss-down';
                      const sign = isPos ? '+' : '';

                      return (
                        <div
                          key={m}
                          className="flex-1 h-12 rounded-md flex flex-col items-center justify-center cursor-default px-1 transition-all hover:scale-[1.05]"
                          style={{ background: bg }}
                          title={`${year}년 ${m}월: ${sign}${pct.toFixed(2)}% (${sign}${fmtKRW(stat.diff ?? 0)})`}
                        >
                          {showAmount && stat.diff !== null ? (
                            <span className={`num text-[10px] font-extrabold leading-tight ${txt}`}>
                              {sign}{fmtKRW(stat.diff)}
                            </span>
                          ) : (
                            <span className={`num text-[11px] font-extrabold leading-tight ${txt}`}>
                              {sign}{pct.toFixed(1)}%
                            </span>
                          )}
                          <span className={`num text-[8px] mt-0.5 opacity-70 ${txt}`}>
                            {showAmount ? `${sign}${pct.toFixed(1)}%` : `${sign}${(stat.diff! / 10000).toFixed(0)}만`}
                          </span>
                        </div>
                      );
                    })}
                    {/* 연 합계 */}
                    <div className="w-14 shrink-0 ml-1 h-12 rounded-md bg-toss-bg flex flex-col items-center justify-center px-1 border border-toss-border/60">
                      <span className="text-[8px] text-toss-text-tertiary leading-none">YTD</span>
                      {yearTotal.pct !== null ? (
                        <>
                          <span className={`num text-[11px] font-extrabold leading-tight ${colorClass(yearTotal.pct)}`}>
                            {yearTotal.pct >= 0 ? '+' : ''}{yearTotal.pct.toFixed(1)}%
                          </span>
                          <span className={`num text-[8px] mt-0.5 opacity-70 ${colorClass(yearTotal.diff)}`}>
                            {yearTotal.diff >= 0 ? '+' : ''}{fmtKRW(yearTotal.diff)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-toss-text-tertiary">-</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* 범례 */}
              <div className="mt-3 flex items-center gap-2 justify-end px-1">
                <span className="text-[10px] text-toss-text-tertiary">손실</span>
                <div className="flex gap-0.5">
                  {[0.7, 0.4, 0.2].map((op, i) => (
                    <div key={i} className="w-4 h-3 rounded-sm" style={{ background: `rgba(91,156,246,${op})` }} />
                  ))}
                  <div className="w-4 h-3 rounded-sm bg-toss-bg/40 mx-0.5" />
                  {[0.2, 0.4, 0.7].map((op, i) => (
                    <div key={i} className="w-4 h-3 rounded-sm" style={{ background: `rgba(240,68,82,${op})` }} />
                  ))}
                </div>
                <span className="text-[10px] text-toss-text-tertiary">수익 (한국식)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
