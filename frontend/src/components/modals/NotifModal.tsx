import { useEffect, useState } from 'react';
import {
  loadSettings,
  saveSettings,
  requestPermission,
  getPermission,
  type NotifSettings,
} from '../../notifications';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between bg-toss-bg rounded-xl px-4 py-3">
      <span className="text-sm font-medium text-toss-text-primary">{label}</span>
      {children}
    </div>
  );
}

function SmallToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${on ? 'bg-toss-blue' : 'bg-toss-border'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export default function NotifModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<NotifSettings>(() => loadSettings());
  const [perm, setPerm] = useState(() => getPermission());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const enableAll = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'granted') {
      const next = { ...s, enabled: true };
      setS(next);
      saveSettings(next);
    }
  };

  const update = (patch: Partial<NotifSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
  };

  const denied = perm === 'denied';
  const unsupported = perm === 'unsupported';

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-modal-title"
        className="modal-content mobile-sheet bg-toss-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-toss-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="notif-modal-title" className="text-lg font-bold text-toss-text-primary mb-1">알림 설정</h2>
        <p className="text-[12px] text-toss-text-secondary mb-4">
          페이지가 열려 있거나 PWA가 설치된 경우 알림이 표시됩니다. (브라우저 권한 필요)
        </p>

        {unsupported ? (
          <div className="bg-toss-bg rounded-xl p-4 text-sm text-toss-text-secondary">
            이 브라우저는 알림 API를 지원하지 않습니다.
          </div>
        ) : denied ? (
          <div className="bg-amber-500/10 rounded-xl p-4 text-sm text-amber-500">
            브라우저에서 알림이 차단되어 있어요. 사이트 설정에서 알림을 허용해주세요.
          </div>
        ) : !s.enabled ? (
          <button
            onClick={enableAll}
            className="w-full py-3 rounded-xl bg-toss-blue text-white font-semibold active:scale-[0.98]"
          >
            알림 켜기
          </button>
        ) : (
          <div className="space-y-3">
            <Row label="알림 사용">
              <SmallToggle on={s.enabled} onChange={(v) => update({ enabled: v })} />
            </Row>
            <Row label="자동매수 D-1 알림">
              <SmallToggle on={s.autobuy_d1} onChange={(v) => update({ autobuy_d1: v })} />
            </Row>
            <Row label="가격 변동 알림">
              <SmallToggle on={s.price_alert} onChange={(v) => update({ price_alert: v })} />
            </Row>
            {s.price_alert && (
              <div className="bg-toss-bg rounded-xl p-3 flex items-center gap-2">
                <span className="text-xs text-toss-text-secondary">임계값</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="20"
                  value={s.price_threshold_pct}
                  onChange={(e) => update({ price_threshold_pct: parseFloat(e.target.value) || 3 })}
                  className="num flex-1 bg-transparent focus:outline-none text-sm text-right text-toss-text-primary"
                />
                <span className="text-xs text-toss-text-tertiary">±% 초과</span>
              </div>
            )}
            <p className="text-[11px] text-toss-text-tertiary leading-relaxed">
              ⓘ 같은 종목/날짜에 대해 하루 1회만 알림이 발사됩니다.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full py-3 rounded-xl bg-toss-bg text-toss-text-primary font-semibold active:scale-[0.98]"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
