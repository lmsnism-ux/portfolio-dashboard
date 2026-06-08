import type { HistoryPoint, PortfolioSummary, TradeAggregate, TradeRecord } from './types';

// dev에서는 vite proxy가 /api를 백엔드로 forward.
// 배포 시 VITE_API_BASE=https://your-api.onrender.com 같이 지정.
// 끝 슬래시 정규화: '/' 중복 방지
const _RAW_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');
const BASE = `${_RAW_BASE}/api`;

// 운영 환경에서 쓰기 작업 시 X-API-Key 헤더 전송. localStorage에 저장.
const API_KEY_STORE = 'pd_api_key';
export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORE) ?? '';
}
export function setApiKey(key: string): void {
  if (key) localStorage.setItem(API_KEY_STORE, key);
  else localStorage.removeItem(API_KEY_STORE);
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = getApiKey();
  return key ? { ...extra, 'X-API-Key': key } : extra;
}

async function writeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = authHeaders((init.headers as Record<string, string>) ?? {});
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    throw new Error('인증이 필요해요. 우상단 ⓘ에서 API 키를 설정해주세요.');
  }
  return res;
}

export async function fetchPortfolio(): Promise<PortfolioSummary> {
  const res = await fetch(`${BASE}/portfolio`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchHistory(days = 365): Promise<HistoryPoint[]> {
  const res = await fetch(`${BASE}/history?days=${days}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return json.items as HistoryPoint[];
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

export async function patchGoal(goal_krw: number): Promise<void> {
  const res = await writeFetch(`${BASE}/portfolio/goal`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal_krw }),
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

export async function fetchSparkline(): Promise<Record<string, number[]>> {
  try {
    const res = await fetch(`${BASE}/market/sparkline`);
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
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

export async function fetchTickerHistory(ticker: string, range = '1mo'): Promise<TickerHistory> {
  const res = await fetch(`${BASE}/market/history/${encodeURIComponent(ticker)}?range=${range}`);
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
  const res = await fetch(`${BASE}/trades?${params.toString()}`);
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

export async function reorderAccounts(names: string[]): Promise<void> {
  const res = await writeFetch(`${BASE}/portfolio/accounts/order`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}
