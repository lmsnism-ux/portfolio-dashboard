import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { X } from 'lucide-react';
import { fetchTickerHistory } from '../api';
import { colorClass } from '../utils';

interface Props {
  ticker: string;
  name: string;
  shortLabel: string;
  accentColor: string;
  currentDisplay: string | null;
  onClose: () => void;
}

const RANGES: { key: string; label: string }[] = [
  { key: '1mo', label: '1개월' },
  { key: '3mo', label: '3개월' },
  { key: '6mo', label: '6개월' },
  { key: '1y', label: '1년' },
  { key: '5y', label: '5년' },
];

export default function TickerChartModal({
  ticker,
  name,
  shortLabel,
  accentColor,
  currentDisplay,
  onClose,
}: Props) {
  const [range, setRange] = useState('3mo');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tickerHistory', ticker, range],
    queryFn: () => fetchTickerHistory(ticker, range),
    staleTime: 30 * 60 * 1000,
  });

  const items = data?.items ?? [];
  // 지수(^IXIC, ^GSPC, ^KS11 …)는 통화 단위가 아니라 포인트(pt). 종목 USD/KRW 분기에서 제외.
  const isIndex = ticker.startsWith('^');
  const isUsd = !isIndex && data?.currency === 'USD';
  const first = items[0]?.close ?? 0;
  const last = items[items.length - 1]?.close ?? 0;
  const diff = last - first;
  const pct = first > 0 ? (diff / first) * 100 : 0;
  const isPos = diff >= 0;
  const stroke = isPos ? '#F04452' : '#5B9CF6';

  const minClose = items.length ? Math.min(...items.map(x => x.close)) : 0;
  const maxClose = items.length ? Math.max(...items.map(x => x.close)) : 0;

  const fmtPrice = (v: number) =>
    isIndex
      ? `${v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pt`
      : isUsd
        ? `$${v.toFixed(2)}`
        : `₩${Math.round(v).toLocaleString('ko-KR')}`;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="주가 차트"
        className="modal-content bg-toss-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-toss-card px-5 pt-5 pb-3 flex items-start justify-between border-b border-toss-border/60">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-white"
                style={{ background: accentColor }}
              >
                {shortLabel}
              </span>
              <span className="text-[11px] text-toss-text-tertiary">{ticker}</span>
            </div>
            <h2 className="text-lg font-bold text-toss-text-primary leading-snug truncate">{name}</h2>
            {currentDisplay && (
              <p className="num text-[12px] text-toss-text-secondary mt-0.5">
                현재 {currentDisplay}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95 shrink-0"
          >
            <X size={18} className="text-toss-text-secondary" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 기간 변동 요약 */}
          {items.length >= 2 && (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`num text-2xl font-extrabold tracking-tight ${colorClass(diff)}`}>
                {isPos ? '+' : ''}{fmtPrice(diff)}
              </span>
              <span className={`num text-xs font-bold px-2 py-0.5 rounded-full ${
                isPos ? 'bg-toss-up-soft text-toss-up' : 'bg-toss-down-soft text-toss-down'
              }`}>
                {isPos ? '+' : ''}{pct.toFixed(2)}%
              </span>
              <span className="text-[11px] text-toss-text-tertiary ml-auto">
                {items[0].date} ~ {items[items.length - 1].date}
              </span>
            </div>
          )}

          {/* 기간 탭 */}
          <div className="flex bg-toss-bg rounded-full p-0.5 gap-0.5">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`flex-1 px-2.5 py-1 text-[12px] rounded-full transition-all font-medium ${
                  range === r.key
                    ? 'bg-toss-blue text-white shadow-sm'
                    : 'text-toss-text-secondary hover:text-toss-text-primary'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* 차트 */}
          <div className="h-[220px] -mx-1">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-toss-text-tertiary">불러오는 중...</p>
              </div>
            ) : isError || items.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center px-4">
                <p className="text-sm text-toss-text-tertiary">
                  주가 데이터를 불러올 수 없어요.<br />
                  <span className="text-[11px]">티커가 유효한지 확인해주세요.</span>
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={items} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`tickerGrad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                      <stop offset="60%" stopColor={stroke} stopOpacity={0.08} />
                      <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-toss-border)" strokeDasharray="4 4" vertical={false} strokeOpacity={0.6} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--color-toss-text-tertiary)' }}
                    tickFormatter={v => v.slice(5)}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-toss-text-tertiary)' }}
                    tickFormatter={v =>
                      isIndex
                        ? v.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
                        : isUsd
                          ? `$${v.toFixed(0)}`
                          : `${Math.round(v / 1000)}k`
                    }
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    domain={['dataMin', 'dataMax']}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload;
                      return (
                        <div className="bg-toss-card border border-toss-border rounded-xl px-3 py-2 shadow-[var(--shadow-toss-pop)]">
                          <p className="text-[11px] text-toss-text-tertiary mb-1">{p.date}</p>
                          <p className="num text-sm font-bold text-toss-text-primary">{fmtPrice(p.close)}</p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="close"
                    stroke={stroke}
                    strokeWidth={2.5}
                    fill={`url(#tickerGrad-${ticker})`}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: stroke }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 가격 요약 */}
          {items.length >= 2 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-toss-bg rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-toss-text-tertiary mb-0.5">기간 최저가</p>
                <p className="num text-sm font-bold text-toss-down">{fmtPrice(minClose)}</p>
              </div>
              <div className="bg-toss-bg rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-toss-text-tertiary mb-0.5">기간 최고가</p>
                <p className="num text-sm font-bold text-toss-up">{fmtPrice(maxClose)}</p>
              </div>
            </div>
          )}

          <p className="text-[10px] text-toss-text-tertiary text-center">
            Yahoo Finance 일봉 데이터 · 30분 캐시
          </p>
        </div>
      </div>
    </div>
  );
}
