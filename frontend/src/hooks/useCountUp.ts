import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 목표 숫자로 부드럽게 카운트업/롤링 (토스 감성).
 * - 최초 등장: 0 → target
 * - 값 변경(새로고침 등): 직전값 → 새 target
 * - prefers-reduced-motion 이면 애니메이션 없이 즉시 target
 * 포맷은 호출부에서 fmtKRW 등으로 처리한다.
 * (effect 안에서 동기 setState를 호출하지 않도록, 즉시 표시 케이스는
 *  reduced 플래그로 렌더 단계에서 처리하고 effect는 rAF 애니메이션만 담당한다.)
 */
export function useCountUp(target: number, durationMs = 700): number {
  const reduced = prefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const fromRef = useRef(reduced ? target : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced || !Number.isFinite(target)) {
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(from + (target - from) * eased);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, reduced]);

  return reduced || !Number.isFinite(target) ? target : value;
}
