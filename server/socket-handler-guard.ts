/**
 * Pure guard for socket.io event handlers (issues #112, #241).
 *
 * socket.io does not catch exceptions thrown inside handlers. A synchronous throw
 * becomes an uncaughtException; an async handler that returns a rejecting Promise
 * becomes an unhandledRejection — either of which can take down the whole process
 * and disconnect every connected VR user. This helper catches both paths so one
 * malformed/async-failing message stays contained to that event.
 *
 * Extracted as a pure function (no socket.io dependency) so unit tests can drive
 * sync throws and Promise rejections without spinning a real Server.
 */

/**
 * Invoke `handler(...args)`, catching synchronous throws immediately and Promise
 * rejections via `.catch`. `onError` is called for either failure mode; successes
 * are silent.
 */
export function runGuardedHandler(
  handler: (...args: unknown[]) => unknown,
  args: unknown[],
  onError: (err: unknown) => void
): void {
  try {
    // Promise.resolve wraps both plain values and thenables so async handlers are
    // covered without requiring every handler to be async.
    Promise.resolve(handler(...args)).catch(onError);
  } catch (err) {
    onError(err);
  }
}
