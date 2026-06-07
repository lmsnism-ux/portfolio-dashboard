import type { PortfolioSummary } from '../types';
import DonutChart from './DonutChart';
import { fmtKRW } from '../utils';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
}

type RiskLevel = '위험자산' | '혼합자산' | '안전자산';

const RISK_MAP: Record<string, RiskLevel> = {
  '주식': '위험자산',
  '혼합(TDF)': '혼합자산',
  '혼합': '혼합자산',
  '채권': '안전자산',
  '예금': '안전자산',
  '현금': '안전자산',
  '현금성': '안전자산',
};

const RISK_CONFIG: Record<RiskLevel, { color: string; bg: string; text: string }> = {
  '위험자산': { color: '#F04452', bg: 'bg-toss-up-soft', text: 'text-toss-up' },
  '혼합자산': { color: '#F5A623', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  '안전자산': { color: '#3182F6', bg: 'bg-toss-blue-soft', text: 'text-toss-down' },
};

const RISK_ORDER: RiskLevel[] = ['위험자산', '혼합자산', '안전자산'];

export default function AllocationCard({ data, hideAssets }: Props) {
  const accountItems = data.account_weights.map((a) => ({
    name: a.name,
    value: a.value_krw,
    weight: a.weight,
  }));
  const classItems = data.asset_class_weights.map((c) => ({
    name: c.name,
    value: c.value_krw,
    weight: c.weight,
  }));
  const regionItems = data.region_weights.map((c) => ({
    name: c.name,
    value: c.value_krw,
    weight: c.weight,
  }));

  // 위험/혼합/안전 자산 분류
  const riskTotals: Record<RiskLevel, number> = { '위험자산': 0, '혼합자산': 0, '안전자산': 0 };
  const totalVal = data.asset_class_weights.reduce((s, c) => s + c.value_krw, 0);
  data.asset_class_weights.forEach((c) => {
    const level = RISK_MAP[c.name] ?? '위험자산';
    riskTotals[level] += c.value_krw;
  });

  const riskItems = RISK_ORDER
    .filter((r) => riskTotals[r] > 0)
    .map((r) => ({
      label: r,
      value: riskTotals[r],
      pct: totalVal > 0 ? (riskTotals[r] / totalVal) * 100 : 0,
      ...RISK_CONFIG[r],
    }));

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <DonutChart data={accountItems} title="계좌별 비중" hideAssets={hideAssets} compact />
        <DonutChart data={classItems} title="자산군 비중" hideAssets={hideAssets} compact />
        <DonutChart data={regionItems} title="지역 비중" hideAssets={hideAssets} compact />
      </div>

      {/* 위험자산 / 안전자산 분류 바 */}
      {riskItems.length > 0 && (
        <div className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-4">
          <h3 className="text-xs font-semibold text-toss-text-secondary mb-3">위험 자산 구성</h3>

          {/* 스택 바 */}
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
            {riskItems.map((r) => (
              <div
                key={r.label}
                className="h-full rounded-full transition-all"
                style={{ width: `${r.pct}%`, background: r.color }}
              />
            ))}
          </div>

          {/* 항목별 라벨 */}
          <div className="grid grid-cols-3 gap-2">
            {riskItems.map((r) => (
              <div
                key={r.label}
                className={`rounded-xl px-3 py-2.5 ${r.bg}`}
              >
                <div className="flex items-center gap-1 mb-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: r.color }}
                  />
                  <span className={`text-[10px] font-semibold ${r.text}`}>{r.label}</span>
                </div>
                <p className={`num text-sm font-bold ${r.text}`}>{r.pct.toFixed(1)}%</p>
                {!hideAssets && (
                  <p className={`num text-[10px] mt-0.5 ${r.text} opacity-70`}>
                    {fmtKRW(r.value)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
