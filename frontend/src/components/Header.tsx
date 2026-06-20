import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import { applyDisplayToggles, colorClass, fmtAbsTime, fmtKRW, fmtKRWFull, fmtPct } from '../utils';

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

export default function Header({ data, hideAssets, realEstateOn, loanOn, dcOn, onToggleHide, onRefresh, isRefreshing }: Props) {
  const display = applyDisplayToggles(data, { dcOn, realEstateOn, loanOn });
  return (
    <header className="hero-header">
      <div className="mx-auto max-w-3xl px-5 pb-7 pt-5">
        <div className="mb-7 flex items-center justify-between">
          <div>
            <p className="text-[16px] font-bold text-toss-text-primary">내 포트폴리오</p>
            <p className="mt-1 text-[13px] text-toss-text-tertiary">{fmtAbsTime(data.price_updated_at)} 기준</p>
          </div>
          <div className="flex gap-1">
            <button onClick={onRefresh} disabled={isRefreshing} aria-label="가격 새로고침" className="icon-button hero-action"><RefreshCw size={19} className={isRefreshing ? 'animate-spin' : ''} /></button>
            <button onClick={onToggleHide} aria-label={hideAssets ? '자산 금액 보기' : '자산 금액 가리기'} className="icon-button hero-action">{hideAssets ? <Eye size={19} /> : <EyeOff size={19} />}</button>
          </div>
        </div>

        <p className="text-[14px] font-medium text-toss-text-secondary">총 자산</p>
        <h1 className="num mt-2 text-[42px] font-extrabold leading-none tracking-[-0.04em] text-toss-text-primary sm:text-[48px]">{hideAssets ? '••••••' : fmtKRW(display.total)}</h1>
        {!hideAssets && <p className="num mt-2 text-[13px] text-toss-text-tertiary">{fmtKRWFull(display.total)}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <div>
            <p className="text-[12px] text-toss-text-tertiary">{data.day_change_label || '오늘'}</p>
            <p className={`num mt-1 text-[15px] font-bold ${colorClass(display.dayChg)}`}>{hideAssets ? '••••' : `${display.dayChg >= 0 ? '+' : ''}${fmtKRW(display.dayChg)} · ${fmtPct(display.dayPct)}`}</p>
          </div>
          <div>
            <p className="text-[12px] text-toss-text-tertiary">누적 수익</p>
            <p className={`num mt-1 text-[15px] font-bold ${colorClass(display.profit)}`}>{hideAssets ? '••••' : `${display.profit >= 0 ? '+' : ''}${fmtKRW(display.profit)} · ${fmtPct(display.profitPct)}`}</p>
          </div>
          <div>
            <p className="text-[12px] text-toss-text-tertiary">환율</p>
            <p className="num mt-1 text-[15px] font-bold text-toss-text-secondary">{data.usd_krw?.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</p>
          </div>
        </div>
      </div>
    </header>
  );
}
