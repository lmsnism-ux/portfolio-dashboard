import { useState } from 'react';
import { RefreshCw, Moon, Sun, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import { fmtKRW, fmtKRWFull, fmtPct, colorClass, relativeTime, fmtAbsTime } from '../utils';

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

function groupAvgPct(items: TickerItem[]): number {
  if (!items.length) return 0;
  return items.reduce((s, t) => s + t.pct, 0) / items.length;
}

function shortTickerName(name: string): string {
  let s = name
    .replace(ETF_BRAND_RE, '')
    .replace(/\s*INDXX\s*/gi, '')
    .replace(/플러스/g, '+')
    .replace(/액티브/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/TOP(\d+)/gi, 'T$1');
  return s.length > 9 ? s.slice(0, 9) + '…' : s;
}

function accCatOrder(type: string): number {
  if (/주식|ISA|CMA|기본계좌|증권/i.test(type)) return 1;
  if (/IRP|DC|퇴직|연금|연금저축/i.test(type)) return 2;
  if (/적금|예금|저축/i.test(type)) return 3;
  return 4;
}

interface Props {
  data: PortfolioSummary;
  dark: boolean;
  hideAssets: boolean;
  realEstateOn: boolean;
  onToggleDark: () => void;
  onToggleHide: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

type TickerItem = { name: string; pct: number; krwChange: number | null; catOrder: number };

function GroupHeaderBadge({ label, pct }: { label: string; pct: number }) {
  const bgClass = pct >= 0 ? 'bg-toss-up-soft' : 'bg-toss-down-soft';
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl cursor-default shrink-0 ${bgClass}`}>
      <span className="text-[12px] text-toss-text-secondary whitespace-nowrap font-semibold">{label}</span>
      <span className={`num text-[14px] font-bold whitespace-nowrap ${colorClass(pct)}`}>
        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
      </span>
    </div>
  );
}

function Badge({ item, hideAssets }: { item: TickerItem; hideAssets: boolean }) {
  const bgClass = item.pct >= 0 ? 'bg-toss-up-soft' : 'bg-toss-down-soft';
  const titleAttr = `${item.name}${item.krwChange !== null && !hideAssets ? ' · ' + (item.krwChange >= 0 ? '+' : '') + fmtKRW(item.krwChange) : ''}`;
  return (
    <div
      className={`flex items-center gap-1 px-2 py-0.5 rounded-lg cursor-default shrink-0 ${bgClass}`}
      title={titleAttr}
    >
      <span className="text-[10px] text-toss-text-secondary whitespace-nowrap font-medium">
        {shortTickerName(item.name)}
      </span>
      <span className={`num text-[10px] font-bold whitespace-nowrap ${colorClass(item.pct)}`}>
        {item.pct >= 0 ? '+' : ''}{item.pct.toFixed(1)}%
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
  onToggleDark,
  onToggleHide,
  onRefresh,
  isRefreshing,
}: Props) {
  const [excludeLong, setExcludeLong] = useState(false);

  const longTermAccs = data.accounts.filter(a => /IRP|DC|퇴직|연금|연금저축/i.test(a.type));
  const longTermKrw    = longTermAccs.reduce((s, a) => s + a.value_krw, 0);
  const longTermDayChg = longTermAccs.reduce((s, a) => s + a.day_change_krw, 0);
  const longTermProfit = longTermAccs.reduce((s, a) => s + a.profit_krw, 0);
  const longTermCost   = longTermAccs.reduce((s, a) => s + a.cost_krw, 0);

  const reEquity = realEstateOn ? 0 : (data.real_estate_equity_krw ?? 0);
  const reCost   = realEstateOn ? 0 : (data.real_estate_cost_krw ?? 0);

  const displayTotal     = data.total_value_krw  - (excludeLong ? longTermKrw : 0) - reEquity;
  const displayDayChg    = data.total_day_change_krw - (excludeLong ? longTermDayChg : 0);
  const displayProfit    = data.total_profit_krw - (excludeLong ? longTermProfit : 0) - (reEquity - reCost);
  const investCost       = data.total_cost_krw - (excludeLong ? longTermCost : 0) - reCost;
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
            seen.set(h.name, { name: h.name, pct, krwChange: h.day_change_krw, catOrder: catOrd });
          }
        });
    });
    return [...seen.values()].sort((a, b) => {
      const ag = GROUP_ORDER[getGroup(a.name)];
      const bg = GROUP_ORDER[getGroup(b.name)];
      if (ag !== bg) return ag - bg;
      return Math.abs(b.pct) - Math.abs(a.pct);
    });
  })();

  const groups = { nasdaq: [] as TickerItem[], sp500: [] as TickerItem[], korea: [] as TickerItem[] };
  tickerItems.forEach(t => { groups[getGroup(t.name)].push(t); });
  const hasUs = groups.nasdaq.length > 0 || groups.sp500.length > 0;
  const usDetailItems = [...groups.nasdaq, ...(groups.sp500.length > 1 ? groups.sp500 : [])];

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
              <button onClick={onToggleHide} className="p-2 rounded-full hover:bg-toss-bg active:scale-95 transition-all" title={hideAssets ? '자산 보기' : '자산 가리기'}>
                {hideAssets ? <EyeOff size={17} className="text-toss-text-secondary" /> : <Eye size={17} className="text-toss-text-secondary" />}
              </button>
              <button onClick={onRefresh} disabled={isRefreshing} className="p-2 rounded-full hover:bg-toss-bg active:scale-95 transition-all disabled:opacity-50" title="가격 갱신">
                <RefreshCw size={17} className={`text-toss-text-secondary ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={onToggleDark} className="p-2 rounded-full hover:bg-toss-bg active:scale-95 transition-all" title={dark ? '라이트 모드' : '다크 모드'}>
                {dark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-toss-text-secondary" />}
              </button>
            </div>
          </div>

          {/* 총자산 */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[11px] font-medium text-toss-text-tertiary tracking-widest uppercase">총 자산</p>
              {longTermKrw > 0 && (
                <button
                  onClick={() => setExcludeLong(e => !e)}
                  className={`text-[9px] px-2 py-0.5 rounded-full border font-medium transition-all ${
                    excludeLong
                      ? 'border-indigo-400/40 text-indigo-400 bg-indigo-500/10'
                      : 'border-toss-border text-toss-text-tertiary hover:border-toss-text-tertiary'
                  }`}
                >
                  {excludeLong ? '장기 제외' : '전체'}
                </button>
              )}
            </div>
            <h1 className="num text-[42px] sm:text-[48px] leading-none font-extrabold tracking-tight text-toss-text-primary">
              {hideAssets ? MASK : fmtKRW(displayTotal)}
            </h1>
            {!hideAssets && (
              <p className="num text-xs text-toss-text-tertiary mt-1.5 flex items-center gap-2">
                {fmtKRWFull(displayTotal)}
                {excludeLong && <span className="text-indigo-400 font-medium">· 연금 제외</span>}
              </p>
            )}
          </div>

          {/* 오늘 등락 / 누적 수익 / 환율 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-toss-text-tertiary">{data.day_change_label || '오늘'}</span>
                <span className="text-[11px] text-toss-text-tertiary/50">·</span>
                <span className="text-[10px] text-toss-text-tertiary/70">{fmtAbsTime(data.price_updated_at)}</span>
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

      {/* ── Non-sticky: 금일 주가 배지 (미국 / 한국 섹션) ── */}
      {tickerItems.length > 0 && (
        <div className="bg-toss-card border-b border-toss-border">
          <div className="max-w-7xl mx-auto px-5 py-3">
            <div className="flex flex-col sm:flex-row gap-2">
              {/* 미국 주식 */}
              {hasUs && (
                <div className="sm:flex-1 rounded-2xl bg-toss-bg px-3.5 pt-2.5 pb-3">
                  <p className="text-[9px] font-bold text-toss-text-tertiary/80 tracking-[0.12em] uppercase mb-2">미국 주식</p>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {(['nasdaq', 'sp500'] as const).filter(g => groups[g].length > 0).map(g => (
                      <GroupHeaderBadge key={g} label={GROUP_CONFIG[g].label} pct={groupAvgPct(groups[g])} />
                    ))}
                  </div>
                  {usDetailItems.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {usDetailItems.map((item, i) => (
                        <Badge key={i} item={item} hideAssets={hideAssets} />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* 국내 주식 */}
              {groups.korea.length > 0 && (
                <div className="sm:flex-1 rounded-2xl bg-toss-bg px-3.5 pt-2.5 pb-3">
                  <p className="text-[9px] font-bold text-toss-text-tertiary/80 tracking-[0.12em] uppercase mb-2">국내 주식</p>
                  <div className="mb-1.5">
                    <GroupHeaderBadge label={GROUP_CONFIG.korea.label} pct={groupAvgPct(groups.korea)} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {groups.korea.map((item, i) => (
                      <Badge key={i} item={item} hideAssets={hideAssets} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
