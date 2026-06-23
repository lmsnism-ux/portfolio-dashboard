import type { CashFlowRecord, HistoryPoint, InvestmentDecision, PerformanceSummary, PortfolioSummary, TradeAggregate, TradeRecord } from './types';

// dev에서는 vite proxy가 /api를 백엔드로 forward.
// 배포 시 VITE_API_BASE=https://your-api.onrender.com 같이 지정.
// 끝 슬래시 정규화: '/' 중복 방지
const _RAW_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');
const BASE = `${_RAW_BASE}/api`;

async function writeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, cache: 'no-store' });
}

async function readFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, cache: 'no-store' });
}

// 콜드스타트(Render 절전 30~60초) 동안 빈 화면 대신 직전 스냅샷을 즉시 보여주기 위한 캐시
const PORTFOLIO_CACHE = 'pd_portfolio_cache';

export function readCachedPortfolio(): PortfolioSummary | undefined {
  try {
    const raw = localStorage.getItem(PORTFOLIO_CACHE);
    return raw ? (JSON.parse(raw) as PortfolioSummary) : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchPortfolio(): Promise<PortfolioSummary> {
  const res = await readFetch(`${BASE}/portfolio`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json()) as PortfolioSummary;
  try {
    localStorage.setItem(PORTFOLIO_CACHE, JSON.stringify(data));
  } catch {
    /* 저장 용량 초과 등은 무시 (캐시는 보조 기능) */
  }
  return data;
}

export async function fetchHistory(days = 365): Promise<HistoryPoint[]> {
  const res = await readFetch(`${BASE}/history?days=${days}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return json.items as HistoryPoint[];
}

export async function fetchPerformance(days = 730): Promise<PerformanceSummary> {
  const res = await readFetch(`${BASE}/performance?days=${days}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchCashFlows(days = 730): Promise<CashFlowRecord[]> {
  const res = await readFetch(`${BASE}/cash-flows?days=${days}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return json.items as CashFlowRecord[];
}

export async function createCashFlow(body: {
  flow_type: 'deposit' | 'withdrawal';
  amount_krw: number;
  occurred_on: string;
  account_name?: string | null;
  note?: string | null;
}): Promise<void> {
  const res = await writeFetch(`${BASE}/cash-flows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function deleteCashFlow(id: number): Promise<void> {
  const res = await writeFetch(`${BASE}/cash-flows/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function fetchDecisions(): Promise<InvestmentDecision[]> {
  const res = await readFetch(`${BASE}/decisions`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).items as InvestmentDecision[];
}

export async function createDecision(body: { title: string; thesis: string; review_on?: string | null }): Promise<void> {
  const res = await writeFetch(`${BASE}/decisions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function updateDecision(id: number, body: { status: 'planned' | 'done' | 'dismissed'; outcome_note?: string | null }): Promise<void> {
  const res = await writeFetch(`${BASE}/decisions/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function triggerRefresh(): Promise<void> {
  await writeFetch(`${BASE}/prices/refresh`, { method: 'POST' });
}

export async function triggerBackfill(days = 30): Promise<{ filled_days: number }> {
  const res = await writeFetch(`${BASE}/history/backfill?days=${days}`, { method: 'POST' });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export interface HoldingPatch {
  account_name: string;
  holding_key: string;
  shares?: number | null;
  avg_price_krw?: number | null;
  avg_price_usd?: number | null;
  snapshot_value_krw?: number | null;
  snapshot_value_usd?: number | null;
  ticker?: string | null;
  asset_class?: string | null;
  remove_auto_buy?: boolean;
  auto_buy?: {
    enabled: boolean;
    amount_usd?: number | null;
    amount_krw?: number | null;
    frequency?: string;
  } | null;
}

export async function patchHolding(body: HoldingPatch): Promise<void> {
  const res = await writeFetch(`${BASE}/portfolio/holding`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
}

export async function patchHoldingsBulk(updates: HoldingPatch[]): Promise<void> {
  const res = await writeFetch(`${BASE}/portfolio/holdings/bulk`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
}

export async function patchGoal(body: { goal_krw?: number; long_goal_krw?: number }): Promise<void> {
  const res = await writeFetch(`${BASE}/portfolio/goal`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export interface HoldingCreate {
  account_name: string;
  name: string;
  ticker?: string | null;
  shares?: number | null;
  avg_price_krw?: number | null;
  avg_price_usd?: number | null;
  snapshot_value_krw?: number | null;
  snapshot_value_usd?: number | null;
  asset_class?: string | null;
  region?: string | null;
  asset_type?: string | null;
  auto_buy?: {
    enabled: boolean;
    amount_usd?: number | null;
    amount_krw?: number | null;
    frequency?: string;
  } | null;
}

export async function createHolding(body: HoldingCreate): Promise<void> {
  const res = await writeFetch(`${BASE}/portfolio/holding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
}

export async function deleteHolding(account_name: string, holding_key: string): Promise<void> {
  const res = await writeFetch(`${BASE}/portfolio/holding`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_name, holding_key }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
}

export interface AccountCreate {
  name: string;
  type: string;
  currency?: string;
  etf_limit?: number | null;
}

export async function createAccount(body: AccountCreate): Promise<void> {
  const res = await writeFetch(`${BASE}/portfolio/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
}

export async function deleteAccount(name: string): Promise<void> {
  const res = await writeFetch(`${BASE}/portfolio/account?name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
}

export interface TickerHistoryPoint {
  date: string;
  close: number;
  volume: number;
}

export interface TickerHistory {
  ticker: string;
  symbol?: string;
  range: string;
  currency: string;
  items: TickerHistoryPoint[];
}

export interface TickerSearchResult {
  name: string;
  ticker: string;
  symbol: string;
  type: string;
  market: 'KR' | 'US';
}

export async function searchTickers(q: string): Promise<TickerSearchResult[]> {
  if (!q.trim()) return [];
  try {
    const res = await readFetch(`${BASE}/market/search?q=${encodeURIComponent(q.trim())}`);
    if (!res.ok) return [];
    const data = await res.json() as { items: TickerSearchResult[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function fetchTickerHistory(ticker: string, range = '1mo'): Promise<TickerHistory> {
  const res = await fetch(`${BASE}/market/history/${encodeURIComponent(ticker)}?range=${range}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export interface MarketIndexValue {
  label: string;
  symbol: string;
  value: number | null;
  change: number | null;
  change_pct: number | null;
}

export type MarketIndices = Record<string, MarketIndexValue>;
export type MarketSparklines = Record<string, number[]>;

export async function fetchMarketIndices(): Promise<MarketIndices> {
  const res = await fetch(`${BASE}/market/indices`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchMarketSparklines(): Promise<MarketSparklines> {
  const res = await fetch(`${BASE}/market/sparkline`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ─── 체결(매수/매도) 내역 ───
export interface TradeCreate {
  account_name: string;
  holding_key: string;
  name: string;
  ticker?: string | null;
  side: 'buy' | 'sell';
  shares: number;
  price?: number | null;
  currency?: string;
  traded_at?: string | null;
  note?: string | null;
  apply_to_holding?: boolean;
}

export async function createTrade(body: TradeCreate): Promise<{ id: number; holding: unknown }> {
  const res = await writeFetch(`${BASE}/trades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
  return res.json();
}

export async function fetchTrades(
  account_name?: string,
  holding_key?: string,
  limit = 200,
): Promise<{ items: TradeRecord[]; aggregate: TradeAggregate | null }> {
  const params = new URLSearchParams();
  if (account_name) params.set('account_name', account_name);
  if (holding_key) params.set('holding_key', holding_key);
  params.set('limit', String(limit));
  const res = await readFetch(`${BASE}/trades?${params.toString()}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function deleteTrade(id: number): Promise<void> {
  const res = await writeFetch(`${BASE}/trades/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
}

export interface HealthStatus {
  status: string;
  scheduler_running: boolean;
  price_updated_at: string | null;
  cache_stale_hours: number | null;
  price_errors: { ticker: string; error_count: number; last_error: string }[];
}

export async function fetchHealth(): Promise<HealthStatus | null> {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function reorderAccounts(names: string[]): Promise<void> {
  const res = await writeFetch(`${BASE}/portfolio/accounts/order`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function downloadCsv(): Promise<void> {
  const res = await fetch(`${BASE}/export/csv`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`CSV 다운로드 실패 (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `portfolio_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
