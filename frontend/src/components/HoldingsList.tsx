import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, ChevronDown, ChevronUp, Plus, Search } from 'lucide-react';
import { fmtKRW, fmtKRWFull, fmtPct, colorClass, isPriceStale, relativeTime } from '../utils';
import { reorderAccounts } from '../api';
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

// 계좌명 → 증권사/은행 배지(색·약칭). 뱅크샐러드처럼 기관별로 구분.
function brokerStyle(accountName: string): { label: string; bg: string } {
  const n = accountName;
  if (n.includes('토스')) return { label: 'toss', bg: '#3182F6' };
  if (n.includes('미래에셋') || n.includes('미래')) return { label: '미래', bg: '#F37321' };
  if (n.includes('삼성')) return { label: '삼성', bg: '#1428A0' };
  if (n.includes('국민') || n.includes('KB')) return { label: 'KB', bg: '#F5A100' };
  if (n.includes('기업') || n.includes('IBK')) return { label: 'IBK', bg: '#0B4DA2' };
  if (n.includes('신한')) return { label: '신한', bg: '#0046FF' };
  if (n.includes('NH') || n.includes('농협')) return { label: 'NH', bg: '#1AAB39' };
  if (n.includes('키움')) return { label: '키움', bg: '#C8102E' };
  if (n.includes('한국투자') || n.includes('한투')) return { label: '한투', bg: '#C00D2D' };
  if (n.includes('하나')) return { label: '하나', bg: '#008C95' };
  if (n.includes('우리')) return { label: '우리', bg: '#0067AC' };
  if (n.includes('카카오')) return { label: 'kakao', bg: '#FEE500' };
  return { label: n.replace(/[^A-Za-z0-9가-힣]/g, '').slice(0, 2) || '··', bg: '#8B95A1' };
}

function BrokerBadge({ accountName }: { accountName: string }) {
  const s = brokerStyle(accountName);
  const lower = s.label === 'toss' || s.label === 'kakao';
  const dark = s.bg === '#FEE500'; // 카카오 노랑은 검은 글자
  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-extrabold ${lower ? 'text-[10px]' : 'text-[13px]'}`}
      style={{ background: s.bg, color: dark ? '#191919' : '#fff' }}
    >
      {s.label}
    </span>
  );
}

export default function HoldingsList({ data, hideAssets, onEdit, onAdd, onTrade, onAddAccount }: Props) {
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<PeriodMode>('전체');
  const [editMode, setEditMode] = useState(false);
  const queryClient = useQueryClient();

  const reorderMutation = useMutation({
    mutationFn: reorderAccounts,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
  });

  const moveAccount = (index: number, dir: -1 | 1) => {
    const order = data.accounts.map(a => a.name);
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    reorderMutation.mutate(order);
  };

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

  const investTotal = data.accounts.reduce((s, a) => s + a.value_krw, 0);

  return (
    <section aria-labelledby="holdings-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="holdings-title" className="text-[18px] font-bold text-toss-text-primary">보유 종목</h2>
          <p className="num mt-1 text-[15px] font-bold text-toss-text-secondary">
            계좌 합계 {hideAssets ? '••••••' : fmtKRWFull(investTotal)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => setEditMode(v => !v)} className={`secondary-button ${editMode ? 'text-toss-blue' : ''}`}>
            {editMode ? '완료' : '편집'}
          </button>
          {onAddAccount && <button onClick={onAddAccount} className="secondary-button"><Plus size={16} /> 계좌</button>}
        </div>
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
              <div className="flex min-w-0 items-center gap-3">
                {editMode && !query && (
                  <div className="flex flex-col">
                    <button type="button" onClick={() => moveAccount(data.accounts.findIndex(a => a.name === account.name), -1)} aria-label="위로" className="p-0.5 text-toss-text-tertiary hover:text-toss-blue active:scale-90 disabled:opacity-20" disabled={data.accounts[0]?.name === account.name}><ChevronUp size={16} /></button>
                    <button type="button" onClick={() => moveAccount(data.accounts.findIndex(a => a.name === account.name), 1)} aria-label="아래로" className="p-0.5 text-toss-text-tertiary hover:text-toss-blue active:scale-90 disabled:opacity-20" disabled={data.accounts[data.accounts.length - 1]?.name === account.name}><ChevronDown size={16} /></button>
                  </div>
                )}
                <BrokerBadge accountName={account.name} />
                <div className="min-w-0">
                  <h3 className="truncate text-[16px] font-bold text-toss-text-primary">{account.name}</h3>
                  <p className="mt-1 text-[13px] text-toss-text-tertiary">{account.type} · {account.holdings.length}종목</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <strong className="num block text-[15px] text-toss-text-primary">{hideAssets ? '••••••' : fmtKRWFull(account.value_krw)}</strong>
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
                      <strong className="num block text-[15px] text-toss-text-primary">{hideAssets ? '••••' : fmtKRWFull(holding.value_krw)}</strong>
                      {changeKrw !== null && <small className={`num mt-1 block text-[13px] ${colorClass(changeKrw)}`}>{changeKrw >= 0 ? '+' : ''}{hideAssets ? '••••' : fmtKRW(changeKrw)} {fmtPct(changePct)}</small>}
                    </div>

                    {editMode && !holding.is_snapshot && (
                      <button onClick={() => onTrade(account, holding)} className="icon-button shrink-0" aria-label={`${holding.name} 거래`}><ArrowLeftRight size={17} /></button>
                    )}
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
