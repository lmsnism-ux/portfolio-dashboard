import { useEffect, useState } from 'react';
import { getApiKey, setApiKey } from '../../api';

export default function ApiKeyModal({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<string>(() => getApiKey());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const save = () => {
    setApiKey(draft.trim());
    onClose();
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="apikey-modal-title"
        className="modal-content mobile-sheet bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="apikey-modal-title" className="text-lg font-bold text-toss-text-primary mb-1">API 키 설정</h2>
        <p className="text-[12px] text-toss-text-secondary mb-4">
          백엔드 PORTFOLIO_API_KEY 환경변수와 동일한 값을 입력하세요. 빈 칸으로 저장하면 키를 제거합니다.
        </p>
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="API key"
          className="w-full bg-toss-bg rounded-xl px-4 py-3 text-base text-toss-text-primary focus:outline-none focus:ring-2 focus:ring-toss-blue mb-4"
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-toss-bg text-toss-text-primary font-semibold active:scale-[0.98]">
            취소
          </button>
          <button onClick={save} className="flex-[2] py-3 rounded-xl bg-toss-blue text-white font-semibold active:scale-[0.98]">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
