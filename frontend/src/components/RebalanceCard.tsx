import { useState } from 'react';
import { Sliders, Check, X } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import { fmtKRW } from '../utils';

const REBALANCE_KEY = 'pd_rebalance_targets';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
}

function loadTargets(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(REBALANCE_KEY) || '{}'); } catch { return {}; }
}

export default function RebalanceCard({ data, hideAssets }: Props) {
  const [editing, setEditing] = useState(false);
  const [targets, setTargets] = useState<Record<string, number>>(loadTargets);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const classes = data.asset_class_weights;
  const totalKrw = classes.reduce((s, c) => s + c.value_krw, 0);

  if (classes.length === 0) return null;

  const hasTargets = classes.some(c => (targets[c.name] ?? 0) > 0);
  const draftTotal = Object.values(draft).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const startEdit = () => {
    const d: Record<string, string> = {};
    classes.forEach(c => { d[c.name] = (targets[c.name] ?? 0) > 0 ? String(targets[c.name]) : ''; });
    setDraft(d);
    setEditing(true);
  };

  const saveEdit = () => {
    const next: Record<string, number> = {};
    Object.entries(draft).forEach(([k, v]) => {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n > 0) next[k] = n;
    });
    setTargets(next);
    localStorage.setItem(REBALANCE_KEY, JSON.stringify(next));
    setEditing(false);
  };

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-full bg-toss-blue-soft flex items-center justify-center shrink-0">
          <Sliders size={15} className="text-toss-blue" />
        </div>
        <h3 className="text-sm font-semibold text-toss-text-primary flex-1">리밸런싱 도우미</h3>
        {!editing ? (
          <button
            onClick={startEdit}
            className="text-[11px] text-toss-blue font-semibold px-3 py-1 rounded-full bg-toss-blue-soft hover:opacity-80 active:scale-95 transition-all"
          >
            목표 설정
          </button>
        ) : (
          <div className="flex gap-1.5">
            <button onClick={saveEdit} className="p-1.5 rounded-full bg-toss-blue text-white active:scale-95">
              <Check size={14} />
            </button>
            <button onClick={() => setEditing(false)} className="p-1.5 rounded-full bg-toss-bg text-toss-text-secondary active:scale-95">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {!hasTargets && !editing ? (
        <p className="text-sm text-toss-text-secondary">
          목표 배분을 설정하면 리밸런싱 가이드를 볼 수 있어요.{' '}
          <button onClick={startEdit} className="text-toss-blue font-semibold">지금 설정하기</button>
        </p>
      ) : (
        <>
          {/* 컬럼 헤더 */}
          <div
            className="grid gap-2 mb-2 text-[10px] text-toss-text-tertiary font-medium"
            style={{ gridTemplateColumns: editing ? '1fr 56px 80px' : '1fr 56px 56px minmax(80px,auto)' }}
          >
            <span>자산군</span>
            <span className="text-right">현재</span>
            {!editing && <span className="text-right">목표</span>}
            <span className="text-right">{editing ? '목표 (%)' : '차이'}</span>
          </div>

          <div className="space-y-1.5">
            {classes.map(c => {
              const targetPct = targets[c.name] ?? 0;
              const currentPct = c.weight;
              const gapPct = targetPct > 0 ? currentPct - targetPct : null;

              return (
                <div
                  key={c.name}
                  className="bg-toss-bg rounded-xl px-3 py-2.5 grid items-center gap-2"
                  style={{ gridTemplateColumns: editing ? '1fr 56px 80px' : '1fr 56px 56px minmax(80px,auto)' }}
                >
                  <p className="text-[11px] font-medium text-toss-text-secondary truncate">{c.name}</p>
                  <p className="num text-[11px] font-bold text-toss-text-primary text-right">{currentPct.toFixed(1)}%</p>

                  {!editing && (
                    <p className="num text-[11px] font-medium text-toss-text-tertiary text-right">
                      {targetPct > 0 ? `${targetPct.toFixed(0)}%` : '-'}
                    </p>
                  )}

                  {editing ? (
                    <div className="flex items-center gap-1 justify-end">
                      <input
                        type="number"
                        step="5"
                        min="0"
                        max="100"
                        value={draft[c.name] ?? ''}
                        onChange={e => setDraft(prev => ({ ...prev, [c.name]: e.target.value }))}
                        className="num w-12 text-right bg-toss-card border border-toss-border rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:border-toss-blue"
                        placeholder="0"
                      />
                      <span className="text-[10px] text-toss-text-tertiary">%</span>
                    </div>
                  ) : gapPct !== null ? (
                    <div className="text-right">
                      {Math.abs(gapPct) < 0.5 ? (
                        <p className="text-[10px] text-emerald-400 font-semibold">균형</p>
                      ) : gapPct > 0 ? (
                        <>
                          <p className="num text-[11px] font-bold text-amber-400">+{gapPct.toFixed(1)}% 초과</p>
                          {!hideAssets && (
                            <p className="num text-[9px] text-amber-400 opacity-80">
                              {fmtKRW(Math.round((gapPct / 100) * totalKrw))} 과잉
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="num text-[11px] font-bold text-toss-blue">{Math.abs(gapPct).toFixed(1)}% 부족</p>
                          {!hideAssets && (
                            <p className="num text-[9px] text-toss-blue opacity-80">
                              +{fmtKRW(Math.round((Math.abs(gapPct) / 100) * totalKrw))} 매수
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-toss-text-tertiary text-right">-</p>
                  )}
                </div>
              );
            })}
          </div>

          {editing && (
            <p className="mt-3 text-[10px] px-1">
              <span className="text-toss-text-tertiary">합계: </span>
              <span className={`font-bold num ${Math.abs(draftTotal - 100) < 0.5 ? 'text-emerald-400' : 'text-toss-down'}`}>
                {draftTotal.toFixed(0)}%
              </span>
              <span className="text-toss-text-tertiary"> / 100%</span>
            </p>
          )}

          {!editing && hasTargets && !hideAssets && (
            <p className="mt-3 text-[10px] text-toss-text-tertiary px-1">
              총 투자 자산 {fmtKRW(totalKrw)} 기준
            </p>
          )}
        </>
      )}
    </section>
  );
}
