import { ArrowUp, ArrowDown, Eye, EyeOff, Trash2 } from 'lucide-react';
import { colorClass, fmtKRW } from '../../utils';
import type { HoldingClass } from '../../utils';

const ETF_BRAND_RE = /^(TIGER|KODEX|KBSTAR|HANARO|SOL|ACE|ARIRANG|KOSEF|WOORI|MIRAE)\s+/i;

function etfDisplayName(name: string): string {
  return name
    .replace(ETF_BRAND_RE, '')
    .replace(/\s*INDXX\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TickerItem {
  name: string;
  ticker: string | null;
  pct: number;
  krwChange: number | null;
  price: string | null;
  priceLabel: string;
  category: HoldingClass;
  exchange: 'KR' | 'US';
  shortLabel: string;
  accentColor: string;
  fetchedAt: string | null;
}

interface Props {
  item: TickerItem;
  hideAssets: boolean;
  editing?: boolean;
  isHidden?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  pendingDelete?: boolean;
  onClick?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onToggleHidden?: () => void;
  onAskDelete?: () => void;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
}

export default function MarketHoldingCard({
  item, hideAssets, editing, isHidden, isFirst, isLast, pendingDelete,
  onClick, onMoveUp, onMoveDown, onToggleHidden, onAskDelete, onConfirmDelete, onCancelDelete,
}: Props) {
  const isPos = item.pct >= 0;
  const sign = isPos ? '+' : '';

  if (editing) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-opacity ${
          isHidden ? 'opacity-40' : ''
        } ${pendingDelete ? 'bg-toss-down-soft border-toss-down/40' : isPos ? 'bg-toss-up-soft border-toss-up/20' : 'bg-toss-down-soft border-toss-down/20'}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-toss-text-primary leading-snug truncate">
            {etfDisplayName(item.name)}
          </p>
          {pendingDelete ? (
            <p className="text-[10px] text-toss-down font-semibold mt-0.5">정말 삭제할까요? 보유 기록도 사라져요</p>
          ) : (
            <span
              className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white whitespace-nowrap"
              style={{ background: item.accentColor }}
            >
              {item.shortLabel}
            </span>
          )}
        </div>
        {pendingDelete ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onConfirmDelete}
              className="text-[11px] font-semibold text-white bg-toss-down px-2.5 py-1 rounded-full active:scale-95"
            >삭제</button>
            <button
              onClick={onCancelDelete}
              className="text-[11px] text-toss-text-tertiary px-2.5 py-1 rounded-full border border-toss-border active:scale-95"
            >취소</button>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onAskDelete} aria-label="삭제" className="p-1.5 rounded-full hover:bg-toss-down/10 active:scale-90">
              <Trash2 size={13} className="text-toss-down" />
            </button>
            <button onClick={onToggleHidden} aria-label={isHidden ? '표시' : '숨김'} className="p-1.5 rounded-full hover:bg-toss-bg active:scale-90">
              {isHidden ? <Eye size={13} className="text-toss-text-secondary" /> : <EyeOff size={13} className="text-toss-text-tertiary" />}
            </button>
            <div className="flex flex-col gap-0">
              <button onClick={onMoveUp} disabled={isFirst} aria-label="위로" className="p-0.5 rounded hover:bg-toss-bg disabled:opacity-20 active:scale-90">
                <ArrowUp size={12} className="text-toss-text-tertiary" />
              </button>
              <button onClick={onMoveDown} disabled={isLast} aria-label="아래로" className="p-0.5 rounded hover:bg-toss-bg disabled:opacity-20 active:scale-90">
                <ArrowDown size={12} className="text-toss-text-tertiary" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left w-full flex items-start justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all ${
        onClick ? 'hover:scale-[1.01] active:scale-[0.99] cursor-pointer' : 'cursor-default'
      } ${isPos ? 'bg-toss-up-soft border-toss-up/20' : 'bg-toss-down-soft border-toss-down/20'}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-toss-text-primary leading-snug truncate">
          {etfDisplayName(item.name)}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span
            className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-white whitespace-nowrap"
            style={{ background: item.accentColor }}
          >
            {item.shortLabel}
          </span>
          {item.price && (
            <span className="text-[10px] text-toss-text-tertiary truncate">{item.price}</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`num text-[14px] font-extrabold leading-tight ${colorClass(item.pct)}`}>
          {sign}{item.pct.toFixed(2)}%
        </p>
        {item.krwChange !== null && !hideAssets && (
          <p className={`num text-[10px] mt-0.5 ${colorClass(item.krwChange)}`}>
            {sign}{fmtKRW(item.krwChange)}
          </p>
        )}
      </div>
    </button>
  );
}
