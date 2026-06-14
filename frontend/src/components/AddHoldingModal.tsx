import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, TrendingUp, Landmark } from 'lucide-react';
import { createHolding } from '../api';
import type { AccountData } from '../types';

interface Props {
  account: AccountData;
  onClose: () => void;
}

type Mode = 'stock' | 'cash';

const ASSET_CLASSES = ['주식', '채권', '혼합', '현금', '대체투자'];
const REGIONS = ['미국', '국내', '글로벌', '신흥국', '기타'];

export default function AddHoldingModal({ account, onClose }: Props) {
  const queryClient = useQueryClient();
  const accountIsUsd = account.currency === 'USD';

  // 적금/예금/현금 계좌면 기본을 '잔액 입력' 모드로
  const isCashAccount = ['적금', '예금', '현금', 'CMA', '저축'].some((t) => account.type.includes(t));
  const [mode, setMode] = useState<Mode>(isCashAccount ? 'cash' : 'stock');

  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [balance, setBalance] = useState('');
  const [assetClass, setAssetClass] = useState<string>('주식');
  const [region, setRegion] = useState<string>(accountIsUsd ? '미국' : '국내');

  const mutation = useMutation({
    mutationFn: createHolding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
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

  // 모드 전환 시 자산군 기본값 보정
  const switchMode = (m: Mode) => {
    setMode(m);
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
      // 예적금·현금: 잔액만 직접 입력. 티커·수량 없음 → 백엔드가 스냅샷으로 처리.
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
    const avgN = parseFloat(avgPrice);
    mutation.mutate({
      account_name: account.name,
      name: name.trim(),
      ticker: ticker.trim() || null,
      shares: Number.isFinite(sharesN) ? sharesN : null,
      avg_price_krw: !accountIsUsd && Number.isFinite(avgN) ? avgN : undefined,
      avg_price_usd: accountIsUsd && Number.isFinite(avgN) ? avgN : undefined,
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
        className="modal-content bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-toss-card px-5 pt-5 pb-3 flex items-start justify-between z-10">
          <div>
            <p className="text-xs text-toss-text-tertiary">{account.name}</p>
            <h2 className="text-lg font-bold text-toss-text-primary">자산 추가</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95"
          >
            <X size={18} className="text-toss-text-secondary" />
          </button>
        </div>

        {/* 종류 선택 — 주식·ETF vs 예적금·현금 */}
        <div className="px-5 pt-1 pb-3">
          <div role="tablist" aria-label="자산 종류" className="grid grid-cols-2 gap-2">
            <ModeTab
              active={mode === 'stock'}
              onClick={() => switchMode('stock')}
              icon={<TrendingUp size={16} />}
              title="주식·ETF"
              desc="가격 자동조회"
            />
            <ModeTab
              active={mode === 'cash'}
              onClick={() => switchMode('cash')}
              icon={<Landmark size={16} />}
              title="예적금·현금"
              desc="잔액 직접입력"
            />
          </div>
        </div>

        <div className="px-5 py-2 space-y-4">
          <Field label={mode === 'cash' ? '이름 *' : '종목 이름 *'}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
              placeholder={mode === 'cash' ? '예: IBK 청년도약계좌' : '예: TIGER 미국나스닥100'}
              autoFocus
            />
          </Field>

          {mode === 'cash' ? (
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
          ) : (
            <>
              <Field label="티커 (선택, 가격 자동 조회용)">
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue uppercase"
                  placeholder={accountIsUsd ? '예: QQQ' : '예: 381170'}
                />
                <p className="text-[11px] text-toss-text-tertiary mt-1">
                  {accountIsUsd
                    ? '미국 주식: Yahoo Finance 심볼 (QLD, QQQ 등)'
                    : '한국 ETF: 종목코드 6자리 (381170 등)'}
                </p>
              </Field>

              <div className="grid grid-cols-2 gap-3">
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
                <Field label={`평단가 (${accountIsUsd ? 'USD' : 'KRW'})`}>
                  <input
                    type="number"
                    step="any"
                    value={avgPrice}
                    onChange={(e) => setAvgPrice(e.target.value)}
                    className="num w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
                    placeholder="0"
                  />
                </Field>
              </div>
            </>
          )}

          <Field label="자산군">
            <div className="flex flex-wrap gap-2">
              {ASSET_CLASSES.map((c) => (
                <Chip key={c} active={assetClass === c} onClick={() => setAssetClass(c)}>
                  {c}
                </Chip>
              ))}
            </div>
          </Field>

          {mode === 'stock' && (
            <Field label="지역">
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <Chip key={r} active={region === r} onClick={() => setRegion(r)}>
                    {r}
                  </Chip>
                ))}
              </div>
            </Field>
          )}

          {mutation.isError && (
            <p className="text-xs text-toss-down">추가 실패: {(mutation.error as Error).message}</p>
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
            disabled={mutation.isPending || !canSave}
            className="flex-[2] py-3 rounded-xl bg-toss-blue text-white font-semibold disabled:opacity-50 active:scale-[0.98]"
          >
            {mutation.isPending ? '추가 중...' : '추가하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-col items-start gap-1 px-3.5 py-3 rounded-2xl border text-left transition-all ${
        active
          ? 'border-toss-blue bg-toss-blue/10'
          : 'border-toss-border bg-toss-bg hover:border-toss-blue/40'
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

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
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
