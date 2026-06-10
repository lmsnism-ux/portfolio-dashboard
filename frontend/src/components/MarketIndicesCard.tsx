import { useQuery } from '@tanstack/react-query';
import { fetchMarketIndices, fetchSparkline } from '../api';

const INDEX_KEYS = ['kospi', 'korea', 'nasdaq', 'sp500'] as const;

function MiniSparkline({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 72, H = 26;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={W} height={H} className="opacity-80">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? 'var(--color-toss-up)' : 'var(--color-toss-down)'}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 시장 탭 상단 — 주요 지수 현황 (도미노 앱 스타일 리스트) */
export default function MarketIndicesCard() {
  const { data: indices } = useQuery({
    queryKey: ['marketIndices'],
    queryFn: fetchMarketIndices,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });
  const { data: sparklines } = useQuery({
    queryKey: ['sparkline'],
    queryFn: fetchSparkline,
    staleTime: 30 * 60 * 1000,
  });

  if (!indices) return null;
  const entries = INDEX_KEYS
    .filter(k => indices[k]?.value != null)
    .map(k => ({ key: k, idx: indices[k] }));
  if (entries.length === 0) return null;

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] shadow-[var(--shadow-toss-card)] overflow-hidden">
      <h2 className="px-5 pt-4 pb-1 text-[15px] font-bold text-toss-text-primary">주요 지수</h2>
      <div className="divide-y divide-toss-border/60">
        {entries.map(({ key, idx }) => {
          const up = (idx.change_pct ?? 0) >= 0;
          const colorCls = up ? 'text-toss-up' : 'text-toss-down';
          return (
            <div key={key} className="flex items-center justify-between px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-toss-text-primary">{idx.label}</p>
                <p className={`num text-[13px] font-medium ${colorCls}`}>
                  {idx.change != null && `${up ? '+' : ''}${idx.change.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`}
                  {idx.change_pct != null && ` (${up ? '+' : ''}${idx.change_pct.toFixed(2)}%)`}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <MiniSparkline data={sparklines?.[key] ?? []} up={up} />
                <p className="num text-[17px] font-bold text-toss-text-primary w-[88px] text-right">
                  {idx.value!.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
