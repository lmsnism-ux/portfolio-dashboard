import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchHealth } from '../api';

const STALE_WARN_HOURS = 1.5;

export default function HealthBanner() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 3 * 60 * 1000,
  });

  if (!data) return null;

  const isStale = data.cache_stale_hours != null && data.cache_stale_hours >= STALE_WARN_HOURS;
  const hasErrors = data.price_errors.length > 0;

  if (!isStale && !hasErrors) return null;

  const stalePart = isStale
    ? `가격 정보가 ${data.cache_stale_hours!.toFixed(0)}시간째 갱신되지 않았어요.`
    : null;
  const errorPart = hasErrors
    ? `${data.price_errors.length}개 종목 가격을 불러오지 못했어요 (${data.price_errors.slice(0, 3).map(e => e.ticker).join(', ')}${data.price_errors.length > 3 ? ' 외' : ''}).`
    : null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-500 text-sm"
    >
      <RefreshCw size={15} className="shrink-0 mt-0.5" />
      <p className="leading-snug">
        {[stalePart, errorPart].filter(Boolean).join(' ')}
        {' '}자동으로 재시도 중입니다.
      </p>
      <AlertTriangle size={15} className="shrink-0 mt-0.5 ml-auto opacity-60" />
    </div>
  );
}
