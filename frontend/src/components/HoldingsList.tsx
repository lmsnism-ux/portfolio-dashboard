import { useMemo, useState } from 'react';
import { ArrowLeftRight, Pencil, Plus, Search } from 'lucide-react';
import { fmtKRW, fmtPct, colorClass, isPriceStale, relativeTime } from '../utils';
import type { AccountData, HoldingData, PortfolioSummary } from '../types';
import IrpMonitor from './IrpMonitor';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
  onEdit: (account: AccountData, holding: HoldingData) => void;
  onAdd: (account: AccountData) => void;
  onTrade: (account: AccountData, holding: HoldingData) => void;
  onAddAccount?: () => void;
}

type PeriodMode = '오늘' | '전체';

function HoldingMark({ holding }: { holding: HoldingData }) {
  const label = (holding.ticker || holding.name).replace(/[^A-Za-z0-9가-힣]/g, '').slice(0, 2).toUpperCase();
  return <span className="holding-mark" aria-hidden="true">{label || '·'}</span>;
}

export default function HoldingsList({ data, hideAssets, onEdit, onAdd, onTrade, onAddAccount }: Props) {
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<PeriodMode>('전체');

  const accounts = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('ko-KR');
    if (!keyword) return data.accounts;
    return data.accounts
      .map(account => ({
        ...account,
        holdings: account.holdings.filter(holding =>
          `${holding.name} ${holding.ticker ?? ''} ${account.name}`.toLocaleLowerCase('ko-KR').includes(keyword),
        ),
      }))
      .filter(account => account.holdings.length > 0);
  }, [data.accounts, query]);

  return (
    <section aria-labelledby="holdings-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 id="holdings-title" className="text-[18px] font-bold text-toss-text-primary">보유 종목</h2>
          <p className="mt-1 text-[13px] text-toss-text-tertiary">종목을 누르면 바로 수정할 수 있어요.</p>
        </div>
        {onAddAccount && <button onClick={onAddAccount} className="secondary-button"><Plus size={16} /> 계좌</button>}
      </div>

      <div className="mb-4 flex gap-2">
        <label className="search-field flex-1">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">종목 검색</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="종목명이나 티커 검색" />
        </label>
        <div className="segmented-control" role="group" aria-label="수익 표시 기간">
          {(['오늘', '전체'] as PeriodMode[]).map(item => (
            <button key={item} onClick={() => setPeriod(item)} aria-pressed={period === item} className={period === item ? 'active' : ''}>{item}</button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {accounts.map(account => (
          <article key={account.name} className="surface-card overflow-hidden">
            <header className="flex items-center justify-between gap-3 border-b border-toss-border/60 px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate text-[16px] font-bold text-toss-text-primary">{account.name}</h3>
                <p className="mt-1 text-[13px] text-toss-text-tertiary">{account.type} · {account.holdings.length}종목</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <strong className="num block text-[15px] text-toss-text-primary">{hideAssets ? '••••••' : fmtKRW(account.value_krw)}</strong>
                  <small className={`num mt-1 block text-[13px] ${colorClass(account.day_change_krw)}`}>오늘 {account.day_change_krw >= 0 ? '+' : ''}{hideAssets ? '••••' : fmtKRW(account.day_change_krw)}</small>
                </div>
                <button type="button" onClick={() => onAdd(account)} aria-label={`${account.name}에 종목 추가`} className="icon-button"><Plus size={18} /></button>
              </div>
            </header>

            {account.irp_info && (
              <div className="border-b border-toss-border/50 bg-toss-bg/50 px-5 py-3">
                <IrpMonitor info={account.irp_info} hideAssets={hideAssets} />
              </div>
            )}

            <div className="divide-y divide-toss-border/50">
              {account.holdings.map(holding => {
                const changeKrw = period === '오늘' ? holding.day_change_krw : holding.profit_krw;
                const changePct = period === '오늘' ? holding.day_change_pct : holding.profit_pct;
                return (
                  <div key={holding.ticker || holding.name} className="holding-row">
                    <button onClick={() => onEdit(account, holding)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`${holding.name} 수정 열기`}>
                      <HoldingMark holding={holding} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <strong className="truncate text-[15px] text-toss-text-primary">{holding.name}</strong>
                          {isPriceStale(holding.fetched_at) && <span className="stale-dot" title={`가격 갱신 ${relativeTime(holding.fetched_at ?? null)}`} />}
                        </span>
                        <small className="mt-1 block truncate text-[13px] text-toss-text-tertiary">
                          {holding.ticker && holding.ticker !== holding.name ? `${holding.ticker} · ` : ''}
                          {holding.shares == null ? holding.price_label : `${holding.shares.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}주`}
                        </small>
                      </span>
                    </button>

                    <div className="shrink-0 text-right">
                      <strong className="num block text-[15px] text-toss-text-primary">{hideAssets ? '••••' : fmtKRW(holding.value_krw)}</strong>
                      {changeKrw !== null && <small className={`num mt-1 block text-[13px] ${colorClass(changeKrw)}`}>{changeKrw >= 0 ? '+' : ''}{hideAssets ? '••••' : fmtKRW(changeKrw)} {fmtPct(changePct)}</small>}
                    </div>

                    <div className="flex shrink-0 gap-1">
                      {!holding.is_snapshot && <button onClick={() => onTrade(account, holding)} className="icon-button" aria-label={`${holding.name} 거래`}><ArrowLeftRight size={17} /></button>}
                      <button onClick={() => onEdit(account, holding)} className="edit-button" aria-label={`${holding.name} 수정`}><Pencil size={16} /><span>수정</span></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
        {!accounts.length && <div className="empty-state">검색 결과가 없습니다.</div>}
      </div>
    </section>
  );
}
