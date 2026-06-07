import { useState, useMemo } from 'react';
import { Pencil, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { chartColor, fmtKRW, fmtPct, colorClass } from '../utils';
import type { AccountData, HoldingData, PortfolioSummary } from '../types';
import IrpMonitor from './IrpMonitor';

const HIDDEN_KEY = 'pd_hidden';
const ORDER_KEY = 'pd_horder';

function topCat(type: string): string {
  if (/주식|ISA|CMA/i.test(type)) return '투자';
  if (/IRP|DC|퇴직|연금/i.test(type)) return '연금';
  return '기타';
}

// Colored avatar circle with 1-2 char abbreviation
function Avatar({ name, ticker, color }: { name: string; ticker: string | null; color: string }) {
  const text = ((ticker || name).replace(/[^A-Za-z가-힣]/g, '').slice(0, 2) || '?').toUpperCase();
  return (
    <div
      className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
      style={{ background: color }}
    >
      {text}
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
  onMoveAccount: (idx: number, dir: -1 | 1) => void;
}

export default function HoldingsList({ data, hideAssets, onEdit, onAdd, onMoveAccount }: Props) {
  const [editMode, setEditMode] = useState(false);

  const [hidden, setHidden] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); }
    catch { return new Set(); }
  });

  const [order, setOrder] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '{}'); }
    catch { return {}; }
  });

  // draft state for edit mode (uncommitted until save)
  const [draftHidden, setDraftHidden] = useState<Set<string>>(new Set());
  const [draftOrder, setDraftOrder] = useState<Record<string, string[]>>({});

  const enterEdit = () => {
    setDraftHidden(new Set(hidden));
    setDraftOrder({ ...order });
    setEditMode(true);
  };

  const save = () => {
    setHidden(new Set(draftHidden));
    setOrder({ ...draftOrder });
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...draftHidden]));
    localStorage.setItem(ORDER_KEY, JSON.stringify(draftOrder));
    setEditMode(false);
  };

  const cancel = () => setEditMode(false);

  const toggleDraftHidden = (id: string) => {
    setDraftHidden(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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

  // stable color per holding
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    let idx = 0;
    data.accounts.forEach(acc => {
      acc.holdings.forEach(h => {
        map[`${acc.name}::${h.ticker || h.name}`] = chartColor(idx++);
      });
    });
    return map;
  }, [data.accounts]);

  // apply order to account holdings
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

  // group accounts by top-level category
  const grouped = useMemo(() => {
    const map: Record<string, AccountData[]> = {};
    data.accounts.forEach(acc => {
      const cat = topCat(acc.type);
      (map[cat] ??= []).push(acc);
    });
    return (['투자', '연금', '기타'] as const)
      .filter(c => map[c])
      .map(c => ({ cat: c, accounts: map[c] }));
  }, [data.accounts]);

  const activeHidden = editMode ? draftHidden : hidden;
  const activeOrder = editMode ? draftOrder : order;

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between px-1 mb-3">
        <h2 className="text-sm font-bold text-toss-text-secondary">보유 종목</h2>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
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
        {grouped.map(({ cat, accounts }) => {
          const catTotal = accounts.reduce((s, a) => s + a.value_krw, 0);
          const catDay = accounts.reduce((s, a) => s + a.day_change_krw, 0);

          return (
            <div
              key={cat}
              className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] overflow-hidden"
            >
              {/* Category header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-toss-border/60">
                <span className="text-[15px] font-bold text-toss-text-primary">{cat}</span>
                <div className="text-right">
                  <p className="num text-sm font-bold text-toss-text-primary">
                    {hideAssets ? '••••••' : fmtKRW(catTotal)}
                  </p>
                  <p className={`num text-[11px] ${colorClass(catDay)}`}>
                    {catDay >= 0 ? '+' : ''}{hideAssets ? '••••' : fmtKRW(catDay)}
                  </p>
                </div>
              </div>

              {/* Accounts within this category */}
              {accounts.map((acc, _accIdx) => {
                const accGlobalIdx = data.accounts.indexOf(acc);
                const holdings = getHoldings(acc, activeOrder);

                // visible holdings in view mode
                const visibleHoldings = editMode
                  ? holdings
                  : holdings.filter(h => !activeHidden.has(`${acc.name}::${h.ticker || h.name}`));

                return (
                  <div key={acc.name}>
                    {/* Account sub-header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-toss-bg/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] font-semibold text-toss-text-secondary truncate">
                          {acc.name}
                        </span>
                        <span className="text-[10px] text-toss-text-tertiary bg-toss-border/80 px-1.5 py-0.5 rounded-full shrink-0">
                          {acc.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!editMode && (
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

                    {/* IRP info bar (view mode only) */}
                    {!editMode && acc.irp_info && (
                      <div className="px-4 py-3 border-b border-toss-border/30 bg-toss-bg/20">
                        <IrpMonitor info={acc.irp_info} hideAssets={hideAssets} />
                      </div>
                    )}

                    {/* Holdings */}
                    <div className="divide-y divide-toss-border/30">
                      {(editMode ? holdings : visibleHoldings).map((h, hi) => {
                        const id = `${acc.name}::${h.ticker || h.name}`;
                        const isHidden = activeHidden.has(id);
                        const color = colorMap[id] ?? chartColor(0);

                        return (
                          <div
                            key={h.ticker || h.name}
                            className={`flex items-center gap-3 px-4 py-3 transition-all ${
                              editMode && isHidden ? 'opacity-40' : ''
                            }`}
                          >
                            <Avatar name={h.name} ticker={h.ticker} color={color} />

                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-toss-text-primary truncate leading-snug">
                                {h.name}
                              </p>
                              {h.ticker && (
                                <p className="text-[11px] text-toss-text-tertiary mt-0.5">{h.ticker}</p>
                              )}
                            </div>

                            {editMode ? (
                              /* Edit mode: pencil + toggle + up/down */
                              <div className="flex items-center gap-3 shrink-0">
                                <button
                                  onClick={() => onEdit(acc, h)}
                                  className="p-1.5 rounded-full hover:bg-toss-bg active:scale-90 transition-all"
                                  title="수정"
                                >
                                  <Pencil size={14} className="text-toss-text-tertiary" />
                                </button>
                                <Toggle on={!isHidden} onToggle={() => toggleDraftHidden(id)} />
                                <div className="flex flex-col gap-0">
                                  <button
                                    onClick={() => moveHolding(acc.name, holdings, hi, -1)}
                                    disabled={hi === 0}
                                    className="p-0.5 rounded hover:bg-toss-bg disabled:opacity-20 active:scale-90 transition-all"
                                  >
                                    <ChevronUp size={14} className="text-toss-text-tertiary" />
                                  </button>
                                  <button
                                    onClick={() => moveHolding(acc.name, holdings, hi, 1)}
                                    disabled={hi === holdings.length - 1}
                                    className="p-0.5 rounded hover:bg-toss-bg disabled:opacity-20 active:scale-90 transition-all"
                                  >
                                    <ChevronDown size={14} className="text-toss-text-tertiary" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* View mode: value + day change */
                              <div className="text-right shrink-0">
                                <p className="num text-[13px] font-bold text-toss-text-primary">
                                  {hideAssets ? '••••' : fmtKRW(h.value_krw)}
                                </p>
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
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Add holding button in edit mode */}
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
