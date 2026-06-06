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
    <header className="sticky top-0 z-20 bg-toss-card border-b border-toss-border">
      {/* stale 경고 */}
      {data.cache_is_stale && (
        <div className="bg-toss-up-soft text-toss-up text-xs px-4 py-1.5 flex items-center gap-1.5">
          <AlertTriangle size={14} />
          <span>가격 데이터가 {data.cache_stale_hours}시간 동안 갱신되지 않았어요. 새로고침을 눌러보세요.</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-5 pt-4 pb-5">
        {/* 상단 바 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-toss-text-secondary">내 포트폴리오</span>
            <span className="text-xs text-toss-text-tertiary">·</span>
            <span className="text-xs text-toss-text-tertiary">
              {relativeTime(data.price_updated_at)} 갱신
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleHide}
              className="p-2 rounded-full hover:bg-toss-bg active:scale-95 transition-all"
              title={hideAssets ? '자산 보기' : '자산 가리기'}
            >
              {hideAssets ? (
                <EyeOff size={18} className="text-toss-text-secondary" />
              ) : (
                <Eye size={18} className="text-toss-text-secondary" />
              )}
            </button>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-full hover:bg-toss-bg active:scale-95 transition-all disabled:opacity-50"
              title="가격 갱신"
            >
              <RefreshCw
                size={18}
                className={`text-toss-text-secondary ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              onClick={onToggleDark}
              className="p-2 rounded-full hover:bg-toss-bg active:scale-95 transition-all"
              title={dark ? '라이트 모드' : '다크 모드'}
            >
              {dark ? (
                <Sun size={18} className="text-amber-400" />
              ) : (
                <Moon size={18} className="text-toss-text-secondary" />
              )}
            </button>
          </div>
        </div>

        {/* 총자산 거대 표시 */}
        <div className="mb-3">
          <p className="text-sm text-toss-text-secondary mb-1.5">총 자산</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="num text-[40px] sm:text-[44px] leading-none font-extrabold tracking-tight text-toss-text-primary">
              {hideAssets ? MASK : fmtKRW(data.total_value_krw)}
            </h1>
          </div>
          {!hideAssets && (
            <p className="num text-xs text-toss-text-tertiary mt-1.5">
              {fmtKRWFull(data.total_value_krw)}
            </p>
          )}
        </div>

        {/* 오늘/직전 거래일 등락 / 누적 수익 한 줄 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-toss-text-tertiary inline-flex items-center gap-1">
              {data.day_change_label || '오늘'}
              {data.market_status === 'closed' && (
                <span className="w-1.5 h-1.5 rounded-full bg-toss-text-tertiary" title="휴장" />
              )}
              {data.market_status === 'live' && (
                <span className="w-1.5 h-1.5 rounded-full bg-toss-up animate-pulse" title="장중" />
              )}
            </span>
            <span className={`num text-sm font-semibold ${dayColor}`}>
              {hideAssets ? MASK : (data.total_day_change_krw >= 0 ? '+' : '') + fmtKRW(data.total_day_change_krw)}
            </span>
            <span className={`num text-xs ${dayColor}`}>
              ({fmtPct(data.total_day_change_pct)})
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-toss-text-tertiary">총수익</span>
            <span className={`num text-sm font-semibold ${profitColor}`}>
              {hideAssets ? MASK : (data.total_profit_krw >= 0 ? '+' : '') + fmtKRW(data.total_profit_krw)}
            </span>
            <span className={`num text-xs ${profitColor}`}>
              ({fmtPct(data.total_profit_pct)})
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 ml-auto">
            <span className="text-xs text-toss-text-tertiary">USD/KRW</span>
            <span className="num text-sm font-medium text-toss-text-secondary">
              {data.usd_krw?.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
            </span>
            {data.usd_krw_prev && (
              <span className={`num text-xs ${colorClass(data.usd_krw - data.usd_krw_prev)}`}>
                {fmtPct(((data.usd_krw - data.usd_krw_prev) / data.usd_krw_prev) * 100)}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
