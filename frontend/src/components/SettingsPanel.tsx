import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Landmark,
  Moon,
  ShieldCheck,
  LogOut,
  Sun,
  WalletCards,
} from 'lucide-react';
import { deleteSession, downloadCsv } from '../api';
import ApiKeyModal from './modals/ApiKeyModal';
import NotifModal from './modals/NotifModal';

interface Props {
  dark: boolean;
  hideAssets: boolean;
  dcOn: boolean;
  realEstateOn: boolean;
  loanOn: boolean;
  onToggleDark: () => void;
  onToggleHide: () => void;
  onToggleDc: () => void;
  onToggleRealEstate: () => void;
  onToggleLoan: () => void;
  onLogout: () => void;
}

function ToggleRow({
  icon: Icon,
  label,
  description,
  on,
  onToggle,
}: {
  icon: typeof Eye;
  label: string;
  description: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full min-h-[68px] px-4 py-3 flex items-center gap-3 text-left active:bg-toss-bg"
      aria-pressed={on}
    >
      <Icon size={19} className="text-toss-text-secondary shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-toss-text-primary">{label}</p>
        <p className="text-xs text-toss-text-tertiary mt-0.5">{description}</p>
      </div>
      <span className={`toggle-switch ${on ? 'is-on' : ''}`} aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

export default function SettingsPanel({
  dark,
  hideAssets,
  dcOn,
  realEstateOn,
  loanOn,
  onToggleDark,
  onToggleHide,
  onToggleDc,
  onToggleRealEstate,
  onToggleLoan,
  onLogout,
}: Props) {
  const queryClient = useQueryClient();
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const closeApiKey = () => {
    setApiKeyOpen(false);
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
  };

  return (
    <>
      <section className="bg-toss-card rounded-[var(--radius-toss-lg)] shadow-[var(--shadow-toss-card)] overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-bold text-toss-text-primary">화면과 자산 범위</h2>
        </div>
        <div className="divide-y divide-toss-border/70">
          <ToggleRow
            icon={hideAssets ? EyeOff : Eye}
            label="자산 금액 가리기"
            description="화면의 주요 금액을 숨겨요."
            on={hideAssets}
            onToggle={onToggleHide}
          />
          <ToggleRow
            icon={dark ? Moon : Sun}
            label="다크 모드"
            description="어두운 색상으로 화면을 표시해요."
            on={dark}
            onToggle={onToggleDark}
          />
          <ToggleRow
            icon={WalletCards}
            label="퇴직연금 포함"
            description="총자산과 분석에 퇴직연금을 포함해요."
            on={dcOn}
            onToggle={onToggleDc}
          />
          <ToggleRow
            icon={Building2}
            label="부동산 포함"
            description="총자산에 부동산 평가액을 포함해요."
            on={realEstateOn}
            onToggle={onToggleRealEstate}
          />
          <ToggleRow
            icon={Landmark}
            label="대출 반영"
            description="부동산 순자산에서 대출 잔액을 차감해요."
            on={loanOn}
            onToggle={onToggleLoan}
          />
        </div>
      </section>

      <section className="bg-toss-card rounded-[var(--radius-toss-lg)] shadow-[var(--shadow-toss-card)] overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-bold text-toss-text-primary">보안과 데이터</h2>
        </div>
        <div className="divide-y divide-toss-border/70">
          <button
            onClick={() => setApiKeyOpen(true)}
            className="settings-action"
          >
            <KeyRound size={19} />
            <span>
              <strong>편집 권한 연결</strong>
              <small>추가·수정·삭제가 필요할 때만 연결해요.</small>
            </span>
          </button>
          <button
            onClick={() => setNotifOpen(true)}
            className="settings-action"
          >
            <Bell size={19} />
            <span>
              <strong>알림 설정</strong>
              <small>자동매수 일정과 가격 변동 알림을 관리해요.</small>
            </span>
          </button>
          <button
            onClick={() => { void deleteSession().finally(onLogout); }}
            className="settings-action"
          >
            <LogOut size={19} />
            <span>
              <strong>로그아웃</strong>
              <small>현재 탭의 개인 자산 세션을 종료해요.</small>
            </span>
          </button>
          <button
            onClick={() => {
              setDownloadError('');
              downloadCsv().catch(() => setDownloadError('API 키를 확인한 뒤 다시 시도해주세요.'));
            }}
            className="settings-action"
          >
            <Download size={19} />
            <span>
              <strong>CSV 내보내기</strong>
              <small>보유 자산과 거래 기록을 파일로 내려받아요.</small>
            </span>
          </button>
        </div>
        {downloadError && (
          <p role="alert" className="px-5 pb-4 text-sm text-toss-danger">{downloadError}</p>
        )}
      </section>

      <section className="rounded-[var(--radius-toss-lg)] bg-toss-blue-soft p-5 flex items-start gap-3">
        <ShieldCheck size={20} className="text-toss-blue shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-bold text-toss-text-primary">개인 자산 데이터 보호</h2>
          <p className="text-xs text-toss-text-secondary leading-relaxed mt-1">
            마스터 키는 저장하지 않습니다. 자산 API 응답도 오프라인 캐시에 남기지 않으며, 세션은 12시간 후 만료됩니다.
          </p>
        </div>
      </section>

      {apiKeyOpen && <ApiKeyModal onClose={closeApiKey} />}
      {notifOpen && <NotifModal onClose={() => setNotifOpen(false)} />}
    </>
  );
}
