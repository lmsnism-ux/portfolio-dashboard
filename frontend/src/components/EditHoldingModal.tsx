import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Receipt, Trash2, Search, LoaderCircle, TrendingUp } from 'lucide-react';
import type { AccountData, HoldingData } from '../types';
import type { TickerSearchResult } from '../api';
import { deleteHolding, patchHolding, searchTickers } from '../api';
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [shares, setShares] = useState<string>(holding.shares?.toString() ?? '');
  const [avgPrice, setAvgPrice] = useState<string>(
    holding.avg_price !== null ? holding.avg_price.toString() : '',
  );
  const [snapshotVal, setSnapshotVal] = useState<string>(
    holding.is_snapshot ? (holding.value_krw?.toString() ?? '') : '',
  );
  // 스냅샷(고정금액) → 실시간 시세 추적 전환용
  const [convertTicker, setConvertTicker] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = searchQ.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (!q) { setSearchResults([]); return; }
      setSearching(true);
      setSearchResults(await searchTickers(q));
      setSearching(false);
    }, 120);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQ]);
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
  const deleteMutation = useMutation({
    mutationFn: () => deleteHolding(account.name, holding.ticker || holding.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      onClose();
    },
  });

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, select')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previousFocus?.focus();
    };
  }, [onClose]);

  const handleSave = () => {
    const sharesNum = parseFloat(shares);
    const avgNum = parseFloat(avgPrice);
    const amtNum = parseFloat(autoBuyAmount);

    const snapNum = parseFloat(snapshotVal);
    // 스냅샷 종목인데 티커+주수를 입력했으면 실시간 시세 종목으로 전환
    const converting = holding.is_snapshot && convertTicker.trim() !== '' && Number.isFinite(sharesNum);

    mutation.mutate({
      account_name: account.name,
      holding_key: holding.ticker || holding.name,
      ticker: converting ? convertTicker.trim() : undefined,
      shares: Number.isFinite(sharesNum) ? sharesNum : (converting ? undefined : null),
      avg_price_krw: !isUsd && Number.isFinite(avgNum) ? avgNum : undefined,
      avg_price_usd: isUsd && Number.isFinite(avgNum) ? avgNum : undefined,
      // 전환 중이면 스냅샷 잔액을 보내지 않는다(백엔드가 제거).
      snapshot_value_krw: !converting && holding.is_snapshot && !isUsd && Number.isFinite(snapNum) ? snapNum : undefined,
      snapshot_value_usd: !converting && holding.is_snapshot && isUsd && Number.isFinite(snapNum) ? snapNum : undefined,
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-holding-title"
        className="modal-content mobile-sheet bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-toss-card px-5 pt-5 pb-3 flex items-start justify-between">
          <div>
            <p className="text-xs text-toss-text-tertiary">{account.name}</p>
            <h2 id="edit-holding-title" className="text-xl font-bold text-toss-text-primary">{holding.name}</h2>
            {holding.ticker && (
              <p className="text-[11px] text-toss-text-tertiary">{holding.ticker}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="종목 수정 닫기"
            className="icon-button"
          >
            <X size={18} className="text-toss-text-secondary" />
          </button>
        </div>

        <div className="px-5 py-3 space-y-5">
          {holding.is_snapshot ? (
            /* 예수금/스냅샷 종목: 잔액 + (선택) 실시간 추적 전환 */
            <>
              <Field label={`잔액 (${isUsd ? 'USD' : 'KRW'})`}>
                <input
                  type="number"
                  step="any"
                  value={snapshotVal}
                  onChange={(e) => setSnapshotVal(e.target.value)}
                  disabled={convertTicker.trim() !== ''}
                  className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue disabled:opacity-40"
                  placeholder={isUsd ? '예: 1500.00' : '예: 500000'}
                />
              </Field>

              <div className="rounded-2xl border border-dashed border-toss-blue/40 bg-toss-blue-soft/40 p-4 space-y-3">
                <p className="flex items-center gap-1.5 text-sm font-bold text-toss-text-primary">
                  <TrendingUp size={15} className="text-toss-blue" /> 실시간 시세로 추적하기 (선택)
                </p>
                <p className="text-[11px] leading-relaxed text-toss-text-tertiary">
                  종목을 검색해 고르고 보유 주수·평단을 입력하면, 고정 금액 대신 <b>실시간 시세 × 주수</b>로 자동 평가돼요.
                </p>

                {convertTicker ? (
                  <div className="flex items-center justify-between rounded-xl bg-toss-card px-3 py-2.5">
                    <span className="num text-sm font-bold text-toss-blue">티커 {convertTicker}</span>
                    <button type="button" onClick={() => { setConvertTicker(''); setSearchQ(''); }} className="text-xs font-semibold text-toss-text-tertiary">바꾸기</button>
                  </div>
                ) : (
                  <div>
                    <label className="search-field">
                      <Search size={15} className="shrink-0" />
                      <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="종목명·티커 검색 (예: SOL TOP2, QQQ)" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                      {searching && <LoaderCircle size={15} className="shrink-0 animate-spin text-toss-blue" />}
                    </label>
                    {searchResults.length > 0 && (
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-toss-border divide-y divide-toss-border/60">
                        {searchResults.map((r) => (
                          <button key={r.symbol} type="button"
                            onClick={() => { setConvertTicker(r.ticker); setSearchQ(''); setSearchResults([]); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-toss-bg">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${r.market === 'KR' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'}`}>{r.market}</span>
                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-toss-text-primary">{r.name}</span>
                            <span className="num text-[10px] text-toss-text-tertiary">{r.ticker}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {convertTicker && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="보유 수량">
                      <input type="number" step="any" value={shares} onChange={(e) => setShares(e.target.value)} className="num w-full bg-toss-card rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-toss-blue" placeholder="0" />
                    </Field>
                    <Field label={`평단가 (${isUsd ? 'USD' : 'KRW'})`}>
                      <input type="number" step="any" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} className="num w-full bg-toss-card rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-toss-blue" placeholder="0" />
                    </Field>
                  </div>
                )}
              </div>
            </>
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
            <p role="alert" className="text-sm text-toss-danger">저장하지 못했어요. 잠시 후 다시 시도해주세요.</p>
          )}
          {deleteMutation.isError && (
            <p role="alert" className="text-sm text-toss-danger">삭제하지 못했어요. 잠시 후 다시 시도해주세요.</p>
          )}

          <div className="border-t border-toss-border pt-4">
            {confirmDelete ? (
              <div className="rounded-2xl bg-red-500/10 p-4">
                <p className="text-sm font-semibold text-toss-text-primary">이 종목을 삭제할까요?</p>
                <p className="mt-1 text-[13px] text-toss-text-secondary">삭제하면 되돌릴 수 없습니다.</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="secondary-button flex-1 justify-center">취소</button>
                  <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="danger-button flex-1 justify-center">삭제</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center gap-2 text-[14px] font-semibold text-toss-danger"><Trash2 size={17} /> 종목 삭제</button>
            )}
          </div>
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
      role="switch"
      aria-checked={checked}
      aria-label="자동매수 사용"
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
