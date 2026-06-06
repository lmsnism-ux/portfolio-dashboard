export interface AutoBuy {
  enabled: boolean;
  amount_usd?: number;
  amount_krw?: number;
  frequency: string;
}

export interface HoldingData {
  name: string;
  ticker: string | null;
  shares: number | null;
  avg_price: number | null;
  current_price: number | null;
  current_price_display: string | null;
  value_krw: number;
  cost_krw: number | null;
  profit_krw: number | null;
  profit_pct: number | null;
  day_change_pct: number | null;
  day_change_krw: number | null;
  currency: string;
  price_label: string;
  is_snapshot: boolean;
  auto_buy?: AutoBuy;
}

export interface IrpInfo {
  account_name: string;
  etf_ratio: number;
  etf_value: number;
  total_value: number;
  limit: number;
  status: 'ok' | 'warning' | 'danger';
  status_label: string;
  available_krw: number;
  sol_available_shares: number;
  sol_price: number;
}

export interface AccountData {
  name: string;
  type: string;
  value_krw: number;
  cost_krw: number;
  profit_krw: number;
  profit_pct: number | null;
  day_change_krw: number;
  holdings: HoldingData[];
  irp_info: IrpInfo | null;
}

export interface AccountWeight {
  name: string;
  type: string;
  value_krw: number;
  weight: number;
}

export interface TopHolding {
  name: string;
  ticker: string;
  value_krw: number;
  weight: number;
  change_pct: number | null;
}

export interface AutoBuySummary {
  name: string;
  ticker: string;
  account_name: string;
  holding_key: string;
  enabled: boolean;
  frequency: string;
  amount: string;
  amount_krw: number | null;
  next_date: string;
  est_shares_per_buy: number | null;
  est_shares_note: string;
  currency: string;
}

export interface HistoryPoint {
  date: string;
  total_value_krw: number;
  total_cost_krw: number;
  total_profit_krw: number;
  total_profit_pct: number | null;
  usd_krw: number | null;
}

export interface ClassWeight {
  name: string;
  value_krw: number;
  weight: number;
}

export interface PortfolioSummary {
  total_value_krw: number;
  total_cost_krw: number;
  total_profit_krw: number;
  total_profit_pct: number | null;
  total_day_change_krw: number;
  total_day_change_pct: number | null;
  fx_day_change_krw: number;
  usd_krw: number;
  usd_krw_prev: number | null;
  accounts: AccountData[];
  account_weights: AccountWeight[];
  top_holdings: TopHolding[];
  asset_class_weights: ClassWeight[];
  region_weights: ClassWeight[];
  auto_buy_items: AutoBuySummary[];
  goal_krw: number | null;
  goal_progress_pct: number | null;
  market_status: 'live' | 'closed';
  day_change_label: string;
  calculated_at: string;
  price_updated_at: string | null;
  cache_stale_hours: number | null;
  cache_is_stale: boolean;
}
