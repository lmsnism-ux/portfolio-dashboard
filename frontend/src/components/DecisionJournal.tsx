import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck, Check, Plus, X } from 'lucide-react';
import { createDecision, fetchDecisions, updateDecision } from '../api';

export default function DecisionJournal() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [thesis, setThesis] = useState('');
  const [reviewOn, setReviewOn] = useState('');
  const { data: items = [] } = useQuery({ queryKey: ['decisions'], queryFn: fetchDecisions });
  const refresh = () => client.invalidateQueries({ queryKey: ['decisions'] });
  const createMutation = useMutation({ mutationFn: createDecision, onSuccess: () => { refresh(); setOpen(false); setTitle(''); setThesis(''); } });
  const updateMutation = useMutation({ mutationFn: ({ id, status }: { id: number; status: 'done' | 'dismissed' }) => updateDecision(id, { status }), onSuccess: refresh });

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] shadow-[var(--shadow-toss-card)] overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div><h2 className="text-base font-bold text-toss-text-primary">투자 판단 기록</h2><p className="mt-1 text-xs text-toss-text-tertiary">결정 당시의 근거를 남기고 나중에 검토합니다.</p></div>
        <button onClick={() => setOpen(value => !value)} aria-expanded={open} className="min-h-11 px-3 inline-flex items-center gap-1 text-sm font-semibold text-toss-blue"><Plus size={16} /> 기록</button>
      </div>
      {open && (
        <div className="mx-4 mb-4 rounded-2xl bg-toss-bg p-4 space-y-3">
          <label className="block"><span className="text-xs text-toss-text-secondary">결정</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 미국 주식 비중 유지" className="mt-1 w-full rounded-xl bg-toss-card px-4 py-3" /></label>
          <label className="block"><span className="text-xs text-toss-text-secondary">근거</span><textarea value={thesis} onChange={e => setThesis(e.target.value)} placeholder="왜 이 판단을 했는지 적어주세요." rows={3} className="mt-1 w-full resize-none rounded-xl bg-toss-card px-4 py-3" /></label>
          <label className="block"><span className="text-xs text-toss-text-secondary">검토일</span><input type="date" value={reviewOn} onChange={e => setReviewOn(e.target.value)} className="mt-1 w-full rounded-xl bg-toss-card px-4 py-3" /></label>
          <button onClick={() => createMutation.mutate({ title, thesis, review_on: reviewOn || null })} disabled={!title.trim() || !thesis.trim() || createMutation.isPending} className="min-h-12 w-full rounded-xl bg-toss-blue text-white font-semibold disabled:opacity-50">저장</button>
        </div>
      )}
      <div className="divide-y divide-toss-border/70">
        {items.slice(0, 6).map(item => (
          <article key={item.id} className="px-5 py-4 flex gap-3">
            <BookOpenCheck size={18} className="mt-0.5 shrink-0 text-toss-blue" />
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-toss-text-primary">{item.title}</h3><span className="rounded-full bg-toss-bg px-2 py-0.5 text-[10px] text-toss-text-tertiary">{item.status === 'planned' ? '검토 예정' : item.status === 'done' ? '실행' : '보류'}</span></div><p className="mt-1 text-xs leading-5 text-toss-text-secondary">{item.thesis}</p>{item.review_on && <p className="mt-1 text-[10px] text-toss-text-tertiary">검토일 {item.review_on}</p>}</div>
            {item.status === 'planned' && <div className="flex gap-1"><button onClick={() => updateMutation.mutate({ id: item.id, status: 'done' })} aria-label={`${item.title} 실행 완료`} className="w-10 h-10 flex items-center justify-center text-toss-success"><Check size={16} /></button><button onClick={() => updateMutation.mutate({ id: item.id, status: 'dismissed' })} aria-label={`${item.title} 보류`} className="w-10 h-10 flex items-center justify-center text-toss-text-tertiary"><X size={16} /></button></div>}
          </article>
        ))}
        {!items.length && <p className="px-5 pb-5 text-sm text-toss-text-tertiary">아직 기록이 없습니다.</p>}
      </div>
    </section>
  );
}
