import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level error boundary — a render crash anywhere in the tree shows a
 * recoverable screen instead of a blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('Unhandled render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-dvh flex items-center justify-center bg-donkey-bg p-6">
          <div className="card text-center max-w-md">
            <p className="text-lg font-bold text-donkey-text mb-2">Something went wrong</p>
            <p className="text-sm text-donkey-muted mb-4">
              The app hit an unexpected error. Reload to carry on.
            </p>
            <button
              className="btn-primary w-full"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
