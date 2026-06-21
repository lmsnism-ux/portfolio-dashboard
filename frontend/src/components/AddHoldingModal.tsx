import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Landmark, LoaderCircle, Search, TrendingUp, X } from 'lucide-react';
import { createHolding, searchTickers } from '../api';
import type { TickerSearchResult } from '../api';
import type { AccountData } from '../types';

interface Props {
  account: AccountData;
  onClose: () => void;
}

type Mode  = 'stock' | 'cash';
type Phase = 'search' | 'fill';

const ASSET_CLASSES = ['주식', '채권', '혼합', '현금', '대체투자'];
const REGIONS       = ['미국', '국내', '글로벌', '신흥국', '기타'];

export default function AddHoldingModal({ account, onClose }: Props) {
  const queryClient   = useQueryClient();
  const accountIsUsd  = account.currency === 'USD';
  const isCashAccount = ['적금', '예금', '현금', 'CMA', '저축'].some((t) => account.type.includes(t));

  const [mode, setMode]           = useState<Mode>(isCashAccount ? 'cash' : 'stock');
  const [phase, setPhase]         = useState<Phase>('search');

  // search
  const [searchQ, setSearchQ]           = useState('');
  const [results, setResults]           = useState<TickerSearchResult[]>([]);
  const [searching, setSearching]       = useState(false);
  const [searchDone, setSearchDone]     = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // form fields
  const [name, setName]           = useState('');
  const [ticker, setTicker]       = useState('');
  const [shares, setShares]       = useState('');
  const [avgPrice, setAvgPrice]   = useState('');
  const [balance, setBalance]     = useState('');
  const [assetClass, setAssetClass] = useState<string>('주식');
  const [region, setRegion]       = useState<string>(accountIsUsd ? '미국' : '국내');

  const mutation = useMutation({
    mutationFn: createHolding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      onClose();
    },
  });

  // ESC + body scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // debounced search
  useEffect(() => {
    if (mode !== 'stock' || !searchQ.trim()) {
      setResults([]);
      setSearchDone(false);
      return;
    }
    setSearchDone(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      const items = await searchTickers(searchQ);
      setResults(items);
      setSearching(false);
      setSearchDone(true);
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [searchQ, mode]);

  const selectResult = (r: TickerSearchResult) => {
    setName(r.name);
    setTicker(r.ticker);
    setRegion(r.market === 'KR' ? '국내' : '미국');
    if (r.type === 'ETF') setAssetClass('주식');
    setPhase('fill');
  };

  const enterManually = () => {
    setName(searchQ.trim());
    setTicker('');
    setPhase('fill');
  };

  const resetSearch = () => {
    setSearchQ('');
    setResults([]);
    setSearchDone(false);
    setName('');
    setTicker('');
    setPhase('search');
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setPhase('search');
    setSearchQ('');
    setResults([]);
    setSearchDone(false);
    setName('');
    setTicker('');
    if (m === 'cash' && assetClass === '주식') setAssetClass('현금');
    if (m === 'stock' && assetClass === '현금') setAssetClass('주식');
  };

  const balanceN = parseFloat(balance.replace(/,/g, ''));
  const canSave =
    name.trim().length > 0 &&
    (mode === 'stock' || (Number.isFinite(balanceN) && balanceN > 0));

  const save = () => {
    if (!canSave) return;
    if (mode === 'cash') {
      mutation.mutate({
        account_name: account.name,
        name: name.trim(),
        snapshot_value_krw: !accountIsUsd ? balanceN : undefined,
        snapshot_value_usd: accountIsUsd ? balanceN : undefined,
        asset_class: assetClass,
        region: accountIsUsd ? '미국' : '국내',
      });
      return;
    }
    const sharesN = parseFloat(shares);
    const avgN    = parseFloat(avgPrice);
    mutation.mutate({
      account_name: account.name,
      name: name.trim(),
      ticker: ticker.trim() || null,
      shares: Number.isFinite(sharesN) ? sharesN : null,
      avg_price_krw: !accountIsUsd && Number.isFinite(avgN) ? avgN : undefined,
      avg_price_usd:  accountIsUsd && Number.isFinite(avgN) ? avgN : undefined,
      asset_class: assetClass,
      region,
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
        aria-label="자산 추가"
        className="modal-content mobile-sheet bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-toss-card px-5 pt-5 pb-3 flex items-start justify-between z-10">
          <div>
            <p className="text-xs text-toss-text-tertiary">{account.name}</p>
            <h2 className="text-lg font-bold text-toss-text-primary">자산 추가</h2>
          </div>
          <button onClick={onClose} aria-label="닫기" className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95">
            <X size={18} className="text-toss-text-secondary" />
          </button>
        </div>

        {/* 모드 탭 */}
        <div className="px-5 pt-1 pb-3">
          <div role="tablist" aria-label="자산 종류" className="grid grid-cols-2 gap-2">
            <ModeTab active={mode === 'stock'} onClick={() => switchMode('stock')} icon={<TrendingUp size={16} />} title="주식·ETF" desc="종목 검색" />
            <ModeTab active={mode === 'cash'}  onClick={() => switchMode('cash')}  icon={<Landmark size={16} />}   title="예적금·현금" desc="잔액 직접입력" />
          </div>
        </div>

        <div className="px-5 py-2 space-y-4 pb-4">

          {/* ── 주식 모드: 검색 페이즈 ── */}
          {mode === 'stock' && phase === 'search' && (
            <>
              {/* 검색 입력 */}
              <label className="search-field">
                <Search size={16} className="shrink-0" />
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="종목명 또는 티커 (예: 코스피, TIGER, QQQ)"
                  className="min-w-0 flex-1 bg-transparent text-sm text-toss-text-primary outline-none"
                  autoFocus
                />
                {searching
                  ? <LoaderCircle size={16} className="shrink-0 animate-spin text-toss-blue" />
                  : searchQ && (
                    <button onClick={() => { setSearchQ(''); setResults([]); setSearchDone(false); }} aria-label="지우기">
                      <X size={14} className="text-toss-text-tertiary" />
                    </button>
                  )
                }
              </label>

              {/* 검색 결과 */}
              {results.length > 0 && (
                <div className="rounded-2xl border border-toss-border overflow-hidden divide-y divide-toss-border/60">
                  {results.map((r) => (
                    <button
                      key={r.symbol}
                      type="button"
                      onClick={() => selectResult(r)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-toss-bg active:bg-toss-bg transition-colors"
                    >
                      <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-[10px] font-black ${r.market === 'KR' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                        {r.market}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-toss-text-primary leading-tight truncate">{r.name}</p>
                        <p className="text-[11px] text-toss-text-tertiary mt-0.5">{r.ticker} · {r.type === 'ETF' ? 'ETF' : '주식'}</p>
                      </div>
                      <ChevronRight size={15} className="text-toss-text-tertiary shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {/* 결과 없음 */}
              {searchDone && results.length === 0 && (
                <p className="text-sm text-toss-text-tertiary text-center py-2">검색 결과가 없어요.</p>
              )}

              {/* 직접 입력 */}
              {searchQ.trim().length >= 1 && !searching && (
                <button
                  type="button"
                  onClick={enterManually}
                  className="w-full py-3 rounded-xl text-[13px] font-semibold text-toss-text-secondary text-center border border-dashed border-toss-border hover:border-toss-blue hover:text-toss-blue transition-colors"
                >
                  "{searchQ.trim()}" 직접 입력하기
                </button>
              )}

              {/* 첫 안내 */}
              {!searchQ && (
                <p className="text-xs text-toss-text-tertiary text-center py-3">
                  종목명을 입력하면 자동으로 검색해요.<br />
                  국내 ETF(KODEX·TIGER·SOL 등)와 미국 주식 모두 지원해요.
                </p>
              )}
            </>
          )}

          {/* ── 주식 모드: 폼 페이즈 ── */}
          {mode === 'stock' && phase === 'fill' && (
            <>
              {/* 선택된 종목 카드 */}
              <div className="flex items-center gap-3 px-4 py-3 bg-toss-blue-soft rounded-2xl">
                <div className="w-10 h-10 rounded-[12px] bg-toss-blue/15 flex items-center justify-center shrink-0">
                  <TrendingUp size={18} className="text-toss-blue" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-toss-text-primary truncate">{name || '종목명 미입력'}</p>
                  {ticker && <p className="text-[11px] text-toss-text-tertiary mt-0.5">{ticker}</p>}
                </div>
                <button
                  type="button"
                  onClick={resetSearch}
                  className="text-xs font-bold text-toss-blue shrink-0 px-2 py-1 rounded-lg hover:bg-toss-blue/10 transition-colors"
                >
                  바꾸기
                </button>
              </div>

              {/* 이름 편집 (직접 입력 시 또는 검색 결과 수정용) */}
              <Field label="종목 이름">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-toss-bg rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-toss-blue"
                  placeholder="예: TIGER 미국나스닥100"
                />
              </Field>

              {/* 티커 */}
              <Field label="티커 (가격 자동 조회용)">
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-toss-blue uppercase"
                  placeholder={accountIsUsd ? '예: QQQ' : '예: 381170'}
                />
              </Field>

              {/* 수량 / 평단가 */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="보유 수량">
                  <input
                    type="number"
                    step="any"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-toss-blue"
                    placeholder="0"
                  />
                </Field>
                <Field label={`평단가 (${accountIsUsd ? 'USD' : 'KRW'})`}>
                  <input
                    type="number"
                    step="any"
                    value={avgPrice}
                    onChange={(e) => setAvgPrice(e.target.value)}
                    className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-toss-blue"
                    placeholder="0"
                  />
                </Field>
              </div>

              {/* 자산군 */}
              <Field label="자산군">
                <div className="flex flex-wrap gap-2">
                  {ASSET_CLASSES.map((c) => (
                    <Chip key={c} active={assetClass === c} onClick={() => setAssetClass(c)}>{c}</Chip>
                  ))}
                </div>
              </Field>

              {/* 지역 */}
              <Field label="지역">
                <div className="flex flex-wrap gap-2">
                  {REGIONS.map((r) => (
                    <Chip key={r} active={region === r} onClick={() => setRegion(r)}>{r}</Chip>
                  ))}
                </div>
              </Field>
            </>
          )}

          {/* ── 현금 모드 ── */}
          {mode === 'cash' && (
            <>
              <Field label="이름 *">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-toss-bg rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-toss-blue"
                  placeholder="예: IBK 청년도약계좌"
                  autoFocus
                />
              </Field>

              <Field label={`현재 잔액 (${accountIsUsd ? 'USD' : 'KRW'}) *`}>
                <input
                  inputMode="numeric"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-toss-blue"
                  placeholder="0"
                />
                {Number.isFinite(balanceN) && balanceN > 0 && (
                  <p className="text-[12px] text-toss-text-secondary mt-1.5">
                    {balanceN.toLocaleString('ko-KR')} {accountIsUsd ? 'USD' : '원'}
                  </p>
                )}
                <p className="text-[11px] text-toss-text-tertiary mt-1">
                  적금·예금·CMA처럼 가격이 없는 자산은 현재 잔액만 입력하면 돼요.
                </p>
              </Field>

              <Field label="자산군">
                <div className="flex flex-wrap gap-2">
                  {ASSET_CLASSES.map((c) => (
                    <Chip key={c} active={assetClass === c} onClick={() => setAssetClass(c)}>{c}</Chip>
                  ))}
                </div>
              </Field>
            </>
          )}

          {mutation.isError && (
            <p className="text-xs text-toss-up">{(mutation.error as Error).message}</p>
          )}
        </div>

        {/* 하단 버튼 */}
        {(mode === 'cash' || phase === 'fill') && (
          <div className="sticky bottom-0 bg-toss-card px-5 pt-3 pb-5 border-t border-toss-border flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-toss-bg text-toss-text-primary font-semibold active:scale-[0.98]"
            >
              취소
            </button>
            <button
              onClick={save}
              disabled={mutation.isPending || !canSave}
              className="flex-[2] py-3 rounded-xl bg-toss-blue text-white font-semibold disabled:opacity-50 active:scale-[0.98]"
            >
              {mutation.isPending ? '추가 중...' : '추가하기'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeTab({ active, onClick, icon, title, desc }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-col items-start gap-1 px-3.5 py-3 rounded-2xl border text-left transition-all ${
        active ? 'border-toss-blue bg-toss-blue/10' : 'border-toss-border bg-toss-bg hover:border-toss-blue/40'
      }`}
    >
      <span className={`flex items-center gap-1.5 ${active ? 'text-toss-blue' : 'text-toss-text-secondary'}`}>
        {icon}
        <span className="text-[13px] font-bold">{title}</span>
      </span>
      <span className="text-[11px] text-toss-text-tertiary">{desc}</span>
    </button>
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

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
        active ? 'bg-toss-blue text-white' : 'bg-toss-bg text-toss-text-secondary'
      }`}
    >
      {children}
    </button>
  );
}
