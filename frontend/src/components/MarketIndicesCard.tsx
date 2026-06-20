import { useQuery } from '@tanstack/react-query';
import { fetchMarketIndices, fetchMarketSparklines } from '../api';

const INDEX_KEYS = ['korea', 'nasdaq', 'sp500'] as const;

function MiniSparkline({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return <div className="h-8" />;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 32 - ((value - min) / range) * 30;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 34" className="mt-3 h-8 w-full" role="img" aria-label="최근 20거래일 흐름">
      <polyline
        points={points}
        fill="none"
        stroke={up ? 'var(--color-toss-up)' : 'var(--color-toss-down)'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MarketIndicesCard() {
  const { data: indices, isLoading } = useQuery({
    queryKey: ['marketIndices'],
    queryFn: fetchMarketIndices,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });
  const { data: sparklines = {} } = useQuery({
    queryKey: ['marketSparklines'],
    queryFn: fetchMarketSparklines,
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) return <div className="skeleton h-44 rounded-[var(--radius-toss-lg)]" />;
  if (!indices) return null;

  return (
    <section className="surface-card p-5" aria-labelledby="market-indices-title">
      <div className="mb-4">
        <p className="section-kicker">MARKET NOW</p>
        <h2 id="market-indices-title" className="mt-1 text-[18px] font-bold text-toss-text-primary">주요 시장 현황</h2>
        <p className="mt-1 text-xs text-toss-text-tertiary">전일 마감과 비교한 변화예요.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {INDEX_KEYS.map((key) => {
          const item = indices[key];
          if (!item || item.value == null) return null;
          const up = (item.change_pct ?? 0) >= 0;
          return (
            <article key={key} className="rounded-2xl bg-toss-bg p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-toss-text-primary">{item.label}</h3>
                  <p className="num mt-1 text-lg font-bold text-toss-text-primary">
                    {item.value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                  </p>
                </div>
                <span className={`num rounded-full px-2 py-1 text-[11px] font-bold ${up ? 'bg-toss-up-soft text-toss-up' : 'bg-toss-down-soft text-toss-down'}`}>
                  {up ? '+' : ''}{item.change_pct?.toFixed(2) ?? '-'}%
                </span>
              </div>
              <MiniSparkline values={sparklines[key] ?? []} up={up} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
