import { colorClass, fmtKRW } from '../utils';
import type { PortfolioSummary } from '../types';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
}

export default function TickerTape({ data, hideAssets }: Props) {
  const items = data.accounts.flatMap(acc =>
    acc.holdings
      .filter(h => h.day_change_pct !== null)
      .map(h => ({
        name: h.name,
        pct: h.day_change_pct!,
        krwChange: h.day_change_krw,
        value: h.value_krw,
      }))
  );

  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  return (
    <div className="bg-toss-card border-b border-toss-border px-4 py-2.5">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap gap-1.5">
          {sorted.map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] transition-all cursor-default group ${
                item.pct >= 0
                  ? 'bg-toss-up-soft hover:bg-toss-up-soft/80'
                  : 'bg-toss-down-soft hover:bg-toss-down-soft/80'
              }`}
              title={`${item.name} · ${item.pct >= 0 ? '+' : ''}${item.pct.toFixed(2)}% · ${
                item.krwChange !== null && !hideAssets
                  ? (item.krwChange >= 0 ? '+' : '') + fmtKRW(item.krwChange)
                  : ''
              }`}
            >
              <span className="font-medium text-toss-text-secondary whitespace-nowrap max-w-[72px] truncate">
                {item.name.length > 7 ? item.name.slice(0, 7) + '…' : item.name}
              </span>
              <span className={`num font-bold whitespace-nowrap ${colorClass(item.pct)}`}>
                {item.pct >= 0 ? '+' : ''}{item.pct.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
