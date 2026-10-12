import { Component, type ErrorInfo, type ReactNode } from 'react';

// A class because React has no function-component error boundary.

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
