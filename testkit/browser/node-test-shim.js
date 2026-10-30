// Minimal stand-in for `node:test` so the same test files run in a browser.
// Supports flat `test(name, [options], fn)` only; tests run sequentially in registration order.
const registered = [];

export function test(name, options, fn) {
  if (typeof options === 'function') fn = options;
  registered.push({ name, fn });
}
export const it = test;
export default test;

function describeError(e) {
  if (e && typeof e === 'object') return `${e.name ?? 'Error'}: ${e.message}${e.code ? ` [${e.code}]` : ''}`;
  return String(e);
}

export async function runFiles(files, onResult) {
  const results = [];
  for (const file of files) {
    const start = registered.length;
    try {
      await import(file);
    } catch (e) {
      const r = { file, name: `(load) ${file}`, ok: false, error: describeError(e), ms: 0 };
      results.push(r);
      onResult?.(r);
      continue;
    }
    for (const t of registered.slice(start)) {
      const t0 = performance.now();
      const diagnostics = [];
      let r;
      try {
        await t.fn({ name: t.name, diagnostic: (msg) => diagnostics.push(String(msg)) });
        r = { file, name: t.name, ok: true, ms: performance.now() - t0, diagnostics };
      } catch (e) {
        r = { file, name: t.name, ok: false, error: describeError(e), ms: performance.now() - t0, diagnostics };
      }
      results.push(r);
      onResult?.(r);
    }
  }
  return results;
}
