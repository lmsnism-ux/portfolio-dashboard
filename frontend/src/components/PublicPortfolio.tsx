import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

const sampleActions = [
  { title: '미국 주식 비중 점검', detail: '목표보다 4.2% 높음', impact: '집중 위험 낮추기' },
  { title: '연금 세액공제 여유', detail: '추가 납입 가능', impact: '예상 절세 66만원' },
  { title: '유휴 현금 배분', detail: '전체 자산의 8.4%', impact: '현금 방치 줄이기' },
];

const principles = [
  '수익률보다 먼저 데이터의 기준 시각과 출처를 확인합니다.',
  '시장 상승과 입출금 효과를 분리해 성과를 과장하지 않습니다.',
  '추천보다 목표 비중, 비용, 세금과 위험을 먼저 보여줍니다.',
];

export default function PublicPortfolio({ onOpenPrivate }: { onOpenPrivate: () => void }) {
  return (
    <div className="min-h-screen bg-[#080A12] text-white selection:bg-blue-500/30">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#080A12]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="#top" className="flex items-center gap-2 font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <BarChart3 size={19} />
            </span>
            Portfolio OS
          </a>
          <button
            onClick={onOpenPrivate}
            className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-slate-950 transition-transform active:scale-[0.98]"
          >
            개인 자산 열기
          </button>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pt-24">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-300">
              <Sparkles size={13} /> 기록이 판단으로 이어지는 투자 운영 시스템
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.12] tracking-[-0.04em] sm:text-6xl">
              자산을 보여주는 화면에서,
              <span className="block bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
                다음 결정을 돕는 시스템으로.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              여러 계좌의 주식·연금·현금·부동산을 한곳에서 확인하고, 목표·집중도·세금·데이터 상태를 근거로 오늘 할 일을 정리합니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#demo" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue-500 px-5 text-sm font-bold hover:bg-blue-400">
                샘플 분석 보기 <ArrowRight size={16} />
              </a>
              <button onClick={onOpenPrivate} className="min-h-12 rounded-xl border border-white/15 px-5 text-sm font-bold text-slate-200 hover:bg-white/5">
                내 데이터로 시작
              </button>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck size={14} /> 아래 숫자는 모두 샘플이며 실제 개인 자산은 공개되지 않습니다.
            </p>
          </div>

          <div id="demo" className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-blue-950/40 sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500">샘플 순자산</p>
                <p className="mt-2 text-4xl font-black tracking-tight">₩128,430,000</p>
                <p className="mt-2 text-sm font-semibold text-rose-400">오늘 +₩864,000 · +0.68%</p>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">데이터 정상</span>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-2">
              {[['목표 달성', '71.4%'], ['최대낙폭', '-8.7%'], ['현금 비중', '8.4%']].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-black/25 p-3">
                  <p className="text-[10px] text-slate-500">{label}</p>
                  <p className="mt-1 text-sm font-bold text-slate-100">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <p className="px-1 text-xs font-bold text-slate-400">오늘 확인할 것</p>
              {sampleActions.map((action) => (
                <div key={action.title} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400"><Target size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{action.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{action.detail}</p>
                  </div>
                  <span className="text-right text-[11px] font-semibold text-blue-300">{action.impact}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/[0.08] bg-white/[0.025]">
          <div className="mx-auto grid max-w-6xl gap-4 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [WalletCards, '전 자산 통합', '증권·연금·현금·부동산과 부채를 한 기준으로 봅니다.'],
              [TrendingUp, '성과의 원인', '가격·환율·현금흐름을 구분해 숫자의 이유를 설명합니다.'],
              [Target, '행동 우선', '목표 이탈과 세금 기회를 예상 비용과 함께 제시합니다.'],
              [Database, '데이터 신뢰', '기준 시각, 누락 종목과 백업 상태를 숨기지 않습니다.'],
            ].map(([Icon, title, text]) => {
              const FeatureIcon = Icon as typeof WalletCards;
              return (
                <article key={String(title)} className="rounded-2xl border border-white/[0.07] bg-black/20 p-5">
                  <FeatureIcon className="text-blue-400" size={21} />
                  <h2 className="mt-4 text-base font-bold">{String(title)}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{String(text)}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-2">
          <div>
            <p className="text-sm font-bold text-blue-400">운영 원칙</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight">좋은 대시보드는 화려한 차트보다 정직한 기준이 먼저입니다.</h2>
            <div className="mt-7 space-y-4">
              {principles.map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-slate-300">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" /> {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-blue-400/15 bg-gradient-to-br from-blue-500/10 to-indigo-500/5 p-7">
            <LockKeyhole size={26} className="text-blue-300" />
            <h2 className="mt-5 text-xl font-bold">공개 데모와 개인 금고를 분리했습니다.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              공개 화면은 샘플 데이터만 사용합니다. 개인 앱에서는 마스터 키를 브라우저에 남기지 않고, 이 탭에서만 유효한 만료 세션으로 교환합니다.
            </p>
            <button onClick={onOpenPrivate} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-slate-950">
              안전하게 개인 자산 열기 <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.08] px-5 py-8 text-center text-xs text-slate-600">
        투자 판단을 대신하지 않습니다. 계산 기준과 데이터 상태를 확인하는 개인 의사결정 도구입니다.
      </footer>
    </div>
  );
}
