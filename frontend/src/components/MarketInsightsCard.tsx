import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Newspaper, ExternalLink } from 'lucide-react';
import { fetchMarketInsights } from '../api';
import { relativeTime } from '../utils';
import type { HoldingSignal, InsightNews } from '../types';

const SIGNAL_STYLE: Record<HoldingSignal['signal'], { badge: string; label: string }> = {
  buy:  { badge: 'bg-toss-up-soft text-toss-up',     label: '매수 검토' },
  sell: { badge: 'bg-toss-down-soft text-toss-down', label: '매도 검토' },
  hold: { badge: 'bg-toss-bg text-toss-text-tertiary', label: '관망' },
};

function NewsList({ flag, label, items }: { flag: string; label: string; items: InsightNews[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[13px] leading-none" aria-hidden>{flag}</span>
        <span className="text-[11px] font-semibold text-toss-text-secondary">{label}</span>
      </div>
      <ul className="space-y-1">
        {items.map((n, i) => (
          <li key={i}>
            {n.link ? (
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-toss-bg transition-colors"
              >
                <span className="flex-1 text-[12px] text-toss-text-primary leading-snug group-hover:text-toss-blue">
                  {n.title}
                </span>
                <ExternalLink size={11} className="mt-0.5 shrink-0 text-toss-text-tertiary/60" />
              </a>
            ) : (
              <span className="block px-2.5 py-1.5 text-[12px] text-toss-text-primary">{n.title}</span>
            )}
            <p className="px-2.5 text-[10px] text-toss-text-tertiary">
              {n.publisher}{n.published_at ? ` · ${relativeTime(n.published_at)}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignalRow({ s }: { s: HoldingSignal }) {
  const style = SIGNAL_STYLE[s.signal];
  return (
    <div className="bg-toss-bg rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[12px] leading-none" aria-hidden>{s.exchange === 'KR' ? '🇰🇷' : '🇺🇸'}</span>
        <p className="flex-1 min-w-0 text-[12px] font-semibold text-toss-text-primary truncate">{s.name}</p>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${style.badge}`}>
          {style.label}
        </span>
      </div>
      <p className="mt-1 text-[10px] text-toss-text-tertiary leading-relaxed">
        {s.reasons.join(' · ')}
      </p>
    </div>
  );
}

export default function MarketInsightsCard() {
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['marketInsights'],
    queryFn: fetchMarketInsights,
    enabled: open,                  // 펼쳤을 때만 조회 (백엔드 첫 계산이 수 초 걸림)
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });

  const signals = data?.signals ?? [];
  const buyCount = signals.filter(s => s.signal === 'buy').length;
  const sellCount = signals.filter(s => s.signal === 'sell').length;
  const holdCount = signals.filter(s => s.signal === 'hold').length;

  return (
    <section className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-5 py-4"
      >
        <div className="w-7 h-7 rounded-full bg-toss-blue-soft flex items-center justify-center shrink-0">
          <Newspaper size={15} className="text-toss-blue" />
        </div>
        <h3 className="text-sm font-semibold text-toss-text-primary flex-1 text-left">시장 인사이트</h3>
        {data && (
          <span className="text-[10px] text-toss-text-tertiary mr-1">
            매수 {buyCount} · 관망 {holdCount} · 매도 {sellCount}
          </span>
        )}
        {open
          ? <ChevronUp size={16} className="text-toss-text-tertiary" />
          : <ChevronDown size={16} className="text-toss-text-tertiary" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-toss-border/60 pt-4 space-y-4">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-toss-text-tertiary">
              시장 데이터 분석 중... (최초 1회 수 초 소요)
            </div>
          ) : isError ? (
            <div className="py-6 text-center text-sm text-toss-text-tertiary">
              인사이트를 불러올 수 없어요. 잠시 후 다시 열어보세요.
            </div>
          ) : data ? (
            <>
              {/* 시장 주요 뉴스 */}
              {(data.news.kospi.length > 0 || data.news.nasdaq.length > 0) && (
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold text-toss-text-tertiary tracking-widest uppercase">
                    시장 주요 뉴스
                  </p>
                  <NewsList flag="🇰🇷" label="코스피" items={data.news.kospi} />
                  <NewsList flag="🇺🇸" label="나스닥" items={data.news.nasdaq} />
                </div>
              )}

              {/* 보유 종목 시그널 */}
              {signals.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-toss-text-tertiary tracking-widest uppercase mb-2">
                    보유 종목 기술적 시그널
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {signals.map(s => <SignalRow key={s.ticker} s={s} />)}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-toss-text-tertiary leading-relaxed bg-toss-bg rounded-lg px-3 py-2">
                ⚠️ {data.disclaimer}
              </p>
              <p className="text-[9px] text-toss-text-tertiary text-right">
                {relativeTime(data.generated_at)} 생성 · 30분 캐시
              </p>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
