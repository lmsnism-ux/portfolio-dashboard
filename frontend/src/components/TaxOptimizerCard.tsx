import { AlertTriangle, Landmark, PiggyBank, ReceiptText, ShieldCheck, TrendingUp, type LucideIcon } from 'lucide-react';
import type { TaxOptimizationSummary } from '../types';
import { fmtKRW } from '../utils';

interface Props {
  tax?: TaxOptimizationSummary;
  hideAssets: boolean;
}

const MASK = '••••';

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function shares(value: number): string {
  return `${value.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}주`;
}

function money(value: number, hideAssets: boolean): string {
  return hideAssets ? MASK : fmtKRW(value);
}

function barPct(value: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.max(0, (value / limit) * 100));
}

export default function TaxOptimizerCard({ tax, hideAssets }: Props) {
  if (!tax) return null;

  const direct = tax.direct_us;
  const pension = tax.pension;
  const isa = tax.isa;
  const directOver = direct.taxable_gain_if_full_sale_krw > 0;
  const isaOver = isa.taxable_profit_krw > 0;
  const firstSell = direct.recommended_sells[0];

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
          <ReceiptText size={15} className="text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-toss-text-primary">절세 최적화</h3>
          <p className="text-[11px] text-toss-text-tertiary mt-0.5">
            {tax.year}년 보유 자산 기준 자동 계산
          </p>
        </div>
        <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
          실시간 연동
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <SummaryTile
          icon={TrendingUp}
          label="미국 직투"
          value={money(direct.estimated_unrealized_gain_krw, hideAssets)}
          caption={directOver ? `세금 예상 ${money(direct.estimated_tax_if_full_sale_krw, hideAssets)}` : '비과세권'}
          tone={directOver ? 'danger' : 'success'}
        />
        <SummaryTile
          icon={PiggyBank}
          label="연금·IRP"
          value={money(pension.expected_refund_krw, hideAssets)}
          caption={`공제율 ${pct(pension.credit_rate)}`}
          tone="blue"
        />
        <SummaryTile
          icon={Landmark}
          label="ISA"
          value={money(isa.profit_krw, hideAssets)}
          caption={isaOver ? `초과 ${money(isa.taxable_profit_krw, hideAssets)}` : '한도 내'}
          tone={isaOver ? 'danger' : 'success'}
        />
      </div>

      <div className="space-y-3">
        <LimitRow
          label="미국 직투 비과세 한도"
          used={Math.max(0, direct.estimated_unrealized_gain_krw)}
          limit={direct.limit_krw}
          hideAssets={hideAssets}
          danger={directOver}
        />
        <LimitRow
          label="연금 세액공제 한도"
          used={pension.deductible_krw}
          limit={9_000_000}
          hideAssets={hideAssets}
        />
        <LimitRow
          label="ISA 비과세 한도"
          used={Math.max(0, isa.profit_krw)}
          limit={isa.tax_free_limit_krw}
          hideAssets={hideAssets}
          danger={isaOver}
        />
      </div>

      <div className="rounded-2xl bg-toss-bg p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={16} className="text-emerald-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-toss-text-primary">오늘 할 일</p>
            <p className="text-[12px] text-toss-text-secondary leading-relaxed mt-1">
              {firstSell
                ? `${firstSell.ticker || firstSell.name} ${shares(firstSell.safe_sell_shares)}까지 매도하면 예상 차익 ${money(firstSell.expected_gain_krw, hideAssets)}를 한도 안에서 실현할 수 있어요.`
                : direct.holdings_count > 0
                  ? '미국 직투 전량 매도 기준으로 아직 비과세 한도 안에 있어요.'
                  : '과세 대상 미국 직투 종목이 없어요.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <ActionPill
            label="연금저축 추가"
            value={money(pension.add_pension_savings_krw, hideAssets)}
          />
          <ActionPill
            label="IRP 추가"
            value={money(pension.add_irp_krw, hideAssets)}
          />
        </div>

        {pension.source === 'missing' && (
          <p className="text-[11px] text-amber-400 leading-relaxed">
            올해 납입액 필드가 없어 연금 환급액은 0원 기준으로 보수 계산했어요.
          </p>
        )}
      </div>

      {tax.alerts.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-500/10 px-3 py-2.5">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-500 dark:text-amber-300 leading-relaxed">
            {tax.alerts[0]}
          </p>
        </div>
      )}
    </section>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  caption: string;
  tone: 'success' | 'danger' | 'blue';
}) {
  const colorMap: Record<'success' | 'danger' | 'blue', { icon: string; caption: string; captionBg: string }> = {
    success: { icon: 'text-emerald-400', caption: 'text-emerald-400', captionBg: 'bg-emerald-500/10' },
    danger: { icon: 'text-toss-up', caption: 'text-toss-up', captionBg: 'bg-toss-up-soft' },
    blue: { icon: 'text-toss-blue', caption: 'text-toss-blue', captionBg: 'bg-toss-blue-soft' },
  };
  const colors = colorMap[tone];

  return (
    <div className="rounded-2xl bg-toss-bg px-3 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={13} className={colors.icon} />
        <span className="text-[11px] font-semibold text-toss-text-secondary">{label}</span>
      </div>
      <p className="num text-sm font-extrabold text-toss-text-primary truncate">{value}</p>
      <p className={`text-[10px] mt-1 inline-block rounded-full px-1.5 py-0.5 font-semibold ${colors.captionBg} ${colors.caption}`}>
        {caption}
      </p>
    </div>
  );
}

function LimitRow({
  label,
  used,
  limit,
  hideAssets,
  danger = false,
}: {
  label: string;
  used: number;
  limit: number;
  hideAssets: boolean;
  danger?: boolean;
}) {
  const width = barPct(used, limit);
  const color = danger ? '#F04452' : '#2DAF4E';

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-medium text-toss-text-secondary">{label}</p>
        <p className="num text-[11px] text-toss-text-tertiary">
          {money(used, hideAssets)} / {money(limit, hideAssets)}
        </p>
      </div>
      <div className="h-2 rounded-full bg-toss-bg overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ActionPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-toss-card border border-toss-border px-3 py-2.5">
      <p className="text-[10px] text-toss-text-tertiary">{label}</p>
      <p className="num text-[13px] font-bold text-toss-text-primary mt-0.5">{value}</p>
    </div>
  );
}
