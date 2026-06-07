import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { chartColor, fmtKRW, colorClass } from '../utils';
import type { PortfolioSummary } from '../types';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
}

const ToolTipBox = ({ active, payload, hideAssets }: any) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div
      className="bg-toss-card border border-toss-border rounded-xl px-3 py-2"
      style={{ boxShadow: 'var(--shadow-toss-pop)' }}
    >
      <p className="text-xs text-toss-text-secondary font-semibold">{item.name}</p>
      {item.ticker && <p className="text-[10px] text-toss-text-tertiary">{item.ticker}</p>}
      <p className="num text-sm font-bold text-toss-text-primary mt-0.5">
        {item.weight.toFixed(2)}%
      </p>
      <p className="num text-xs text-toss-text-secondary">
        {hideAssets ? '••••' : fmtKRW(item.value)}
      </p>
      {item.profit_krw !== null && (
        <p className={`num text-xs mt-1 ${colorClass(item.profit_krw)}`}>
          수익 {item.profit_krw >= 0 ? '+' : ''}{hideAssets ? '••••' : fmtKRW(item.profit_krw)}
          {item.profit_pct !== null && (
            <span className="ml-1">({item.profit_pct >= 0 ? '+' : ''}{item.profit_pct.toFixed(2)}%)</span>
          )}
        </p>
      )}
    </div>
  );
};

export default function HoldingsBar({ data, hideAssets }: Props) {
  const items = useMemo(() => {
    // holdings에서 profit 정보 매핑
    const profitMap = new Map<string, { profit_krw: number | null; profit_pct: number | null }>();
    data.accounts.flatMap(a => a.holdings).forEach(h => {
      profitMap.set(h.ticker ?? h.name, {
        profit_krw: h.profit_krw,
        profit_pct: h.profit_pct,
      });
    });

    return data.top_holdings.slice(0, 15).map((h, i) => {
      const prof = profitMap.get(h.ticker ?? h.name);
      return {
        name: h.name,
        ticker: h.ticker,
        weight: h.weight,
        value: h.value_krw,
        fill: chartColor(i),
        profit_krw: prof?.profit_krw ?? null,
        profit_pct: prof?.profit_pct ?? null,
      };
    });
  }, [data]);

  const barH = Math.max(items.length * 36 + 16, 100);

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-4">
      <h3 className="text-xs font-semibold text-toss-text-secondary mb-3">
        종목별 비중 (상위 {items.length})
      </h3>
      <ResponsiveContainer width="100%" height={barH}>
        <BarChart
          data={items}
          layout="vertical"
          margin={{ top: 0, right: 90, left: 0, bottom: 0 }}
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: 'var(--color-toss-text-secondary)' }}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip content={<ToolTipBox hideAssets={hideAssets} />} cursor={false} />
          <Bar
            dataKey="weight"
            radius={[0, 4, 4, 0]}
            minPointSize={4}
            label={{
              position: 'right',
              fontSize: 10,
              fill: 'var(--color-toss-text-tertiary)',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter: (v: any) => v != null ? `${Number(v).toFixed(1)}%` : '',
            }}
          >
            {items.map((item, i) => (
              <Cell key={i} fill={item.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
