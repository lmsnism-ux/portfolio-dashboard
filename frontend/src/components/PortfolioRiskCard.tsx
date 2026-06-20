import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Database, Gauge, TrendingDown } from 'lucide-react';
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
    for (let i = 0; i < history.length; i += 1) {
      const value = history[i].total_value_krw;
      peak = Math.max(peak, value);
      if (peak > 0) maxDrawdown = Math.min(maxDrawdown, (value - peak) / peak);
    }
    return {
      maxDrawdown: maxDrawdown * 100,
      days: history.length,
    };
  }, [history]);

  const topWeight = data.top_holdings?.[0]?.weight ?? 0;
  const diversification = topWeight >= 35 ? '한 종목에 많이 몰렸어요' : topWeight >= 20 ? '조금 몰려 있어요' : '고르게 나뉘어 있어요';
  const confidence = data.cache_is_stale ? '업데이트 확인 필요' : data.price_updated_at ? '최신 가격 반영' : '가격 확인 필요';
  const benchmarkReturn = benchmark && benchmark.items.length >= 2
    ? (benchmark.items[benchmark.items.length - 1].close / benchmark.items[0].close - 1) * 100
    : null;

  const items = [
    {
      icon: TrendingDown,
      label: '가장 크게 떨어졌던 때',
      value: performance?.available ? `${performance.max_drawdown_pct?.toFixed(1)}%` : metrics ? `${metrics.maxDrawdown.toFixed(1)}%` : '-',
      note: '기록 중 최고점에서 얼마나 내려갔는지 보여줘요. 0%에 가까울수록 변동이 작아요.',
    },
    {
      icon: CircleCheck,
      label: '입출금을 뺀 투자 결과',
      value: performance?.available ? `${performance.twr_pct?.toFixed(1)}%` : '-',
      note: '추가 입금이나 출금 효과를 빼고, 투자 자체가 얼마나 변했는지 보여줘요.',
    },
    {
      icon: Gauge,
      label: '가장 큰 종목의 비중',
      value: `${topWeight.toFixed(1)}%`,
      note: `${diversification} 35% 이상이면 분산을 검토해 보세요.`,
    },
    {
      icon: Database,
      label: '숫자는 믿을 만한가요?',
      value: confidence,
      note: metrics ? `${metrics.days}일치 자산 기록으로 계산했어요.` : '비교할 날짜 기록이 아직 부족해요.',
    },
  ];

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5">
      <h3 className="text-base font-bold text-toss-text-primary">내 포트폴리오, 괜찮은가요?</h3>
      <p className="mt-1 text-xs leading-relaxed text-toss-text-tertiary">어려운 투자 용어 대신, 지금 확인할 숫자만 쉽게 풀어봤어요.</p>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {items.map(({ icon: Icon, label, value, note }) => (
          <div key={label} className="rounded-2xl bg-toss-bg p-3.5">
            <div className="flex items-center gap-1.5 text-toss-text-tertiary"><Icon size={13} /><span className="text-[11px] font-semibold">{label}</span></div>
            <p className="mt-2 num text-lg font-bold text-toss-text-primary">{value}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-toss-text-tertiary">{note}</p>
          </div>
        ))}
      </div>
      {performance?.available && (
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl border border-toss-border p-3.5">
          <div><p className="text-[11px] text-toss-text-tertiary">입출금을 뺀 손익 금액</p><p className="mt-1 num text-sm font-bold text-toss-text-primary">{performance.investment_result_krw?.toLocaleString('ko-KR')}원</p></div>
          <div><p className="text-[11px] text-toss-text-tertiary">참고: S&amp;P 500의 1년 변화</p><p className="mt-1 num text-sm font-bold text-toss-text-primary">{benchmarkReturn == null ? '-' : `${benchmarkReturn.toFixed(1)}%`}</p></div>
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-toss-text-tertiary">
        입출금 기록이 빠져 있으면 투자 결과가 실제와 다르게 보일 수 있어요. 이 숫자는 참고용이며 매수·매도 추천이 아닙니다.
      </p>
    </section>
  );
}
