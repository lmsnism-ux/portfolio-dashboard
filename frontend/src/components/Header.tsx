import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Moon, Sun, Eye, EyeOff, AlertTriangle, MoreVertical, Key, ChevronDown, ChevronUp, Bell, Pencil, ArrowUp, ArrowDown, EyeOff as Hide, Trash2, Plus } from 'lucide-react';
import type { HoldingData, PortfolioSummary } from '../types';
import { fmtKRW, fmtKRWFull, fmtPct, colorClass, relativeTime, fmtAbsTime, classifyHolding, getMarketStatus, applyDisplayToggles, type Exchange, type HoldingClass } from '../utils';
import { fetchSparkline, getApiKey, setApiKey, fetchMarketIndices, deleteHolding } from '../api';
import {
  loadSettings as loadNotifSettings,
  saveSettings as saveNotifSettings,
  requestPermission,
  getPermission,
  type NotifSettings,
} from '../notifications';

const TickerChartModal = lazy(() => import('./TickerChartModal'));

// 시장 현황 종목 사용자 정의 순서/숨김 저장 키
const MARKET_ORDER_KEY = 'pd_market_order';
const MARKET_HIDDEN_KEY = 'pd_market_hidden';

const ETF_BRAND_RE = /^(TIGER|KODEX|KBSTAR|HANARO|SOL|ACE|ARIRANG|KOSEF|WOORI|MIRAE)\s+/i;

