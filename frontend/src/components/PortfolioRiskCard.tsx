import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Database, Gauge, TrendingDown } from 'lucide-react';
import { fetchHistory, fetchPerformance, fetchTickerHistory } from '../api';
import type { PortfolioSummary } from '../types';

export default function PortfolioRiskCard({ data }: { data: PortfolioSummary }) {
  const { data: history = [] } = useQuery({
    queryKey: ['history'],
    queryFn: () => fetchHistory(730),
    staleTime: 10 * 60 * 1000,
  });
  const { data: performance } = useQuery({
    queryKey: ['performance'],
    queryFn: () => fetchPerformance(730),
    staleTime: 10 * 60 * 1000,
  });
  const { data: benchmark } = useQuery({
    queryKey: ['benchmark', 'sp500'],
    queryFn: () => fetchTickerHistory('^GSPC', '1y'),
    staleTime: 30 * 60 * 1000,
  });

  const metrics = useMemo(() => {
    if (history.length < 2) return null;
    let peak = history[0].total_value_krw;
    let maxDrawdown = 0;
    const returns: number[] = [];
    for (let i = 0; i < history.length; i += 1) {
      const value = history[i].total_value_krw;
      peak = Math.max(peak, value);
      if (peak > 0) maxDrawdown = Math.min(maxDrawdown, (value - peak) / peak);
      if (i > 0 && history[i - 1].total_value_krw > 0) {
        returns.push(value / history[i - 1].total_value_krw - 1);
      }
    }
    const mean = returns.reduce((sum, value) => sum + value, 0) / Math.max(returns.length, 1);
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(returns.length - 1, 1);
    return {
      maxDrawdown: maxDrawdown * 100,
      volatility: Math.sqrt(variance) * Math.sqrt(252) * 100,
      days: history.length,
    };
  }, [history]);

  const topWeight = data.top_holdings?.[0]?.weight ?? 0;
  const diversification = topWeight >= 35 ? '높은 집중' : topWeight >= 20 ? '점검 필요' : '분산 양호';
  const confidence = data.cache_is_stale ? '주의' : data.price_updated_at ? '정상' : '확인 필요';
  const benchmarkReturn = benchmark && benchmark.items.length >= 2
    ? (benchmark.items[benchmark.items.length - 1].close / benchmark.items[0].close - 1) * 100
    : null;

  const items = [
    { icon: TrendingDown, label: '최대낙폭', value: performance?.available ? `${performance.max_drawdown_pct?.toFixed(1)}%` : metrics ? `${metrics.maxDrawdown.toFixed(1)}%` : '-', note: '관측된 자산가치 기준' },
    { icon: Activity, label: 'TWR 수익률', value: performance?.available ? `${performance.twr_pct?.toFixed(1)}%` : '-', note: '입출금 효과 보정' },
    { icon: Gauge, label: '최대 종목 비중', value: `${topWeight.toFixed(1)}%`, note: diversification },
    { icon: Database, label: '데이터 신뢰', value: confidence, note: metrics ? `${metrics.days}개 스냅샷` : '스냅샷 부족' },
  ];

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5">
      <h3 className="text-sm font-semibold text-toss-text-primary">위험과 데이터 신뢰도</h3>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {items.map(({ icon: Icon, label, value, note }) => (
          <div key={label} className="rounded-2xl bg-toss-bg p-3.5">
            <div className="flex items-center gap-1.5 text-toss-text-tertiary"><Icon size={13} /><span className="text-[10px] font-semibold">{label}</span></div>
            <p className="mt-2 num text-lg font-bold text-toss-text-primary">{value}</p>
            <p className="mt-1 text-[10px] text-toss-text-tertiary">{note}</p>
          </div>
        ))}
      </div>
      {performance?.available && (
        <div className="mt-3 rounded-2xl border border-toss-border p-3.5 grid grid-cols-3 gap-3">
          <div><p className="text-[10px] text-toss-text-tertiary">투자 성과 금액</p><p className="mt-1 num text-sm font-bold text-toss-text-primary">{performance.investment_result_krw?.toLocaleString('ko-KR')}원</p></div>
          <div><p className="text-[10px] text-toss-text-tertiary">연환산 MWR</p><p className="mt-1 num text-sm font-bold text-toss-text-primary">{performance.mwr_annual_pct == null ? '-' : `${performance.mwr_annual_pct.toFixed(1)}%`}</p></div>
          <div><p className="text-[10px] text-toss-text-tertiary">S&amp;P 500 · 1년</p><p className="mt-1 num text-sm font-bold text-toss-text-primary">{benchmarkReturn == null ? '-' : `${benchmarkReturn.toFixed(1)}%`}</p></div>
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-toss-text-tertiary">
        TWR은 등록한 입출금 효과를 제거합니다. 누락된 현금흐름이 있으면 성과가 왜곡될 수 있으며, 이 수치는 매매 추천이 아닙니다.
      </p>
    </section>
  );
}
