import { Home, PieChart, TrendingUp, Menu } from 'lucide-react';

export type TabKey = 'home' | 'assets' | 'market' | 'more';

const TABS: { key: TabKey; label: string; Icon: typeof Home }[] = [
  { key: 'home',   label: '홈',     Icon: Home },
  { key: 'assets', label: '자산',   Icon: PieChart },
  { key: 'market', label: '시장',   Icon: TrendingUp },
  { key: 'more',   label: '더보기', Icon: Menu },
];

interface Props {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bottom-nav fixed bottom-0 inset-x-0 z-40">
      <div className="max-w-2xl mx-auto flex">
        {TABS.map(({ key, label, Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => {
                onChange(key);
                window.scrollTo({ top: 0 });
              }}
              className={`flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-2 transition-colors ${
                isActive ? 'text-toss-text-primary' : 'text-toss-text-tertiary'
              }`}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.4 : 1.8}
                className="transition-transform active:scale-90"
              />
              <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
