import { AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import type { IrpInfo } from '../types';
import { fmtKRW } from '../utils';

interface Props {
  info: IrpInfo;
  hideAssets?: boolean;
}

const STATUS = {
  ok: {
    color: 'text-toss-success',
    barColor: '#1B6D2F',
    icon: CheckCircle,
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/40',
  },
  warning: {
    color: 'text-toss-warning',
    barColor: '#C56F00',
    icon: AlertCircle,
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
  },
  danger: {
    color: 'text-toss-danger',
    barColor: '#D72A37',
    icon: AlertTriangle,
    bg: 'bg-red-50 dark:bg-red-950/20',
    badgeBg: 'bg-red-100 dark:bg-red-900/40',
  },
} as const;

export default function IrpMonitor({ info, hideAssets = false }: Props) {
  const pct = (info.etf_ratio * 100).toFixed(1);
  const limitPct = (info.limit * 100).toFixed(0);
  const barWidth = Math.min(info.etf_ratio / info.limit, 1) * 100;
  const cfg = STATUS[info.status];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-[var(--radius-toss)] p-4 ${cfg.bg}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className={cfg.color} />
        <h3 className="text-sm font-semibold text-toss-text-primary">위험자산 한도</h3>
        <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.color}`}>
          {info.status_label}
        </span>
      </div>

      {/* 게이지 */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-toss-text-tertiary mb-1.5">
          <span>현재 ETF 비중</span>
          <span className={`num font-bold ${cfg.color}`}>
            {pct}% <span className="text-toss-text-tertiary">/ {limitPct}%</span>
          </span>
        </div>
        <div className="h-2.5 bg-white/60 dark:bg-black/30 rounded-full overflow-hidden relative">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${barWidth}%`, background: cfg.barColor }}
          />
        </div>
      </div>

      {/* 금액 정보 */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-toss-text-tertiary">ETF 평가금액</p>
          <p className="num font-semibold text-toss-text-primary">
            {hideAssets ? '••••' : fmtKRW(info.etf_value)}
          </p>
        </div>
        <div>
          <p className="text-toss-text-tertiary">총 계좌금액</p>
          <p className="num font-semibold text-toss-text-primary">
            {hideAssets ? '••••' : fmtKRW(info.total_value)}
          </p>
        </div>
        <div>
          <p className="text-toss-text-tertiary">추가 매수 가능 금액</p>
          <p className={`num font-semibold ${info.available_krw > 0 ? 'text-toss-success' : 'text-toss-danger'}`}>
            {hideAssets ? '••••' : fmtKRW(info.available_krw)}
          </p>
        </div>
      </div>
    </div>
  );
}
