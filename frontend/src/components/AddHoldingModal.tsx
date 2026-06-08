import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { createHolding } from '../api';
import type { AccountData } from '../types';

interface Props {
  account: AccountData;
  onClose: () => void;
}

const ASSET_CLASSES = ['주식', '채권', '혼합', '현금', '대체투자'];
const REGIONS = ['미국', '국내', '글로벌', '신흥국', '기타'];

export default function AddHoldingModal({ account, onClose }: Props) {
  const queryClient = useQueryClient();
  const accountIsUsd = account.currency === 'USD';

  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
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

  const save = () => {
    if (!name.trim()) return;
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
        className="modal-content bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-toss-card px-5 pt-5 pb-3 flex items-start justify-between">
          <div>
            <p className="text-xs text-toss-text-tertiary">{account.name}</p>
            <h2 className="text-lg font-bold text-toss-text-primary">종목 추가</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95"
          >
            <X size={18} className="text-toss-text-secondary" />
          </button>
        </div>

        <div className="px-5 py-2 space-y-4">
          <Field label="종목 이름 *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
              placeholder="예: TIGER 미국나스닥100"
              autoFocus
            />
          </Field>

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

          <Field label="자산군">
            <div className="flex flex-wrap gap-2">
              {ASSET_CLASSES.map((c) => (
                <Chip key={c} active={assetClass === c} onClick={() => setAssetClass(c)}>
                  {c}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="지역">
            <div className="flex flex-wrap gap-2">
              {REGIONS.map((r) => (
                <Chip key={r} active={region === r} onClick={() => setRegion(r)}>
                  {r}
                </Chip>
              ))}
            </div>
          </Field>

          {mutation.isError && (
            <p className="text-xs text-toss-up">추가 실패: {(mutation.error as Error).message}</p>
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
            disabled={mutation.isPending || !name.trim()}
            className="flex-[2] py-3 rounded-xl bg-toss-blue text-white font-semibold disabled:opacity-50 active:scale-[0.98]"
          >
            {mutation.isPending ? '추가 중...' : '추가하기'}
          </button>
        </div>
      </div>
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
