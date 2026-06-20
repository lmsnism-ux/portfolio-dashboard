import { AlertTriangle, ArrowRight, Banknote, CircleCheck, ShieldAlert } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import { fmtKRW } from '../utils';

interface Props {
  data: PortfolioSummary;
  onOpenAnalysis: () => void;
}

export default function DecisionCenter({ data, onOpenAnalysis }: Props) {
  const top = data.top_holdings?.[0];
  const tax = data.tax_optimization;
  const pensionRoom = tax
    ? tax.pension.add_pension_savings_krw + tax.pension.add_irp_krw
    : 0;

  const primary = data.cache_is_stale
    ? {
        Icon: AlertTriangle,
        tone: 'warning',
        title: '가격 정보 확인이 필요해요',
        detail: `${Math.round(data.cache_stale_hours ?? 0)}시간 동안 갱신되지 않았습니다.`,
      }
    : top && top.weight >= 20
      ? {
          Icon: ShieldAlert,
          tone: 'warning',
          title: `${top.name} 비중이 높아요`,
          detail: `투자 자산의 ${top.weight.toFixed(1)}%입니다. 목표 비중과 비교해 보세요.`,
        }
      : pensionRoom > 0
        ? {
            Icon: Banknote,
            tone: 'blue',
            title: '연금 세액공제 여유가 있어요',
            detail: `추가 납입 검토액은 ${fmtKRW(pensionRoom)}입니다.`,
          }
        : {
            Icon: CircleCheck,
            tone: 'success',
            title: '지금 확인할 큰 이탈이 없어요',
            detail: '목표와 자산 배분이 안정적으로 유지되고 있습니다.',
          };
  const PrimaryIcon = primary.Icon;

  return (
    <section className="surface-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="section-kicker">오늘의 포트폴리오</p>
          <h2 className="mt-1 text-[19px] font-bold text-toss-text-primary">{primary.title}</h2>
        </div>
        <span className={`status-icon ${primary.tone}`}><PrimaryIcon size={21} /></span>
      </div>
      <p className="mt-3 text-[14px] leading-6 text-toss-text-secondary">{primary.detail}</p>
      <button onClick={onOpenAnalysis} className="mt-4 flex min-h-11 items-center gap-1 text-[14px] font-semibold text-toss-blue">
        자세히 보기 <ArrowRight size={16} />
      </button>
    </section>
  );
}
