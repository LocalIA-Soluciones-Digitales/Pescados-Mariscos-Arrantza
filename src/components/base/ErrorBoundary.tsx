import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logError } from '@/lib/errorLog';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(error.message, 'react_boundary', error.stack ?? info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-sm text-foreground-500">Ha ocurrido un error inesperado.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-full text-xs font-medium bg-primary-500 text-background-50"
          >
            Recargar página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
