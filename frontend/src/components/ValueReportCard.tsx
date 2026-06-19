import { Banknote, Clock3, ReceiptText, Sparkles } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import { fmtKRW } from '../utils';

export default function ValueReportCard({ data, hideAssets }: { data: PortfolioSummary; hideAssets: boolean }) {
  const tax = data.tax_optimization;
  const cash = data.cash_total_krw ?? 0;
  const cashDrag = Math.round(cash * 0.03);
  const possibleRefund = tax ? Math.max(0, tax.pension.max_refund_krw - tax.pension.expected_refund_krw) : 0;
  const taxExposure = tax?.direct_us.estimated_tax_if_full_sale_krw ?? 0;

  const money = (value: number) => hideAssets ? '••••' : fmtKRW(value);
  return (
    <section className="bg-gradient-to-br from-toss-blue-soft to-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5">
      <div className="flex items-center gap-2">
        <Sparkles size={17} className="text-toss-blue" />
        <h3 className="text-sm font-semibold text-toss-text-primary">이번 달 가치 리포트</h3>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-3 rounded-2xl bg-toss-card/80 p-3.5">
          <Banknote size={18} className="text-toss-success" />
          <div className="flex-1"><p className="text-xs text-toss-text-tertiary">추가 연금 납입 시 가능한 세액공제</p><p className="mt-1 text-sm font-bold text-toss-text-primary">최대 {money(possibleRefund)}</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-toss-card/80 p-3.5">
          <Clock3 size={18} className="text-toss-blue" />
          <div className="flex-1"><p className="text-xs text-toss-text-tertiary">현금의 연 3% 기회비용 가정</p><p className="mt-1 text-sm font-bold text-toss-text-primary">연 {money(cashDrag)}</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-toss-card/80 p-3.5">
          <ReceiptText size={18} className="text-toss-warning" />
          <div className="flex-1"><p className="text-xs text-toss-text-tertiary">미국 직접투자 전량 매도 시 예상 세금</p><p className="mt-1 text-sm font-bold text-toss-text-primary">{money(taxExposure)}</p></div>
        </div>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-toss-text-tertiary">세율·수수료·3% 기회비용 가정에 따른 추정치입니다. 실제 절감액이나 수익을 보장하지 않습니다.</p>
    </section>
  );
}
