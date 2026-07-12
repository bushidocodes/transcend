/**
 * Recoverable error boundary for the VR room tree (issue #206).
 *
 * React has no hooks equivalent for getDerivedStateFromError / componentDidCatch, so this
 * stays a class component. When a room (or any child under Outlet) throws, we render a
 * fallback with a reload button instead of unmounting the entire app to a blank page.
 */

import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional label shown in the fallback (e.g. "room"). */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

const fallbackStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  padding: '24px',
  background: 'rgba(10, 10, 20, 0.92)',
  color: '#f5f5f5',
  fontFamily: 'system-ui, sans-serif',
  textAlign: 'center'
};

const buttonStyle: CSSProperties = {
  cursor: 'pointer',
  padding: '10px 18px',
  border: '1px solid #888',
  borderRadius: '6px',
  background: '#2a2a3a',
  color: '#fff',
  fontSize: '14px'
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError (error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch (error: Error, info: ErrorInfo): void {
    // Keep the app process alive; log for operators / remote debugging.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = (): void => {
    // Full reload is the safest recovery for A-Frame / WebGL scene corruption.
    window.location.reload();
  };

  private handleReset = (): void => {
    // Soft recovery: clear the error and re-render children (useful in tests and when
    // the throw was transient). Prefer reload for real A-Frame failures.
    this.setState({ error: null });
  };

  render (): ReactNode {
    const { error } = this.state;
    if (error) {
      const where = this.props.label ? ` in the ${this.props.label}` : '';
      return (
        <div role="alert" style={fallbackStyle} data-testid="error-boundary-fallback">
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Something went wrong{where}</h2>
          <p style={{ margin: 0, maxWidth: '32rem', opacity: 0.85 }}>
            {error.message || 'An unexpected error occurred.'}
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button type="button" style={buttonStyle} onClick={this.handleReload}>
              Reload
            </button>
            <button type="button" style={buttonStyle} onClick={this.handleReset}>
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
