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
  /** 가격 fetched_at (ISO, KST). 시장 구분에서 시점 표시에 사용 */
  fetched_at?: string;
  currency: string;
  price_label: string;
  is_snapshot: boolean;
  auto_buy?: AutoBuy;
  /** 포트폴리오 메타: 시장/자산 분류용 */
  region?: string;         // '국내' | '미국' | '글로벌' | '신흥국' 등
  asset_class?: string;    // '주식' | '혼합(TDF)' | '현금' | '예금' 등
  asset_type?: string;     // 'ETF' | '안전자산' 등 IRP 한도 계산용
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
  /** 계좌 기본 통화 (KRW/USD). 백엔드 portfolio.json에 정의된 값. */
  currency?: string;
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
  /** 라벨 (예: '매 영업일') */
  frequency: string;
  /** 백엔드 키 (예: 'daily_weekday') — 편집 폼 초기값으로 사용 */
  frequency_key?: string;
  amount: string;
  amount_krw: number | null;
  next_date: string;
  est_shares_per_buy: number | null;
  est_shares_note: string;
  currency: string;
}

export interface LoanInfo {
  balance_krw: number;
  rate_pct: number;
  repayment_type: string;
  last_payment_krw: number;
  last_payment_date: string;
}

export interface PropertyData {
  name: string;
  purchase_price_krw: number;
  current_value_krw: number;
  loan?: LoanInfo;
}

export interface RealEstateData {
  properties: PropertyData[];
}

export interface CashItem {
  name: string;
  balance_krw: number;
  interest_rate_pct?: number;
  maturity_date?: string;
}

export interface CashAssetsData {
  items: CashItem[];
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

export interface TradeRecord {
  id: number;
  account_name: string;
  holding_key: string;
  name: string;
  ticker: string | null;
  side: 'buy' | 'sell';
  shares: number;
  price: number | null;
  currency: string;
  traded_at: string;
  recorded_at: string;
  note: string | null;
}

export interface TradeAggregate {
  trade_count: number;
  total_buy_shares: number;
  total_buy_amount: number;
  total_sell_shares: number;
  net_shares: number;
  avg_price_from_trades: number | null;
}

// ── 시장 인사이트 (뉴스 + 기술적 시그널) ──
export interface InsightNews {
  title: string | null;
  publisher: string | null;
  link: string | null;
  published_at: string | null;
}

export interface HoldingSignal {
  name: string;
  ticker: string;
  exchange: 'KR' | 'US';
  signal: 'buy' | 'hold' | 'sell';
  signal_label: string;
  rsi: number | null;
  mom20_pct: number | null;
  reasons: string[];
}

export interface MarketInsights {
  generated_at: string;
  news: { kospi: InsightNews[]; nasdaq: InsightNews[] };
  signals: HoldingSignal[];
  disclaimer: string;
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
  real_estate?: RealEstateData;
  real_estate_equity_krw?: number;
  real_estate_cost_krw?: number;
  real_estate_gross_value_krw?: number;
  real_estate_loan_krw?: number;
  /** DC/퇴직 계좌 합계 (Header DC 토글에 사용) */
  dc_value_krw?: number;
  dc_cost_krw?: number;
  dc_day_change_krw?: number;
  /** 투자(부동산·DC 제외) 합계 — Header / GoalCard에서 즉시 사용 */
  invest_only_value_krw?: number;
  invest_only_cost_krw?: number;
  cash_assets?: CashAssetsData;
  cash_total_krw?: number;
  calculated_at: string;
  price_updated_at: string | null;
  cache_stale_hours: number | null;
  cache_is_stale: boolean;
}
