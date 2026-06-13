import { getMarketStatus, type Exchange } from '../../utils';
import Sparkline from './Sparkline';

interface Props {
  exchange: Exchange;
  indexLabel: string;
  indexValue: number | null;
  indexChange: number | null;
  indexChangePct: number | null;
  sparkData?: number[];
  onClick?: () => void;
}

export default function MarketStatusCard({
  exchange,
  indexLabel,
  indexValue,
  indexChange,
  indexChangePct,
  sparkData,
  onClick,
}: Props) {
  const status = getMarketStatus(exchange);
  const isKR = exchange === 'KR';
  const flag = isKR ? '🇰🇷' : '🇺🇸';
  const title = isKR ? '한국장' : '미국장';

  const stateConfig = {
    open:   { dot: 'bg-emerald-500', dotAnim: 'animate-pulse', text: 'text-emerald-500' },
    pre:    { dot: 'bg-amber-400',   dotAnim: '',              text: 'text-amber-500' },
    post:   { dot: 'bg-toss-text-tertiary/60', dotAnim: '',    text: 'text-toss-text-tertiary' },
    closed: { dot: 'bg-toss-text-tertiary/40', dotAnim: '',    text: 'text-toss-text-tertiary' },
  }[status.state];

  const hasIndex = indexValue !== null;
  const sign = indexChange !== null && indexChange >= 0 ? '+' : '';
  const fmtIndex = (v: number) =>
    v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const clickable = !!onClick && hasIndex;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`text-left flex-1 min-w-[180px] bg-toss-card border border-toss-border rounded-2xl px-4 py-3 transition-all ${
        clickable
          ? 'hover:border-toss-blue/50 hover:shadow-[var(--shadow-toss-card)] active:scale-[0.99] cursor-pointer'
          : 'cursor-default'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg leading-none" aria-hidden>{flag}</span>
        <span className="text-[13px] font-bold text-toss-text-primary">{title}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${stateConfig.dot} ${stateConfig.dotAnim}`} />
          <span className={`text-[11px] font-semibold ${stateConfig.text}`}>{status.label}</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-toss-text-tertiary">{indexLabel}</p>
          {hasIndex ? (
            <>
              <p className="num text-[20px] font-extrabold leading-tight text-toss-text-primary">
                {fmtIndex(indexValue!)}
              </p>
              {indexChange !== null && indexChangePct !== null && (
                <p className={`num text-[11px] font-bold mt-0.5 ${indexChange >= 0 ? 'text-toss-up' : 'text-toss-down'}`}>
                  {sign}{fmtIndex(indexChange)} ({sign}{indexChangePct.toFixed(2)}%)
                </p>
              )}
            </>
          ) : (
            <p className="num text-[16px] font-bold text-toss-text-tertiary">-</p>
          )}
        </div>
        {sparkData && sparkData.length >= 2 && indexChange !== null && (
          <Sparkline data={sparkData} pct={indexChange} />
        )}
      </div>
      <p className="text-[10px] text-toss-text-tertiary mt-1.5">{status.timeLabel}</p>
      {clickable && (
        <p className="text-[10px] text-toss-blue/70 mt-0.5">탭하여 차트 보기 →</p>
      )}
    </button>
  );
}
