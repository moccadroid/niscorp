import { Component, type ErrorInfo, type ReactNode } from 'react';

// ═══════════════════════════════════════════════════════════
// React error boundaries REQUIRE a class component as of React 19.
// There is no functional alternative today. This is the ONLY class
// in the package outside `shared/errors.ts`. Justified strictly by
// the framework requirement — every other abstraction in nova uses
// factory + closure.
// ═══════════════════════════════════════════════════════════

export type NovaErrorBoundaryProps = {
  children?: ReactNode;
  fallback?: (error: Error) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type NovaErrorBoundaryState = {
  error: Error | undefined;
};

export class NovaErrorBoundary extends Component<NovaErrorBoundaryProps, NovaErrorBoundaryState> {
  state: NovaErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): NovaErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const handler = this.props.onError;
    if (handler !== undefined) handler(error, info);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error !== undefined) {
      const fallback = this.props.fallback;
      if (fallback !== undefined) return fallback(error);
      return (
        <div data-nova-error-boundary="true" role="alert">
          {error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
