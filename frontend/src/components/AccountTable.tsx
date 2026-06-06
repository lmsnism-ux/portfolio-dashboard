import { ChevronDown, Pencil, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccountData, HoldingData } from '../types';
import { deleteHolding } from '../api';
import { fmtKRW, fmtPct, colorClass } from '../utils';
import IrpMonitor from './IrpMonitor';

interface Props {
  account: AccountData;
  hideAssets: boolean;
  defaultOpen?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onEdit?: (account: AccountData, holding: HoldingData) => void;
  onAdd?: (account: AccountData) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export default function AccountTable({
  account,
  hideAssets,
  defaultOpen = false,
  canMoveUp,
  canMoveDown,
  onEdit,
  onAdd,
  onMoveUp,
  onMoveDown,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const profitColor = colorClass(account.profit_krw);
  const dayColor = colorClass(account.day_change_krw);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: ({ key }: { key: string }) => deleteHolding(account.name, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });

  const confirmDelete = (h: HoldingData) => {
    const key = h.ticker || h.name;
    if (confirm(`'${h.name}'을(를) 삭제할까요?\n* 매도가 아닌 목록에서만 제거됩니다.`)) {
      deleteMutation.mutate({ key });
    }
  };

  return (
    <article className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] overflow-hidden">
      <div className="flex items-center">
        <button
          className="flex-1 flex items-center justify-between p-5 hover:bg-toss-bg/40 active:scale-[0.997] transition-all"
          onClick={() => setOpen(!open)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-left min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-toss-text-primary text-[15px] truncate">
                  {account.name}
                </span>
                <span className="shrink-0 text-[10px] bg-toss-bg text-toss-text-tertiary px-1.5 py-0.5 rounded-full">
                  {account.type}
                </span>
              </div>
              <p className="num text-sm text-toss-text-secondary mt-1">
                {hideAssets ? '••••••' : fmtKRW(account.value_krw)}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0 flex items-center gap-3">
            <div>
              <p className={`num text-sm font-semibold ${profitColor}`}>{fmtPct(account.profit_pct)}</p>
              <p className={`num text-[11px] ${dayColor}`}>
                {account.day_change_krw >= 0 ? '+' : ''}
                {hideAssets ? '••••' : fmtKRW(account.day_change_krw)}
              </p>
            </div>
            <ChevronDown
              size={16}
              className={`text-toss-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </div>
        </button>
        <div className="flex flex-col gap-0.5 pr-3">
          <button
            disabled={!canMoveUp}
            onClick={onMoveUp}
            className="p-1 rounded hover:bg-toss-bg disabled:opacity-30 active:scale-90"
            title="위로"
          >
            <ArrowUp size={12} className="text-toss-text-tertiary" />
          </button>
          <button
            disabled={!canMoveDown}
            onClick={onMoveDown}
            className="p-1 rounded hover:bg-toss-bg disabled:opacity-30 active:scale-90"
            title="아래로"
          >
            <ArrowDown size={12} className="text-toss-text-tertiary" />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-toss-border">
          {account.irp_info && (
            <div className="p-4 sm:p-5 border-b border-toss-border">
              <IrpMonitor info={account.irp_info} hideAssets={hideAssets} />
            </div>
          )}

          <div className="block sm:hidden divide-y divide-toss-border">
            {account.holdings.map((h, i) => (
              <div key={i} className="p-4">
                <div className="flex justify-between items-start mb-2 gap-3">
                  <div className="min-w-0 flex items-start gap-1.5 flex-1">
                    <div className="min-w-0">
                      <p className="font-semibold text-toss-text-primary text-sm truncate">{h.name}</p>
                      {h.ticker && (
                        <p className="text-[11px] text-toss-text-tertiary mt-0.5">{h.ticker}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(account, h)}
                          className="p-1 rounded-full hover:bg-toss-bg active:scale-90"
                          title="수정"
                        >
                          <Pencil size={12} className="text-toss-text-tertiary" />
                        </button>
                      )}
                      <button
                        onClick={() => confirmDelete(h)}
                        className="p-1 rounded-full hover:bg-toss-up-soft active:scale-90"
                        title="제거"
                      >
                        <Trash2 size={12} className="text-toss-text-tertiary" />
                      </button>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="num font-semibold text-toss-text-primary text-sm">
                      {hideAssets ? '••••' : fmtKRW(h.value_krw)}
                    </p>
                    {h.day_change_pct !== null && (
                      <p className={`num text-[11px] ${colorClass(h.day_change_pct)}`}>
                        {fmtPct(h.day_change_pct)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-y-1 gap-x-2 text-[11px] text-toss-text-secondary">
                  {h.shares && (
                    <span className="num">
                      {h.shares.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}주
                    </span>
                  )}
                  {h.current_price_display && (
                    <span className="num">
                      현재 {h.current_price_display}
                    </span>
                  )}
                  {h.profit_pct !== null && (
                    <span className={`num ${colorClass(h.profit_pct)}`}>
                      수익률 {fmtPct(h.profit_pct)}
                    </span>
                  )}
                  {h.profit_krw !== null && (
                    <span className={`num ${colorClass(h.profit_krw)}`}>
                      수익 {hideAssets ? '••••' : fmtKRW(h.profit_krw)}
                    </span>
                  )}
                </div>
                {h.is_snapshot && (
                  <p className="text-[10px] text-toss-warning mt-1.5">* 스냅샷 기준 (실시간 아님)</p>
                )}
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-toss-bg/60 text-[11px] text-toss-text-tertiary uppercase tracking-wide">
                  <th className="text-left px-5 py-2.5 font-medium">종목</th>
                  <th className="text-right px-3 py-2.5 font-medium">보유수량</th>
                  <th className="text-right px-3 py-2.5 font-medium">평단가</th>
                  <th className="text-right px-3 py-2.5 font-medium">현재가</th>
                  <th className="text-right px-3 py-2.5 font-medium">평가금액</th>
                  <th className="text-right px-3 py-2.5 font-medium">수익금</th>
                  <th className="text-right px-3 py-2.5 font-medium">수익률</th>
                  <th className="text-right px-3 py-2.5 font-medium">오늘 등락</th>
                  <th className="w-10 px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-toss-border">
                {account.holdings.map((h, i) => (
                  <tr key={i} className="hover:bg-toss-bg/30 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-start gap-1.5">
                        <div className="min-w-0">
                          <p className="font-medium text-toss-text-primary">{h.name}</p>
                          {h.ticker && <p className="text-[11px] text-toss-text-tertiary">{h.ticker}</p>}
                          {h.is_snapshot && (
                            <p className="text-[11px] text-toss-warning">스냅샷</p>
                          )}
                        </div>
                        {onEdit && (
                          <button
                            onClick={() => onEdit(account, h)}
                            className="p-1 rounded-full hover:bg-toss-bg active:scale-90 shrink-0 mt-0.5"
                            title="수정"
                          >
                            <Pencil size={11} className="text-toss-text-tertiary" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="num px-3 py-3 text-right text-toss-text-secondary">
                      {h.shares ? h.shares.toLocaleString('ko-KR', { maximumFractionDigits: 6 }) : '-'}
                    </td>
                    <td className="num px-3 py-3 text-right text-toss-text-secondary">
                      {h.avg_price
                        ? `${h.currency === 'USD' ? '$' : '₩'}${h.avg_price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`
                        : '-'}
                    </td>
                    <td className="num px-3 py-3 text-right text-toss-text-primary">
                      {h.current_price_display || '-'}
                      {h.price_label && (
                        <span className="block text-[10px] text-toss-text-tertiary">{h.price_label}</span>
                      )}
                    </td>
                    <td className="num px-3 py-3 text-right font-semibold text-toss-text-primary">
                      {hideAssets ? '••••' : fmtKRW(h.value_krw)}
                    </td>
                    <td className={`num px-3 py-3 text-right font-medium ${colorClass(h.profit_krw)}`}>
                      {h.profit_krw !== null ? (hideAssets ? '••••' : fmtKRW(h.profit_krw)) : '-'}
                    </td>
                    <td className={`num px-3 py-3 text-right font-semibold ${colorClass(h.profit_pct)}`}>
                      {fmtPct(h.profit_pct)}
                    </td>
                    <td className={`num px-3 py-3 text-right ${colorClass(h.day_change_pct)}`}>
                      {fmtPct(h.day_change_pct)}
                      {h.day_change_krw !== null && (
                        <span className="block text-[10px]">
                          {h.day_change_krw >= 0 ? '+' : ''}
                          {hideAssets ? '••••' : fmtKRW(h.day_change_krw)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <button
                        onClick={() => confirmDelete(h)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-toss-up-soft transition-all"
                        title="제거"
                      >
                        <Trash2 size={12} className="text-toss-text-tertiary" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {onAdd && (
            <button
              onClick={() => onAdd(account)}
              className="w-full flex items-center justify-center gap-1.5 py-3 text-xs text-toss-blue font-semibold hover:bg-toss-blue-soft/40 active:scale-[0.99] border-t border-toss-border"
            >
              <Plus size={14} />
              종목 추가
            </button>
          )}
        </div>
      )}
    </article>
  );
}
