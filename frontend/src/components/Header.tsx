import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import {
  applyDisplayToggles,
  colorClass,
  fmtAbsTime,
  fmtKRW,
  fmtKRWFull,
  fmtPct,
} from '../utils';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
  realEstateOn: boolean;
  loanOn: boolean;
  dcOn: boolean;
  onToggleHide: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const MASK = '••••••';

export default function Header({
  data,
  hideAssets,
  realEstateOn,
  loanOn,
  dcOn,
  onToggleHide,
  onRefresh,
  isRefreshing,
}: Props) {
  const display = applyDisplayToggles(data, { dcOn, realEstateOn, loanOn });
  const totalSize = display.total >= 1_000_000_000_000
    ? 'text-[30px]'
    : display.total >= 100_000_000_000
      ? 'text-[34px]'
      : 'text-[40px]';

  return (
    <header className="bg-toss-card border-b border-toss-border shadow-[var(--shadow-toss-card)]">
      <div className="max-w-2xl mx-auto px-5 pt-4 pb-5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm font-bold text-toss-text-primary">내 포트폴리오</p>
            <p className="text-xs text-toss-text-tertiary mt-0.5">
              {fmtAbsTime(data.price_updated_at)} 기준
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="가격 갱신"
              className="w-11 h-11 rounded-full flex items-center justify-center active:bg-toss-bg disabled:opacity-50"
            >
              <RefreshCw
                size={19}
                className={`text-toss-text-secondary ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              onClick={onToggleHide}
              aria-label={hideAssets ? '자산 금액 보기' : '자산 금액 가리기'}
              className="w-11 h-11 rounded-full flex items-center justify-center active:bg-toss-bg"
            >
              {hideAssets
                ? <Eye size={19} className="text-toss-text-secondary" />
                : <EyeOff size={19} className="text-toss-text-secondary" />}
            </button>
          </div>
        </div>

        <p className="text-xs font-semibold text-toss-text-tertiary mb-2">총 자산</p>
        <h1 className={`num leading-none font-extrabold tracking-tight text-toss-text-primary ${totalSize}`}>
          {hideAssets ? MASK : fmtKRW(display.total)}
        </h1>
        {!hideAssets && (
          <p className="num text-xs text-toss-text-tertiary mt-2">
            {fmtKRWFull(display.total)}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-toss-text-tertiary">{data.day_change_label || '오늘'}</span>
          <span className={`num text-sm font-bold ${colorClass(display.dayChg)}`}>
            {hideAssets ? MASK : `${display.dayChg >= 0 ? '+' : ''}${fmtKRW(display.dayChg)}`}
          </span>
          <span className={`num text-xs font-bold px-2 py-1 rounded-lg ${
            display.dayPct >= 0
              ? 'bg-toss-up-soft text-toss-up'
              : 'bg-toss-down-soft text-toss-down'
          }`}>
            {fmtPct(display.dayPct)}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-x-4 gap-y-2 flex-wrap text-xs">
          <p className="text-toss-text-tertiary">
            누적 수익{' '}
            <span className={`num font-semibold ${colorClass(display.profit)}`}>
              {hideAssets ? MASK : `${display.profit >= 0 ? '+' : ''}${fmtKRW(display.profit)}`}
              {' '}{fmtPct(display.profitPct)}
            </span>
          </p>
          <p className="text-toss-text-tertiary">
            USD/KRW{' '}
            <span className="num font-semibold text-toss-text-secondary">
              {data.usd_krw?.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
            </span>
          </p>
        </div>
      </div>
    </header>
  );
}
