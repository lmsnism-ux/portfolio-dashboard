import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Target, Pencil, Check, X } from 'lucide-react';
import { patchGoal } from '../api';
import { fmtKRW } from '../utils';

interface Props {
  goalKrw: number | null;
  currentKrw: number;
  progressPct: number | null;
  hideAssets: boolean;
  longTermKrw?: number;
}

export default function GoalCard({ goalKrw, currentKrw, progressPct, hideAssets, longTermKrw }: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(goalKrw ? (goalKrw / 10000).toString() : '');
  const [excludeLongTerm, setExcludeLongTerm] = useState(false);

  const mutation = useMutation({
    mutationFn: (krw: number) => patchGoal(krw),
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
  const pct = goalKrw ? (investKrw / goalKrw) * 100 : (progressPct ?? 0);
  const clamped = Math.min(100, Math.max(0, pct));
  const isAchieved = pct >= 100;

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="w-7 h-7 rounded-full bg-toss-blue-soft flex items-center justify-center shrink-0">
          <Target size={15} className="text-toss-blue" />
        </div>
        <h3 className="text-sm font-semibold text-toss-text-primary">목표 자산</h3>
        <div className="ml-auto flex items-center gap-2">
          {!editing && !!longTermKrw && (
            <div className="flex bg-toss-bg border border-toss-border rounded-full p-0.5 gap-0.5">
              {[false, true].map(excl => (
                <button
                  key={String(excl)}
                  onClick={() => setExcludeLongTerm(excl)}
                  className={`px-2 py-0.5 text-[10px] rounded-full transition-all font-medium whitespace-nowrap ${
                    excludeLongTerm === excl
                      ? 'bg-toss-blue text-white shadow-sm'
                      : 'text-toss-text-tertiary hover:text-toss-text-secondary'
                  }`}
                >
                  {excl ? '장기투자 제외' : '전체'}
                </button>
              ))}
            </div>
          )}
          {!editing && (
            <button
              onClick={() => {
                setDraft(goalKrw ? (goalKrw / 10000).toString() : '');
                setEditing(true);
              }}
              className="p-1.5 rounded-full hover:bg-toss-bg active:scale-95"
              title="목표 수정"
            >
              <Pencil size={13} className="text-toss-text-tertiary" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-toss-bg rounded-xl px-4 py-2.5">
            <input
              type="number"
              step="any"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="num flex-1 bg-transparent focus:outline-none text-base"
              placeholder="예: 10000"
              autoFocus
            />
            <span className="text-sm text-toss-text-tertiary ml-2">만원</span>
          </div>
          <button
            onClick={save}
            disabled={mutation.isPending}
            className="p-2.5 rounded-xl bg-toss-blue text-white active:scale-95"
          >
            <Check size={16} />
          </button>
          <button
            onClick={() => setEditing(false)}
            className="p-2.5 rounded-xl bg-toss-bg text-toss-text-secondary active:scale-95"
          >
            <X size={16} />
          </button>
        </div>
      ) : !goalKrw ? (
        <p className="text-sm text-toss-text-secondary">
          목표 자산을 설정해 보세요.{' '}
          <button onClick={() => setEditing(true)} className="text-toss-blue font-semibold">
            지금 설정하기
          </button>
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <span className="num text-2xl font-extrabold text-toss-text-primary">
              {clamped.toFixed(1)}%
            </span>
            <span className="num text-xs text-toss-text-tertiary">
              {hideAssets ? '••••' : fmtKRW(investKrw)} /{' '}
              <span className="text-toss-text-secondary font-semibold">{fmtKRW(goalKrw)}</span>
            </span>
          </div>
          <div className="h-2.5 bg-toss-bg rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${clamped}%`,
                background: isAchieved
                  ? 'linear-gradient(90deg, #1B6D2F 0%, #2DAF4E 100%)'
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
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
              연금 계좌 {hideAssets ? '••••' : fmtKRW(longTermKrw)} 제외됨
            </p>
          )}
        </>
      )}
    </section>
  );
}
