import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** 카드 이름 — 에러 메시지에 표시 */
  name?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name ?? 'unknown'}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="bg-toss-card border border-toss-border rounded-2xl px-5 py-4 flex items-center gap-3">
          <span className="text-amber-400 text-lg">⚠</span>
          <div>
            <p className="text-sm font-semibold text-toss-text-primary">
              {this.props.name ? `${this.props.name} 로드 실패` : '일부 항목을 불러올 수 없어요'}
            </p>
            <p className="text-xs text-toss-text-tertiary mt-0.5">
              페이지를 새로고침하거나 잠시 후 다시 시도해주세요.
            </p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="ml-auto text-xs text-toss-blue font-semibold px-3 py-1.5 rounded-full border border-toss-blue/30 hover:bg-toss-blue/5 active:scale-95 transition-all shrink-0"
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
