import { useEffect, useRef, useState } from 'react';
import { createSession } from '../../api';

export default function ApiKeyModal({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('input, button:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previousFocus?.focus();
    };
  }, [onClose]);

  const save = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await createSession(draft.trim());
      onClose();
    } catch {
      setError('로그인 키가 일치하지 않습니다. 다시 확인해주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="apikey-modal-title"
        aria-describedby="apikey-modal-description"
        className="modal-content mobile-sheet bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="apikey-modal-title" className="text-lg font-bold text-toss-text-primary mb-1">편집 권한 연결</h2>
        <p id="apikey-modal-description" className="text-[12px] text-toss-text-secondary mb-4">
          키는 저장하지 않고, 이 탭에서만 유효한 12시간 세션으로 교환합니다.
        </p>
        <label htmlFor="portfolio-login-key" className="sr-only">개인 자산 로그인 키</label>
        <input
          id="portfolio-login-key"
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          placeholder="로그인 키"
          aria-describedby="apikey-modal-description"
          className="w-full bg-toss-bg rounded-xl px-4 py-3 text-base text-toss-text-primary focus:outline-none focus:ring-2 focus:ring-toss-blue mb-4"
          autoFocus
        />
        {error && <p role="alert" className="text-sm text-toss-danger mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-toss-bg text-toss-text-primary font-semibold active:scale-[0.98]">
            취소
          </button>
          <button disabled={saving || !draft.trim()} onClick={() => void save()} className="flex-[2] py-3 rounded-xl bg-toss-blue text-white font-semibold active:scale-[0.98] disabled:opacity-50">
            {saving ? '확인 중…' : '로그인'}
          </button>
        </div>
      </div>
    </div>
  );
}
