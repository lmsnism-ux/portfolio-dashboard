import { useMemo, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { chartColor, colorClass, fmtPct } from '../utils';
import type { AccountData, HoldingData, PortfolioSummary } from '../types';

interface HoldingRef {
  account: AccountData;
  holding: HoldingData;
  color: string;
}

interface Props {
  data: PortfolioSummary;
  onTrade: (account: AccountData, holding: HoldingData, side?: 'buy' | 'sell') => void;
  onEdit: (account: AccountData, holding: HoldingData) => void;
}

/** 한글 이름 앞 2자 또는 영문 티커 앞 2자 */
function avatarText(name: string, ticker: string | null): string {
  const korean = name.replace(/[^가-힣]/g, '').slice(0, 2);
  if (korean) return korean;
  return ((ticker || name).replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?').toUpperCase();
}

export default function QuickTradeCard({ data, onTrade, onEdit }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 비-스냅샷 보유 종목을 가치 순으로 정렬, 최대 10개
  const items = useMemo<HoldingRef[]>(() => {
    const list: HoldingRef[] = [];
    let colorIdx = 0;
    for (const acc of data.accounts) {
      for (const h of acc.holdings) {
        if (!h.is_snapshot) {
          list.push({ account: acc, holding: h, color: chartColor(colorIdx++) });
        }
      }
    }
    return list.sort((a, b) => b.holding.value_krw - a.holding.value_krw).slice(0, 10);
  }, [data]);

  if (items.length === 0) return null;

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] shadow-[var(--shadow-toss-card)] overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-bold text-toss-text-primary">빠른 거래</h2>
        <span className="text-[12px] text-toss-text-tertiary">종목 탭하면 바로 거래</span>
      </div>

      {/* 가로 스크롤 종목 칩 */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto px-4 pb-4 scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        {items.map(({ account, holding, color }) => {
          const chg = holding.day_change_pct;
          const chgCls = colorClass(chg);

          return (
            <div
              key={`${account.name}:${holding.name}`}
              className="flex-shrink-0 w-[112px] bg-toss-bg rounded-2xl p-3 flex flex-col gap-2"
              style={{ scrollSnapAlign: 'start' }}
            >
              {/* 상단: 아바타 + 편집 버튼 */}
              <div className="flex items-start justify-between">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                  style={{ background: color }}
                >
                  {avatarText(holding.name, holding.ticker)}
                </div>
                <button
                  onClick={() => onEdit(account, holding)}
                  className="p-1 -mt-0.5 -mr-0.5 text-toss-text-tertiary hover:text-toss-text-secondary active:scale-90 transition-all"
                  aria-label={`${holding.name} 편집`}
                >
                  <Pencil size={13} />
                </button>
              </div>

              {/* 종목명 */}
              <p className="text-[12px] font-semibold text-toss-text-primary leading-tight line-clamp-2">
                {holding.name}
              </p>

              {/* 등락률 */}
              <p className={`num text-[11px] font-medium ${chgCls}`}>
                {chg != null ? fmtPct(chg) : '—'}
              </p>

              {/* 매수 / 매도 버튼 */}
              <div className="flex gap-1 mt-auto">
                <button
                  onClick={() => onTrade(account, holding, 'buy')}
                  className="flex-1 py-1 rounded-lg text-[11px] font-bold bg-toss-blue text-white active:scale-95 transition-transform"
                >
                  매수
                </button>
                <button
                  onClick={() => onTrade(account, holding, 'sell')}
                  className="flex-1 py-1 rounded-lg text-[11px] font-bold bg-toss-bg border border-toss-border text-toss-text-secondary active:scale-95 transition-transform"
                >
                  매도
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
