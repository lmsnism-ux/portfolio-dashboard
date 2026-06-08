import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Moon, Sun, Eye, EyeOff, AlertTriangle, MoreVertical, Key, ChevronDown, ChevronUp } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import { fmtKRW, fmtKRWFull, fmtPct, colorClass, relativeTime, fmtAbsTime, categorizeAccount } from '../utils';
import { fetchSparkline, getApiKey, setApiKey } from '../api';

const ETF_BRAND_RE = /^(TIGER|KODEX|KBSTAR|HANARO|SOL|ACE|ARIRANG|KOSEF|WOORI|MIRAE)\s+/i;
const NASDAQ_RE = /\b(QLD|TQQQ|QQQ)\b|나스닥|nasdaq|미국테크/i;
const SP500_RE = /s&p|미국\s*s&p/i;

function getGroup(name: string): 'nasdaq' | 'sp500' | 'korea' {
  if (NASDAQ_RE.test(name)) return 'nasdaq';
  if (SP500_RE.test(name)) return 'sp500';
  return 'korea';
}

const GROUP_CONFIG = {
  nasdaq: { label: '나스닥' },
  sp500: { label: 'S&P500' },
  korea: { label: '코스피' },
} as const;

const GROUP_ORDER: Record<string, number> = { nasdaq: 0, sp500: 1, korea: 2 };

const TICKER_SORT_PRIORITY: Record<string, number> = { QLD: 0, TQQQ: 1, QQQ: 2 };
function tickerPriority(name: string): number {
  const u = name.toUpperCase();
  for (const [k, v] of Object.entries(TICKER_SORT_PRIORITY)) {
    if (u === k || u.startsWith(k + ' ') || u.endsWith(' ' + k) || u.includes('(' + k + ')')) return v;
  }
  return 99;
}

function groupAvgPct(items: TickerItem[]): number {
  if (!items.length) return 0;
  return items.reduce((s, t) => s + t.pct, 0) / items.length;
}

