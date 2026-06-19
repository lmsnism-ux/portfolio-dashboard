import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Plus, Trash2 } from 'lucide-react';
import { createCashFlow, deleteCashFlow, fetchCashFlows } from '../api';
import { fmtKRW } from '../utils';

export default function CashFlowCard() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const { data: items = [] } = useQuery({ queryKey: ['cash-flows'], queryFn: () => fetchCashFlows(365) });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['cash-flows'] });
    client.invalidateQueries({ queryKey: ['performance'] });
  };
  const createMutation = useMutation({
    mutationFn: createCashFlow,
    onSuccess: () => { refresh(); setAmount(''); setNote(''); setOpen(false); },
  });
  const deleteMutation = useMutation({ mutationFn: deleteCashFlow, onSuccess: refresh });
  const save = () => {
    const parsed = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    createMutation.mutate({ flow_type: type, amount_krw: Math.round(parsed), occurred_on: date, note: note.trim() || null });
  };

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] shadow-[var(--shadow-toss-card)] overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div><h2 className="text-base font-bold text-toss-text-primary">입출금 장부</h2><p className="mt-1 text-xs text-toss-text-tertiary">수익률에서 외부 현금흐름을 분리합니다.</p></div>
        <button onClick={() => setOpen(value => !value)} aria-expanded={open} className="min-h-11 px-3 inline-flex items-center gap-1 text-sm font-semibold text-toss-blue"><Plus size={16} /> 기록</button>
      </div>

      {open && (
        <div className="mx-4 mb-4 rounded-2xl bg-toss-bg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="현금흐름 종류">
            {([['deposit', '입금', ArrowDownToLine], ['withdrawal', '출금', ArrowUpFromLine]] as const).map(([key, label, Icon]) => (
              <button key={key} onClick={() => setType(key)} aria-pressed={type === key} className={`min-h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold ${type === key ? 'bg-toss-blue text-white' : 'bg-toss-card text-toss-text-secondary'}`}><Icon size={16} />{label}</button>
            ))}
          </div>
          <label className="block"><span className="text-xs text-toss-text-secondary">금액</span><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" placeholder="예: 1000000" className="mt-1 w-full rounded-xl bg-toss-card px-4 py-3" /></label>
          <label className="block"><span className="text-xs text-toss-text-secondary">날짜</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-xl bg-toss-card px-4 py-3" /></label>
          <label className="block"><span className="text-xs text-toss-text-secondary">메모</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="선택 사항" className="mt-1 w-full rounded-xl bg-toss-card px-4 py-3" /></label>
          <button onClick={save} disabled={createMutation.isPending || !amount} className="min-h-12 w-full rounded-xl bg-toss-blue text-white font-semibold disabled:opacity-50">저장</button>
        </div>
      )}

      <div className="divide-y divide-toss-border/70">
        {items.slice(0, 8).map(item => (
          <div key={item.id} className="min-h-16 px-5 py-3 flex items-center gap-3">
            <span className={`w-9 h-9 rounded-full flex items-center justify-center ${item.flow_type === 'deposit' ? 'bg-toss-blue-soft text-toss-blue' : 'bg-red-500/10 text-red-500'}`}>{item.flow_type === 'deposit' ? <ArrowDownToLine size={17} /> : <ArrowUpFromLine size={17} />}</span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-toss-text-primary">{item.flow_type === 'deposit' ? '입금' : '출금'} · {fmtKRW(item.amount_krw)}</p><p className="mt-0.5 truncate text-xs text-toss-text-tertiary">{item.occurred_on}{item.note ? ` · ${item.note}` : ''}</p></div>
            <button onClick={() => deleteMutation.mutate(item.id)} aria-label={`${item.occurred_on} 현금흐름 삭제`} className="w-11 h-11 flex items-center justify-center text-toss-text-tertiary"><Trash2 size={16} /></button>
          </div>
        ))}
        {!items.length && <p className="px-5 pb-5 text-sm text-toss-text-tertiary">아직 기록이 없습니다.</p>}
      </div>
    </section>
  );
}
