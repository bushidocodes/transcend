/**
 * Unit tests for runGuardedHandler (issue #241).
 *
 * Proves that both synchronous throws and async Promise rejections are delivered
 * to onError and do not escape the wrapper (so a pure unit test can replace a
 * full process-crash integration check).
 */

import { runGuardedHandler } from './socket-handler-guard.ts';

function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

describe('runGuardedHandler (issue #241)', () => {
  it('invokes the handler with the provided args', () => {
    const seen: unknown[] = [];
    runGuardedHandler(
      (a, b) => seen.push(a, b),
      ['x', 2],
      () => {}
    );
    expect(seen).toEqual(['x', 2]);
  });

  it('catches a synchronous throw and does not rethrow', () => {
    const errors: unknown[] = [];
    expect(() =>
      runGuardedHandler(
        () => {
          throw new Error('sync-boom');
        },
        [],
        err => errors.push(err)
      )
    ).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe('sync-boom');
  });

  it('catches a Promise rejection from an async handler', async () => {
    const errors: unknown[] = [];
    runGuardedHandler(
      async () => {
        throw new Error('async-boom');
      },
      [],
      err => errors.push(err)
    );
    // Rejection is delivered on a microtask; wait before asserting.
    await flushMicrotasks();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe('async-boom');
  });

  it('catches an explicitly returned rejected Promise', async () => {
    const errors: unknown[] = [];
    runGuardedHandler(
      () => Promise.reject(new Error('rejected-promise')),
      [],
      err => errors.push(err)
    );
    await flushMicrotasks();
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('rejected-promise');
  });

  it('does not call onError when the handler succeeds', async () => {
    const errors: unknown[] = [];
    runGuardedHandler(
      () => 'ok',
      [],
      err => errors.push(err)
    );
    runGuardedHandler(
      async () => 'ok-async',
      [],
      err => errors.push(err)
    );
    await flushMicrotasks();
    expect(errors).toEqual([]);
  });
});
