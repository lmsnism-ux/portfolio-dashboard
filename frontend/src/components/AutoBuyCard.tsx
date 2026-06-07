import { useState } from 'react';
import { CalendarClock, Pencil, Trash2, Check, X, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AutoBuySummary, AccountData } from '../types';
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
  accounts: AccountData[];
}

interface EditState {
  key: string;
  amount: string;
  frequency: string;
}

interface AddForm {
  accountName: string;
  holdingKey: string;
  currency: string;
  amount: string;
  frequency: string;
}

const EMPTY_ADD: AddForm = {
  accountName: '',
  holdingKey: '',
  currency: 'KRW',
  amount: '',
  frequency: 'daily_weekday',
};

export default function AutoBuyCard({ items, accounts }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD);

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
      patchHolding({ account_name, holding_key, remove_auto_buy: true }),
    onSuccess: () => { invalidate(); setPendingDelete(null); },
  });

  const addMutation = useMutation({
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
    onSuccess: () => { invalidate(); setAddMode(false); setAddForm(EMPTY_ADD); },
  });

  // 자동매수 없는 종목 목록 (추가 가능 후보)
  const availableHoldings = accounts.flatMap(acc =>
    acc.holdings
      .filter(h => !h.auto_buy)
      .map(h => ({
        accountName: acc.name,
        holdingKey: h.ticker || h.name,
        name: h.name,
        currency: h.currency,
      }))
  );

  const selectedAccountHoldings = addForm.accountName
    ? availableHoldings.filter(h => h.accountName === addForm.accountName)
    : availableHoldings;

  const onSelectAccount = (accName: string) => {
    const first = availableHoldings.find(h => h.accountName === accName);
    setAddForm(f => ({
      ...f,
      accountName: accName,
      holdingKey: first?.holdingKey ?? '',
      currency: first?.currency ?? 'KRW',
    }));
  };

  const onSelectHolding = (key: string) => {
    const h = availableHoldings.find(h => h.holdingKey === key);
    setAddForm(f => ({ ...f, holdingKey: key, currency: h?.currency ?? 'KRW' }));
  };

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)]">
      {/* 헤더 - 항상 표시 */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-5 py-4 text-left"
      >
        <div className="w-7 h-7 rounded-full bg-toss-blue-soft flex items-center justify-center shrink-0">
          <CalendarClock size={15} className="text-toss-blue" />
        </div>
        <h3 className="text-sm font-semibold text-toss-text-primary flex-1">자동매수 예정</h3>
        {items.length > 0 && (
          <span className="text-[11px] text-toss-text-tertiary">{items.length}건</span>
        )}
        {open ? (
          <ChevronUp size={16} className="text-toss-text-tertiary shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-toss-text-tertiary shrink-0" />
        )}
      </button>

      {/* 펼쳐진 내용 */}
      {open && (
        <div className="px-5 pb-5 border-t border-toss-border/60">
          {items.length === 0 && !addMode ? (
            <div className="py-6 text-center">
              <p className="text-sm text-toss-text-tertiary mb-3">설정된 자동매수가 없어요</p>
              <button
                onClick={() => setAddMode(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-toss-blue bg-toss-blue-soft px-4 py-2 rounded-full active:scale-95 transition-all"
              >
                <Plus size={13} />
                자동매수 추가
              </button>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-toss-border mt-3">
                {items.map((item) => {
                  const itemKey = `${item.account_name}::${item.holding_key}`;
                  const isEditing = editing?.key === itemKey;
                  const isDeleting = pendingDelete === itemKey;

                  return (
                    <li key={itemKey} className={`py-3 first:pt-0 last:pb-0 transition-opacity ${item.enabled ? '' : 'opacity-50'}`}>
                      {isEditing ? (
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
                              <Check size={11} /> 저장
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="flex items-center gap-1 text-[11px] text-toss-text-tertiary px-3 py-1.5 rounded-full border border-toss-border active:scale-95 transition-all"
                            >
                              <X size={11} /> 취소
                            </button>
                          </div>
                        </div>
                      ) : isDeleting ? (
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
                              <button
                                onClick={() => setPendingDelete(itemKey)}
                                className="p-1.5 rounded-full hover:bg-red-500/10 active:scale-90 transition-all"
                                title="삭제"
                              >
                                <Trash2 size={12} className="text-red-400" />
                              </button>
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

              {/* 자동매수 추가 폼 */}
              {addMode ? (
                <div className="mt-3 pt-3 border-t border-toss-border/60 space-y-2.5">
                  <p className="text-xs font-semibold text-toss-text-secondary">자동매수 추가</p>

                  {availableHoldings.length === 0 ? (
                    <p className="text-xs text-toss-text-tertiary">자동매수를 설정할 수 있는 종목이 없어요.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={addForm.accountName}
                          onChange={e => onSelectAccount(e.target.value)}
                          className="text-[11px] bg-toss-bg border border-toss-border rounded-xl px-2.5 py-2 text-toss-text-primary focus:outline-none focus:border-toss-blue"
                        >
                          <option value="">계좌 선택</option>
                          {[...new Set(availableHoldings.map(h => h.accountName))].map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        <select
                          value={addForm.holdingKey}
                          onChange={e => onSelectHolding(e.target.value)}
                          className="text-[11px] bg-toss-bg border border-toss-border rounded-xl px-2.5 py-2 text-toss-text-primary focus:outline-none focus:border-toss-blue"
                        >
                          <option value="">종목 선택</option>
                          {selectedAccountHoldings.map(h => (
                            <option key={h.holdingKey} value={h.holdingKey}>{h.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-toss-bg rounded-xl px-3 py-1.5">
                          <span className="text-[11px] text-toss-text-tertiary">금액</span>
                          <input
                            type="number"
                            value={addForm.amount}
                            onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                            className="num w-20 text-[12px] font-bold text-toss-text-primary bg-transparent focus:outline-none text-right"
                            placeholder="0"
                          />
                          <span className="text-[11px] text-toss-text-tertiary">
                            {addForm.currency === 'USD' ? 'USD' : 'KRW'}
                          </span>
                        </div>
                        <select
                          value={addForm.frequency}
                          onChange={e => setAddForm(f => ({ ...f, frequency: e.target.value }))}
                          className="text-[11px] bg-toss-bg border border-toss-border rounded-xl px-2.5 py-1.5 text-toss-text-primary focus:outline-none focus:border-toss-blue"
                        >
                          {FREQ_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => addMutation.mutate({
                            account_name: addForm.accountName,
                            holding_key: addForm.holdingKey,
                            currency: addForm.currency,
                            amount: Number(addForm.amount),
                            frequency: addForm.frequency,
                          })}
                          disabled={addMutation.isPending || !addForm.accountName || !addForm.holdingKey || !addForm.amount}
                          className="flex items-center gap-1 text-[11px] font-semibold text-white bg-toss-blue px-3 py-1.5 rounded-full disabled:opacity-50 active:scale-95 transition-all"
                        >
                          <Check size={11} /> 저장
                        </button>
                        <button
                          onClick={() => { setAddMode(false); setAddForm(EMPTY_ADD); }}
                          className="flex items-center gap-1 text-[11px] text-toss-text-tertiary px-3 py-1.5 rounded-full border border-toss-border active:scale-95 transition-all"
                        >
                          <X size={11} /> 취소
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setAddMode(true)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-toss-blue font-semibold rounded-xl border border-dashed border-toss-blue/30 hover:bg-toss-blue-soft/30 active:scale-[0.99] transition-all"
                >
                  <Plus size={13} />
                  자동매수 추가
                </button>
              )}

              <p className="text-[11px] text-toss-text-tertiary mt-3">
                ⓘ 실제 체결은 증권사 자동매수로 진행됩니다. 위 숫자는 현재가 기준 예상치예요.
              </p>
            </>
          )}
        </div>
      )}
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
