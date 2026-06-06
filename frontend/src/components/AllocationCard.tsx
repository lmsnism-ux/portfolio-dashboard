import { useState } from 'react';
import type { PortfolioSummary } from '../types';
import DonutChart from './DonutChart';

type Mode = 'account' | 'holding' | 'class' | 'region';

const TABS: { key: Mode; label: string }[] = [
  { key: 'account', label: '계좌별' },
  { key: 'holding', label: '종목별' },
  { key: 'class', label: '자산군' },
  { key: 'region', label: '지역' },
];

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
}

export default function AllocationCard({ data, hideAssets }: Props) {
  const [mode, setMode] = useState<Mode>('account');

  const items = (() => {
    switch (mode) {
      case 'account':
        return data.account_weights.map((a) => ({ name: a.name, value: a.value_krw, weight: a.weight }));
      case 'holding':
        return data.top_holdings.map((h) => ({ name: h.name, value: h.value_krw, weight: h.weight }));
      case 'class':
        return data.asset_class_weights.map((c) => ({ name: c.name, value: c.value_krw, weight: c.weight }));
      case 'region':
        return data.region_weights.map((c) => ({ name: c.name, value: c.value_krw, weight: c.weight }));
    }
  })();

  const title = (() => {
    switch (mode) {
      case 'account':
        return '계좌별 비중';
      case 'holding':
        return '종목별 비중 (상위 10)';
      case 'class':
        return '자산군 비중';
      case 'region':
        return '지역 비중';
    }
  })();

  return (
    <section className="space-y-3">
      {/* 토글 */}
      <div className="flex bg-toss-card rounded-full p-1 border border-toss-border shadow-[var(--shadow-toss-card)] overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={`flex-1 min-w-[64px] py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
              mode === t.key
                ? 'bg-toss-blue text-white'
                : 'text-toss-text-secondary hover:bg-toss-bg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <DonutChart data={items} title={title} hideAssets={hideAssets} />
    </section>
  );
}
