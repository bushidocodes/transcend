import { expect } from 'vitest';

// Replacement for chai-immutable's deep `.to.equal` on Immutable collections. Immutable.js
// values implement structural `.equals()`, so this compares by value the way the reducer tests
// expect: `expect(stateMap).toEqualImmutable(Map({ ... }))`.
expect.extend({
  toEqualImmutable (received, expected) {
    const isImmutable = received && typeof received.equals === 'function';
    const pass = isImmutable && received.equals(expected);
    return {
      pass,
      message: () =>
        `expected ${this.utils.printReceived(received && received.toJS ? received.toJS() : received)} ` +
        `to ${this.isNot ? 'not ' : ''}equal Immutable ${this.utils.printExpected(expected && expected.toJS ? expected.toJS() : expected)}`,
    };
  },
});
