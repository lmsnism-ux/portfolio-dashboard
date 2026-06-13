import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { createAccount } from '../api';

interface Props {
  onClose: () => void;
}

const TYPES = [
  { value: '기본계좌', label: '주식 계좌' },
  { value: 'ISA', label: 'ISA' },
  { value: '연금저축', label: '연금저축' },
  { value: 'IRP', label: 'IRP (퇴직연금)' },
  { value: '적금', label: '적금' },
  { value: '예금', label: '예금' },
];

export default function AddAccountModal({ onClose }: Props) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [type, setType] = useState<string>('기본계좌');
  const [currency, setCurrency] = useState<string>('KRW');
  const [etfLimit, setEtfLimit] = useState<string>(''); // IRP 한도

  const mutation = useMutation({
    mutationFn: createAccount,
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

  const isIRP = type === 'IRP';

  const save = () => {
    if (!name.trim()) return;
    const limitNum = parseFloat(etfLimit);
    mutation.mutate({
      name: name.trim(),
      type,
      currency,
      etf_limit: isIRP && Number.isFinite(limitNum) ? limitNum : null,
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
        aria-label="계좌 추가"
        className="modal-content bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-toss-card px-5 pt-5 pb-3 flex items-start justify-between">
          <h2 className="text-lg font-bold text-toss-text-primary">계좌 추가</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95">
            <X size={18} className="text-toss-text-secondary" />
          </button>
        </div>

        <div className="px-5 py-2 space-y-4">
          <Field label="계좌명 *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-toss-bg rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-toss-blue"
              placeholder="예: 미래에셋 ISA"
              autoFocus
            />
          </Field>

          <Field label="계좌 유형">
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(t => (
                <Chip key={t.value} active={type === t.value} onClick={() => setType(t.value)}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="기본 통화">
            <div className="flex gap-2">
              {['KRW', 'USD'].map(c => (
                <Chip key={c} active={currency === c} onClick={() => setCurrency(c)}>
                  {c}
                </Chip>
              ))}
            </div>
          </Field>

          {isIRP && (
            <Field label="ETF 한도 비율 (선택)">
              <div className="flex items-center bg-toss-bg rounded-xl px-4 py-3">
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={etfLimit}
                  onChange={(e) => setEtfLimit(e.target.value)}
                  className="num flex-1 bg-transparent focus:outline-none text-base"
                  placeholder="0.7"
                />
                <span className="text-sm text-toss-text-tertiary ml-2">(예: 0.7)</span>
              </div>
              <p className="text-[11px] text-toss-text-tertiary mt-1">
                IRP/DC 위험자산 한도. 일반적으로 0.7 (70%).
              </p>
            </Field>
          )}

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
      className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
        active ? 'bg-toss-blue text-white' : 'bg-toss-bg text-toss-text-secondary'
      }`}
    >
      {children}
    </button>
  );
}
