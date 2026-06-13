import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Trash2 } from 'lucide-react';
import { fetchTrades, deleteTrade } from '../api';
import { fmtKRW } from '../utils';

interface Props {
  accountName: string;
  holdingKey: string;
  holdingName: string;
  isUsd: boolean;
  onClose: () => void;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yy}/${mm}/${dd} ${hh}:${mi}`;
}

export default function TradeHistoryModal({
  accountName,
  holdingKey,
  holdingName,
  isUsd,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ['trades', accountName, holdingKey],
    queryFn: () => fetchTrades(accountName, holdingKey, 200),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteTrade(id),
    onSuccess: () => {
      setPendingDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['trades', accountName, holdingKey] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });

  const items = data?.items ?? [];
  const agg = data?.aggregate;

  const fmtPrice = (p: number | null): string => {
    if (p === null) return '-';
    return isUsd
      ? `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
      : `₩${p.toLocaleString('ko-KR')}`;
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="체결 내역"
        className="modal-content bg-toss-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-toss-card px-5 pt-5 pb-3 flex items-start justify-between border-b border-toss-border/60">
          <div>
            <p className="text-xs text-toss-text-tertiary">{accountName}</p>
            <h2 className="text-lg font-bold text-toss-text-primary">{holdingName} 체결 내역</h2>
          </div>
          <button onClick={onClose} aria-label="닫기" className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95">
            <X size={18} className="text-toss-text-secondary" />
          </button>
        </div>

        {/* 누적 요약 */}
        {agg && agg.trade_count > 0 && (
          <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-toss-border/60">
            <Stat label="총 매수 수량" value={`${agg.total_buy_shares.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}주`} />
            <Stat label="총 매도 수량" value={`${agg.total_sell_shares.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}주`} />
            <Stat label="현 보유" value={`${agg.net_shares.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}주`} />
            <Stat
              label="평단 (재계산)"
              value={agg.avg_price_from_trades !== null ? fmtPrice(agg.avg_price_from_trades) : '-'}
            />
          </div>
        )}

        {/* 목록 */}
        <div className="px-5 py-3">
          {isLoading ? (
            <p className="text-sm text-toss-text-tertiary py-6 text-center">불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-toss-text-tertiary py-6 text-center">
              기록된 체결이 없어요.<br />
              <span className="text-[11px]">매수/매도 시 자동으로 여기에 기록돼요.</span>
            </p>
          ) : (
            <ul className="divide-y divide-toss-border/40">
              {items.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        t.side === 'buy'
                          ? 'bg-toss-up-soft text-toss-up'
                          : 'bg-toss-down-soft text-toss-down'
                      }`}
                    >
                      {t.side === 'buy' ? '매수' : '매도'}
                    </span>
                    <div className="min-w-0">
                      <p className="num text-[13px] font-semibold text-toss-text-primary">
                        {t.shares.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}주
                        {t.price !== null && (
                          <span className="text-toss-text-tertiary font-normal"> × {fmtPrice(t.price)}</span>
                        )}
                      </p>
                      <p className="text-[10px] text-toss-text-tertiary">{fmtDateTime(t.traded_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.price !== null && t.shares > 0 && (
                      <p className="num text-[12px] font-semibold text-toss-text-secondary">
                        {t.currency === 'USD'
                          ? `$${(t.shares * t.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : fmtKRW(t.shares * t.price)}
                      </p>
                    )}
                    {pendingDeleteId === t.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteMut.mutate(t.id)}
                          disabled={deleteMut.isPending}
                          className="text-[10px] font-bold text-white bg-toss-down px-2 py-1 rounded-full active:scale-95"
                        >
                          확인
                        </button>
                        <button
                          onClick={() => setPendingDeleteId(null)}
                          className="text-[10px] text-toss-text-tertiary px-2 py-1 rounded-full border border-toss-border active:scale-95"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPendingDeleteId(t.id)}
                        aria-label="삭제"
                        className="p-1.5 rounded-full hover:bg-toss-down/10 active:scale-90 transition-all"
                      >
                        <Trash2 size={13} className="text-toss-text-tertiary" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-toss-text-tertiary mt-3 leading-relaxed">
            ⓘ 체결 기록은 평단가 가중평균 계산의 근거가 돼요. 삭제하면 평단/수량이 재계산됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-toss-bg rounded-xl px-3 py-2.5">
      <p className="text-[10px] text-toss-text-tertiary mb-0.5">{label}</p>
      <p className="num text-[12px] font-bold text-toss-text-primary">{value}</p>
    </div>
  );
}
