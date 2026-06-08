import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fetchHistory } from '../api';
import type { HistoryPoint } from '../types';

const MONTH_LABELS = ['1','2','3','4','5','6','7','8','9','10','11','12'];

interface MonthlyStat {
  year: number;
  month: number;
  pct: number | null;
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
    if (!prevYm) return { year: y, month: m, pct: null };
    const prevPts = byMonth[prevYm];
    const basePt = prevPts[prevPts.length - 1];
    if (!basePt.total_value_krw) return { year: y, month: m, pct: null };
    const pct = (lastPt.total_value_krw - basePt.total_value_krw) / basePt.total_value_krw * 100;
    return { year: y, month: m, pct };
  });
}

export default function ProfitHeatmap() {
  const [open, setOpen] = useState(false);

  const { data: items } = useQuery({
    queryKey: ['history'],
    queryFn: () => fetchHistory(730),
    refetchInterval: 30 * 60 * 1000,
  });

  const stats = useMemo(() => items ? computeMonthlyStats(items) : [], [items]);
  const years = useMemo(() => [...new Set(stats.map(s => s.year))].sort(), [stats]);
  const byKey = useMemo(() => {
    const m: Record<string, number | null> = {};
    stats.forEach(s => { m[`${s.year}-${s.month}`] = s.pct; });
    return m;
  }, [stats]);

  if (!items || items.length < 14) return null;

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-5 py-4"
      >
        <h3 className="text-sm font-semibold text-toss-text-primary flex-1 text-left">월별 수익 히트맵</h3>
        {open
          ? <ChevronUp size={16} className="text-toss-text-tertiary" />
          : <ChevronDown size={16} className="text-toss-text-tertiary" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-toss-border/60 pt-4">
          <div className="overflow-x-auto">
            <div className="min-w-[360px]">
              {/* 월 헤더 */}
              <div className="flex gap-0.5 mb-1 pl-9">
                {MONTH_LABELS.map(m => (
                  <div key={m} className="flex-1 text-[9px] text-toss-text-tertiary text-center">{m}월</div>
                ))}
              </div>
              {/* 연도별 행 */}
              {years.map(year => (
                <div key={year} className="flex items-center gap-0.5 mb-0.5">
                  <span className="text-[10px] text-toss-text-tertiary w-8 shrink-0">{year}</span>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                    const key = `${year}-${m}`;
                    const pct = byKey[key];
                    if (pct === undefined) {
                      return <div key={m} className="flex-1 h-7 rounded-sm" />;
                    }
                    if (pct === null) {
                      return <div key={m} className="flex-1 h-7 rounded-sm bg-toss-bg/40" />;
                    }
                    const intensity = Math.min(1, Math.abs(pct) / 5);
                    const isPos = pct >= 0;
                    return (
                      <div
                        key={m}
                        className="flex-1 h-7 rounded-sm flex items-center justify-center cursor-default"
                        style={{
                          background: isPos
                            ? `rgba(45,175,78,${0.15 + intensity * 0.65})`
                            : `rgba(240,68,82,${0.15 + intensity * 0.65})`,
                        }}
                        title={`${year}년 ${m}월 ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
                      >
                        <span className={`text-[7px] font-bold leading-none ${isPos ? 'text-emerald-300' : 'text-red-300'}`}>
                          {pct >= 0 ? '+' : ''}{pct.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* 범례 */}
              <div className="mt-3 flex items-center gap-2 justify-end">
                <span className="text-[9px] text-toss-text-tertiary">손실</span>
                <div className="flex gap-0.5">
                  {[0.75, 0.45, 0.2].map((op, i) => (
                    <div key={i} className="w-4 h-3 rounded-sm" style={{ background: `rgba(240,68,82,${op})` }} />
                  ))}
                  <div className="w-4 h-3 rounded-sm bg-toss-bg/40 mx-0.5" />
                  {[0.2, 0.45, 0.75].map((op, i) => (
                    <div key={i} className="w-4 h-3 rounded-sm" style={{ background: `rgba(45,175,78,${op})` }} />
                  ))}
                </div>
                <span className="text-[9px] text-toss-text-tertiary">수익</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
