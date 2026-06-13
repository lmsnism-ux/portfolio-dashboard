import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Target, Pencil, Check, X } from 'lucide-react';
import { patchGoal } from '../api';
import { fmtKRW } from '../utils';

interface Props {
  goalKrw: number | null;
  longGoalKrw: number | null;
  currentKrw: number;
  progressPct: number | null;
  hideAssets: boolean;
  longTermKrw?: number;
}

type TabKey = 'short' | 'long';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'short', label: '단기 목표' },
  { key: 'long',  label: '장기 목표' },
];

interface GoalViewProps {
  goalKrw: number | null;
  currentKrw: number;
  hideAssets: boolean;
  longTermKrw?: number;
  tabKey: TabKey;
}

function GoalView({ goalKrw, currentKrw, hideAssets, longTermKrw, tabKey }: GoalViewProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(goalKrw ? (goalKrw / 10000).toString() : '');
  const [excludeLongTerm, setExcludeLongTerm] = useState(false);

  const mutation = useMutation({
    mutationFn: (krw: number) =>
      patchGoal(tabKey === 'short' ? { goal_krw: krw } : { long_goal_krw: krw }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      setEditing(false);
    },
  });

  const save = () => {
    const manwon = parseFloat(draft);
    if (!Number.isFinite(manwon) || manwon <= 0) return;
    mutation.mutate(Math.round(manwon * 10000));
  };

  const investKrw = excludeLongTerm && longTermKrw ? currentKrw - longTermKrw : currentKrw;
  const remaining = goalKrw ? Math.max(0, goalKrw - investKrw) : null;
  const pct = goalKrw ? (investKrw / goalKrw) * 100 : 0;
  const clamped = Math.min(100, Math.max(0, pct));
  const isAchieved = pct >= 100;

  const label = tabKey === 'short' ? '단기 목표' : '장기 목표';

  return (
    <div>
      {editing ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-toss-bg rounded-xl px-4 py-2.5">
            <input
              type="number"
              step="any"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="num flex-1 bg-transparent focus:outline-none text-base"
              placeholder="예: 10000"
              aria-label={`${label} 금액 입력 (만원)`}
              autoFocus
            />
            <span className="text-sm text-toss-text-tertiary ml-2">만원</span>
          </div>
          <button
            onClick={save}
            disabled={mutation.isPending}
            aria-label="저장"
            className="p-2.5 rounded-xl bg-toss-blue text-white active:scale-95"
          >
            <Check size={16} />
          </button>
          <button
            onClick={() => setEditing(false)}
            aria-label="취소"
            className="p-2.5 rounded-xl bg-toss-bg text-toss-text-secondary active:scale-95"
          >
            <X size={16} />
          </button>
        </div>
      ) : !goalKrw ? (
        <p className="text-sm text-toss-text-secondary">
          {label}을 설정해 보세요.{' '}
          <button
            onClick={() => {
              setDraft('');
              setEditing(true);
            }}
            className="text-toss-blue font-semibold"
          >
            지금 설정하기
          </button>
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2">
              <span className="num text-2xl font-extrabold text-toss-text-primary">
                {clamped.toFixed(1)}%
              </span>
              {!!longTermKrw && (
                <div className="flex bg-toss-bg border border-toss-border rounded-full p-0.5 gap-0.5">
                  {[false, true].map((excl) => (
                    <button
                      key={String(excl)}
                      onClick={() => setExcludeLongTerm(excl)}
                      aria-pressed={excludeLongTerm === excl}
                      className={`px-2 py-0.5 text-[10px] rounded-full transition-all font-medium whitespace-nowrap ${
                        excludeLongTerm === excl
                          ? 'bg-toss-blue text-white shadow-sm'
                          : 'text-toss-text-tertiary hover:text-toss-text-secondary'
                      }`}
                    >
                      {excl ? '연금 제외' : '전체'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="num text-xs text-toss-text-tertiary whitespace-nowrap">
                {hideAssets ? '••••' : fmtKRW(investKrw)} /{' '}
                <span className="text-toss-text-secondary font-semibold">{fmtKRW(goalKrw)}</span>
              </span>
              <button
                onClick={() => {
                  setDraft(goalKrw ? (goalKrw / 10000).toString() : '');
                  setEditing(true);
                }}
                aria-label={`${label} 수정`}
                className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95 shrink-0"
              >
                <Pencil size={13} className="text-toss-text-tertiary" />
              </button>
            </div>
          </div>

          <div
            role="progressbar"
            aria-valuenow={Math.round(clamped)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} 달성률 ${clamped.toFixed(1)}%`}
            className="h-2.5 bg-toss-bg rounded-full overflow-hidden"
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${clamped}%`,
                background: isAchieved
                  ? 'linear-gradient(90deg, #1B6D2F 0%, #2DAF4E 100%)'
                  : tabKey === 'long'
                    ? 'linear-gradient(90deg, #6366F1 0%, #818CF8 100%)'
                    : 'linear-gradient(90deg, #3182F6 0%, #5B8DEF 100%)',
              }}
            />
          </div>

          <p className="text-xs text-toss-text-tertiary mt-2">
            {isAchieved ? (
              <span className="text-toss-success font-semibold">목표 달성! 🎉</span>
            ) : (
              <>
                목표까지{' '}
                <span className="num text-toss-text-secondary font-semibold">
                  {hideAssets ? '••••' : fmtKRW(remaining!)}
                </span>{' '}
                남았어요
              </>
            )}
          </p>

          {excludeLongTerm && longTermKrw && (
            <p className="text-[10px] text-indigo-400 mt-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" aria-hidden="true" />
              연금 계좌 {hideAssets ? '••••' : fmtKRW(longTermKrw)} 제외됨
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function GoalCard({ goalKrw, longGoalKrw, currentKrw, hideAssets, longTermKrw }: Props) {
  const [tab, setTab] = useState<TabKey>('short');

  return (
    <section
      className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5"
      aria-label="목표 자산"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-toss-blue-soft flex items-center justify-center shrink-0" aria-hidden="true">
          <Target size={15} className="text-toss-blue" />
        </div>
        <h3 className="text-sm font-semibold text-toss-text-primary">목표 자산</h3>

        <div className="ml-auto flex bg-toss-bg border border-toss-border rounded-full p-0.5 gap-0.5" role="tablist" aria-label="목표 기간">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1 text-[11px] rounded-full transition-all font-medium whitespace-nowrap ${
                tab === t.key
                  ? 'bg-toss-blue text-white shadow-sm'
                  : 'text-toss-text-tertiary hover:text-toss-text-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" aria-label={tab === 'short' ? '단기 목표' : '장기 목표'}>
        {tab === 'short' ? (
          <GoalView
            key="short"
            goalKrw={goalKrw}
            currentKrw={currentKrw}
            hideAssets={hideAssets}
            longTermKrw={longTermKrw}
            tabKey="short"
          />
        ) : (
          <GoalView
            key="long"
            goalKrw={longGoalKrw}
            currentKrw={currentKrw}
            hideAssets={hideAssets}
            longTermKrw={longTermKrw}
            tabKey="long"
          />
        )}
      </div>
    </section>
  );
}
