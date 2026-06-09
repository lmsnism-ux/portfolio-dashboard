import { useState, useMemo } from 'react';
import { Pencil, Plus, ChevronUp, ChevronDown, ArrowLeftRight, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chartColor, fmtKRW, fmtPct, colorClass, categorizeAccount, CATEGORY_ORDER, isPriceStale, STALE_PRICE_THRESHOLD_HOURS, relativeTime } from '../utils';
import type { AccountData, HoldingData, PortfolioSummary } from '../types';
import { deleteHolding } from '../api';
import IrpMonitor from './IrpMonitor';

const HIDDEN_KEY = 'pd_hidden';
const ORDER_KEY = 'pd_horder';
const CAT_ORDER_KEY = 'pd_catorder';

const CAT_STYLE: Record<string, { accent: string; headerBg: string }> = {
  '투자':    { accent: '#3182F6', headerBg: 'rgba(49,130,246,0.06)' },
  '개인연금': { accent: '#6366f1', headerBg: 'rgba(99,102,241,0.06)' },
  '퇴직연금': { accent: '#8b5cf6', headerBg: 'rgba(139,92,246,0.06)' },
  '저축':    { accent: '#10b981', headerBg: 'rgba(16,185,129,0.06)' },
  '기타':    { accent: '#64748b', headerBg: 'rgba(100,116,139,0.06)' },
};

const DEFAULT_CATS = [...CATEGORY_ORDER];

// 증권사 약칭 추출 (계좌명 앞 2글자)
function brokerAbbr(accName: string): string {
  const korean = accName.replace(/[^가-힣]/g, '').slice(0, 2);
  if (korean) return korean;
  return accName.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '??';
}

// 아바타 — 한글 이름 우선, 영문 티커 fallback
function Avatar({ name, ticker, color }: { name: string; ticker: string | null; color: string }) {
  const korean = name.replace(/[^가-힣]/g, '').slice(0, 2);
  const text = korean
    || ((ticker || name).replace(/[^A-Za-z]/g, '').slice(0, 2) || '?').toUpperCase();
  return (
    <div
      className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
      style={{ background: color }}
    >
      {text}
    </div>
  );
}

