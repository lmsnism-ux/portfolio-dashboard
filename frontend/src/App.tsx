import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPortfolio, triggerRefresh, reorderAccounts } from './api';
import Header from './components/Header';
import AccountTable from './components/AccountTable';
import AutoBuyCard from './components/AutoBuyCard';
import HistoryChart from './components/HistoryChart';
import GoalCard from './components/GoalCard';
import AllocationCard from './components/AllocationCard';
import EditHoldingModal from './components/EditHoldingModal';
import AddHoldingModal from './components/AddHoldingModal';
import { DashboardSkeleton } from './components/Skeletons';
import { fmtKRW } from './utils';
import type { AccountData, HoldingData } from './types';

const HIDE_KEY = 'pd_hide_assets';
const DARK_KEY = 'pd_dark';

export default function App() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem(DARK_KEY);
    if (saved !== null) return saved === '1';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [hideAssets, setHideAssets] = useState(
    () => localStorage.getItem(HIDE_KEY) === '1',
  );
  const [editing, setEditing] = useState<{ account: AccountData; holding: HoldingData } | null>(
    null,
  );
  const [adding, setAdding] = useState<AccountData | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem(DARK_KEY, dark ? '1' : '0');
  }, [dark]);

  useEffect(() => {
    localStorage.setItem(HIDE_KEY, hideAssets ? '1' : '0');
  }, [hideAssets]);

  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['portfolio'],
    queryFn: fetchPortfolio,
    refetchInterval: 7 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: triggerRefresh,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: reorderAccounts,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
  });

  const moveAccount = (idx: number, dir: -1 | 1) => {
    if (!data) return;
    const newOrder = data.accounts.map((a) => a.name);
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    reorderMutation.mutate(newOrder);
  };

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-toss-bg flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-lg font-bold text-toss-text-primary mb-2">데이터를 불러오지 못했어요</p>
          <p className="text-sm text-toss-text-secondary mb-5">
            백엔드 서버(포트 8000)가 실행 중인지 확인해주세요
          </p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['portfolio'] })}
            className="px-5 py-2.5 bg-toss-blue text-white rounded-full text-sm font-semibold hover:opacity-90 active:scale-95 transition-all"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-toss-bg transition-colors">
      <Header
        data={data}
        dark={dark}
        hideAssets={hideAssets}
        onToggleDark={() => setDark((d) => !d)}
        onToggleHide={() => setHideAssets((h) => !h)}
        onRefresh={() => refreshMutation.mutate()}
        isRefreshing={refreshMutation.isPending}
      />

      <main className="max-w-7xl mx-auto px-4 py-5 space-y-4">
        <HistoryChart hideAssets={hideAssets} />

        <GoalCard
          goalKrw={data.goal_krw}
          currentKrw={data.total_value_krw}
          progressPct={data.goal_progress_pct}
          hideAssets={hideAssets}
        />

        {data.auto_buy_items?.length > 0 && <AutoBuyCard items={data.auto_buy_items} />}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {data.account_weights.map((a, i) => (
            <div
              key={i}
              className="bg-toss-card rounded-[var(--radius-toss)] border border-toss-border shadow-[var(--shadow-toss-card)] p-3"
            >
              <p className="text-[11px] text-toss-text-tertiary truncate">{a.name}</p>
              <p className="num font-bold text-toss-text-primary text-sm mt-1">
                {hideAssets ? '••••' : fmtKRW(a.value_krw)}
              </p>
              <p className="num text-[11px] text-toss-blue font-semibold mt-0.5">
                {a.weight.toFixed(1)}%
              </p>
            </div>
          ))}
        </div>

        <AllocationCard data={data} hideAssets={hideAssets} />

        <div className="space-y-3">
          <h2 className="text-sm font-bold text-toss-text-secondary px-1">계좌별 상세</h2>
          {data.accounts.map((account, i) => (
            <AccountTable
              key={account.name}
              account={account}
              hideAssets={hideAssets}
              defaultOpen={i === 0}
              canMoveUp={i > 0}
              canMoveDown={i < data.accounts.length - 1}
              onEdit={(acc, h) => setEditing({ account: acc, holding: h })}
              onAdd={(acc) => setAdding(acc)}
              onMoveUp={() => moveAccount(i, -1)}
              onMoveDown={() => moveAccount(i, 1)}
            />
          ))}
        </div>

        <div className="h-4" />
      </main>

      {editing && (
        <EditHoldingModal
          account={editing.account}
          holding={editing.holding}
          onClose={() => setEditing(null)}
        />
      )}
      {adding && <AddHoldingModal account={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}
