import { useState } from 'react';
import { Home, ChevronDown, ChevronUp } from 'lucide-react';
import type { RealEstateData } from '../types';
import { fmtKRW, fmtKRWFull, colorClass } from '../utils';

interface Props {
  data: RealEstateData;
  hideAssets: boolean;
  visible: boolean;
  onToggle: (on: boolean) => void;
}

// 말일 납부일 계산 (말일 주말이면 다음 달 첫 영업일)
function getPaymentDate(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const dow = lastDay.getDay();
  if (dow === 6) return new Date(year, month + 1, 2); // 토→월
  if (dow === 0) return new Date(year, month + 1, 1); // 일→월
  return lastDay;
}

function nextDueDate(): Date {
  const today = new Date();
  const thisMonthDue = getPaymentDate(today.getFullYear(), today.getMonth());
  if (today <= thisMonthDue) return thisMonthDue;
  const nm = today.getMonth() === 11 ? 0 : today.getMonth() + 1;
  const ny = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
  return getPaymentDate(ny, nm);
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function RealEstateCard({ data, hideAssets, visible, onToggle }: Props) {
  const [open, setOpen] = useState(visible);

  const toggleVisible = () => {
    const next = !visible;
    onToggle(next);
    if (next) setOpen(true);
  };

  if (data.properties.length === 0) return null;

  const prop = data.properties[0];
  const gain = prop.current_value_krw - prop.purchase_price_krw;
  const gainPct = (gain / prop.purchase_price_krw) * 100;
  const loan = prop.loan;
  const netEquity = loan ? prop.current_value_krw - loan.balance_krw : prop.current_value_krw;
  const monthlyInterest = loan ? Math.round(loan.balance_krw * (loan.rate_pct / 100) / 12) : 0;
  const dueDate = nextDueDate();

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)]">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-5 py-4">
        <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
          <Home size={15} className="text-emerald-500" />
        </div>
        <h3 className="text-sm font-semibold text-toss-text-primary flex-1">부동산 · 대출</h3>
        {/* ON/OFF 토글 */}
        <button
          type="button"
          onClick={toggleVisible}
          className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${
            visible ? 'bg-emerald-500' : 'bg-toss-border'
          }`}
          title={visible ? '숨기기' : '보이기'}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            visible ? 'translate-x-4' : ''
          }`} />
        </button>
        {visible && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="p-1 rounded-full hover:bg-toss-bg transition-all"
          >
            {open ? <ChevronUp size={16} className="text-toss-text-tertiary" /> : <ChevronDown size={16} className="text-toss-text-tertiary" />}
          </button>
        )}
      </div>

      {visible && open && (
        <div className="px-5 pb-5 border-t border-toss-border/60 space-y-4">
          {/* 부동산 요약 */}
          <div className="pt-4">
            <p className="text-xs font-semibold text-toss-text-secondary mb-3">{prop.name}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-toss-bg rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-toss-text-tertiary mb-1">매매가</p>
                <p className="num text-sm font-bold text-toss-text-primary">
                  {hideAssets ? '••••' : fmtKRW(prop.purchase_price_krw)}
                </p>
              </div>
              <div className="bg-toss-bg rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-toss-text-tertiary mb-1">현재가</p>
                <p className="num text-sm font-bold text-toss-text-primary">
                  {hideAssets ? '••••' : fmtKRW(prop.current_value_krw)}
                </p>
              </div>
              <div className="bg-toss-bg rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-toss-text-tertiary mb-1">평가손익</p>
                <p className={`num text-sm font-bold ${colorClass(gain)}`}>
                  {hideAssets ? '••••' : (gain >= 0 ? '+' : '') + fmtKRW(gain)}
                </p>
                <p className={`num text-[10px] ${colorClass(gainPct)}`}>
                  {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {/* 대출 정보 */}
          {loan && (
            <div>
              <p className="text-xs font-semibold text-toss-text-secondary mb-3">대출 현황</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="bg-toss-bg rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-toss-text-tertiary mb-1">대출잔액</p>
                  <p className="num text-sm font-bold text-toss-down">
                    {hideAssets ? '••••' : fmtKRW(loan.balance_krw)}
                  </p>
                  {!hideAssets && (
                    <p className="num text-[9px] text-toss-text-tertiary">{fmtKRWFull(loan.balance_krw)}</p>
                  )}
                </div>
                <div className="bg-toss-bg rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-toss-text-tertiary mb-1">금리 · 방식</p>
                  <p className="num text-sm font-bold text-toss-text-primary">{loan.rate_pct}%</p>
                  <p className="text-[9px] text-toss-text-tertiary">체증식</p>
                </div>
                <div className="bg-toss-bg rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-toss-text-tertiary mb-1">월 이자 추정</p>
                  <p className="num text-sm font-bold text-toss-text-primary">
                    {hideAssets ? '••••' : fmtKRW(monthlyInterest)}
                  </p>
                  <p className="text-[9px] text-toss-text-tertiary">원금 별도</p>
                </div>
                <div className="bg-toss-bg rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-toss-text-tertiary mb-1">다음 납부일</p>
                  <p className="text-sm font-bold text-toss-text-primary">{fmtDate(dueDate)}</p>
                  <p className="num text-[9px] text-toss-text-tertiary">
                    참고: {hideAssets ? '••••' : `${(loan.last_payment_krw / 10000).toFixed(1)}만원`}
                  </p>
                </div>
              </div>

              {/* 순자산 바 */}
              <div className="bg-toss-bg rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-toss-text-tertiary">부동산 순자산 (현재가 - 대출)</p>
                  <p className={`num text-sm font-bold ${colorClass(netEquity)}`}>
                    {hideAssets ? '••••' : fmtKRW(netEquity)}
                  </p>
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${(netEquity / prop.current_value_krw) * 100}%` }}
                  />
                  <div
                    className="h-full bg-toss-down/60 rounded-full"
                    style={{ width: `${(loan.balance_krw / prop.current_value_krw) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] text-emerald-500 font-medium">
                    순자산 {((netEquity / prop.current_value_krw) * 100).toFixed(0)}%
                  </span>
                  <span className="text-[9px] text-toss-down font-medium">
                    대출 {((loan.balance_krw / prop.current_value_krw) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