function etfDisplayName(name: string): string {
  return name
    .replace(ETF_BRAND_RE, '')
    .replace(/\s*INDXX\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Props {
  data: PortfolioSummary;
  dark: boolean;
  hideAssets: boolean;
  realEstateOn: boolean;
  loanOn: boolean;
  dcOn: boolean;
  onToggleDark: () => void;
  onToggleHide: () => void;
  onRefresh: () => void;
  onToggleDc: () => void;
  isRefreshing: boolean;
  /** 편집 모드에서 + 누를 때 어느 계좌로 추가할지 선택 모달을 띄움 */
  onAddHolding?: () => void;
}

interface TickerItem {
  name: string;
  ticker: string | null;
  pct: number;
  krwChange: number | null;
  price: string | null;
  priceLabel: string;
  category: HoldingClass;
  exchange: Exchange;
  shortLabel: string;
  accentColor: string;
  fetchedAt: string | null;
}

// 한국장 내부 노출 순서: 국내 상장 해외 ETF → TDF·혼합 → 국내 ETF (사용자 요청: 국내 ETF 최하단)
const CATEGORY_ORDER: Record<HoldingClass, number> = {
  kr_listed_overseas: 1,
  mixed_tdf: 2,
  kr_domestic: 3,
  us_direct: 4,
  cash: 5,
};

// 미국장 해외 직투 사용자 정의 순서: QLD → TQQQ
const US_TICKER_PRIORITY: Record<string, number> = { QLD: 1, TQQQ: 2 };
function usTickerOrder(name: string): number {
  const upper = name.toUpperCase();
  for (const [t, ord] of Object.entries(US_TICKER_PRIORITY)) {
    if (upper === t || upper.startsWith(t + ' ') || upper.includes('(' + t + ')')) return ord;
  }
  return 99;
}

function Sparkline({ data, pct }: { data: number[]; pct: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 44, H = 18;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={W} height={H} className="opacity-75 shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={pct >= 0 ? '#2daf4e' : '#f03e3e'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 시장(한국장/미국장) 상태 + 대표 지수 큰 카드 */
function MarketStatusCard({
  exchange,
  indexLabel,
  indexValue,
  indexChange,
  indexChangePct,
  sparkData,
  indexLoading,
  onClick,
}: {
  exchange: Exchange;
  indexLabel: string;
  indexValue: number | null;        // 실제 지수 포인트 (예: 2,650.45)
  indexChange: number | null;       // 전일 대비 변동 포인트 (예: +12.3)
  indexChangePct: number | null;    // 전일 대비 변동률 (%)
  sparkData?: number[];
  indexLoading?: boolean;
  onClick?: () => void;
}) {
  const status = getMarketStatus(exchange);
  const isKR = exchange === 'KR';
  const flag = isKR ? '🇰🇷' : '🇺🇸';
  const title = isKR ? '한국장' : '미국장';

  const stateConfig = {
    open:   { dot: 'bg-emerald-500', dotAnim: 'animate-pulse', text: 'text-emerald-500' },
    pre:    { dot: 'bg-amber-400',   dotAnim: '',              text: 'text-amber-500' },
    post:   { dot: 'bg-toss-text-tertiary/60', dotAnim: '',    text: 'text-toss-text-tertiary' },
    closed: { dot: 'bg-toss-text-tertiary/40', dotAnim: '',    text: 'text-toss-text-tertiary' },
  }[status.state];

  const hasIndex = indexValue !== null;
  const sign = indexChange !== null && indexChange >= 0 ? '+' : '';
  const fmtIndex = (v: number) => v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const clickable = !!onClick && hasIndex;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`text-left flex-1 min-w-[180px] bg-toss-card border border-toss-border rounded-2xl px-4 py-3 transition-all ${
        clickable ? 'hover:border-toss-blue/50 hover:shadow-[var(--shadow-toss-card)] active:scale-[0.99] cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg leading-none" aria-hidden>{flag}</span>
        <span className="text-[13px] font-bold text-toss-text-primary">{title}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${stateConfig.dot} ${stateConfig.dotAnim}`} />
          <span className={`text-[11px] font-semibold ${stateConfig.text}`}>{status.label}</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-toss-text-tertiary">{indexLabel}</p>
          {hasIndex ? (
            <>
              <p className="num text-[20px] font-extrabold leading-tight text-toss-text-primary">
                {fmtIndex(indexValue!)}
              </p>
              {indexChange !== null && indexChangePct !== null && (
                <p className={`num text-[11px] font-bold mt-0.5 ${colorClass(indexChange)}`}>
                  {sign}{fmtIndex(indexChange)} ({sign}{indexChangePct.toFixed(2)}%)
                </p>
              )}
            </>
          ) : (
            <div>
              <p className="num text-[16px] font-bold text-toss-text-tertiary">-</p>
              <p className="text-[10px] text-toss-text-tertiary mt-0.5">
                {indexLoading ? '불러오는 중' : '지수 연결 확인'}
              </p>
            </div>
          )}
        </div>
        {sparkData && sparkData.length >= 2 && indexChange !== null && (
          <Sparkline data={sparkData} pct={indexChange} />
        )}
      </div>
      <p className="text-[10px] text-toss-text-tertiary mt-1.5">{status.timeLabel}</p>
      {clickable && (
        <p className="text-[10px] text-toss-blue/70 mt-0.5">탭하여 차트 보기 →</p>
      )}
    </button>
  );
}

/** 보유 종목 카드 — 카테고리 라벨 + 등락률·등락금액 동시 표시 + 클릭/편집 컨트롤 */
function HoldingCard({
  item, hideAssets, editing, isHidden, isFirst, isLast, pendingDelete,
  onClick, onMoveUp, onMoveDown, onToggleHidden, onAskDelete, onConfirmDelete, onCancelDelete,
}: {
  item: TickerItem;
  hideAssets: boolean;
  editing?: boolean;
  isHidden?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  pendingDelete?: boolean;
  onClick?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onToggleHidden?: () => void;
  onAskDelete?: () => void;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
}) {
  const isPos = item.pct >= 0;
  const sign = isPos ? '+' : '';

  if (editing) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-opacity ${
          isHidden ? 'opacity-40' : ''
        } ${pendingDelete ? 'bg-toss-down-soft border-toss-down/40' : isPos ? 'bg-toss-up-soft border-toss-up/20' : 'bg-toss-down-soft border-toss-down/20'}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-toss-text-primary leading-snug truncate">
            {etfDisplayName(item.name)}
          </p>
          {pendingDelete ? (
            <p className="text-[10px] text-toss-down font-semibold mt-0.5">정말 삭제할까요? 보유 기록도 사라져요</p>
          ) : (
            <span
              className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white whitespace-nowrap"
              style={{ background: item.accentColor }}
            >
              {item.shortLabel}
            </span>
          )}
        </div>
        {pendingDelete ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onConfirmDelete}
              className="text-[11px] font-semibold text-white bg-toss-down px-2.5 py-1 rounded-full active:scale-95"
            >삭제</button>
            <button
              onClick={onCancelDelete}
              className="text-[11px] text-toss-text-tertiary px-2.5 py-1 rounded-full border border-toss-border active:scale-95"
            >취소</button>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onAskDelete}
              aria-label="삭제"
              className="p-1.5 rounded-full hover:bg-toss-down/10 active:scale-90"
            >
              <Trash2 size={13} className="text-toss-down" />
            </button>
            <button
              onClick={onToggleHidden}
              aria-label={isHidden ? '표시' : '숨김'}
              className="p-1.5 rounded-full hover:bg-toss-bg active:scale-90"
            >
              {isHidden ? <Eye size={13} className="text-toss-text-secondary" /> : <Hide size={13} className="text-toss-text-tertiary" />}
            </button>
            <div className="flex flex-col gap-0">
              <button
                onClick={onMoveUp}
                disabled={isFirst}
                aria-label="위로"
                className="p-0.5 rounded hover:bg-toss-bg disabled:opacity-20 active:scale-90"
              >
                <ArrowUp size={12} className="text-toss-text-tertiary" />
              </button>
              <button
                onClick={onMoveDown}
                disabled={isLast}
                aria-label="아래로"
                className="p-0.5 rounded hover:bg-toss-bg disabled:opacity-20 active:scale-90"
              >
                <ArrowDown size={12} className="text-toss-text-tertiary" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left w-full flex items-start justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all ${
        onClick ? 'hover:scale-[1.01] active:scale-[0.99] cursor-pointer' : 'cursor-default'
      } ${isPos ? 'bg-toss-up-soft border-toss-up/20' : 'bg-toss-down-soft border-toss-down/20'}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-toss-text-primary leading-snug truncate">
          {etfDisplayName(item.name)}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span
            className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-white whitespace-nowrap"
            style={{ background: item.accentColor }}
          >
            {item.shortLabel}
          </span>
          {item.price && (
            <span className="text-[10px] text-toss-text-tertiary truncate">
              {item.price}
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`num text-[14px] font-extrabold leading-tight ${colorClass(item.pct)}`}>
          {sign}{item.pct.toFixed(2)}%
        </p>
        {item.krwChange !== null && !hideAssets && (
          <p className={`num text-[10px] mt-0.5 ${colorClass(item.krwChange)}`}>
            {sign}{fmtKRW(item.krwChange)}
          </p>
        )}
      </div>
    </button>
  );
}

const MASK = '••••••';

export default function Header({
  data,
  dark,
  hideAssets,
  realEstateOn,
  loanOn,
  dcOn,
  onToggleDark,
  onToggleHide,
  onRefresh,
  onToggleDc,
  isRefreshing,
  onAddHolding,
}: Props) {
  const queryClient = useQueryClient();
  const { data: sparklines } = useQuery({
    queryKey: ['sparkline'],
    queryFn: fetchSparkline,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });

  // 실제 지수 (코스피·나스닥) 현재가 + 전일 대비. 5분마다 갱신.
  const { data: indices, isLoading: indicesLoading } = useQuery({
    queryKey: ['indices'],
    queryFn: fetchMarketIndices,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // 우상단 메뉴 + 시장 현황 collapse + API 키/알림 모달
  const [menuOpen, setMenuOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(() => localStorage.getItem('pd_market_open') === '1');
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 종목 카드 클릭 → 차트 모달
  const [chartTarget, setChartTarget] = useState<TickerItem | null>(null);
  // 시장 카드(코스피/나스닥 지수) 클릭 → 차트 모달
  const [indexChart, setIndexChart] = useState<{ ticker: string; name: string; accentColor: string } | null>(null);
  // 편집 모드에서 종목 삭제 확인 (dedupe-confirm 패턴)
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: ({ accName, key }: { accName: string; key: string }) => deleteHolding(accName, key),
    onSuccess: () => {
      setPendingDeleteName(null);
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });

  /** 종목 이름으로 (account_name, holding_key) 찾기 — 동일 종목 여러 계좌면 첫 번째 */
  const findHoldingLocation = (name: string): { accName: string; key: string } | null => {
    for (const acc of data.accounts) {
      const h = acc.holdings.find(x => x.name === name);
      if (h) return { accName: acc.name, key: h.ticker || h.name };
    }
    return null;
  };

  // 시장 현황 편집 모드 (순서 변경 + 숨김)
  const [marketEditing, setMarketEditing] = useState(false);
  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(MARKET_ORDER_KEY) || '[]'); } catch { return []; }
  });
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(MARKET_HIDDEN_KEY) || '[]')); } catch { return new Set(); }
  });
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [draftHidden, setDraftHidden] = useState<Set<string>>(new Set());

  const enterMarketEdit = () => {
    // 저장된 커스텀 순서가 비어 있으면 현재 정렬된 종목명 리스트로 초기화
    // (이래야 편집 모드에서 ↑↓ 버튼이 즉시 작동함)
    const baseOrder = customOrder.length > 0
      ? [...customOrder]
      : tickerItems.map(t => t.name);
    setDraftOrder(baseOrder);
    setDraftHidden(new Set(hiddenSet));
    setMarketEditing(true);
  };
  const cancelMarketEdit = () => setMarketEditing(false);
  const saveMarketEdit = () => {
    setCustomOrder([...draftOrder]);
    setHiddenSet(new Set(draftHidden));
    localStorage.setItem(MARKET_ORDER_KEY, JSON.stringify(draftOrder));
    localStorage.setItem(MARKET_HIDDEN_KEY, JSON.stringify([...draftHidden]));
    setMarketEditing(false);
  };
  const moveDraftItem = (name: string, dir: -1 | 1) => {
    setDraftOrder(prev => {
      const arr = [...prev];
      const i = arr.indexOf(name);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };
  const toggleDraftHidden = (name: string) => {
    setDraftHidden(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const toggleMarket = () => {
    setMarketOpen(o => {
      localStorage.setItem('pd_market_open', !o ? '1' : '0');
      return !o;
    });
  };

  // 사용자 토글(퇴직연금/부동산/대출) 적용 — HistoryChart와 동일 기준의 표시값.
  // utils.applyDisplayToggles에 로직 통합 (Phase 2: Header / HistoryChart 일관성).
  const dcKrw = data.dc_value_krw ?? 0;
  const {
    total: displayTotal,
    dayChg: displayDayChg,
    dayPct: displayDayPct,
    profit: displayProfit,
    profitPct: displayProfitPct,
  } = applyDisplayToggles(data, { dcOn, realEstateOn, loanOn });

  const profitColor = colorClass(displayProfit);
  const dayColor    = colorClass(displayDayChg);

  // 보유 종목 → 거래소(KR/US)와 세부 카테고리로 분류.
  // React Compiler가 자동 메모이제이션 처리 — 수동 useMemo는 인접 코드와 상호작용해
  // 'preserve-manual-memoization' 에러를 일으키므로 일반 변수로 둔다.
  const tickerItems: TickerItem[] = (() => {
    const seen = new Map<string, TickerItem>();
    data.accounts.forEach(acc => {
      acc.holdings
        .filter((h: HoldingData) => h.day_change_pct !== null && !h.is_snapshot)
        .forEach((h: HoldingData) => {
          const cls = classifyHolding(h);
          if (cls.category === 'cash') return; // 현금은 시장 변동 없음
          const ex = seen.get(h.name);
          const pct = h.day_change_pct as number;
          if (!ex || Math.abs(pct) > Math.abs(ex.pct)) {
            seen.set(h.name, {
              name: h.name,
              ticker: h.ticker,
              pct,
              krwChange: h.day_change_krw,
              price: h.current_price_display,
              priceLabel: h.price_label,
              category: cls.category,
              exchange: cls.exchange,
              shortLabel: cls.shortLabel,
              accentColor: cls.accentColor,
              fetchedAt: h.fetched_at ?? null,
            });
          }
        });
    });
    return [...seen.values()].sort((a, b) => {
      // 거래소(KR 먼저) → 카테고리 → 미국 티커 우선순위 → 변동률 절대값
      if (a.exchange !== b.exchange) return a.exchange === 'KR' ? -1 : 1;
      const aOrd = CATEGORY_ORDER[a.category];
      const bOrd = CATEGORY_ORDER[b.category];
      if (aOrd !== bOrd) return aOrd - bOrd;
      if (a.exchange === 'US') {
        const ap = usTickerOrder(a.name);
        const bp = usTickerOrder(b.name);
        if (ap !== bp) return ap - bp;
      }
      return Math.abs(b.pct) - Math.abs(a.pct);
    });
  })();

  // 사용자 정의 순서 / 숨김 적용
  // 편집 모드에선 draft 사용, 아니면 저장된 값 사용
  const activeOrder  = marketEditing ? draftOrder  : customOrder;
  const activeHidden = marketEditing ? draftHidden : hiddenSet;

  // React Compiler가 자동 메모이제이션 처리.
  const orderedItems = (() => {
    if (activeOrder.length === 0) return tickerItems;
    const map = new Map(tickerItems.map(t => [t.name, t]));
    const sorted: TickerItem[] = [];
    activeOrder.forEach(name => {
      const t = map.get(name);
      if (t) { sorted.push(t); map.delete(name); }
    });
    // 저장된 순서에 없는 새 종목은 끝에 추가
    map.forEach(t => sorted.push(t));
    return sorted;
  })();

  // 편집 모드가 아니면 숨김 항목 제외, 편집 모드면 다 보여주되 흐리게
  const visibleItems = marketEditing
    ? orderedItems
    : orderedItems.filter(t => !activeHidden.has(t.name));

  const krItems = visibleItems.filter(t => t.exchange === 'KR');
  const usItems = visibleItems.filter(t => t.exchange === 'US');

  // 한국장 카테고리별 그룹
  const krByCategory: Array<{ category: HoldingClass; label: string; items: TickerItem[] }> = (() => {
    const map = new Map<HoldingClass, TickerItem[]>();
    krItems.forEach(t => {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    });
    const order: HoldingClass[] = ['kr_domestic', 'kr_listed_overseas', 'mixed_tdf'];
    return order
      .filter(c => map.has(c))
      .map(c => ({
        category: c,
        label: map.get(c)![0].shortLabel,
        items: map.get(c)!,
      }));
  })();


  return (
    <>
      {/* ── Sticky 헤더: 총자산 / 등락 / 수익 / 환율 ── */}
      <header className="sticky top-0 z-20 bg-toss-card border-b border-toss-border shadow-[var(--shadow-toss-card)]">
        {data.cache_is_stale && (
          <div className="bg-toss-up-soft text-toss-up text-xs px-4 py-2 flex items-center gap-2">
            <AlertTriangle size={13} />
            <span>가격 데이터가 {data.cache_stale_hours}시간 동안 갱신되지 않았어요. 새로고침을 눌러보세요.</span>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-5 pt-4 pb-4">
          {/* 상단 바 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-toss-text-secondary">내 포트폴리오</span>
              <span
                className="text-[10px] text-toss-text-tertiary bg-toss-bg px-2 py-0.5 rounded-full cursor-default"
                title={`마지막 갱신: ${data.price_updated_at ?? '-'} | ${relativeTime(data.price_updated_at)}`}
              >
                {fmtAbsTime(data.price_updated_at)} 기준
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                aria-label="가격 갱신"
                className="p-2 rounded-full hover:bg-toss-bg active:scale-95 transition-all disabled:opacity-50"
                title="가격 갱신"
              >
                <RefreshCw size={17} className={`text-toss-text-secondary ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenuOpen(o => !o)}
                  aria-label="메뉴"
                  aria-expanded={menuOpen}
                  className="p-2 rounded-full hover:bg-toss-bg active:scale-95 transition-all"
                  title="설정"
                >
                  <MoreVertical size={17} className="text-toss-text-secondary" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-toss-card border border-toss-border rounded-2xl shadow-[var(--shadow-toss-pop)] overflow-hidden z-30">
                    <button
                      onClick={() => { onToggleHide(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-toss-bg text-left text-[13px] text-toss-text-primary"
                    >
                      {hideAssets ? <Eye size={15} /> : <EyeOff size={15} />}
                      {hideAssets ? '자산 보기' : '자산 가리기'}
                    </button>
                    <button
                      onClick={() => { onToggleDark(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-toss-bg text-left text-[13px] text-toss-text-primary"
                    >
                      {dark ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} />}
                      {dark ? '라이트 모드' : '다크 모드'}
                    </button>
                    {dcKrw > 0 && (
                      <button
                        onClick={() => { onToggleDc(); setMenuOpen(false); }}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-toss-bg text-left text-[13px] text-toss-text-primary border-t border-toss-border/50"
                      >
                        <span>퇴직연금 포함</span>
                        <span className={`text-[11px] font-bold ${dcOn ? 'text-toss-blue' : 'text-toss-text-tertiary'}`}>
                          {dcOn ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    )}
                    <button
                      onClick={() => { setNotifOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-toss-bg text-left text-[13px] text-toss-text-primary border-t border-toss-border/50"
                    >
                      <Bell size={15} />
                      알림 설정
                    </button>
                    <button
                      onClick={() => { setApiKeyOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-toss-bg text-left text-[13px] text-toss-text-primary"
                    >
                      <Key size={15} />
                      API 키 설정
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 총자산 */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[11px] font-medium text-toss-text-tertiary tracking-widest uppercase">총 자산</p>
              {!dcOn && dcKrw > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-medium">
                  퇴직연금 제외
                </span>
              )}
            </div>
            <h1 className="num text-[42px] sm:text-[48px] leading-none font-extrabold tracking-tight text-toss-text-primary">
              {hideAssets ? MASK : fmtKRW(displayTotal)}
            </h1>
            {!hideAssets && (
              <p className="num text-xs text-toss-text-tertiary mt-1.5 flex items-center gap-2">
                {fmtKRWFull(displayTotal)}
                {!dcOn && <span className="text-indigo-400 font-medium">· 퇴직연금 제외</span>}
              </p>
            )}
          </div>

          {/* 오늘 등락 / 누적 수익 / 환율 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-toss-text-tertiary">{data.day_change_label || '오늘'}</span>
                {data.market_status === 'closed' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-toss-text-tertiary/50" title="휴장" />
                )}
                {data.market_status === 'live' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-toss-up animate-pulse" title="장중" />
                )}
              </div>
              <span className={`num text-sm font-bold ${dayColor}`}>
                {hideAssets ? MASK : (displayDayChg >= 0 ? '+' : '') + fmtKRW(displayDayChg)}
              </span>
              <span className={`num text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                displayDayPct >= 0 ? 'bg-toss-up-soft text-toss-up' : 'bg-toss-down-soft text-toss-down'
              }`}>
                {fmtPct(displayDayPct)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-toss-text-tertiary">누적 수익</span>
              <span className={`num text-sm font-bold ${profitColor}`}>
                {hideAssets ? MASK : (displayProfit >= 0 ? '+' : '') + fmtKRW(displayProfit)}
              </span>
              <span className={`num text-xs font-semibold ${profitColor}`}>
                {fmtPct(displayProfitPct)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[11px] text-toss-text-tertiary">USD/KRW</span>
              <span className="num text-sm font-semibold text-toss-text-secondary">
                {data.usd_krw?.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
              </span>
              {data.usd_krw_prev && (
                <span className={`num text-[11px] font-medium ${colorClass(data.usd_krw - data.usd_krw_prev)}`}>
                  {fmtPct(((data.usd_krw - data.usd_krw_prev) / data.usd_krw_prev) * 100)}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Non-sticky: 시장 현황 대시보드 (한국장 / 미국장 분리) ── */}
      {tickerItems.length > 0 && (
        <div className="bg-toss-bg/40 border-b border-toss-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-5 py-3 space-y-3">
            {/* 시장 상태 카드 (한국장 + 미국장) */}
            <div className="flex flex-col sm:flex-row gap-2">
              {krItems.length > 0 && (
                <MarketStatusCard
                  exchange="KR"
                  indexLabel={indices?.korea?.label ?? '코스피'}
                  indexValue={indices?.korea?.value ?? null}
                  indexChange={indices?.korea?.change ?? null}
                  indexChangePct={indices?.korea?.change_pct ?? null}
                  indexLoading={indicesLoading}
                  sparkData={sparklines?.korea}
                  onClick={indices?.korea?.value ? () => setIndexChart({
                    ticker: '^KS11',
                    name: '코스피 (KOSPI)',
                    accentColor: '#3182F6',
                  }) : undefined}
                />
              )}
              {(usItems.length > 0 || krItems.some(t => t.category === 'kr_listed_overseas')) && (
                <MarketStatusCard
                  exchange="US"
                  indexLabel={indices?.nasdaq?.label ?? '나스닥'}
                  indexValue={indices?.nasdaq?.value ?? null}
                  indexChange={indices?.nasdaq?.change ?? null}
                  indexChangePct={indices?.nasdaq?.change_pct ?? null}
                  indexLoading={indicesLoading}
                  sparkData={sparklines?.nasdaq}
                  onClick={indices?.nasdaq?.value ? () => setIndexChart({
                    ticker: '^IXIC',
                    name: '나스닥 (NASDAQ Composite)',
                    accentColor: '#8B5CF6',
                  }) : undefined}
                />
              )}
              <button
                onClick={toggleMarket}
                aria-label={marketOpen ? '시장 현황 접기' : '시장 현황 펴기'}
                aria-expanded={marketOpen}
                className="self-start sm:self-stretch px-3 py-2 rounded-2xl bg-toss-card border border-toss-border hover:bg-toss-bg active:scale-95 transition-all shrink-0"
              >
                {marketOpen
                  ? <ChevronUp size={16} className="text-toss-text-tertiary" />
                  : <ChevronDown size={16} className="text-toss-text-tertiary" />}
              </button>
            </div>

            {/* 편집 토글 + 안내 (시장 펼침 상태일 때만) */}
            {marketOpen && (
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] text-toss-text-tertiary">
                  {marketEditing
                    ? '종목을 위/아래로 옮기거나 숨길 수 있어요.'
                    : '종목을 누르면 최근 주가 그래프가 열려요.'}
                </p>
                {!marketEditing ? (
                  <button
                    onClick={enterMarketEdit}
                    className="text-[11px] font-medium text-toss-text-secondary px-2.5 py-1 rounded-full border border-toss-border hover:border-toss-blue/50 flex items-center gap-1 active:scale-95"
                  >
                    <Pencil size={10} /> 편집
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {onAddHolding && (
                      <button
                        onClick={onAddHolding}
                        className="text-[11px] font-medium text-toss-blue px-2.5 py-1 rounded-full border border-toss-blue/30 bg-toss-blue-soft hover:bg-toss-blue/10 flex items-center gap-1 active:scale-95"
                      >
                        <Plus size={10} /> 종목 추가
                      </button>
                    )}
                    <button onClick={cancelMarketEdit} className="text-[11px] text-toss-text-tertiary px-2.5 py-1 rounded-full border border-toss-border active:scale-95">취소</button>
                    <button onClick={saveMarketEdit} className="text-[11px] font-semibold text-white bg-toss-blue px-3 py-1 rounded-full active:scale-95">저장</button>
                  </div>
                )}
              </div>
            )}

            {/* 보유 종목 — 시장별 + 카테고리별 그룹 */}
            {marketOpen && (
              <div className="space-y-3">
                {/* 한국장 종목들 */}
                {krItems.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="text-base leading-none" aria-hidden>🇰🇷</span>
                      <h3 className="text-[12px] font-bold text-toss-text-primary">한국장 종목</h3>
                      <span className="text-[10px] text-toss-text-tertiary">{krItems.length}개</span>
                    </div>
                    <div className="space-y-2.5">
                      {krByCategory.map(group => (
                        <div key={group.category}>
                          <div className="flex items-center gap-1.5 mb-1 px-1">
                            <span
                              className="inline-block w-1 h-3 rounded-full"
                              style={{ background: group.items[0].accentColor }}
                            />
                            <span className="text-[11px] font-semibold text-toss-text-secondary">
                              {group.label}
                            </span>
                            <span className="text-[10px] text-toss-text-tertiary">{group.items.length}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                            {group.items.map((item, i) => (
                              <HoldingCard
                                key={item.name}
                                item={item}
                                hideAssets={hideAssets}
                                editing={marketEditing}
                                isHidden={activeHidden.has(item.name)}
                                isFirst={i === 0}
                                isLast={i === group.items.length - 1}
                                pendingDelete={pendingDeleteName === item.name}
                                onClick={item.ticker ? () => setChartTarget(item) : undefined}
                                onToggleHidden={() => toggleDraftHidden(item.name)}
                                onMoveUp={() => moveDraftItem(item.name, -1)}
                                onMoveDown={() => moveDraftItem(item.name, 1)}
                                onAskDelete={() => setPendingDeleteName(item.name)}
                                onConfirmDelete={() => {
                                  const loc = findHoldingLocation(item.name);
                                  if (loc) deleteMut.mutate(loc);
                                }}
                                onCancelDelete={() => setPendingDeleteName(null)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* 미국장 종목들 */}
                {usItems.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="text-base leading-none" aria-hidden>🇺🇸</span>
                      <h3 className="text-[12px] font-bold text-toss-text-primary">미국장 종목</h3>
                      <span className="text-[10px] text-toss-text-tertiary">{usItems.length}개</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span
                          className="inline-block w-1 h-3 rounded-full"
                          style={{ background: usItems[0].accentColor }}
                        />
                        <span className="text-[11px] font-semibold text-toss-text-secondary">해외 직투</span>
                        <span className="text-[10px] text-toss-text-tertiary">{usItems.length}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {usItems.map((item, i) => (
                          <HoldingCard
                            key={item.name}
                            item={item}
                            hideAssets={hideAssets}
                            editing={marketEditing}
                            isHidden={activeHidden.has(item.name)}
                            isFirst={i === 0}
                            isLast={i === usItems.length - 1}
                            pendingDelete={pendingDeleteName === item.name}
                            onClick={item.ticker ? () => setChartTarget(item) : undefined}
                            onToggleHidden={() => toggleDraftHidden(item.name)}
                            onMoveUp={() => moveDraftItem(item.name, -1)}
                            onMoveDown={() => moveDraftItem(item.name, 1)}
                            onAskDelete={() => setPendingDeleteName(item.name)}
                            onConfirmDelete={() => {
                              const loc = findHoldingLocation(item.name);
                              if (loc) deleteMut.mutate(loc);
                            }}
                            onCancelDelete={() => setPendingDeleteName(null)}
                          />
                        ))}
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* API 키 설정 모달 */}
      {apiKeyOpen && <ApiKeyModal onClose={() => setApiKeyOpen(false)} />}
      {/* 알림 설정 모달 */}
      {notifOpen && <NotifModal onClose={() => setNotifOpen(false)} />}
      {/* 종목 주가 차트 모달 */}
      {chartTarget && chartTarget.ticker && (
        <Suspense fallback={null}>
          <TickerChartModal
            ticker={chartTarget.ticker}
            name={chartTarget.name}
            shortLabel={chartTarget.shortLabel}
            accentColor={chartTarget.accentColor}
            currentDisplay={chartTarget.price}
            onClose={() => setChartTarget(null)}
          />
        </Suspense>
      )}
      {/* 지수 차트 모달 (코스피 / 나스닥) */}
      {indexChart && (
        <Suspense fallback={null}>
          <TickerChartModal
            ticker={indexChart.ticker}
            name={indexChart.name}
            shortLabel="지수"
            accentColor={indexChart.accentColor}
            currentDisplay={
              indexChart.ticker === '^KS11'
                ? (indices?.korea?.value ?? null)?.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? null
                : indexChart.ticker === '^IXIC'
                  ? (indices?.nasdaq?.value ?? null)?.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? null
                  : null
            }
            onClose={() => setIndexChart(null)}
          />
        </Suspense>
      )}
    </>
  );
}

function NotifModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<NotifSettings>(() => loadNotifSettings());
  const [perm, setPerm] = useState(() => getPermission());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const enableAll = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'granted') {
      const next = { ...s, enabled: true };
      setS(next);
      saveNotifSettings(next);
    }
  };

  const update = (patch: Partial<NotifSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveNotifSettings(next);
  };

  const denied = perm === 'denied';
  const unsupported = perm === 'unsupported';

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="modal-content bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-toss-text-primary mb-1">알림 설정</h2>
        <p className="text-[12px] text-toss-text-secondary mb-4">
          페이지가 열려 있거나 PWA가 설치된 경우 알림이 표시됩니다. (브라우저 권한 필요)
        </p>

        {unsupported ? (
          <div className="bg-toss-bg rounded-xl p-4 text-sm text-toss-text-secondary">
            이 브라우저는 알림 API를 지원하지 않습니다.
          </div>
        ) : denied ? (
          <div className="bg-toss-up-soft rounded-xl p-4 text-sm text-toss-up">
            브라우저에서 알림이 차단되어 있어요. 사이트 설정에서 알림을 허용해주세요.
          </div>
        ) : !s.enabled ? (
          <button
            onClick={enableAll}
            className="w-full py-3 rounded-xl bg-toss-blue text-white font-semibold active:scale-[0.98]"
          >
            알림 켜기
          </button>
        ) : (
          <div className="space-y-3">
            <Row label="알림 사용">
              <SmallToggle on={s.enabled} onChange={(v) => update({ enabled: v })} />
            </Row>
            <Row label="자동매수 D-1 알림">
              <SmallToggle on={s.autobuy_d1} onChange={(v) => update({ autobuy_d1: v })} />
            </Row>
            <Row label="가격 변동 알림">
              <SmallToggle on={s.price_alert} onChange={(v) => update({ price_alert: v })} />
            </Row>
            {s.price_alert && (
              <div className="bg-toss-bg rounded-xl p-3 flex items-center gap-2">
                <span className="text-xs text-toss-text-secondary">임계값</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="20"
                  value={s.price_threshold_pct}
                  onChange={(e) => update({ price_threshold_pct: parseFloat(e.target.value) || 3 })}
                  className="num flex-1 bg-transparent focus:outline-none text-sm text-right text-toss-text-primary"
                />
                <span className="text-xs text-toss-text-tertiary">±% 초과</span>
              </div>
            )}
            <p className="text-[11px] text-toss-text-tertiary leading-relaxed">
              ⓘ 같은 종목/날짜에 대해 하루 1회만 알림이 발사됩니다.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full py-3 rounded-xl bg-toss-bg text-toss-text-primary font-semibold active:scale-[0.98]"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between bg-toss-bg rounded-xl px-4 py-3">
      <span className="text-sm font-medium text-toss-text-primary">{label}</span>
      {children}
    </div>
  );
}

function SmallToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
        on ? 'bg-toss-blue' : 'bg-toss-border'
      }`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
        on ? 'translate-x-5' : ''
      }`} />
    </button>
  );
}

function ApiKeyModal({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<string>(() => getApiKey());

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
    setApiKey(draft.trim());
    onClose();
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="modal-content bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-toss-text-primary mb-1">API 키 설정</h2>
        <p className="text-[12px] text-toss-text-secondary mb-4">
          백엔드 PORTFOLIO_API_KEY 환경변수와 동일한 값을 입력하세요. 빈 칸으로 저장하면 키를 제거합니다.
        </p>
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="API key"
          className="w-full bg-toss-bg rounded-xl px-4 py-3 text-base text-toss-text-primary focus:outline-none focus:ring-2 focus:ring-toss-blue mb-4"
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-toss-bg text-toss-text-primary font-semibold active:scale-[0.98]">
            취소
          </button>
          <button onClick={save} className="flex-[2] py-3 rounded-xl bg-toss-blue text-white font-semibold active:scale-[0.98]">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
