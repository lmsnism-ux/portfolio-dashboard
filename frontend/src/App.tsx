import { Suspense, lazy, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPortfolio, triggerRefresh, reorderAccounts } from './api';
import Header from './components/Header';
import AutoBuyCard from './components/AutoBuyCard';
import RealEstateCard from './components/RealEstateCard';
import CashCard from './components/CashCard';
import HistoryChart from './components/HistoryChart';
import GoalCard from './components/GoalCard';
import AllocationCard from './components/AllocationCard';
import HoldingsBar from './components/HoldingsBar';
import HoldingsList from './components/HoldingsList';
import { DashboardSkeleton } from './components/Skeletons';
import { isLongTermAccount } from './utils';
import { useAlertTriggers } from './hooks/useAlertTriggers';
import type { AccountData, HoldingData } from './types';

// 부가 컴포넌트: 첫 화면에 즉시 필요 없음 → lazy load
const RebalanceCard     = lazy(() => import('./components/RebalanceCard'));
const ProfitHeatmap     = lazy(() => import('./components/ProfitHeatmap'));
const EditHoldingModal  = lazy(() => import('./components/EditHoldingModal'));
const AddHoldingModal   = lazy(() => import('./components/AddHoldingModal'));
const AddAccountModal   = lazy(() => import('./components/AddAccountModal'));
const TradeModal        = lazy(() => import('./components/TradeModal'));

const HIDE_KEY = 'pd_hide_assets';
const DARK_KEY = 'pd_dark';
const RE_KEY = 'pd_realestate_show';
const DC_KEY = 'pd_dc_show';
const LOAN_KEY = 'pd_loan_on';

export default function App() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem(DARK_KEY);
    if (saved !== null) return saved === '1';
    return true; // 다크 모드 기본값
  });
  const [hideAssets, setHideAssets] = useState(
    () => localStorage.getItem(HIDE_KEY) === '1',
  );
  const [editing, setEditing] = useState<{ account: AccountData; holding: HoldingData } | null>(
    null,
  );
  const [adding, setAdding] = useState<AccountData | null>(null);
  const [addingAccount, setAddingAccount] = useState(false);
  const [trading, setTrading] = useState<{ account: AccountData; holding: HoldingData } | null>(null);
  const [realEstateOn, setRealEstateOn] = useState(() => localStorage.getItem(RE_KEY) !== '0');
  const [loanOn, setLoanOn] = useState(() => localStorage.getItem(LOAN_KEY) !== '0');
  const [dcOn, setDcOn] = useState(() => localStorage.getItem(DC_KEY) !== '0');

  const handleRealEstateToggle = (on: boolean) => {
    setRealEstateOn(on);
    localStorage.setItem(RE_KEY, on ? '1' : '0');
  };

  const handleLoanToggle = (on: boolean) => {
    setLoanOn(on);
    localStorage.setItem(LOAN_KEY, on ? '1' : '0');
  };

  const handleDcToggle = () => {
    setDcOn(prev => {
      const next = !prev;
      localStorage.setItem(DC_KEY, next ? '1' : '0');
      return next;
    });
  };

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

  // 자동매수 D-1 + 가격 변동 임계값 알림 (메뉴에서 활성화 시)
  useAlertTriggers(data);

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
        realEstateOn={realEstateOn}
        loanOn={loanOn}
        dcOn={dcOn}
        onToggleDark={() => setDark((d) => !d)}
        onToggleHide={() => setHideAssets((h) => !h)}
        onRefresh={() => refreshMutation.mutate()}
        onToggleDc={handleDcToggle}
        isRefreshing={refreshMutation.isPending}
      />

      <main className="max-w-7xl mx-auto px-4 py-5 space-y-4">
        {/* 투자 수익 + 기간별 수익분석 + 자산 추이 */}
        <HistoryChart data={data} hideAssets={hideAssets} />

        {/* 부동산 · 대출 - HistoryChart 바로 아래 */}
        {data.real_estate && (
          <RealEstateCard
            data={data.real_estate}
            hideAssets={hideAssets}
            visible={realEstateOn}
            loanOn={loanOn}
            onToggle={handleRealEstateToggle}
            onToggleLoan={handleLoanToggle}
          />
        )}

        {/* 현금·예금 */}
        {data.cash_assets && data.cash_assets.items.length > 0 && (
          <CashCard
            data={data.cash_assets}
            cashTotal={data.cash_total_krw ?? 0}
            hideAssets={hideAssets}
          />
        )}

        {/* 도넛 차트 3개 나란히 */}
        <AllocationCard data={data} hideAssets={hideAssets} />

        {/* 종목별 비중 바 차트 */}
        {data.top_holdings?.length > 0 && (
          <HoldingsBar data={data} hideAssets={hideAssets} />
        )}

        {/* 목표/자동매수 */}
        {(() => {
          const longTermKrw = data.accounts
            .filter(a => isLongTermAccount(a.type))
            .reduce((s, a) => s + a.value_krw, 0);
          const dcKrw = dcOn ? 0 : (data.dc_value_krw ?? 0);
          const reEquity = data.real_estate_equity_krw ?? 0;
          return (
            <GoalCard
              goalKrw={data.goal_krw}
              currentKrw={data.total_value_krw - reEquity - dcKrw}
              progressPct={data.goal_progress_pct}
              hideAssets={hideAssets}
              longTermKrw={longTermKrw}
            />
          );
        })()}

        <AutoBuyCard items={data.auto_buy_items ?? []} accounts={data.accounts} />

        {/* 리밸런싱 도우미 + 히트맵 (lazy load) */}
        <Suspense fallback={null}>
          <RebalanceCard data={data} hideAssets={hideAssets} />
          <ProfitHeatmap />
        </Suspense>

        {/* 보유 종목 - 카테고리별 항상 펼쳐진 뷰 + 편집 모드 */}
        <HoldingsList
          data={data}
          hideAssets={hideAssets}
          onEdit={(acc, h) => setEditing({ account: acc, holding: h })}
          onAdd={(acc) => setAdding(acc)}
          onTrade={(acc, h) => setTrading({ account: acc, holding: h })}
          onMoveAccount={moveAccount}
          onAddAccount={() => setAddingAccount(true)}
        />

        <div className="h-4" />
      </main>

      <Suspense fallback={null}>
        {editing && (
          <EditHoldingModal
            account={editing.account}
            holding={editing.holding}
            onClose={() => setEditing(null)}
          />
        )}
        {adding && <AddHoldingModal account={adding} onClose={() => setAdding(null)} />}
        {addingAccount && <AddAccountModal onClose={() => setAddingAccount(false)} />}
        {trading && (
          <TradeModal
            account={trading.account}
            holding={trading.holding}
            onClose={() => setTrading(null)}
          />
        )}
      </Suspense>
    </div>
  );
}
