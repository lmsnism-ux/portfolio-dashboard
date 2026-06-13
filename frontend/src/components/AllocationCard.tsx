import { useMemo, useState } from 'react';
import type { PortfolioSummary } from '../types';
import DonutChart from './DonutChart';
import { fmtKRW } from '../utils';

const ETF_BRAND_RE = /^(TIGER|KODEX|KBSTAR|HANARO|SOL|ACE|ARIRANG|KOSEF|WOORI|MIRAE)\s+/i;

function holdingStyle(name: string): string {
  if (/qld|tqqq|soxl|leverag|레버리지|\b2[xX]\b|\b3[xX]\b|ultrapro/i.test(name)) return '레버리지';
  if (/배당|dividend|schd|다우존스|인컴|고배당|리츠|reit/i.test(name)) return '배당·인컴';
  if (/채권|bond|국채|treasury|cd금리|머니마켓|mmf/i.test(name)) return '채권·안전';
  if (/tdf|디폴트옵션|적극투자형|안정형/i.test(name)) return 'TDF·혼합';
  if (/s&p\s*500|코스피\s*200|코스닥\s*150|전세계|all.?world|total.?market/i.test(name)) return '인덱스·코어';
  if (/테크|tech|반도체|semi|ai|나스닥|nasdaq|기술|클라우드|바이오|bio|혁신|qqq/i.test(name)) return '성장·테마';
  if (/예수금|예금|적금|청년도약|청약|cma|파킹|현금/i.test(name)) return '현금·예금';
  return '기타';
}

const STYLE_ORDER = ['레버리지', '성장·테마', '인덱스·코어', '배당·인컴', '채권·안전', 'TDF·혼합', '현금·예금', '기타'];

const STYLE_WEIGHTS: Record<string, number> = {
  '레버리지': 3, '성장·테마': 2, '인덱스·코어': 1.5,
  '배당·인컴': 1, 'TDF·혼합': 0.8, '채권·안전': 0.5, '현금·예금': 0, '기타': 1,
};

function computePersonality(groups: Array<{ style: string; pct: number }>) {
  const score = groups.reduce((s, g) => s + g.pct * (STYLE_WEIGHTS[g.style] ?? 1), 0);
  if (score >= 200) return { label: '초공격형', color: '#F04452', bg: 'bg-red-500/10', sub: '레버리지 고비중' };
  if (score >= 150) return { label: '공격형',   color: '#E96AFF', bg: 'bg-purple-400/10', sub: '성장·기술 중심' };
  if (score >= 110) return { label: '성장형',   color: '#8B5CF6', bg: 'bg-purple-500/10', sub: '인덱스·성장 중심' };
  if (score >= 70)  return { label: '균형형',   color: '#3182F6', bg: 'bg-blue-500/10',   sub: '위험·안전 균형' };
  if (score >= 35)  return { label: '안정형',   color: '#2DAF4E', bg: 'bg-emerald-500/10', sub: '배당·채권 중심' };
  return                    { label: '보수형',   color: '#9CA3AF', bg: 'bg-gray-500/10',   sub: '예금·현금 중심' };
}

const STYLE_CONFIG: Record<string, { label: string; color: string; bg: string; text: string; desc: string }> = {
  '레버리지':    { label: '레버리지',   color: '#F04452', bg: 'bg-red-500/10',     text: 'text-red-400',    desc: '2x·3x ETF' },
  '성장·테마':   { label: '성장·테마',  color: '#8B5CF6', bg: 'bg-purple-500/10',  text: 'text-purple-400', desc: '테크·AI·반도체' },
  '인덱스·코어': { label: '인덱스·코어', color: '#3182F6', bg: 'bg-blue-500/10',   text: 'text-toss-blue',  desc: 'S&P500·코스피' },
  '배당·인컴':   { label: '배당·인컴',  color: '#2DAF4E', bg: 'bg-emerald-500/10', text: 'text-emerald-400', desc: '배당주·리츠' },
  '채권·안전':   { label: '채권·안전',  color: '#14B8A6', bg: 'bg-teal-500/10',    text: 'text-teal-400',   desc: '국채·회사채' },
  'TDF·혼합':   { label: 'TDF·혼합',   color: '#F5A623', bg: 'bg-amber-500/10',   text: 'text-amber-400',  desc: 'TDF·혼합형' },
  '현금·예금':   { label: '현금·예금',  color: '#9CA3AF', bg: 'bg-gray-500/10',    text: 'text-gray-400',   desc: '예금·적금·현금' },
  '기타':       { label: '기타',       color: '#6B7280', bg: 'bg-gray-500/10',    text: 'text-gray-400',   desc: '' },
};

