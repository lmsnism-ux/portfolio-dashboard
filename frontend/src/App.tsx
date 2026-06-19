import { Suspense, lazy, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { fetchPortfolio, isAuthError, triggerRefresh, reorderAccounts } from './api';
import Header from './components/Header';
import BottomNav, { type TabKey } from './components/BottomNav';
import MarketIndicesCard from './components/MarketIndicesCard';
import AutoBuyCard from './components/AutoBuyCard';
import RealEstateCard from './components/RealEstateCard';
import CashCard from './components/CashCard';
import HoldingsList from './components/HoldingsList';
import HomeOverview from './components/HomeOverview';
import SettingsPanel from './components/SettingsPanel';
import ApiKeyModal from './components/modals/ApiKeyModal';
import { DashboardSkeleton } from './components/Skeletons';
import ErrorBoundary from './components/ErrorBoundary';
import { isLongTermAccount, fmtKRW, fmtPct, colorClass, applyDisplayToggles } from './utils';
import { STORAGE_KEYS } from './constants';
import HealthBanner from './components/HealthBanner';
import { useAlertTriggers } from './hooks/useAlertTriggers';
import type { AccountData, HoldingData } from './types';
import PublicPortfolio from './components/PublicPortfolio';
import DecisionCenter from './components/DecisionCenter';

// 부가 컴포넌트: 첫 화면에 즉시 필요 없음 → lazy load
const RebalanceCard      = lazy(() => import('./components/RebalanceCard'));
const ProfitHeatmap      = lazy(() => import('./components/ProfitHeatmap'));
const MarketInsightsCard = lazy(() => import('./components/MarketInsightsCard'));
const QuickTradeCard     = lazy(() => import('./components/QuickTradeCard'));
const HistoryChart       = lazy(() => import('./components/HistoryChart'));
const GoalCard           = lazy(() => import('./components/GoalCard'));
const AllocationCard     = lazy(() => import('./components/AllocationCard'));
const TaxOptimizerCard   = lazy(() => import('./components/TaxOptimizerCard'));
const HoldingsBar        = lazy(() => import('./components/HoldingsBar'));
const EditHoldingModal  = lazy(() => import('./components/EditHoldingModal'));
const AddHoldingModal   = lazy(() => import('./components/AddHoldingModal'));
const AddAccountModal   = lazy(() => import('./components/AddAccountModal'));
const TradeModal        = lazy(() => import('./components/TradeModal'));
const PortfolioRiskCard = lazy(() => import('./components/PortfolioRiskCard'));
const ValueReportCard   = lazy(() => import('./components/ValueReportCard'));
const CashFlowCard      = lazy(() => import('./components/CashFlowCard'));
const DecisionJournal   = lazy(() => import('./components/DecisionJournal'));

const { DARK_MODE: DARK_KEY, HIDE_ASSETS: HIDE_KEY, REAL_ESTATE_SHOW: RE_KEY, DC_SHOW: DC_KEY, LOAN_ON: LOAN_KEY } = STORAGE_KEYS;
const TAB_KEY = 'pd_tab';

function PrivateDashboard({ onExit }: { onExit: () => void }) {
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
  const [addingAccount, setAddingAccount] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [trading, setTrading] = useState<{ account: AccountData; holding: HoldingData; side?: 'buy' | 'sell' } | null>(null);
  const [realEstateOn, setRealEstateOn] = useState(() => localStorage.getItem(RE_KEY) !== '0');
  const [loanOn, setLoanOn] = useState(() => localStorage.getItem(LOAN_KEY) !== '0');
  const [dcOn, setDcOn] = useState(() => localStorage.getItem(DC_KEY) !== '0');
  const [tab, setTab] = useState<TabKey>(() => {
    const saved = localStorage.getItem(TAB_KEY);
    return (saved === 'home' || saved === 'assets' || saved === 'analysis' || saved === 'market' || saved === 'more')
      ? saved : 'home';
  });

  const handleTabChange = (next: TabKey) => {
    setTab(next);
    localStorage.setItem(TAB_KEY, next);
  };

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
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    localStorage.setItem(DARK_KEY, dark ? '1' : '0');
  }, [dark]);

  useEffect(() => {
    localStorage.setItem(HIDE_KEY, hideAssets ? '1' : '0');
  }, [hideAssets]);

  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['portfolio'],
    queryFn: fetchPortfolio,
    refetchInterval: 7 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
    // Render 무료 서버가 절전에서 깨어나는 데 30~60초 걸릴 수 있어 넉넉히 재시도
    retry: (failureCount, queryError) => !isAuthError(queryError) && failureCount < 6,
    retryDelay: (i) => Math.min(1000 * 2 ** i, 8000),
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
    const authRequired = isAuthError(error);
    return (
      <div className="min-h-[100dvh] bg-toss-bg flex items-center justify-center px-6">
        <div className="text-center max-w-xs">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-toss-blue-soft flex items-center justify-center">
            <KeyRound size={22} className="text-toss-blue" />
          </div>
          <p className="text-lg font-bold text-toss-text-primary mb-2">
            {authRequired ? 'API 키가 필요해요' : '자산 정보를 불러오지 못했어요'}
          </p>
          <p className="text-sm text-toss-text-secondary mb-5 leading-relaxed">
            {authRequired
              ? '자산 데이터를 보호하기 위해 등록된 API 키를 입력해주세요.'
              : '서버가 시작 중이거나 네트워크 연결이 불안정할 수 있어요. 잠시 후 다시 시도해주세요.'}
          </p>
          <button
            onClick={() => authRequired ? setAuthModalOpen(true) : refetch()}
            className="min-h-12 w-full px-5 bg-toss-blue text-white rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            {authRequired ? 'API 키 입력' : '다시 시도'}
          </button>
          <button onClick={onExit} className="mt-3 min-h-11 w-full text-sm font-semibold text-toss-text-secondary">
            공개 포트폴리오로 돌아가기
          </button>
        </div>
        {authModalOpen && (
          <ApiKeyModal
            onClose={() => {
              setAuthModalOpen(false);
              refetch();
            }}
          />
        )}
      </div>
    );
  }

  const goalCard = (() => {
    const longTermKrw = data.accounts
      .filter(a => isLongTermAccount(a.type))
      .reduce((s, a) => s + a.value_krw, 0);
    const dcKrw = dcOn ? 0 : (data.dc_value_krw ?? 0);
    const reEquity = data.real_estate_equity_krw ?? 0;
    return (
      <GoalCard
        goalKrw={data.goal_krw}
        longGoalKrw={data.long_goal_krw}
        currentKrw={data.total_value_krw - reEquity - dcKrw}
        progressPct={data.goal_progress_pct}
        hideAssets={hideAssets}
        longTermKrw={longTermKrw}
      />
    );
  })();

  // 홈과 동일한 표시 규칙(부동산·대출·퇴직연금 토글)을 자산 탭 헤더에도 적용
  const display = applyDisplayToggles(data, { dcOn, realEstateOn, loanOn });

  return (
    <div className="min-h-screen bg-toss-bg transition-colors">
      <HealthBanner />
      {tab === 'home' && (
        <Header
          data={data}
          hideAssets={hideAssets}
          realEstateOn={realEstateOn}
          loanOn={loanOn}
          dcOn={dcOn}
          onToggleHide={() => setHideAssets((h) => !h)}
          onRefresh={() => refreshMutation.mutate()}
          isRefreshing={refreshMutation.isPending}
        />
      )}
      {tab !== 'home' && (
        <div className="max-w-2xl mx-auto px-5 pt-6 pb-2">
          <h1 className="text-[22px] font-bold text-toss-text-primary">
            {tab === 'assets' ? '내 자산' : tab === 'analysis' ? '자산 분석' : tab === 'market' ? '시장' : '더보기'}
          </h1>
          {tab === 'assets' && (
            <div className="mt-1.5">
              <p className="num text-[32px] font-bold text-toss-text-primary leading-tight">
                {hideAssets ? '•••••' : fmtKRW(display.total)}
              </p>
              {!hideAssets && (
                <p className={`num text-sm font-semibold mt-0.5 ${colorClass(display.dayChg)}`}>
                  오늘{' '}
                  {display.dayChg >= 0 ? '+' : ''}
                  {fmtKRW(display.dayChg)}
                  {` (${fmtPct(display.dayPct)})`}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <main key={tab} className="tab-screen max-w-2xl mx-auto px-4 py-5 space-y-4 pb-24">
        {tab === 'home' && (
          <>
            <DecisionCenter data={data} hideAssets={hideAssets} onOpenAnalysis={() => handleTabChange('analysis')} />
            <HomeOverview
              data={data}
              hideAssets={hideAssets}
              onOpenAssets={() => handleTabChange('assets')}
              onOpenAnalysis={() => handleTabChange('analysis')}
            />
          </>
        )}

        {tab === 'assets' && (
          <>
            <Suspense fallback={null}>
              <QuickTradeCard
                data={data}
                onTrade={(acc, h, side) => setTrading({ account: acc, holding: h, side })}
                onEdit={(acc, h) => setEditing({ account: acc, holding: h })}
              />
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

            {/* 종목별 비중 바 차트 */}
            {data.top_holdings?.length > 0 && (
              <Suspense fallback={null}>
                <HoldingsBar data={data} hideAssets={hideAssets} />
              </Suspense>
            )}

            {/* 부동산 · 대출 */}
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
          </>
        )}

        {tab === 'analysis' && (
          <Suspense fallback={<div className="skeleton h-72 rounded-[var(--radius-toss-lg)]" />}>
            <HistoryChart
              data={data}
              hideAssets={hideAssets}
              dcOn={dcOn}
              realEstateOn={realEstateOn}
              loanOn={loanOn}
            />
            <PortfolioRiskCard data={data} />
            <ValueReportCard data={data} hideAssets={hideAssets} />
            <AllocationCard data={data} hideAssets={hideAssets} />
            <TaxOptimizerCard tax={data.tax_optimization} hideAssets={hideAssets} />
            {goalCard}
            <RebalanceCard data={data} hideAssets={hideAssets} />
          </Suspense>
        )}

        {tab === 'market' && (
          <>
            <MarketIndicesCard />
            <Suspense fallback={null}>
              <MarketInsightsCard />
              <ProfitHeatmap />
            </Suspense>
          </>
        )}

        {tab === 'more' && (
          <>
            <SettingsPanel
              dark={dark}
              hideAssets={hideAssets}
              dcOn={dcOn}
              realEstateOn={realEstateOn}
              loanOn={loanOn}
              onToggleDark={() => setDark((d) => !d)}
              onToggleHide={() => setHideAssets((h) => !h)}
              onToggleDc={handleDcToggle}
              onToggleRealEstate={() => handleRealEstateToggle(!realEstateOn)}
              onToggleLoan={() => handleLoanToggle(!loanOn)}
              onLogout={onExit}
            />
            <AutoBuyCard items={data.auto_buy_items ?? []} accounts={data.accounts} />
            <Suspense fallback={null}><CashFlowCard /></Suspense>
            <Suspense fallback={null}><DecisionJournal /></Suspense>
          </>
        )}

        <div className="h-4" />
      </main>

      <BottomNav active={tab} onChange={handleTabChange} />

      <ErrorBoundary name="모달">
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
              initialSide={trading.side}
              onClose={() => setTrading(null)}
            />
          )}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash === '#/app' ? 'app' : 'public');

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash === '#/app' ? 'app' : 'public');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (route !== 'app') {
    return <PublicPortfolio onOpenPrivate={() => { window.location.hash = '/app'; }} />;
  }

  return <PrivateDashboard onExit={() => { window.location.hash = '/'; }} />;
}
