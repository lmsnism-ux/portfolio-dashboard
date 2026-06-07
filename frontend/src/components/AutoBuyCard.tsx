import { useState } from 'react';
import { CalendarClock, Pencil, Trash2, Check, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AutoBuySummary } from '../types';
import { patchHolding } from '../api';

const FREQ_OPTIONS = [
  { value: 'daily_weekday', label: '매일 (평일)' },
  { value: 'weekly_monday', label: '매주 월요일' },
  { value: 'weekly_friday', label: '매주 금요일' },
  { value: 'monthly_first', label: '매월 1일' },
  { value: 'monthly_last', label: '매월 마지막날' },
];

interface Props {
  items: AutoBuySummary[];
}

interface EditState {
  key: string;
  amount: string;
  frequency: string;
}

export default function AutoBuyCard({ items }: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['portfolio'] });

  const toggleMutation = useMutation({
    mutationFn: ({ account_name, holding_key, enabled }: { account_name: string; holding_key: string; enabled: boolean }) =>
      patchHolding({ account_name, holding_key, auto_buy: { enabled } }),
    onSuccess: invalidate,
  });

  const editMutation = useMutation({
    mutationFn: ({ account_name, holding_key, currency, amount, frequency }: {
      account_name: string; holding_key: string; currency: string; amount: number; frequency: string;
    }) =>
      patchHolding({
        account_name,
        holding_key,
        auto_buy: {
          enabled: true,
          ...(currency === 'USD' ? { amount_usd: amount } : { amount_krw: amount }),
          frequency,
        },
      }),
    onSuccess: () => { invalidate(); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ account_name, holding_key }: { account_name: string; holding_key: string }) =>
      patchHolding({ account_name, holding_key, auto_buy: null }),
    onSuccess: () => { invalidate(); setPendingDelete(null); },
  });

  if (!items.length) return null;

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-full bg-toss-blue-soft flex items-center justify-center">
          <CalendarClock size={15} className="text-toss-blue" />
        </div>
        <h3 className="text-sm font-semibold text-toss-text-primary">자동매수 예정</h3>
        <span className="ml-auto text-[11px] text-toss-text-tertiary">{items.length}건</span>
      </div>

      <ul className="divide-y divide-toss-border">
        {items.map((item) => {
          const itemKey = `${item.account_name}::${item.holding_key}`;
          const isEditing = editing?.key === itemKey;
          const isDeleting = pendingDelete === itemKey;

          return (
            <li key={itemKey} className={`py-3 first:pt-0 last:pb-0 transition-opacity ${item.enabled ? '' : 'opacity-50'}`}>
              {isEditing ? (
                /* 편집 모드 */
                <div className="space-y-2">
                  <p className="font-semibold text-toss-text-primary text-[14px] truncate">{item.name}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-toss-bg rounded-xl px-3 py-1.5">
                      <span className="text-[11px] text-toss-text-tertiary">금액</span>
                      <input
                        type="number"
                        value={editing.amount}
                        onChange={e => setEditing(prev => prev ? { ...prev, amount: e.target.value } : null)}
                        className="num w-20 text-[12px] font-bold text-toss-text-primary bg-transparent focus:outline-none text-right"
                        placeholder="0"
                      />
                      <span className="text-[11px] text-toss-text-tertiary">
                        {item.currency === 'USD' ? 'USD' : 'KRW'}
                      </span>
                    </div>
                    <select
                      value={editing.frequency}
                      onChange={e => setEditing(prev => prev ? { ...prev, frequency: e.target.value } : null)}
                      className="text-[11px] bg-toss-bg border border-toss-border rounded-xl px-2.5 py-1.5 text-toss-text-primary focus:outline-none focus:border-toss-blue"
                    >
                      {FREQ_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => editMutation.mutate({
                        account_name: item.account_name,
                        holding_key: item.holding_key,
                        currency: item.currency,
                        amount: Number(editing.amount),
                        frequency: editing.frequency,
                      })}
                      disabled={editMutation.isPending || !editing.amount}
                      className="flex items-center gap-1 text-[11px] font-semibold text-white bg-toss-blue px-3 py-1.5 rounded-full disabled:opacity-50 active:scale-95 transition-all"
                    >
                      <Check size={11} />
                      저장
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="flex items-center gap-1 text-[11px] text-toss-text-tertiary px-3 py-1.5 rounded-full border border-toss-border active:scale-95 transition-all"
                    >
                      <X size={11} />
                      취소
                    </button>
                  </div>
                </div>
              ) : isDeleting ? (
                /* 삭제 확인 */
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-toss-text-primary text-[14px] truncate">{item.name}</p>
                    <p className="text-xs text-red-400 mt-0.5">자동매수를 삭제할까요?</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => deleteMutation.mutate({ account_name: item.account_name, holding_key: item.holding_key })}
                      disabled={deleteMutation.isPending}
                      className="text-[11px] font-semibold text-white bg-red-500 px-3 py-1.5 rounded-full disabled:opacity-50 active:scale-95 transition-all"
                    >
                      삭제
                    </button>
                    <button
                      onClick={() => setPendingDelete(null)}
                      className="text-[11px] text-toss-text-tertiary px-3 py-1.5 rounded-full border border-toss-border active:scale-95 transition-all"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                /* 뷰 모드 */
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-toss-text-primary text-[14px] truncate">{item.name}</p>
                    <p className="text-xs text-toss-text-tertiary mt-0.5">
                      {item.frequency} · <span className="num">{item.amount}</span>
                    </p>
                    {item.enabled && item.est_shares_per_buy ? (
                      <p className="text-xs text-toss-text-tertiary mt-0.5">
                        {item.est_shares_note ?? '예상'} 약{' '}
                        <span className="num text-toss-text-secondary">{item.est_shares_per_buy}</span>주
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${
                      item.enabled ? 'bg-toss-blue-soft text-toss-blue' : 'bg-toss-bg text-toss-text-tertiary'
                    }`}>
                      {item.next_date}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {/* 편집 버튼 */}
                      <button
                        onClick={() => setEditing({
                          key: itemKey,
                          amount: item.amount_krw !== null
                            ? String(item.amount_krw)
                            : item.amount.replace(/[^0-9.]/g, ''),
                          frequency: FREQ_OPTIONS.find(f =>
                            item.frequency.includes(f.label.replace(/[()]/g, '').trim().split(' ')[0])
                          )?.value ?? 'daily_weekday',
                        })}
                        className="p-1.5 rounded-full hover:bg-toss-bg active:scale-90 transition-all"
                        title="편집"
                      >
                        <Pencil size={12} className="text-toss-text-tertiary" />
                      </button>
                      {/* 삭제 버튼 */}
                      <button
                        onClick={() => setPendingDelete(itemKey)}
                        className="p-1.5 rounded-full hover:bg-red-500/10 active:scale-90 transition-all"
                        title="삭제"
                      >
                        <Trash2 size={12} className="text-red-400" />
                      </button>
                      {/* 토글 */}
                      <Toggle
                        checked={item.enabled}
                        disabled={toggleMutation.isPending}
                        onChange={(next) => toggleMutation.mutate({
                          account_name: item.account_name,
                          holding_key: item.holding_key,
                          enabled: next,
                        })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-toss-text-tertiary mt-3">
        ⓘ 실제 체결은 증권사 자동매수로 진행됩니다. 위 숫자는 현재가 기준 예상치예요.
      </p>
    </section>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors relative shrink-0 disabled:opacity-50 ${
        checked ? 'bg-toss-blue' : 'bg-toss-border'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-4' : ''
      }`} />
    </button>
  );
}
