// Subset of `node:assert/strict` used by test/*.test.js, for the browser runner.
class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

function fail(message, fallback) {
  throw message instanceof Error ? message : new AssertionError(message ?? fallback);
}

function isDeepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (ArrayBuffer.isView(a)) {
    if (a.byteLength !== b.byteLength) return false;
    const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    return x.every((v, i) => v === y[i]);
  }
  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (a instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !isDeepEqual(v, b.get(k))) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && isDeepEqual(a[k], b[k]));
}

function matchesExpected(err, expected) {
  if (expected === undefined) return true;
  if (typeof expected === 'function') {
    if (expected === Error || Error.isPrototypeOf(expected)) return err instanceof expected;
    return expected(err) === true;
  }
  if (expected instanceof RegExp) return expected.test(String(err?.message ?? err));
  if (typeof expected === 'object') {
    return Object.keys(expected).every((k) =>
      expected[k] instanceof RegExp ? expected[k].test(err?.[k]) : isDeepEqual(err?.[k], expected[k]),
    );
  }
  return false;
}

function assert(value, message) {
  if (!value) fail(message, 'Expected value to be truthy');
}

assert.ok = assert;
assert.equal = assert.strictEqual = (a, b, message) => {
  if (!Object.is(a, b)) fail(message, `Expected ${String(a)} to equal ${String(b)}`);
};
assert.notEqual = assert.notStrictEqual = (a, b, message) => {
  if (Object.is(a, b)) fail(message, `Expected ${String(a)} not to equal ${String(b)}`);
};
assert.deepEqual = assert.deepStrictEqual = (a, b, message) => {
  if (!isDeepEqual(a, b)) fail(message, 'Expected values to be deeply equal');
};
assert.notDeepEqual = assert.notDeepStrictEqual = (a, b, message) => {
  if (isDeepEqual(a, b)) fail(message, 'Expected values not to be deeply equal');
};
assert.match = (s, re, message) => {
  if (!re.test(s)) fail(message, `Expected input to match ${re}`);
};
assert.doesNotMatch = (s, re, message) => {
  if (re.test(s)) fail(message, `Expected input not to match ${re}`);
};
assert.fail = (message) => fail(message, 'Failed');
assert.throws = (fn, expected, message) => {
  try {
    fn();
  } catch (e) {
    if (!matchesExpected(e, expected)) fail(message, `Unexpected error: ${e?.message}`);
    return;
  }
  fail(message, 'Missing expected exception');
};
assert.rejects = async (promiseOrFn, expected, message) => {
  try {
    await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
  } catch (e) {
    if (!matchesExpected(e, expected)) fail(message, `Unexpected rejection: ${e?.message}`);
    return;
  }
  fail(message, 'Missing expected rejection');
};
assert.AssertionError = AssertionError;

export default assert;
export const { ok, equal, strictEqual, notEqual, deepEqual, deepStrictEqual, match, throws, rejects } = assert;
export { AssertionError };