function etfDisplayName(name: string): string {
  return name
    .replace(ETF_BRAND_RE, '')
    .replace(/\s*INDXX\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CAT_PRIORITY: Record<string, number> = {
  '투자': 1, '개인연금': 2, '퇴직연금': 2, '저축': 3, '기타': 4,
};
function accCatOrder(type: string): number {
  return CAT_PRIORITY[categorizeAccount(type)] ?? 4;
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
}

type TickerItem = { name: string; pct: number; krwChange: number | null; catOrder: number; price: string | null; priceLabel: string };

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

function GroupHeaderBadge({ label, pct, sparkData }: { label: string; pct: number; sparkData?: number[] }) {
  const isPos = pct >= 0;
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border cursor-default shrink-0 ${
      isPos ? 'bg-toss-up-soft border-toss-up/20' : 'bg-toss-down-soft border-toss-down/20'
    }`}>
      <span className="text-[12px] text-toss-text-secondary whitespace-nowrap font-semibold">{label}</span>
      {sparkData && sparkData.length >= 2 && <Sparkline data={sparkData} pct={pct} />}
      <span className={`num text-[14px] font-extrabold whitespace-nowrap ${colorClass(pct)}`}>
        {isPos ? '+' : ''}{pct.toFixed(2)}%
      </span>
    </div>
  );
}

function HoldingCard({ item }: { item: TickerItem }) {
  const isPos = item.pct >= 0;
  return (
    <div className={`flex items-start justify-between gap-2 px-3 py-2.5 rounded-xl border ${
      isPos ? 'bg-toss-up-soft border-toss-up/20' : 'bg-toss-down-soft border-toss-down/20'
    }`}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-toss-text-secondary leading-snug">
          {etfDisplayName(item.name)}
        </p>
        {item.price && (
          <p className="text-[10px] text-toss-text-tertiary mt-0.5">
            {item.priceLabel === '실시간' ? '현재가' : '종가'} {item.price}
          </p>
        )}
      </div>
      <span className={`num text-[13px] font-extrabold shrink-0 pt-0.5 ${colorClass(item.pct)}`}>
        {isPos ? '+' : ''}{item.pct.toFixed(2)}%
      </span>
    </div>
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
}: Props) {
  const { data: sparklines } = useQuery({
    queryKey: ['sparkline'],
    queryFn: fetchSparkline,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });

  // 우상단 메뉴 + 시장 현황 collapse + API 키 모달
  const [menuOpen, setMenuOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(() => localStorage.getItem('pd_market_open') !== '0');
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // 백엔드 사전 계산값 사용 (Phase 1: 비즈로직 백엔드 이관)
  const dcKrw    = data.dc_value_krw     ?? 0;
  const dcDayChg = data.dc_day_change_krw ?? 0;
  const dcProfit = (data.dc_value_krw ?? 0) - (data.dc_cost_krw ?? 0);
  const dcCost   = data.dc_cost_krw      ?? 0;

  // 부동산/대출 분리 토글 — 백엔드 total은 (투자자산 + 부동산순자산) 기준
  const reEquityRaw = data.real_estate_equity_krw ?? 0;
  const reCostRaw   = data.real_estate_cost_krw ?? 0;
  const reLoan      = data.real_estate_loan_krw ?? 0;

  let reAdjustValue = 0;
  let reAdjustCost  = 0;
  if (!realEstateOn) {
    reAdjustValue = -reEquityRaw;
    reAdjustCost  = -reCostRaw;
  } else if (!loanOn) {
    // 부동산은 포함, 대출은 부채로 미반영
    reAdjustValue = reLoan;
    reAdjustCost  = reLoan;
  }

  const dcExclude        = dcOn ? 0 : dcKrw;
  const displayTotal     = data.total_value_krw - dcExclude + reAdjustValue;
  const displayDayChg    = data.total_day_change_krw - (dcOn ? 0 : dcDayChg);
  const displayProfit    = data.total_profit_krw - (dcOn ? 0 : dcProfit) + (reAdjustValue - reAdjustCost);
  const investCost       = data.total_cost_krw - (dcOn ? 0 : dcCost) + reAdjustCost;
  const displayProfitPct = investCost > 0 ? (displayProfit / investCost) * 100 : (data.total_profit_pct ?? 0);
  const prevTotal        = displayTotal - displayDayChg;
  const displayDayPct    = prevTotal > 0 ? (displayDayChg / prevTotal) * 100 : (data.total_day_change_pct ?? 0);

  const profitColor = colorClass(displayProfit);
  const dayColor    = colorClass(displayDayChg);

  const tickerItems: TickerItem[] = (() => {
    const seen = new Map<string, TickerItem>();
    data.accounts.forEach(acc => {
      const catOrd = accCatOrder(acc.type);
      acc.holdings
        .filter(h => h.day_change_pct !== null && !/TDF/i.test(h.name))
        .forEach(h => {
          const ex = seen.get(h.name);
          const pct = h.day_change_pct as number;
          if (!ex || Math.abs(pct) > Math.abs(ex.pct)) {
            seen.set(h.name, { name: h.name, pct, krwChange: h.day_change_krw, catOrder: catOrd, price: h.current_price_display, priceLabel: h.price_label });
          }
        });
    });
    return [...seen.values()].sort((a, b) => {
      const ag = GROUP_ORDER[getGroup(a.name)];
      const bg = GROUP_ORDER[getGroup(b.name)];
      if (ag !== bg) return ag - bg;
      const ap = tickerPriority(a.name), bp = tickerPriority(b.name);
      if (ap !== bp) return ap - bp;
      return Math.abs(b.pct) - Math.abs(a.pct);
    });
  })();

  const groups = { nasdaq: [] as TickerItem[], sp500: [] as TickerItem[], korea: [] as TickerItem[] };
  tickerItems.forEach(t => { groups[getGroup(t.name)].push(t); });

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
                      onClick={() => { setApiKeyOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-toss-bg text-left text-[13px] text-toss-text-primary border-t border-toss-border/50"
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

      {/* ── Non-sticky: 시장 현황 대시보드 (접기/펴기) ── */}
      {tickerItems.length > 0 && (
        <div className="bg-toss-card border-b border-toss-border">
          <div className="max-w-7xl mx-auto px-5 py-3 space-y-2.5">
            {/* 대표 지수 요약 + 접기 버튼 */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex flex-wrap gap-2 flex-1">
                {(['nasdaq', 'sp500'] as const).filter(g => groups[g].length > 0).map(g => (
                  <GroupHeaderBadge key={g} label={GROUP_CONFIG[g].label} pct={groupAvgPct(groups[g])} sparkData={sparklines?.[g]} />
                ))}
                {groups.korea.length > 0 && (
                  <GroupHeaderBadge label={GROUP_CONFIG.korea.label} pct={groupAvgPct(groups.korea)} sparkData={sparklines?.korea} />
                )}
              </div>
              <button
                onClick={toggleMarket}
                aria-label={marketOpen ? '시장 현황 접기' : '시장 현황 펴기'}
                aria-expanded={marketOpen}
                className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95 transition-all shrink-0"
              >
                {marketOpen
                  ? <ChevronUp size={16} className="text-toss-text-tertiary" />
                  : <ChevronDown size={16} className="text-toss-text-tertiary" />}
              </button>
            </div>
            {/* 보유 종목 카드 그리드 */}
            {marketOpen && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {tickerItems.map((item, i) => (
                  <HoldingCard key={i} item={item} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* API 키 설정 모달 */}
      {apiKeyOpen && <ApiKeyModal onClose={() => setApiKeyOpen(false)} />}
    </>
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
