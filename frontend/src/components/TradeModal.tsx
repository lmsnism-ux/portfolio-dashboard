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

interface ValidPreview {
  kind: 'valid';
  newShares: number;
  newAvg: number;
  totalCost?: number;       // 매수 시 총 투자금액
  proceeds?: number;        // 매도 시 예상 수익금
  realizedProfit?: number;  // 매도 시 실현 손익 (avg_price 있을 때만)
}
interface ErrorPreview { kind: 'error'; error: string; }
type TradePreview = ValidPreview | ErrorPreview;

function fmt(val: number, isUsd: boolean): string {
  if (isUsd) return `$${val.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `₩${Math.round(val).toLocaleString('ko-KR')}`;
}

/**
 * 매수: 새 평단가 = (기존_수량 × 기존_평단가 + 체결_수량 × 체결가) / (기존_수량 + 체결_수량)
 * 매도: 평단가 유지, 보유수량만 감소
 */
export default function TradeModal({ account, holding, initialSide = 'buy', onClose }: Props) {
  const queryClient = useQueryClient();
  const isUsd = holding.currency === 'USD';

  const [side, setSide] = useState<Side>(initialSide);
  const [qty, setQty] = useState('');
  // 현재가로 가격 필드 초기화
  const [price, setPrice] = useState(() => holding.current_price?.toString() ?? '');
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

    const oldShares = holding.shares ?? 0;
    const oldAvg = holding.avg_price ?? 0;

    if (side === 'buy') {
      if (!Number.isFinite(p) || p <= 0) return null;
      const newShares = oldShares + q;
      const newAvg = newShares > 0 ? (oldShares * oldAvg + q * p) / newShares : p;
      return { kind: 'valid', newShares, newAvg, totalCost: q * p };
    } else {
      if (q > oldShares) return { kind: 'error', error: `보유 수량(${oldShares})보다 많습니다` };
      const newShares = oldShares - q;
      const hasSellPrice = Number.isFinite(p) && p > 0;
      const proceeds = hasSellPrice ? q * p : undefined;
      const realizedProfit = hasSellPrice && oldAvg > 0 ? q * (p - oldAvg) : undefined;
      return { kind: 'valid', newShares, newAvg: oldAvg, proceeds, realizedProfit };
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
      price: Number.isFinite(p) && p > 0 ? p : null,
      currency: isUsd ? 'USD' : 'KRW',
      apply_to_holding: true,
    });
  };

  const currentShares = holding.shares ?? 0;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="매수/매도 기록"
        className="modal-content bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-toss-card px-5 pt-5 pb-3 flex items-start justify-between">
          <div>
            <p className="text-xs text-toss-text-tertiary">{account.name}</p>
            <h2 className="text-lg font-bold text-toss-text-primary">{holding.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="num text-[11px] text-toss-text-tertiary">
                보유 {currentShares.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}주
              </p>
              {holding.avg_price != null && (
                <p className="num text-[11px] text-toss-text-tertiary">
                  · 평단 {fmt(holding.avg_price, isUsd)}
                </p>
              )}
              {holding.current_price != null && (
                <p className="num text-[11px] text-toss-text-tertiary">
                  · 현재가 {fmt(holding.current_price, isUsd)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-toss-bg hover:bg-toss-blue-soft active:scale-95 transition-all text-[11px] font-semibold text-toss-text-secondary"
            >
              <History size={12} />
              내역
            </button>
            <button onClick={onClose} aria-label="닫기" className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95">
              <X size={18} className="text-toss-text-secondary" />
            </button>
          </div>
        </div>

        <div className="px-5 py-2 space-y-4">
          {/* 매수/매도 탭 */}
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

          {/* 체결 수량 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-toss-text-secondary">체결 수량</span>
              {side === 'sell' && currentShares > 0 && (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setQty((currentShares / 2).toString())}
                    className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-toss-bg border border-toss-border text-toss-text-secondary active:scale-95"
                  >
                    절반
                  </button>
                  <button
                    onClick={() => setQty(currentShares.toString())}
                    className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-toss-down/10 border border-toss-down/30 text-toss-down active:scale-95"
                  >
                    전체 매도
                  </button>
                </div>
              )}
            </div>
            <input
              type="number"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
              placeholder="0"
              autoFocus
            />
          </div>

          {/* 체결가 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-toss-text-secondary">
                체결가 ({isUsd ? 'USD' : 'KRW'}){side === 'sell' && ' · 선택'}
              </span>
              {holding.current_price != null && (
                <button
                  onClick={() => setPrice(holding.current_price!.toString())}
                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-toss-blue-soft text-toss-blue active:scale-95"
                >
                  현재가 입력
                </button>
              )}
            </div>
            <input
              type="number"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
              placeholder={isUsd ? '예: 92.50' : '예: 28000'}
            />
          </div>

          {previewError && (
            <p className="text-xs text-toss-up">{previewError}</p>
          )}

          {/* 체결 후 미리보기 */}
          {validPreview && (
            <div className={`rounded-2xl p-4 space-y-2 ${side === 'buy' ? 'bg-toss-up-soft' : 'bg-toss-down-soft'}`}>
              <p className="text-xs font-semibold text-toss-text-secondary">체결 후 예상</p>

              {side === 'buy' && validPreview.totalCost != null && (
                <PreviewRow label="총 매수금액" value={fmt(validPreview.totalCost, isUsd)} />
              )}

              <PreviewRow
                label="새 보유수량"
                value={`${validPreview.newShares.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}주`}
              />

              {side === 'buy' && (
                <PreviewRow
                  label="새 평단가 (가중평균)"
                  value={fmt(validPreview.newAvg, isUsd)}
                  highlight
                />
              )}

              {side === 'sell' && validPreview.proceeds != null && (
                <PreviewRow label="예상 수익금" value={fmt(validPreview.proceeds, isUsd)} />
              )}

              {side === 'sell' && validPreview.realizedProfit != null && (
                <PreviewRow
                  label="실현 손익"
                  value={`${validPreview.realizedProfit >= 0 ? '+' : ''}${fmt(validPreview.realizedProfit, isUsd)}`}
                  color={validPreview.realizedProfit >= 0 ? 'up' : 'down'}
                />
              )}
            </div>
          )}

          {mutation.isError && (
            <p className="text-xs text-toss-up">저장 실패: {(mutation.error as Error).message}</p>
          )}
        </div>

        {/* 하단 버튼 */}
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
            className={`flex-[2] py-3 rounded-xl text-white font-semibold disabled:opacity-50 active:scale-[0.98] transition-opacity ${
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

function PreviewRow({
  label,
  value,
  highlight,
  color,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  color?: 'up' | 'down';
}) {
  const valCls = color === 'up'
    ? 'text-toss-up'
    : color === 'down'
    ? 'text-toss-down'
    : highlight
    ? 'text-toss-text-primary'
    : 'text-toss-text-primary';

  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-toss-text-tertiary">{label}</span>
      <span className={`num text-sm font-semibold ${valCls}`}>{value}</span>
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
// Field is kept for potential external use
void Field;
