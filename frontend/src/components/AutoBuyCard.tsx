import { CalendarClock } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AutoBuySummary } from '../types';
import { patchHolding } from '../api';

interface Props {
  items: AutoBuySummary[];
}

export default function AutoBuyCard({ items }: Props) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: ({
      account_name,
      holding_key,
      enabled,
    }: {
      account_name: string;
      holding_key: string;
      enabled: boolean;
    }) =>
      patchHolding({
        account_name,
        holding_key,
        auto_buy: { enabled },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });

  if (!items.length) return null;

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-full bg-toss-blue-soft flex items-center justify-center">
          <CalendarClock size={15} className="text-toss-blue" />
        </div>
        <h3 className="text-sm font-semibold text-toss-text-primary">자동매수 예정</h3>
        <span className="ml-auto text-[11px] text-toss-text-tertiary">{items.length}건</span>
      </div>
      <ul className="divide-y divide-toss-border">
        {items.map((item, i) => (
          <li
            key={i}
            className={`py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3 transition-opacity ${
              item.enabled ? '' : 'opacity-50'
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-toss-text-primary text-[14px] truncate">
                {item.name}
              </p>
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
              <span
                className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${
                  item.enabled
                    ? 'bg-toss-blue-soft text-toss-blue'
                    : 'bg-toss-bg text-toss-text-tertiary'
                }`}
              >
                {item.next_date}
              </span>
              <Toggle
                checked={item.enabled}
                disabled={toggleMutation.isPending}
                onChange={(next) =>
                  toggleMutation.mutate({
                    account_name: item.account_name,
                    holding_key: item.holding_key,
                    enabled: next,
                  })
                }
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-toss-text-tertiary mt-3">
        ⓘ 실제 체결은 증권사 자동매수로 진행됩니다. 위 숫자는 현재가 기준 예상치예요.
      </p>
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
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}
