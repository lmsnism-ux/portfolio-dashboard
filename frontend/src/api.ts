import type { HistoryPoint, PortfolioSummary } from './types';

// dev에서는 vite proxy가 /api를 백엔드로 forward.
// 배포 시 VITE_API_BASE=https://your-api.onrender.com 같이 지정.
const BASE = (import.meta.env.VITE_API_BASE || '') + '/api';

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
  await fetch(`${BASE}/prices/refresh`, { method: 'POST' });
}

export async function triggerBackfill(days = 30): Promise<{ filled_days: number }> {
  const res = await fetch(`${BASE}/history/backfill?days=${days}`, { method: 'POST' });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export interface HoldingPatch {
  account_name: string;
  holding_key: string;
  shares?: number | null;
  avg_price_krw?: number | null;
  avg_price_usd?: number | null;
  auto_buy?: {
    enabled: boolean;
    amount_usd?: number | null;
    amount_krw?: number | null;
    frequency?: string;
  } | null;
}

export async function patchHolding(body: HoldingPatch): Promise<void> {
  const res = await fetch(`${BASE}/portfolio/holding`, {
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
  const res = await fetch(`${BASE}/portfolio/goal`, {
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
  const res = await fetch(`${BASE}/portfolio/holding`, {
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
  const res = await fetch(`${BASE}/portfolio/holding`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_name, holding_key }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
}

export async function reorderAccounts(names: string[]): Promise<void> {
  const res = await fetch(`${BASE}/portfolio/accounts/order`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}
