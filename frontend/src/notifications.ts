/**
 * 클라이언트 알림 유틸 (Notification API + Service Worker 폴백).
 *
 * 진짜 백그라운드 push가 아니라, 페이지/PWA가 열려 있는 동안 동작하는 알림.
 * VAPID 서버 구독 없이도 PWA 설치 시 안드로이드/iOS 16.4+ 에서 잘 작동한다.
 */

const NOTIF_SETTINGS_KEY = 'pd_notif_settings';
const NOTIF_FIRED_KEY    = 'pd_notif_fired';  // 중복 발사 방지: 날짜+티커별

export interface NotifSettings {
  enabled: boolean;
  /** 자동매수 D-1 알림 (매수일 전날 09시에 알림) */
  autobuy_d1: boolean;
  /** 가격 변동 알림 (단일 종목 일일 등락률 임계값 %) */
  price_alert: boolean;
  price_threshold_pct: number;  // 예: 3 → ±3% 초과 시
}

export const DEFAULT_NOTIF: NotifSettings = {
  enabled: false,
  autobuy_d1: true,
  price_alert: true,
  price_threshold_pct: 3,
};

export function loadSettings(): NotifSettings {
  try {
    const raw = localStorage.getItem(NOTIF_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_NOTIF };
    return { ...DEFAULT_NOTIF, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_NOTIF };
  }
}

export function saveSettings(s: NotifSettings): void {
  localStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(s));
}

/** 브라우저 알림 권한 상태 */
export function getPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** 권한 요청. 거부 / 미지원 / 허용 결과 반환 */
export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

/** 같은 날 같은 키로 한 번만 알림 발사하도록 dedupe */
function shouldFire(key: string): boolean {
  try {
    const raw = localStorage.getItem(NOTIF_FIRED_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    const today = new Date().toISOString().slice(0, 10);
    if (map[key] === today) return false;
    map[key] = today;
    // 오래된 entries 정리 (7일 지난 것)
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    Object.keys(map).forEach(k => {
      if (map[k] < cutoff) delete map[k];
    });
    localStorage.setItem(NOTIF_FIRED_KEY, JSON.stringify(map));
    return true;
  } catch {
    return true;
  }
}

interface NotifyOptions {
  /** dedupe 키. 같은 키는 하루 1회만 발사 */
  dedupeKey?: string;
  body?: string;
  icon?: string;
  tag?: string;
}

export async function notify(title: string, opts: NotifyOptions = {}): Promise<boolean> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  if (opts.dedupeKey && !shouldFire(opts.dedupeKey)) return false;

  try {
    // PWA가 설치되어 있으면 service worker로, 아니면 Notification 직접
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          body: opts.body,
          icon: opts.icon ?? '/favicon.svg',
          tag: opts.tag,
          badge: opts.icon ?? '/favicon.svg',
        });
        return true;
      }
    }
    new Notification(title, {
      body: opts.body,
      icon: opts.icon ?? '/favicon.svg',
      tag: opts.tag,
    });
    return true;
  } catch (e) {
    console.warn('notify failed', e);
    return false;
  }
}

/** 다음 매수일이 내일인지 판정. next_date는 백엔드 한국어 라벨 ("오늘"/"10/5"/"다음 월요일" 등) */
export function isTomorrow(nextDateLabel: string): boolean {
  if (!nextDateLabel) return false;
  const m = nextDateLabel.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return false;
  const now = new Date();
  const target = new Date(now.getFullYear(), parseInt(m[1]) - 1, parseInt(m[2]));
  // 연말 케이스: 1월인데 라벨이 12월이면 작년이 아니라 올해 12월의 의미는 없으니 skip
  const diffDays = Math.round((target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  return diffDays === 1;
}
