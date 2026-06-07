import type { PortfolioSummary } from '../types';
import DonutChart from './DonutChart';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
}

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

  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <DonutChart data={accountItems} title="계좌별 비중" hideAssets={hideAssets} compact />
      <DonutChart data={classItems} title="자산군 비중" hideAssets={hideAssets} compact />
      <DonutChart data={regionItems} title="지역 비중" hideAssets={hideAssets} compact />
    </section>
  );
}
