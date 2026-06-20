import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { fetchHistory } from '../api';
import type { HistoryPoint, PortfolioSummary } from '../types';
import { chartColor, fmtKRW } from '../utils';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
  onOpenAnalysis: () => void;
  onOpenAssets: () => void;
}

interface AllocationItem {
  name: string;
  value_krw: number;
  weight: number;
}

const CLASS_NAMES: Record<string, string> = {
  stock: '주식',
  etf: 'ETF',
  bond: '채권',
  cash: '현금',
  pension: '연금',
  real_estate: '부동산',
};

function HistoryTooltip({
  active,
  payload,
  hideAssets,
}: {
  active?: boolean;
  payload?: Array<{ payload: HistoryPoint }>;
  hideAssets: boolean;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-xl border border-toss-border bg-toss-card px-3 py-2 shadow-[var(--shadow-toss-pop)]">
      <p className="text-[10px] text-toss-text-tertiary">{point.date}</p>
      <p className="num mt-0.5 text-xs font-bold text-toss-text-primary">
        {hideAssets ? '••••••' : fmtKRW(point.total_value_krw)}
      </p>
    </div>
  );
}

function AllocationSummary({
  title,
  items,
  translateName,
}: {
  title: string;
  items: AllocationItem[];
  translateName?: (name: string) => string;
}) {
  const sorted = items
    .filter((item) => item.value_krw > 0)
    .sort((a, b) => b.value_krw - a.value_krw);
  const displayName = (name: string) => translateName?.(name) ?? name;

  return (
    <article className="rounded-2xl bg-toss-bg p-4" aria-label={title}>
      <h3 className="text-[13px] font-bold text-toss-text-primary">{title}</h3>
      {sorted.length > 0 ? (
        <>
          <div
            className="mt-3 flex h-3 overflow-hidden rounded-full bg-toss-border"
            role="img"
            aria-label={sorted.map((item) => `${displayName(item.name)} ${item.weight.toFixed(1)}%`).join(', ')}
          >
            {sorted.map((item, index) => (
              <span
                key={item.name}
                className="h-full min-w-[2px]"
                style={{ width: `${item.weight}%`, backgroundColor: chartColor(index) }}
                aria-hidden="true"
              />
            ))}
          </div>
          <ul className="mt-3 space-y-2.5">
            {sorted.map((item, index) => (
              <li key={item.name} className="flex min-w-0 items-center gap-1.5 text-[11px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: chartColor(index) }} />
                <span className="min-w-0 leading-tight text-toss-text-secondary">{displayName(item.name)}</span>
                <strong className="num ml-auto shrink-0 text-toss-text-primary">
                  {item.weight.toFixed(1)}%
                </strong>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-xs text-toss-text-tertiary">비중 데이터가 아직 없어요</p>
      )}
    </article>
  );
}

export default function HomeCharts({ data, hideAssets, onOpenAnalysis, onOpenAssets }: Props) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: () => fetchHistory(120),
    staleTime: 30 * 60 * 1000,
  });

  const latestHistory = history.slice(-90);
  const firstValue = latestHistory[0]?.total_value_krw;
  const lastValue = latestHistory.at(-1)?.total_value_krw;
  const changePct = firstValue && lastValue ? ((lastValue - firstValue) / firstValue) * 100 : null;

  return (
    <section className="surface-card overflow-hidden" aria-labelledby="home-charts-title">
      <div className="flex items-center justify-between px-5 pb-1 pt-5">
        <div>
          <p className="section-kicker">PORTFOLIO MAP</p>
          <h2 id="home-charts-title" className="mt-1 text-[18px] font-bold text-toss-text-primary">
            내 자산 한눈에
          </h2>
        </div>
        <button type="button" onClick={onOpenAnalysis} className="action-link">
          자세히
        </button>
      </div>

      <div className="p-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <AllocationSummary title="계좌 비중" items={data.account_weights} />
          <AllocationSummary
            title="자산군 비중"
            items={data.asset_class_weights}
            translateName={(name) => CLASS_NAMES[name] ?? name}
          />
          <AllocationSummary title="지역 비중" items={data.region_weights} />
        </div>

        <div className="mt-3 rounded-2xl bg-toss-bg p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-[13px] font-bold text-toss-text-primary">자산 흐름</h3>
              <p className="mt-1 text-[11px] text-toss-text-tertiary">최근 90일</p>
            </div>
            {changePct !== null && (
              <span className={`num rounded-full px-2 py-1 text-[11px] font-bold ${changePct >= 0 ? 'bg-toss-up-soft text-toss-up' : 'bg-toss-down-soft text-toss-down'}`}>
                {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%
              </span>
            )}
          </div>

          <div className="mt-3 h-[190px]" aria-label="최근 90일 총자산 추이 그래프">
            {isLoading ? (
              <div className="skeleton h-full rounded-xl" />
            ) : latestHistory.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={latestHistory} margin={{ top: 10, right: 2, bottom: 0, left: 2 }}>
                  <defs>
                    <linearGradient id="homeTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.48} />
                      <stop offset="55%" stopColor="#5B9CF6" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#14B8A6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="homeTrendStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#8B5CF6" />
                      <stop offset="50%" stopColor="#5B9CF6" />
                      <stop offset="100%" stopColor="#14B8A6" />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <Tooltip content={<HistoryTooltip hideAssets={hideAssets} />} cursor={{ stroke: '#8B5CF6', strokeDasharray: '3 3' }} />
                  <Area
                    type="monotone"
                    dataKey="total_value_krw"
                    stroke="url(#homeTrendStroke)"
                    strokeWidth={3}
                    fill="url(#homeTrendGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#8B5CF6', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-toss-text-tertiary">
                자산 흐름을 모으는 중이에요
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-toss-border px-4 py-3">
        <button
          type="button"
          onClick={onOpenAssets}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-toss-blue transition-colors hover:bg-toss-blue-soft"
        >
          <ArrowLeftRight size={15} aria-hidden="true" />
          최근 매수·매도 반영하기
        </button>
      </div>
    </section>
  );
}