// 증권사 뱃지 아이콘
function BrokerBadge({ accName, color }: { accName: string; color: string }) {
  return (
    <div
      className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
      style={{ background: color }}
      title={accName}
    >
      {brokerAbbr(accName)}
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-12 h-[26px] rounded-full transition-colors flex-shrink-0 ${
        on ? 'bg-emerald-500' : 'bg-toss-border'
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          on ? 'translate-x-[22px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
  onEdit: (account: AccountData, holding: HoldingData) => void;
  onAdd: (account: AccountData) => void;
  onTrade: (account: AccountData, holding: HoldingData) => void;
  onMoveAccount: (idx: number, dir: -1 | 1) => void;
  onAddAccount?: () => void;
}

type PeriodMode = '오늘' | '전체';

export default function HoldingsList({ data, hideAssets, onEdit, onAdd, onTrade, onMoveAccount, onAddAccount }: Props) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: ({ accName, key }: { accName: string; key: string }) =>
      deleteHolding(accName, key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
  });

  const [editMode, setEditMode] = useState(false);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('전체');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [hidden, setHidden] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); }
    catch { return new Set(); }
  });

  const [order, setOrder] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '{}'); }
    catch { return {}; }
  });

  const [catOrder, setCatOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CAT_ORDER_KEY) || 'null');
      if (!saved) return [...DEFAULT_CATS];
      // '연금' → '개인연금' + '퇴직연금' 마이그레이션
      const migrated: string[] = [];
      for (const c of saved) {
        if (c === '연금') { migrated.push('개인연금', '퇴직연금'); }
        else { migrated.push(c); }
      }
      if (!migrated.includes('개인연금')) migrated.splice(1, 0, '개인연금');
      if (!migrated.includes('퇴직연금')) {
        migrated.splice(migrated.indexOf('개인연금') + 1, 0, '퇴직연금');
      }
      return migrated;
    }
    catch { return [...DEFAULT_CATS]; }
  });

  // draft state — 저장 버튼 누를 때까지 반영 안 됨
  const [draftHidden, setDraftHidden] = useState<Set<string>>(new Set());
  const [draftOrder, setDraftOrder] = useState<Record<string, string[]>>({});
  const [draftCatOrder, setDraftCatOrder] = useState<string[]>([...DEFAULT_CATS]);

  const enterEdit = () => {
    setDraftHidden(new Set(hidden));
    setDraftOrder({ ...order });
    setDraftCatOrder([...catOrder]);
    setEditMode(true);
  };

  const save = () => {
    setHidden(new Set(draftHidden));
    setOrder({ ...draftOrder });
    setCatOrder([...draftCatOrder]);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...draftHidden]));
    localStorage.setItem(ORDER_KEY, JSON.stringify(draftOrder));
    localStorage.setItem(CAT_ORDER_KEY, JSON.stringify(draftCatOrder));
    setEditMode(false);
  };

  const cancel = () => setEditMode(false);

  const toggleDraftHidden = (id: string) => {
    setDraftHidden(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const moveHolding = (accountName: string, currentHoldings: HoldingData[], idx: number, dir: -1 | 1) => {
    const keys = currentHoldings.map(h => h.ticker || h.name);
    const target = idx + dir;
    if (target < 0 || target >= keys.length) return;
    const newKeys = [...keys];
    [newKeys[idx], newKeys[target]] = [newKeys[target], newKeys[idx]];
    setDraftOrder(prev => ({ ...prev, [accountName]: newKeys }));
  };

  const moveCat = (idx: number, dir: -1 | 1) => {
    setDraftCatOrder(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // 계좌별 색상 (같은 계좌 내 종목은 동일 색상)
  const brokerColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    data.accounts.forEach((acc, i) => {
      map[acc.name] = chartColor(i);
    });
    return map;
  }, [data.accounts]);

  // 계좌 내 종목 순서 적용
  const getHoldings = (acc: AccountData, ord: Record<string, string[]>): HoldingData[] => {
    const keys = ord[acc.name];
    if (!keys) return acc.holdings;
    const byKey: Record<string, HoldingData> = {};
    acc.holdings.forEach(h => { byKey[h.ticker || h.name] = h; });
    const sorted = keys.map(k => byKey[k]).filter(Boolean) as HoldingData[];
    acc.holdings.forEach(h => {
      if (!keys.includes(h.ticker || h.name)) sorted.push(h);
    });
    return sorted;
  };

  // 카테고리별 그룹 (catOrder 반영)
  const grouped = useMemo(() => {
    const activeCatOrder = editMode ? draftCatOrder : catOrder;
    const map: Record<string, AccountData[]> = {};
    data.accounts.forEach(acc => {
      const cat = categorizeAccount(acc.type, acc.name);
      (map[cat] ??= []).push(acc);
    });
    return activeCatOrder
      .filter(c => map[c])
      .map((c, idx) => ({ cat: c, accounts: map[c], idx }));
  }, [data.accounts, editMode, draftCatOrder, catOrder]);

  const activeHidden = editMode ? draftHidden : hidden;
  const activeOrder = editMode ? draftOrder : order;

  return (
    <section>
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between px-1 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-toss-text-secondary">보유 종목</h2>
          {!editMode && (
            <div className="flex bg-toss-card border border-toss-border rounded-full p-0.5 gap-0.5">
              {(['오늘', '전체'] as PeriodMode[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodMode(p)}
                  className={`px-2.5 py-0.5 text-[10px] rounded-full transition-all font-medium ${
                    periodMode === p
                      ? 'bg-toss-blue text-white shadow-sm'
                      : 'text-toss-text-tertiary hover:text-toss-text-secondary'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              {onAddAccount && (
                <button
                  onClick={onAddAccount}
                  className="text-xs font-medium text-toss-blue px-3 py-1.5 rounded-full border border-toss-blue/30 hover:border-toss-blue bg-toss-blue-soft flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <Plus size={11} />
                  계좌 추가
                </button>
              )}
              <button
                onClick={cancel}
                className="text-xs text-toss-text-tertiary px-3 py-1.5 rounded-full border border-toss-border active:scale-95 transition-all"
              >
                취소
              </button>
              <button
                onClick={save}
                className="text-xs font-semibold text-white bg-toss-blue px-4 py-1.5 rounded-full active:scale-95 transition-all"
              >
                저장
              </button>
            </>
          ) : (
            <button
              onClick={enterEdit}
              className="text-xs font-medium text-toss-text-secondary px-3 py-1.5 rounded-full border border-toss-border hover:border-toss-blue/50 flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Pencil size={11} />
              편집
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {grouped.map(({ cat, accounts, idx: catIdx }) => {
          const catTotal  = accounts.reduce((s, a) => s + a.value_krw, 0);
          const catDay    = accounts.reduce((s, a) => s + a.day_change_krw, 0);
          const catProfit = accounts.reduce((s, a) => s + a.profit_krw, 0);
          const catCost   = accounts.reduce((s, a) => s + a.cost_krw, 0);
          const catProfitPct = catCost > 0 ? (catProfit / catCost) * 100 : null;

          const catStyle = CAT_STYLE[cat] ?? CAT_STYLE['기타'];
          return (
            <div
              key={cat}
              className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] overflow-hidden"
              style={{ borderLeft: `3px solid ${catStyle.accent}` }}
            >
              {/* 카테고리 헤더 */}
              <div
                className="flex items-center justify-between px-4 py-3.5 border-b border-toss-border/60"
                style={{ backgroundColor: catStyle.headerBg }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: catStyle.accent }}
                  />
                  <span className="text-[15px] font-bold text-toss-text-primary">{cat}</span>
                  {cat === '개인연금' && !editMode && (
                    <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-400/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                      55세 이후 수령
                    </span>
                  )}
                  {cat === '퇴직연금' && !editMode && (
                    <span className="text-[10px] font-semibold text-violet-400 bg-violet-500/10 border border-violet-400/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                      퇴직 시 수령
                    </span>
                  )}
                  {/* 편집 모드: 카테고리 순서 변경 */}
                  {editMode && (
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => moveCat(catIdx, -1)}
                        disabled={catIdx === 0}
                        className="p-1 rounded hover:bg-toss-bg disabled:opacity-20 active:scale-90 transition-all"
                        title="카테고리 위로"
                      >
                        <ChevronUp size={14} className="text-toss-text-tertiary" />
                      </button>
                      <button
                        onClick={() => moveCat(catIdx, 1)}
                        disabled={catIdx === grouped.length - 1}
                        className="p-1 rounded hover:bg-toss-bg disabled:opacity-20 active:scale-90 transition-all"
                        title="카테고리 아래로"
                      >
                        <ChevronDown size={14} className="text-toss-text-tertiary" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="num text-sm font-bold text-toss-text-primary">
                    {hideAssets ? '••••••' : fmtKRW(catTotal)}
                  </p>
                  {periodMode === '오늘' ? (
                    <p className={`num text-[11px] ${colorClass(catDay)}`}>
                      {catDay >= 0 ? '+' : ''}{hideAssets ? '••••' : fmtKRW(catDay)}
                    </p>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <p className={`num text-[11px] ${colorClass(catProfit)}`}>
                        {catProfit >= 0 ? '+' : ''}{hideAssets ? '••••' : fmtKRW(catProfit)}
                      </p>
                      {catProfitPct !== null && !hideAssets && (
                        <p className={`num text-[10px] ${colorClass(catProfitPct)}`}>
                          ({fmtPct(catProfitPct)})
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 계좌별 */}
              {accounts.map((acc) => {
                const accGlobalIdx = data.accounts.indexOf(acc);
                const holdings = getHoldings(acc, activeOrder);
                const brokerColor = brokerColorMap[acc.name] ?? chartColor(0);

                const visibleHoldings = editMode
                  ? holdings
                  : holdings.filter(h => !activeHidden.has(`${acc.name}::${h.ticker || h.name}`));

                return (
                  <div key={acc.name}>
                    {/* 계좌 서브헤더 */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-toss-bg/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <BrokerBadge accName={acc.name} color={brokerColor} />
                        <div className="min-w-0">
                          <span className="text-[13px] font-semibold text-toss-text-secondary truncate block">
                            {acc.name}
                          </span>
                          <span className="text-[10px] text-toss-text-tertiary">{acc.type}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!editMode && (
                          <>
                            <div className="text-right">
                              <span className="num text-xs font-medium text-toss-text-secondary">
                                {hideAssets ? '••••' : fmtKRW(acc.value_krw)}
                              </span>
                              {acc.profit_pct !== null && (
                                <span className={`num text-[10px] ml-1.5 ${colorClass(acc.profit_pct)}`}>
                                  {fmtPct(acc.profit_pct)}
                                </span>
                              )}
                            </div>
                            {/* 뷰 모드에서도 종목 추가 버튼 상시 노출 */}
                            <button
                              onClick={() => onAdd(acc)}
                              className="p-1.5 rounded-full bg-toss-blue-soft hover:bg-toss-blue/20 active:scale-90 transition-all"
                              title="종목 추가"
                            >
                              <Plus size={13} className="text-toss-blue" />
                            </button>
                          </>
                        )}
                        {editMode && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onAdd(acc)}
                              className="p-1.5 rounded-full hover:bg-toss-bg active:scale-90 transition-all"
                              title="종목 추가"
                            >
                              <Plus size={13} className="text-toss-blue" />
                            </button>
                            <button
                              onClick={() => onMoveAccount(accGlobalIdx, -1)}
                              disabled={accGlobalIdx === 0}
                              className="p-1 rounded hover:bg-toss-bg disabled:opacity-30 active:scale-90 transition-all"
                              title="계좌 위로"
                            >
                              <ChevronUp size={13} className="text-toss-text-tertiary" />
                            </button>
                            <button
                              onClick={() => onMoveAccount(accGlobalIdx, 1)}
                              disabled={accGlobalIdx === data.accounts.length - 1}
                              className="p-1 rounded hover:bg-toss-bg disabled:opacity-30 active:scale-90 transition-all"
                              title="계좌 아래로"
                            >
                              <ChevronDown size={13} className="text-toss-text-tertiary" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* IRP 모니터 */}
                    {!editMode && acc.irp_info && (
                      <div className="px-4 py-3 border-b border-toss-border/30 bg-toss-bg/20">
                        <IrpMonitor info={acc.irp_info} hideAssets={hideAssets} />
                      </div>
                    )}

                    {/* 종목 목록 */}
                    <div className="divide-y divide-toss-border/30">
                      {(editMode ? holdings : visibleHoldings).map((h, hi) => {
                        const id = `${acc.name}::${h.ticker || h.name}`;
                        const isHidden = activeHidden.has(id);
                        const color = brokerColor;

                        return (
                          <div
                            key={h.ticker || h.name}
                            className={`flex items-center gap-3 px-4 py-3 transition-all ${
                              editMode && isHidden ? 'opacity-40' : ''
                            }`}
                          >
                            <Avatar name={h.name} ticker={h.ticker} color={color} />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-[13px] font-semibold text-toss-text-primary truncate leading-snug">
                                  {h.name}
                                </p>
                                {isPriceStale(h.fetched_at) && (
                                  <span
                                    className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                                    title={`가격 데이터가 ${STALE_PRICE_THRESHOLD_HOURS}시간 이상 갱신되지 않았어요 (${relativeTime(h.fetched_at ?? null)})`}
                                    aria-label="가격 데이터 오래됨"
                                  />
                                )}
                              </div>
                              {h.ticker && (
                                <p className="text-[11px] text-toss-text-tertiary mt-0.5">{h.ticker}</p>
                              )}
                              {/* 보유수량 · 평단가 · 현재가 */}
                              {!h.is_snapshot && !editMode && h.shares !== null && (
                                <p className="text-[10px] text-toss-text-tertiary mt-0.5 flex flex-wrap gap-x-1">
                                  <span className="num">
                                    {Number.isInteger(h.shares)
                                      ? `${h.shares.toLocaleString('ko-KR')}주`
                                      : h.shares < 1
                                        ? `${h.shares.toFixed(6)}주`
                                        : `${h.shares.toFixed(2)}주`}
                                  </span>
                                  {h.avg_price !== null && (
                                    <span className="num">
                                      · 평단{' '}
                                      {h.currency === 'USD'
                                        ? `$${h.avg_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : `₩${h.avg_price.toLocaleString('ko-KR')}`}
                                    </span>
                                  )}
                                  {h.current_price_display && (
                                    <span className="num">
                                      · {h.price_label === '실시간' ? '현재가' : '종가'} {h.current_price_display}
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>

                            {editMode ? (
                              /* 편집 모드: 삭제 + 토글 + 순서 */
                              <div className="flex items-center gap-3 shrink-0">
                                {pendingDeleteId === id ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-toss-down font-semibold">삭제?</span>
                                    <button
                                      onClick={() => {
                                        deleteMutation.mutate({ accName: acc.name, key: h.ticker || h.name });
                                        setPendingDeleteId(null);
                                      }}
                                      className="text-[11px] font-semibold text-white bg-toss-down px-2 py-1 rounded-full active:scale-95"
                                    >
                                      확인
                                    </button>
                                    <button
                                      onClick={() => setPendingDeleteId(null)}
                                      className="text-[11px] text-toss-text-tertiary px-2 py-1 rounded-full border border-toss-border active:scale-95"
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setPendingDeleteId(id)}
                                    aria-label={`${h.name} 삭제`}
                                    className="p-1.5 rounded-full hover:bg-toss-down/10 active:scale-90 transition-all"
                                    title="삭제"
                                  >
                                    <Trash2 size={14} className="text-toss-down" />
                                  </button>
                                )}
                                <Toggle on={!isHidden} onToggle={() => toggleDraftHidden(id)} />
                                <div className="flex flex-col gap-0">
                                  <button
                                    onClick={() => moveHolding(acc.name, holdings, hi, -1)}
                                    disabled={hi === 0}
                                    aria-label="위로"
                                    className="p-0.5 rounded hover:bg-toss-bg disabled:opacity-20 active:scale-90 transition-all"
                                  >
                                    <ChevronUp size={14} className="text-toss-text-tertiary" />
                                  </button>
                                  <button
                                    onClick={() => moveHolding(acc.name, holdings, hi, 1)}
                                    disabled={hi === holdings.length - 1}
                                    aria-label="아래로"
                                    className="p-0.5 rounded hover:bg-toss-bg disabled:opacity-20 active:scale-90 transition-all"
                                  >
                                    <ChevronDown size={14} className="text-toss-text-tertiary" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* 뷰 모드: 평가금액 + 기간별 수익 + 거래 버튼 */
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <p className="num text-[13px] font-bold text-toss-text-primary">
                                    {hideAssets ? '••••' : fmtKRW(h.value_krw)}
                                  </p>
                                  {periodMode === '오늘' ? (
                                    <>
                                      {h.day_change_krw !== null && (
                                        <p className={`num text-[11px] ${colorClass(h.day_change_krw)}`}>
                                          {h.day_change_krw >= 0 ? '+' : ''}
                                          {hideAssets ? '••••' : fmtKRW(h.day_change_krw)}
                                        </p>
                                      )}
                                      {h.day_change_pct !== null && (
                                        <p className={`num text-[10px] ${colorClass(h.day_change_pct)}`}>
                                          ({fmtPct(h.day_change_pct)})
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {h.profit_krw !== null ? (
                                        <>
                                          <p className={`num text-[11px] ${colorClass(h.profit_krw)}`}>
                                            {h.profit_krw >= 0 ? '+' : ''}
                                            {hideAssets ? '••••' : fmtKRW(h.profit_krw)}
                                          </p>
                                          {h.profit_pct !== null && (
                                            <p className={`num text-[10px] ${colorClass(h.profit_pct)}`}>
                                              ({fmtPct(h.profit_pct)})
                                            </p>
                                          )}
                                        </>
                                      ) : !h.is_snapshot && (
                                        <p className="text-[10px] text-toss-text-tertiary">평단 미입력</p>
                                      )}
                                    </>
                                  )}
                                </div>
                                {/* 빠른 수정/거래 버튼 — 뷰 모드에서 상시 노출 */}
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    onClick={() => onEdit(acc, h)}
                                    className="p-1 rounded-full hover:bg-toss-bg active:scale-90 transition-all"
                                    title="수정"
                                  >
                                    <Pencil size={12} className="text-toss-text-tertiary" />
                                  </button>
                                  {!h.is_snapshot && (
                                    <button
                                      onClick={() => onTrade(acc, h)}
                                      className="p-1 rounded-full hover:bg-toss-bg active:scale-90 transition-all"
                                      title="매수/매도"
                                    >
                                      <ArrowLeftRight size={12} className="text-toss-text-tertiary" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* 편집 모드: 종목 추가 */}
                      {editMode && (
                        <button
                          onClick={() => onAdd(acc)}
                          className="w-full flex items-center justify-center gap-1.5 py-3 text-xs text-toss-blue font-semibold hover:bg-toss-blue-soft/30 active:scale-[0.99] transition-all"
                        >
                          <Plus size={13} />
                          종목 추가
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
