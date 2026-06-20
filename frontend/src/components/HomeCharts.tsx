import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
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

export default function HomeCharts({ data, hideAssets, onOpenAnalysis }: Props) {
  const allocation = data.asset_class_weights
    .filter((item) => item.value_krw > 0)
    .sort((a, b) => b.value_krw - a.value_krw);

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

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-toss-bg p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-bold text-toss-text-primary">자산 배분</h3>
            <span className="text-[11px] text-toss-text-tertiary">자산군별</span>
          </div>

          {allocation.length > 0 ? (
            <>
              <div className="relative mx-auto h-[150px] max-w-[210px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocation}
                      dataKey="value_krw"
                      innerRadius={45}
                      outerRadius={67}
                      paddingAngle={2.5}
                      stroke="none"
                    >
                      {allocation.map((item, index) => (
                        <Cell key={item.name} fill={chartColor(index)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => hideAssets ? '••••••' : fmtKRW(Number(value))}
                      labelFormatter={() => ''}
                      contentStyle={{
                        borderRadius: 12,
                        borderColor: 'var(--color-toss-border)',
                        background: 'var(--color-toss-card)',
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] text-toss-text-tertiary">가장 큰 비중</span>
                  <strong className="mt-0.5 text-[13px] text-toss-text-primary">
                    {CLASS_NAMES[allocation[0].name] ?? allocation[0].name}
                  </strong>
                  <span className="num text-[11px] font-semibold text-toss-blue">
                    {allocation[0].weight.toFixed(1)}%
                  </span>
                </div>
              </div>

              <ul className="grid grid-cols-2 gap-x-3 gap-y-2" aria-label="자산 배분 요약">
                {allocation.slice(0, 6).map((item, index) => (
                  <li key={item.name} className="flex min-w-0 items-center gap-1.5 text-[11px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: chartColor(index) }} />
                    <span className="truncate text-toss-text-secondary">
                      {CLASS_NAMES[item.name] ?? item.name}
                    </span>
                    <span className="num ml-auto shrink-0 font-semibold text-toss-text-primary">
                      {item.weight.toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex h-[190px] items-center justify-center text-sm text-toss-text-tertiary">
              배분 데이터가 아직 없어요
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-toss-bg p-4">
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
    </section>
  );
}
