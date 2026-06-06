import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { chartColor, fmtKRW } from '../utils';

interface Item {
  name: string;
  value: number;
  weight: number;
}

interface Props {
  data: Item[];
  title: string;
  hideAssets?: boolean;
}

export default function DonutChart({ data, title, hideAssets = false }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const total = data.reduce((s, x) => s + x.value, 0);
  const active = activeIdx !== null ? data[activeIdx] : null;

  return (
    <div className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5">
      <h3 className="text-sm font-semibold text-toss-text-secondary mb-2">{title}</h3>

      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={88}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              onMouseEnter={(_, i) => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={chartColor(i)}
                  opacity={activeIdx === null || activeIdx === i ? 1 : 0.35}
                  style={{ transition: 'opacity 0.15s' }}
                />
              ))}
            </Pie>
            <Tooltip content={() => null} cursor={false} />
          </PieChart>
        </ResponsiveContainer>

        {/* 중앙: 호버 중이면 그 항목, 아니면 합계 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
          {active ? (
            <>
              <span className="text-[10px] text-toss-text-tertiary truncate max-w-[110px]">
                {active.name}
              </span>
              <span className="num text-base font-bold text-toss-text-primary truncate max-w-[110px]">
                {hideAssets ? '••••' : fmtKRW(active.value)}
              </span>
              <span className="num text-[11px] text-toss-blue font-semibold">
                {active.weight.toFixed(1)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] text-toss-text-tertiary">합계</span>
              <span className="num text-base font-bold text-toss-text-primary">
                {hideAssets ? '••••' : fmtKRW(total)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 범례 */}
      <ul className="mt-3 space-y-1.5">
        {data.slice(0, 6).map((item, i) => (
          <li
            key={i}
            onMouseEnter={() => setActiveIdx(i)}
            onMouseLeave={() => setActiveIdx(null)}
            className={`flex items-center justify-between text-xs cursor-default transition-colors ${
              activeIdx === i ? 'text-toss-text-primary' : ''
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: chartColor(i) }}
              />
              <span className="text-toss-text-secondary truncate">{item.name}</span>
            </div>
            <span className="num text-toss-text-primary font-medium tabular-nums shrink-0">
              {item.weight.toFixed(1)}%
            </span>
          </li>
        ))}
        {data.length > 6 && (
          <li className="text-[11px] text-toss-text-tertiary text-center pt-1">
            +{data.length - 6}개 더
          </li>
        )}
      </ul>
    </div>
  );
}
