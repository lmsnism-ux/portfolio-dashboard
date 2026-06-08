import { Wallet } from 'lucide-react';
import type { CashAssetsData } from '../types';
import { fmtKRW } from '../utils';

interface Props {
  data: CashAssetsData;
  cashTotal: number;
  hideAssets: boolean;
}

export default function CashCard({ data, cashTotal, hideAssets }: Props) {
  if (!data.items.length) return null;

  const annualInterest = Math.round(
    data.items.reduce((sum, item) => {
      return sum + (item.interest_rate_pct ? item.balance_krw * (item.interest_rate_pct / 100) : 0);
    }, 0)
  );

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-full bg-gray-500/15 flex items-center justify-center shrink-0">
          <Wallet size={15} className="text-gray-400" />
        </div>
        <h3 className="text-sm font-semibold text-toss-text-primary flex-1">현금·예금</h3>
        <span className="num text-sm font-bold text-toss-text-primary">
          {hideAssets ? '••••' : fmtKRW(cashTotal)}
        </span>
      </div>

      <div className="space-y-2">
        {data.items.map((item, i) => (
          <div key={i} className="bg-toss-bg rounded-xl px-3 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-toss-text-secondary truncate">{item.name}</p>
              {item.maturity_date && (
                <p className="text-[10px] text-toss-text-tertiary mt-0.5">
                  만기 {item.maturity_date.slice(0, 7).replace('-', '년 ')}월
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="num text-sm font-bold text-toss-text-primary">
                {hideAssets ? '••••' : fmtKRW(item.balance_krw)}
              </p>
              {item.interest_rate_pct && (
                <p className="num text-[10px] text-toss-text-tertiary">{item.interest_rate_pct}% 연이자</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {annualInterest > 0 && (
        <div className="mt-3 flex items-center justify-between px-1">
          <p className="text-[11px] text-toss-text-tertiary">연간 이자 수입 추정</p>
          <p className="num text-[11px] font-semibold text-toss-up">
            {hideAssets ? '••••' : `+${fmtKRW(annualInterest)}/년`}
          </p>
        </div>
      )}
    </section>
  );
}
