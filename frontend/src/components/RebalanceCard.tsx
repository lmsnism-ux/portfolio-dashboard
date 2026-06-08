import { useState } from 'react';
import { Sliders, Check, X, Sparkles } from 'lucide-react';
import type { PortfolioSummary } from '../types';
import { fmtKRW } from '../utils';

const REBALANCE_KEY = 'pd_rebalance_targets';

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
}

/** 자산군 추천 프리셋 — 종류별 비중을 분류해 자동 매핑 */
const PRESETS: Array<{
  key: 'conservative' | 'balanced' | 'aggressive';
  label: string;
  description: string;
  color: string;
  /** 자산군 카테고리별 권장 비중 (%) */
  mix: { 주식: number; '혼합(TDF)': number; 채권: number; 현금: number; 예금: number };
}> = [
  {
    key: 'conservative',
    label: '보수형',
    description: '안정 중심 · 예금/채권 비중',
    color: '#10B981',
    mix: { 주식: 30, '혼합(TDF)': 20, 채권: 25, 현금: 5, 예금: 20 },
  },
  {
    key: 'balanced',
    label: '균형형',
    description: '주식·안전 균형',
    color: '#3182F6',
    mix: { 주식: 55, '혼합(TDF)': 15, 채권: 15, 현금: 5, 예금: 10 },
  },
  {
    key: 'aggressive',
    label: '공격형',
    description: '성장 중심 · 주식 고비중',
    color: '#F04452',
    mix: { 주식: 80, '혼합(TDF)': 10, 채권: 5, 현금: 0, 예금: 5 },
  },
];

function loadTargets(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(REBALANCE_KEY) || '{}'); } catch { return {}; }
}

export default function RebalanceCard({ data, hideAssets }: Props) {
  const [editing, setEditing] = useState(false);
  const [targets, setTargets] = useState<Record<string, number>>(loadTargets);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const classes = data.asset_class_weights;
  const totalKrw = classes.reduce((s, c) => s + c.value_krw, 0);

  if (classes.length === 0) return null;

  const hasTargets = classes.some(c => (targets[c.name] ?? 0) > 0);
  const draftTotal = Object.values(draft).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const startEdit = () => {
    const d: Record<string, string> = {};
    classes.forEach(c => { d[c.name] = (targets[c.name] ?? 0) > 0 ? String(targets[c.name]) : ''; });
    setDraft(d);
    setSelectedPreset(null);
    setEditing(true);
  };

  const applyPreset = (presetKey: typeof PRESETS[number]['key']) => {
    const preset = PRESETS.find(p => p.key === presetKey);
    if (!preset) return;
    const d: Record<string, string> = {};
    classes.forEach(c => {
      // 현재 보유 자산군 이름과 프리셋 키 매칭 (혼합/TDF는 ' 혼합(TDF)' 키 사용)
      let pct: number | undefined;
      const name = c.name;
      if (name in preset.mix) pct = (preset.mix as Record<string, number>)[name];
      else if (/혼합|TDF/i.test(name)) pct = preset.mix['혼합(TDF)'];
      else if (/주식/.test(name))     pct = preset.mix['주식'];
      else if (/채권/.test(name))     pct = preset.mix['채권'];
      else if (/예금|적금/.test(name)) pct = preset.mix['예금'];
      else if (/현금/.test(name))     pct = preset.mix['현금'];
      d[name] = pct && pct > 0 ? String(pct) : '';
    });
    setDraft(d);
    setSelectedPreset(presetKey);
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
          {/* 편집 모드: 추천 프리셋 */}
          {editing && (
            <div className="mb-3 bg-toss-blue-soft/40 rounded-2xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={13} className="text-toss-blue" />
                <span className="text-[11px] font-semibold text-toss-text-secondary">추천 비중 (한 번 클릭으로 자동 채우기)</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {PRESETS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p.key)}
                    className={`text-left p-2.5 rounded-xl transition-all active:scale-95 border-2 ${
                      selectedPreset === p.key
                        ? 'border-toss-blue bg-toss-card'
                        : 'border-toss-border/40 bg-toss-card hover:border-toss-blue/30'
                    }`}
                    style={selectedPreset === p.key ? { borderColor: p.color } : undefined}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
                      <span className="text-[11px] font-bold" style={{ color: p.color }}>{p.label}</span>
                    </div>
                    <p className="text-[9px] text-toss-text-tertiary leading-tight">{p.description}</p>
                    <div className="mt-1.5 flex flex-wrap gap-0.5">
                      {Object.entries(p.mix).filter(([, v]) => v > 0).map(([k, v]) => (
                        <span
                          key={k}
                          className="text-[8px] font-medium px-1 py-0.5 rounded bg-toss-bg text-toss-text-secondary"
                        >
                          {k.replace('혼합(TDF)', 'TDF')} {v}%
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-toss-text-tertiary mt-2 leading-relaxed">
                ⓘ 보유 자산군 이름에 따라 자동 매칭됩니다. 아래에서 미세 조정할 수 있어요.
              </p>
            </div>
          )}

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
