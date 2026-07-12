// @vitest-environment happy-dom
/**
 * ErrorBoundary recovery UI (issue #206).
 *
 * Uses react-dom/client against happy-dom — no testing-library dependency.
 */

import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ErrorBoundary from './ErrorBoundary.tsx';

function Boom(): never {
  throw new Error('boom from child');
}

function Ok() {
  return <span data-testid="ok">ok</span>;
}

describe('ErrorBoundary (issue #206)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleError: typeof console.error;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // React 19 logs boundary errors to console.error; silence noise in the suite.
    consoleError = console.error;
    console.error = () => {};
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    console.error = consoleError;
  });

  it('renders children when no error is thrown', () => {
    act(() => {
      root.render(
        <ErrorBoundary>
          <Ok />
        </ErrorBoundary>
      );
    });
    expect(container.querySelector('[data-testid="ok"]')?.textContent).toBe('ok');
    expect(container.querySelector('[data-testid="error-boundary-fallback"]')).toBeNull();
  });

  it('renders a recoverable fallback when a child throws', () => {
    act(() => {
      root.render(
        <ErrorBoundary label="room">
          <Boom />
        </ErrorBoundary>
      );
    });
    const fallback = container.querySelector('[data-testid="error-boundary-fallback"]');
    expect(fallback).not.toBeNull();
    expect(fallback?.getAttribute('role')).toBe('alert');
    expect(fallback?.textContent).toMatch(/Something went wrong in the room/);
    expect(fallback?.textContent).toMatch(/boom from child/);
    expect(container.querySelector('button')?.textContent).toMatch(/Reload/i);
  });

  it('Try again clears the error and re-renders children', () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('transient');
      return <span data-testid="recovered">recovered</span>;
    }

    act(() => {
      root.render(
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>
      );
    });
    expect(container.querySelector('[data-testid="error-boundary-fallback"]')).not.toBeNull();

    shouldThrow = false;
    const tryAgain = Array.from(container.querySelectorAll('button')).find(b =>
      /try again/i.test(b.textContent || '')
    );
    expect(tryAgain).toBeTruthy();
    act(() => {
      tryAgain!.click();
    });
    expect(container.querySelector('[data-testid="recovered"]')?.textContent).toBe('recovered');
  });
});
