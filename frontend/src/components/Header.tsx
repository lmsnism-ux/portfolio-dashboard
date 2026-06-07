import { RefreshCw, Moon, Sun, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import { fmtKRW, fmtKRWFull, fmtPct, colorClass, relativeTime } from '../utils';

interface Props {
  data: PortfolioSummary;
  dark: boolean;
  hideAssets: boolean;
  onToggleDark: () => void;
  onToggleHide: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const MASK = '••••••';

export default function Header({
  data,
  dark,
  hideAssets,
  onToggleDark,
  onToggleHide,
  onRefresh,
  isRefreshing,
}: Props) {
  const profitColor = colorClass(data.total_profit_krw);
  const dayColor = colorClass(data.total_day_change_krw);

  return (
    <header className="sticky top-0 z-20 bg-toss-card border-b border-toss-border shadow-[var(--shadow-toss-card)]">
      {/* stale 경고 */}
      {data.cache_is_stale && (
        <div className="bg-toss-up-soft text-toss-up text-xs px-4 py-2 flex items-center gap-2">
          <AlertTriangle size={13} />
          <span>가격 데이터가 {data.cache_stale_hours}시간 동안 갱신되지 않았어요. 새로고침을 눌러보세요.</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-5 pt-4 pb-5">
        {/* 상단 바 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-toss-text-secondary">내 포트폴리오</span>
            <span className="text-[10px] text-toss-text-tertiary bg-toss-bg px-2 py-0.5 rounded-full">
              {relativeTime(data.price_updated_at)} 갱신
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onToggleHide}
              className="p-2 rounded-full hover:bg-toss-bg active:scale-95 transition-all"
              title={hideAssets ? '자산 보기' : '자산 가리기'}
            >
              {hideAssets ? (
                <EyeOff size={17} className="text-toss-text-secondary" />
              ) : (
                <Eye size={17} className="text-toss-text-secondary" />
              )}
            </button>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-full hover:bg-toss-bg active:scale-95 transition-all disabled:opacity-50"
              title="가격 갱신"
            >
              <RefreshCw
                size={17}
                className={`text-toss-text-secondary ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              onClick={onToggleDark}
              className="p-2 rounded-full hover:bg-toss-bg active:scale-95 transition-all"
              title={dark ? '라이트 모드' : '다크 모드'}
            >
              {dark ? (
                <Sun size={17} className="text-amber-400" />
              ) : (
                <Moon size={17} className="text-toss-text-secondary" />
              )}
            </button>
          </div>
        </div>

        {/* 총자산 + 종목 등락 */}
        <div className="mb-4 flex items-start gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-toss-text-tertiary tracking-widest uppercase mb-1.5">총 자산</p>
            <h1 className="num text-[42px] sm:text-[48px] leading-none font-extrabold tracking-tight text-toss-text-primary">
              {hideAssets ? MASK : fmtKRW(data.total_value_krw)}
            </h1>
            {!hideAssets && (
              <p className="num text-xs text-toss-text-tertiary mt-1.5">
                {fmtKRWFull(data.total_value_krw)}
              </p>
            )}
          </div>
          {(() => {
            const items = data.accounts.flatMap(acc =>
              acc.holdings
                .filter(h => h.day_change_pct !== null)
                .map(h => ({ name: h.name, pct: h.day_change_pct as number, krwChange: h.day_change_krw }))
            ).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
            if (!items.length) return null;
            return (
              <div className="hidden md:block shrink-0 pt-1 max-w-[210px]">
                <p className="text-[10px] text-toss-text-tertiary font-medium mb-1.5">종목별 등락</p>
                <div className="flex flex-wrap gap-1">
                  {items.map((item, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] cursor-default ${
                        item.pct >= 0 ? 'bg-toss-up-soft' : 'bg-toss-down-soft'
                      }`}
                      title={`${item.name}${item.krwChange !== null && !hideAssets ? ' · ' + (item.krwChange >= 0 ? '+' : '') + fmtKRW(item.krwChange) : ''}`}
                    >
                      <span className="text-toss-text-secondary whitespace-nowrap max-w-[58px] truncate font-medium">
                        {item.name.length > 6 ? item.name.slice(0, 6) + '…' : item.name}
                      </span>
                      <span className={`num font-bold whitespace-nowrap ${colorClass(item.pct)}`}>
                        {item.pct >= 0 ? '+' : ''}{item.pct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* 오늘 등락 / 누적 수익 / 환율 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-toss-text-tertiary">{data.day_change_label || '오늘'}</span>
              {data.market_status === 'closed' && (
                <span className="w-1.5 h-1.5 rounded-full bg-toss-text-tertiary/50" title="휴장" />
              )}
              {data.market_status === 'live' && (
                <span className="w-1.5 h-1.5 rounded-full bg-toss-up animate-pulse" title="장중" />
              )}
            </div>
            <span className={`num text-sm font-bold ${dayColor}`}>
              {hideAssets ? MASK : (data.total_day_change_krw >= 0 ? '+' : '') + fmtKRW(data.total_day_change_krw)}
            </span>
            <span className={`num text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              (data.total_day_change_pct ?? 0) >= 0
                ? 'bg-toss-up-soft text-toss-up'
                : 'bg-toss-down-soft text-toss-down'
            }`}>
              {fmtPct(data.total_day_change_pct)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-toss-text-tertiary">누적 수익</span>
            <span className={`num text-sm font-bold ${profitColor}`}>
              {hideAssets ? MASK : (data.total_profit_krw >= 0 ? '+' : '') + fmtKRW(data.total_profit_krw)}
            </span>
            <span className={`num text-xs font-semibold ${profitColor}`}>
              {fmtPct(data.total_profit_pct)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[11px] text-toss-text-tertiary">USD/KRW</span>
            <span className="num text-sm font-semibold text-toss-text-secondary">
              {data.usd_krw?.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
            </span>
            {data.usd_krw_prev && (
              <span className={`num text-[11px] font-medium ${colorClass(data.usd_krw - data.usd_krw_prev)}`}>
                {fmtPct(((data.usd_krw - data.usd_krw_prev) / data.usd_krw_prev) * 100)}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
