import { ChevronRight, CircleAlert, Target, WalletCards } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import { colorClass, fmtKRW, fmtPct } from '../utils';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
  onOpenAssets: () => void;
  onOpenAnalysis: () => void;
}

export default function HomeOverview({
  data,
  hideAssets,
  onOpenAssets,
  onOpenAnalysis,
}: Props) {
  const topAccounts = [...data.accounts]
    .sort((a, b) => b.value_krw - a.value_krw)
    .slice(0, 4);
  const goalPct = data.goal_krw
    ? Math.min(100, (data.total_value_krw / data.goal_krw) * 100)
    : null;
  const taxAlert = data.tax_optimization?.alerts[0];

  return (
    <>
      <section className="bg-toss-card rounded-[var(--radius-toss-lg)] shadow-[var(--shadow-toss-card)] overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <WalletCards size={18} className="text-toss-blue" />
            <h2 className="text-base font-bold text-toss-text-primary">자산 한눈에</h2>
          </div>
          <button
            onClick={onOpenAssets}
            className="min-h-11 flex items-center gap-1 px-2 text-sm font-semibold text-toss-blue"
          >
            전체 보기
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="divide-y divide-toss-border/70">
          {topAccounts.map((account) => (
            <button
              key={account.name}
              onClick={onOpenAssets}
              className="w-full min-h-16 px-5 py-3 flex items-center gap-3 text-left active:bg-toss-bg"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-toss-text-primary truncate">{account.name}</p>
                <p className="text-xs text-toss-text-tertiary mt-0.5">{account.type}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="num text-sm font-bold text-toss-text-primary">
                  {hideAssets ? '••••••' : fmtKRW(account.value_krw)}
                </p>
                <p className={`num text-xs mt-0.5 ${colorClass(account.day_change_krw)}`}>
                  오늘 {account.day_change_krw >= 0 ? '+' : ''}
                  {hideAssets ? '••••' : fmtKRW(account.day_change_krw)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-toss-card rounded-[var(--radius-toss-lg)] shadow-[var(--shadow-toss-card)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-toss-text-primary">지금 확인할 것</h2>
          <button
            onClick={onOpenAnalysis}
            className="min-h-11 flex items-center gap-1 px-2 text-sm font-semibold text-toss-blue"
          >
            분석 보기
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <button
            onClick={onOpenAnalysis}
            className="w-full min-h-20 rounded-2xl bg-toss-bg px-4 py-3 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-toss-blue-soft flex items-center justify-center shrink-0">
              <Target size={19} className="text-toss-blue" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-toss-text-primary">목표 자산</p>
              <p className="text-xs text-toss-text-secondary mt-1">
                {goalPct === null
                  ? '목표를 설정하고 진행 상황을 확인해 보세요.'
                  : `${goalPct.toFixed(1)}% 달성 · ${fmtKRW(data.goal_krw!)} 목표`}
              </p>
            </div>
            <ChevronRight size={18} className="text-toss-text-tertiary shrink-0" />
          </button>

          <button
            onClick={onOpenAnalysis}
            className="w-full min-h-20 rounded-2xl bg-toss-bg px-4 py-3 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
              <CircleAlert size={19} className="text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-toss-text-primary">포트폴리오 점검</p>
              <p className="text-xs text-toss-text-secondary mt-1 line-clamp-2">
                {taxAlert ?? `누적 수익률 ${fmtPct(data.total_profit_pct)} · 자산 배분을 확인해 보세요.`}
              </p>
            </div>
            <ChevronRight size={18} className="text-toss-text-tertiary shrink-0" />
          </button>
        </div>
      </section>
    </>
  );
}
