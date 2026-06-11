import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, History } from 'lucide-react';
import { createTrade } from '../api';
import type { AccountData, HoldingData } from '../types';
import TradeHistoryModal from './TradeHistoryModal';

interface Props {
  account: AccountData;
  holding: HoldingData;
  initialSide?: 'buy' | 'sell';
  onClose: () => void;
}

type Side = 'buy' | 'sell';
type TradePreview =
  | { kind: 'valid'; newShares: number; newAvg: number }
  | { kind: 'error'; error: string };

/**
 * 매수: 새 평단가 = (기존_수량 × 기존_평단가 + 체결_수량 × 체결가) / (기존_수량 + 체결_수량)
 * 매도: 평단가 유지, 보유수량만 감소
 */
export default function TradeModal({ account, holding, initialSide = 'buy', onClose }: Props) {
  const queryClient = useQueryClient();
  const isUsd = holding.currency === 'USD';
  const [side, setSide] = useState<Side>(initialSide);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: createTrade,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      onClose();
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const preview = useMemo<TradePreview | null>(() => {
    const q = parseFloat(qty);
    const p = parseFloat(price);
    if (!Number.isFinite(q) || q <= 0) return null;
    const oldShares = holding.shares || 0;
    const oldAvg = holding.avg_price || 0;

    if (side === 'buy') {
      if (!Number.isFinite(p) || p <= 0) return null;
      const newShares = oldShares + q;
      const newAvg = (oldShares * oldAvg + q * p) / newShares;
      return { kind: 'valid', newShares, newAvg };
    } else {
      if (q > oldShares) return { kind: 'error', error: `매도 수량이 보유 수량(${oldShares})보다 큽니다` };
      const newShares = oldShares - q;
      return { kind: 'valid', newShares, newAvg: oldAvg };
    }
  }, [qty, price, side, holding]);

  const previewError = preview?.kind === 'error' ? preview.error : null;
  const validPreview = preview?.kind === 'valid' ? preview : null;

  const save = () => {
    if (!validPreview) return;
    const q = parseFloat(qty);
    const p = parseFloat(price);
    mutation.mutate({
      account_name: account.name,
      holding_key: holding.ticker || holding.name,
      name: holding.name,
      ticker: holding.ticker,
      side,
      shares: q,
      price: side === 'buy' ? p : (Number.isFinite(p) ? p : null),
      currency: isUsd ? 'USD' : 'KRW',
      apply_to_holding: true,
    });
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="modal-content bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-toss-card px-5 pt-5 pb-3 flex items-start justify-between">
          <div>
            <p className="text-xs text-toss-text-tertiary">{account.name}</p>
            <h2 className="text-lg font-bold text-toss-text-primary">{holding.name}</h2>
            <p className="num text-[11px] text-toss-text-tertiary mt-0.5">
              현재 {holding.shares?.toLocaleString('ko-KR', { maximumFractionDigits: 6 }) ?? 0}주
              {holding.avg_price !== null
                ? ` · 평단 ${isUsd ? '$' : '₩'}${holding.avg_price.toLocaleString('ko-KR', {
                    maximumFractionDigits: 2,
                  })}`
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-toss-bg hover:bg-toss-blue-soft active:scale-95 transition-all text-[11px] font-semibold text-toss-text-secondary"
              title="체결 내역"
            >
              <History size={12} />
              내역
            </button>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95"
            >
              <X size={18} className="text-toss-text-secondary" />
            </button>
          </div>
        </div>

        <div className="px-5 py-2 space-y-4">
          {/* 매수/매도 토글 */}
          <div className="flex gap-2">
            <button
              onClick={() => setSide('buy')}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                side === 'buy' ? 'bg-toss-up text-white' : 'bg-toss-bg text-toss-text-secondary'
              }`}
            >
              매수
            </button>
            <button
              onClick={() => setSide('sell')}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                side === 'sell' ? 'bg-toss-down text-white' : 'bg-toss-bg text-toss-text-secondary'
              }`}
            >
              매도
            </button>
          </div>

          <Field label="체결 수량">
            <input
              type="number"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
              placeholder="0"
              autoFocus
            />
          </Field>

          {side === 'buy' && (
            <Field label={`체결가 (${isUsd ? 'USD' : 'KRW'})`}>
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
                placeholder={isUsd ? '예: 92.5' : '예: 28000'}
              />
            </Field>
          )}

          {previewError && (
            <p className="text-xs text-toss-up">{previewError}</p>
          )}

          {validPreview && (
            <div className="bg-toss-blue-soft rounded-2xl p-4">
              <p className="text-xs text-toss-text-secondary mb-2">체결 후</p>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-toss-text-tertiary">새 보유수량</span>
                <span className="num text-sm font-semibold text-toss-text-primary">
                  {validPreview.newShares.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}주
                </span>
              </div>
              {side === 'buy' && (
                <div className="flex justify-between">
                  <span className="text-xs text-toss-text-tertiary">새 평단가 (가중평균)</span>
                  <span className="num text-sm font-semibold text-toss-text-primary">
                    {isUsd ? '$' : '₩'}
                    {validPreview.newAvg.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}
                  </span>
                </div>
              )}
            </div>
          )}

          {mutation.isError && (
            <p className="text-xs text-toss-up">저장 실패: {(mutation.error as Error).message}</p>
          )}
        </div>

        <div className="sticky bottom-0 bg-toss-card px-5 pt-3 pb-5 border-t border-toss-border flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-toss-bg text-toss-text-primary font-semibold active:scale-[0.98]"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={mutation.isPending || !validPreview}
            className={`flex-[2] py-3 rounded-xl text-white font-semibold disabled:opacity-50 active:scale-[0.98] ${
              side === 'buy' ? 'bg-toss-up' : 'bg-toss-down'
            }`}
          >
            {mutation.isPending ? '저장 중...' : side === 'buy' ? '매수 기록' : '매도 기록'}
          </button>
        </div>
      </div>

      {historyOpen && (
        <TradeHistoryModal
          accountName={account.name}
          holdingKey={holding.ticker || holding.name}
          holdingName={holding.name}
          isUsd={isUsd}
          onClose={() => setHistoryOpen(false)}
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