interface Props {
  data: PortfolioSummary;
  hideAssets: boolean;
}

type RiskLevel = '위험자산' | '혼합자산' | '안전자산';

const RISK_MAP: Record<string, RiskLevel> = {
  '주식': '위험자산',
  '혼합(TDF)': '혼합자산',
  'TDF·혼합형': '혼합자산',
  '혼합': '혼합자산',
  '채권': '안전자산',
  '예금': '안전자산',
  '현금': '안전자산',
  '현금성': '안전자산',
};

// 자산군 표시명 (혼합(TDF) → TDF·혼합형)
const CLASS_DISPLAY: Record<string, string> = {
  '혼합(TDF)': 'TDF·혼합형',
  '혼합': 'TDF·혼합형',
};

// 위험자산 구성 표시 레이블
const RISK_DISPLAY: Record<RiskLevel, { title: string; desc: string }> = {
  '위험자산': { title: '위험자산', desc: '주식' },
  '혼합자산': { title: 'TDF·혼합형', desc: '채권+주식 혼합' },
  '안전자산': { title: '안전자산', desc: '예금·채권' },
};

const RISK_CONFIG: Record<RiskLevel, { color: string; bg: string; text: string }> = {
  '위험자산': { color: '#F04452', bg: 'bg-toss-up-soft', text: 'text-toss-up' },
  '혼합자산': { color: '#F5A623', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  '안전자산': { color: '#14B8A6', bg: 'bg-teal-500/10', text: 'text-teal-500' },
};

const RISK_ORDER: RiskLevel[] = ['위험자산', '혼합자산', '안전자산'];

const DONUT_TABS = [
  { key: 'account', label: '계좌별' },
  { key: 'class',   label: '자산군' },
  { key: 'region',  label: '지역별' },
] as const;
type DonutTab = typeof DONUT_TABS[number]['key'];

export default function AllocationCard({ data, hideAssets }: Props) {
  const [activeTab, setActiveTab] = useState<DonutTab>('account');

  const styleGroups = useMemo(() => {
    const groups: Record<string, { value: number; names: Set<string> }> = {};
    data.accounts.flatMap(a => a.holdings).forEach(h => {
      const style = holdingStyle(h.name);
      if (!groups[style]) groups[style] = { value: 0, names: new Set() };
      groups[style].value += h.value_krw;
      const short = h.name.replace(ETF_BRAND_RE, '').trim();
      groups[style].names.add(short.length > 13 ? short.slice(0, 13) + '…' : short);
    });
    const total = Object.values(groups).reduce((s, g) => s + g.value, 0);
    return STYLE_ORDER
      .filter(s => groups[s])
      .map(s => ({
        style: s,
        value: groups[s].value,
        pct: total > 0 ? (groups[s].value / total) * 100 : 0,
        names: [...groups[s].names],
      }))
      .filter(g => g.pct > 0.1);
  }, [data.accounts]);

  const accountItems = data.account_weights.map((a) => ({
    name: a.name,
    value: a.value_krw,
    weight: a.weight,
  }));
  const classItems = data.asset_class_weights.map((c) => ({
    name: CLASS_DISPLAY[c.name] ?? c.name,
    value: c.value_krw,
    weight: c.weight,
  }));
  const regionItems = data.region_weights.map((c) => ({
    name: c.name,
    value: c.value_krw,
    weight: c.weight,
  }));

  // 위험/혼합/안전 자산 분류
  const riskTotals: Record<RiskLevel, number> = { '위험자산': 0, '혼합자산': 0, '안전자산': 0 };
  const totalVal = data.asset_class_weights.reduce((s, c) => s + c.value_krw, 0);
  data.asset_class_weights.forEach((c) => {
    const level = RISK_MAP[c.name] ?? '위험자산';
    riskTotals[level] += c.value_krw;
  });

  const riskItems = RISK_ORDER
    .filter((r) => riskTotals[r] > 0)
    .map((r) => ({
      label: r,
      value: riskTotals[r],
      pct: totalVal > 0 ? (riskTotals[r] / totalVal) * 100 : 0,
      ...RISK_CONFIG[r],
    }));

  return (
    <section className="space-y-3">
      {/* 데스크톱: 3개 나란히 / 모바일: 탭 전환 */}
      <div className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] overflow-hidden">
        {/* 모바일 탭 헤더 (sm 이상에서는 숨김) */}
        <div role="tablist" aria-label="자산 배분 기준" className="flex sm:hidden border-b border-toss-border">
          {DONUT_TABS.map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'text-toss-blue border-b-2 border-toss-blue'
                  : 'text-toss-text-tertiary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 모바일: 선택된 탭만 표시 */}
        <div className="sm:hidden p-3">
          {activeTab === 'account' && <DonutChart data={accountItems} title="계좌별 비중" hideAssets={hideAssets} compact showAll />}
          {activeTab === 'class'   && <DonutChart data={classItems}   title="자산군 비중" hideAssets={hideAssets} compact />}
          {activeTab === 'region'  && <DonutChart data={regionItems}  title="지역 비중"   hideAssets={hideAssets} compact />}
        </div>

        {/* 데스크톱: 3개 나란히 */}
        <div className="hidden sm:grid sm:grid-cols-3 gap-0 divide-x divide-toss-border">
          <div className="p-3"><DonutChart data={accountItems} title="계좌별 비중" hideAssets={hideAssets} compact showAll /></div>
          <div className="p-3"><DonutChart data={classItems}   title="자산군 비중" hideAssets={hideAssets} compact /></div>
          <div className="p-3"><DonutChart data={regionItems}  title="지역 비중"   hideAssets={hideAssets} compact /></div>
        </div>
      </div>

      {/* 투자 성향 분류 */}
      {styleGroups.length > 0 && (
        <div className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-4">
          {(() => {
            const p = computePersonality(styleGroups);
            return (
              <div className="flex items-center justify-between mb-0.5">
                <h3 className="text-xs font-semibold text-toss-text-secondary">투자 성향 분류</h3>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${p.bg}`}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="text-[11px] font-bold" style={{ color: p.color }}>{p.label}</span>
                  <span className="text-[10px] opacity-70" style={{ color: p.color }}>{p.sub}</span>
                </div>
              </div>
            );
          })()}
          <div className="h-px bg-toss-border/50 mb-3 mt-2" />

          {/* 스택 바 */}
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
            {styleGroups.map(g => (
              <div
                key={g.style}
                className="h-full rounded-full transition-all"
                style={{ width: `${g.pct}%`, background: STYLE_CONFIG[g.style]?.color ?? '#6B7280' }}
                title={`${g.style} ${g.pct.toFixed(1)}%`}
              />
            ))}
          </div>

          {/* 성향별 카드 그리드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {styleGroups.map(g => {
              const cfg = STYLE_CONFIG[g.style] ?? STYLE_CONFIG['기타'];
              return (
                <div key={g.style} className={`rounded-xl px-3 py-2.5 ${cfg.bg}`}>
                  <div className="flex items-center gap-1 mb-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.color }} />
                    <span className={`text-[10px] font-semibold ${cfg.text}`}>{cfg.label}</span>
                  </div>
                  {cfg.desc && (
                    <p className={`text-[9px] ${cfg.text} opacity-60 mb-1 leading-tight`}>{cfg.desc}</p>
                  )}
                  <p className={`num text-sm font-bold ${cfg.text}`}>{g.pct.toFixed(1)}%</p>
                  {!hideAssets && (
                    <p className={`num text-[10px] mt-0.5 ${cfg.text} opacity-70`}>{fmtKRW(g.value)}</p>
                  )}
                  <p className="text-[9px] text-toss-text-tertiary mt-1.5 leading-tight">
                    {g.names.slice(0, 2).join(' · ')}
                    {g.names.length > 2 && (
                      <span className="text-toss-text-tertiary/60"> +{g.names.length - 2}</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 위험자산 / 안전자산 분류 바 */}
      {riskItems.length > 0 && (
        <div className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border shadow-[var(--shadow-toss-card)] p-4">
          <h3 className="text-xs font-semibold text-toss-text-secondary mb-3">위험 자산 구성</h3>

          {/* 스택 바 */}
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
            {riskItems.map((r) => (
              <div
                key={r.label}
                className="h-full rounded-full transition-all"
                style={{ width: `${r.pct}%`, background: r.color }}
              />
            ))}
          </div>

          {/* 항목별 라벨 */}
          <div className="grid grid-cols-3 gap-2">
            {riskItems.map((r) => (
              <div
                key={r.label}
                className={`rounded-xl px-3 py-2.5 ${r.bg}`}
              >
                <div className="flex items-center gap-1 mb-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: r.color }}
                  />
                  <span className={`text-[10px] font-semibold ${r.text}`}>
                    {RISK_DISPLAY[r.label as RiskLevel].title}
                  </span>
                </div>
                <p className={`text-[9px] ${r.text} opacity-70 mb-0.5 leading-tight`}>
                  {RISK_DISPLAY[r.label as RiskLevel].desc}
                </p>
                <p className={`num text-sm font-bold ${r.text}`}>{r.pct.toFixed(1)}%</p>
                {!hideAssets && (
                  <p className={`num text-[10px] mt-0.5 ${r.text} opacity-70`}>
                    {fmtKRW(r.value)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
