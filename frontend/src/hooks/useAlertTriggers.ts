import { useEffect } from 'react';
import { notify, loadSettings, isTomorrow } from '../notifications';
import type { PortfolioSummary } from '../types';

/**
 * portfolio 데이터 갱신마다 알림 트리거를 평가.
 *
 * 1) 자동매수 D-1: enabled 자동매수 중 next_date가 내일이면 알림
 * 2) 가격 변동: 보유 종목 중 day_change_pct가 임계값 초과면 알림
 *
 * 같은 날 같은 키는 한 번만 발사되도록 notifications.ts가 dedupe 처리.
 */
export function useAlertTriggers(data: PortfolioSummary | undefined): void {
  useEffect(() => {
    if (!data) return;
    const s = loadSettings();
    if (!s.enabled) return;

    // 1) 자동매수 D-1
    if (s.autobuy_d1 && data.auto_buy_items) {
      for (const item of data.auto_buy_items) {
        if (!item.enabled) continue;
        if (isTomorrow(item.next_date)) {
          void notify(`내일 자동매수 예정: ${item.name}`, {
            body: `${item.amount} (${item.frequency})`,
            tag: `autobuy-${item.holding_key}`,
            dedupeKey: `autobuy:${item.holding_key}`,
          });
        }
      }
    }

    // 2) 가격 변동 임계값
    if (s.price_alert) {
      const threshold = Math.max(0.5, s.price_threshold_pct);
      const seen = new Set<string>();
      for (const acc of data.accounts) {
        for (const h of acc.holdings) {
          if (h.day_change_pct === null) continue;
          if (seen.has(h.name)) continue;
          seen.add(h.name);
          const abs = Math.abs(h.day_change_pct);
          if (abs >= threshold) {
            const sign = h.day_change_pct > 0 ? '+' : '';
            void notify(
              `${h.name} ${sign}${h.day_change_pct.toFixed(2)}%`,
              {
                body: `${acc.name} · 임계값 ±${threshold}% 초과`,
                tag: `price-${h.name}`,
                dedupeKey: `price:${h.name}:${h.day_change_pct > 0 ? 'up' : 'down'}`,
              },
            );
          }
        }
      }
    }
  }, [data]);
}
