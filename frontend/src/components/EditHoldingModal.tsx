import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Receipt } from 'lucide-react';
import type { AccountData, HoldingData } from '../types';
import { patchHolding } from '../api';
import TradeModal from './TradeModal';

interface Props {
  account: AccountData;
  holding: HoldingData;
  onClose: () => void;
}

export default function EditHoldingModal({ account, holding, onClose }: Props) {
  const queryClient = useQueryClient();
  const isUsd = holding.currency === 'USD';
  const [tradeOpen, setTradeOpen] = useState(false);

  const [shares, setShares] = useState<string>(holding.shares?.toString() ?? '');
  const [avgPrice, setAvgPrice] = useState<string>(
    holding.avg_price !== null ? holding.avg_price.toString() : '',
  );
  const [snapshotVal, setSnapshotVal] = useState<string>(
    holding.is_snapshot ? (holding.value_krw?.toString() ?? '') : '',
  );
  const [autoBuyEnabled, setAutoBuyEnabled] = useState<boolean>(
    holding.auto_buy?.enabled ?? false,
  );
  const [autoBuyAmount, setAutoBuyAmount] = useState<string>(
    isUsd
      ? holding.auto_buy?.amount_usd?.toString() ?? ''
      : holding.auto_buy?.amount_krw?.toString() ?? '',
  );
  const [autoBuyFreq, setAutoBuyFreq] = useState<string>(
    holding.auto_buy?.frequency ?? (isUsd ? 'daily_weekday' : 'weekly_monday'),
  );

  const mutation = useMutation({
    mutationFn: patchHolding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      onClose();
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleSave = () => {
    const sharesNum = parseFloat(shares);
    const avgNum = parseFloat(avgPrice);
    const amtNum = parseFloat(autoBuyAmount);

    const snapNum = parseFloat(snapshotVal);

    mutation.mutate({
      account_name: account.name,
      holding_key: holding.ticker || holding.name,
      shares: Number.isFinite(sharesNum) ? sharesNum : null,
      avg_price_krw: !isUsd && Number.isFinite(avgNum) ? avgNum : undefined,
      avg_price_usd: isUsd && Number.isFinite(avgNum) ? avgNum : undefined,
      snapshot_value_krw: holding.is_snapshot && !isUsd && Number.isFinite(snapNum) ? snapNum : undefined,
      snapshot_value_usd: holding.is_snapshot && isUsd && Number.isFinite(snapNum) ? snapNum : undefined,
      auto_buy: {
        enabled: autoBuyEnabled,
        amount_usd: isUsd && Number.isFinite(amtNum) ? amtNum : undefined,
        amount_krw: !isUsd && Number.isFinite(amtNum) ? amtNum : undefined,
        frequency: autoBuyFreq,
      },
    });
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="종목 편집"
        className="modal-content mobile-sheet bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-toss-card px-5 pt-5 pb-3 flex items-start justify-between">
          <div>
            <p className="text-xs text-toss-text-tertiary">{account.name}</p>
            <h2 className="text-lg font-bold text-toss-text-primary">{holding.name}</h2>
            {holding.ticker && (
              <p className="text-[11px] text-toss-text-tertiary">{holding.ticker}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95 transition-all"
          >
            <X size={18} className="text-toss-text-secondary" />
          </button>
        </div>

        <div className="px-5 py-2 space-y-4">
          {holding.is_snapshot ? (
            /* 예수금/스냅샷 종목: 잔액만 편집 */
            <Field label={`잔액 (${isUsd ? 'USD' : 'KRW'})`}>
              <input
                type="number"
                step="any"
                value={snapshotVal}
                onChange={(e) => setSnapshotVal(e.target.value)}
                className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
                placeholder={isUsd ? '예: 1500.00' : '예: 500000'}
              />
            </Field>
          ) : (
            <>
              {/* 체결 기록 진입 */}
              <button
                onClick={() => setTradeOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-toss-blue-soft text-toss-blue font-semibold text-sm active:scale-[0.98]"
              >
                <Receipt size={16} />
                체결 기록 (평단가 자동 계산)
              </button>
              <Field label="보유 수량">
                <input
                  type="number"
                  step="any"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
                  placeholder="0"
                />
              </Field>
              <Field label={`평단가 (${isUsd ? 'USD' : 'KRW'})`}>
                <input
                  type="number"
                  step="any"
                  value={avgPrice}
                  onChange={(e) => setAvgPrice(e.target.value)}
                  className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
                  placeholder={isUsd ? '예: 92.5' : '예: 28000'}
                />
              </Field>
            </>
          )}

          <div className="rounded-2xl bg-toss-bg p-4">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-semibold text-toss-text-primary">자동매수</span>
              <Toggle checked={autoBuyEnabled} onChange={setAutoBuyEnabled} />
            </label>

            {autoBuyEnabled && (
              <div className="mt-3 space-y-3">
                <Field label={`회당 금액 (${isUsd ? 'USD' : 'KRW'})`}>
                  <input
                    type="number"
                    step="any"
                    value={autoBuyAmount}
                    onChange={(e) => setAutoBuyAmount(e.target.value)}
                    className="num w-full bg-toss-card rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
                    placeholder={isUsd ? '예: 20' : '예: 100000'}
                  />
                </Field>
                <Field label="주기">
                  <div className="flex gap-2">
                    {[
                      { key: 'daily_weekday', label: '매 영업일' },
                      { key: 'weekly_monday', label: '매주 월요일' },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setAutoBuyFreq(opt.key)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                          autoBuyFreq === opt.key
                            ? 'bg-toss-blue text-white'
                            : 'bg-toss-card text-toss-text-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}
          </div>

          {mutation.isError && (
            <p className="text-xs text-toss-up">저장 실패: {(mutation.error as Error).message}</p>
          )}
        </div>

        <div className="sticky bottom-0 bg-toss-card px-5 pt-3 pb-5 border-t border-toss-border flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-toss-bg text-toss-text-primary font-semibold active:scale-[0.98] transition-all"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="flex-[2] py-3 rounded-xl bg-toss-blue text-white font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {mutation.isPending ? '저장 중...' : '저장하기'}
          </button>
        </div>
      </div>

      {tradeOpen && (
        <TradeModal
          account={account}
          holding={holding}
          onClose={() => {
            setTradeOpen(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-toss-text-secondary mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-colors relative ${
        checked ? 'bg-toss-blue' : 'bg-toss-border'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}
