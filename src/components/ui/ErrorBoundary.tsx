import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  screenName: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    let message = 'Unexpected rendering error.';
    if (error instanceof Error) {
      message = error.message || error.name;
    } else if (typeof error === 'object' && error !== null && 'message' in error) {
      message = String((error as { message: unknown }).message);
    } else if (typeof error === 'string') {
      message = error;
    }
    return { hasError: true, message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="ascend-card p-6 my-4 text-center">
          <div className="w-11 h-11 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="font-display text-base font-semibold">
            {this.props.screenName} encountered an issue
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
          >
            <RotateCcw className="w-4 h-4" />
            Retry Screen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
