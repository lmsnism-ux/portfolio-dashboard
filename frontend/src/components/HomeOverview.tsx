import { ChevronRight, WalletCards } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import { colorClass, fmtKRW } from '../utils';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
  onOpenAssets: () => void;
}

export default function HomeOverview({ data, hideAssets, onOpenAssets }: Props) {
  const accounts = [...data.accounts].sort((a, b) => b.value_krw - a.value_krw).slice(0, 5);

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="icon-well"><WalletCards size={18} /></span>
          <h2 className="text-[17px] font-bold text-toss-text-primary">계좌</h2>
        </div>
        <button onClick={onOpenAssets} className="action-link" aria-label="모든 계좌와 종목 보기">
          전체 보기 <ChevronRight size={17} />
        </button>
      </div>

      <div className="divide-y divide-toss-border/60">
        {accounts.map((account) => (
          <button key={account.name} onClick={onOpenAssets} className="row-button">
            <span className="min-w-0 flex-1 text-left">
              <strong className="block truncate text-[15px] text-toss-text-primary">{account.name}</strong>
              <small className="mt-1 block text-[13px] text-toss-text-tertiary">{account.type}</small>
            </span>
            <span className="shrink-0 text-right">
              <strong className="num block text-[15px] text-toss-text-primary">{hideAssets ? '••••••' : fmtKRW(account.value_krw)}</strong>
              <small className={`num mt-1 block text-[13px] ${colorClass(account.day_change_krw)}`}>
                오늘 {account.day_change_krw >= 0 ? '+' : ''}{hideAssets ? '••••' : fmtKRW(account.day_change_krw)}
              </small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
