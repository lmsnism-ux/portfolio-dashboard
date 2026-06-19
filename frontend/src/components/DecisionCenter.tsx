import { AlertTriangle, ArrowRight, Banknote, CircleCheck, Clock3, ShieldAlert, Target } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import { fmtKRW } from '../utils';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
  onOpenAnalysis: () => void;
}

function monthlyAutoBuy(data: PortfolioSummary): number {
  return (data.auto_buy_items ?? []).reduce((sum, item) => {
    const amount = item.amount_krw ?? 0;
    if (/영업일|daily/i.test(item.frequency)) return sum + amount * 21.7;
    if (/주|weekly/i.test(item.frequency)) return sum + amount * 4.33;
    return sum + amount;
  }, 0);
}

export default function DecisionCenter({ data, hideAssets, onOpenAnalysis }: Props) {
  const total = Math.max(data.invest_only_value_krw ?? data.total_value_krw, 1);
  const cash = data.cash_total_krw ?? 0;
  const cashPct = cash / total * 100;
  const top = data.top_holdings?.[0];
  const tax = data.tax_optimization;
  const contribution = monthlyAutoBuy(data);
  const remaining = data.goal_krw ? Math.max(0, data.goal_krw - total) : 0;
  const months = contribution > 0 ? Math.ceil(remaining / contribution) : null;
  const goalDate = months !== null
    ? new Date(new Date().getFullYear(), new Date().getMonth() + months, 1)
    : null;

  const actions = [
    top && top.weight >= 20 ? {
      icon: ShieldAlert,
      tone: 'amber',
      title: `${top.name} 집중도 확인`,
      detail: `투자 자산의 ${top.weight.toFixed(1)}%를 차지합니다.`,
      impact: '단일 종목 위험 점검',
    } : null,
    tax && tax.pension.add_pension_savings_krw + tax.pension.add_irp_krw > 0 ? {
      icon: Banknote,
      tone: 'blue',
      title: '연금 세액공제 여유',
      detail: `추가 납입 검토액 ${fmtKRW(tax.pension.add_pension_savings_krw + tax.pension.add_irp_krw)}`,
      impact: `최대 환급 ${fmtKRW(Math.max(0, tax.pension.max_refund_krw - tax.pension.expected_refund_krw))}`,
    } : null,
    cashPct >= 10 ? {
      icon: Clock3,
      tone: 'slate',
      title: '유휴 현금 계획 확인',
      detail: `투자 자산 대비 현금 ${cashPct.toFixed(1)}%입니다.`,
      impact: '목표 현금 비중과 비교',
    } : null,
    data.cache_is_stale ? {
      icon: AlertTriangle,
      tone: 'red',
      title: '가격 데이터 갱신 필요',
      detail: `${Math.round(data.cache_stale_hours ?? 0)}시간 동안 갱신되지 않았습니다.`,
      impact: '분석 신뢰도 낮음',
    } : null,
  ].filter(Boolean) as Array<{ icon: typeof Target; tone: string; title: string; detail: string; impact: string }>;

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-widest text-toss-blue uppercase">Decision Center</p>
          <h2 className="mt-1 text-lg font-bold text-toss-text-primary">오늘 확인할 것</h2>
        </div>
        <button onClick={onOpenAnalysis} className="min-h-11 inline-flex items-center gap-1 text-sm font-semibold text-toss-blue">
          전체 분석 <ArrowRight size={15} />
        </button>
      </div>

      <div className="px-5 pb-5 space-y-2.5">
        {actions.length ? actions.slice(0, 3).map(({ icon: Icon, tone, title, detail, impact }) => (
          <button key={title} onClick={onOpenAnalysis} className="w-full min-h-[76px] rounded-2xl bg-toss-bg px-4 py-3 flex items-center gap-3 text-left">
            <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tone === 'red' ? 'bg-red-500/10 text-red-500' : tone === 'amber' ? 'bg-amber-500/10 text-amber-500' : 'bg-toss-blue-soft text-toss-blue'}`}>
              <Icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-toss-text-primary">{title}</strong>
              <small className="block mt-1 text-xs text-toss-text-secondary">{detail}</small>
            </span>
            <span className="max-w-24 text-right text-[10px] font-semibold text-toss-blue">{impact}</span>
          </button>
        )) : (
          <div className="rounded-2xl bg-toss-bg p-4 flex gap-3 items-center">
            <CircleCheck className="text-toss-success" size={20} />
            <p className="text-sm font-semibold text-toss-text-primary">지금 바로 확인할 큰 이탈이 없습니다.</p>
          </div>
        )}

        {data.goal_krw && (
          <div className="rounded-2xl border border-toss-border p-4 flex items-center gap-3">
            <Target size={19} className="text-toss-blue shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-toss-text-tertiary">현재 자동매수 속도 기준</p>
              <p className="mt-1 text-sm font-bold text-toss-text-primary">
                {months === 0 ? '목표를 달성했습니다.' : goalDate ? `${goalDate.getFullYear()}년 ${goalDate.getMonth() + 1}월 목표 도달 예상` : '자동매수 계획을 설정하면 도달 시점을 계산합니다.'}
              </p>
            </div>
            {!hideAssets && contribution > 0 && <span className="text-xs font-semibold text-toss-text-secondary">월 {fmtKRW(contribution)}</span>}
          </div>
        )}
        <p className="px-1 text-[10px] leading-relaxed text-toss-text-tertiary">도달 시점은 투자수익률 0%의 단순 적립 기준이며 수익을 보장하지 않습니다.</p>
      </div>
    </section>
  );
}
