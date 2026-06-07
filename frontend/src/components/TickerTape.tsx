import { colorClass } from '../utils';
import type { PortfolioSummary } from '../types';

interface Props {
  data: PortfolioSummary;
}

export default function TickerTape({ data }: Props) {
  const items = data.accounts.flatMap(acc =>
    acc.holdings.map(h => ({
      name: h.name,
      ticker: h.ticker,
      pct: h.day_change_pct,
      krwChange: h.day_change_krw,
    }))
  ).filter(h => h.pct !== null);

  if (items.length === 0) return null;

  // 무한 스크롤을 위해 3배 복제
  const repeated = [...items, ...items, ...items];

  return (
    <div className="bg-toss-card border-b border-toss-border overflow-hidden">
      <div className="ticker-tape-track flex items-center gap-0 py-2">
        {repeated.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5 px-3 shrink-0">
            <span className="text-[11px] font-semibold text-toss-text-secondary whitespace-nowrap">
              {item.name.length > 10 ? item.name.slice(0, 10) + '…' : item.name}
            </span>
            <span className={`num text-[11px] font-bold whitespace-nowrap ${colorClass(item.pct)}`}>
              {item.pct! >= 0 ? '+' : ''}{item.pct!.toFixed(2)}%
            </span>
            <span className="text-toss-border/60 text-[10px] ml-1 select-none">|</span>
          </span>
        ))}
      </div>
    </div>
  );
}
