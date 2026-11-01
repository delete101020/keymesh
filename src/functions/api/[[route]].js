// The one entry point of /api/*. The order below is the contract: Origin, route, token, id, then the
// handler (owner, body, content, write). A stranger therefore learns nothing from content errors.
import { prelogin, register } from './_auth.js';
import { ApiError, errorResponse } from './_http.js';
import { validVaultId } from './_validate.js';

const ROUTES = [
  { method: 'GET', path: /^\/api\/prelogin$/, handler: prelogin },
  { method: 'POST', path: /^\/api\/register$/, handler: register },
];

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (origin === null) return true;
  if (origin === 'null') return false;
  return String(env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .some((entry) => entry.trim() !== '' && entry.trim() === origin);
}

function match(method, pathname) {
  for (const route of ROUTES) {
    const found = route.method === method && route.path.exec(pathname);
    if (found) return { route, vaultId: found[1] };
  }
  return null;
}

async function handle(context) {
  const { request, env } = context;
  if (!originAllowed(request, env)) return errorResponse('forbidden_origin');
  const url = new URL(request.url);
  const matched = match(request.method, url.pathname);
  if (!matched) return errorResponse('not_found');
  const { route, vaultId } = matched;
  if (vaultId !== undefined && !validVaultId(vaultId)) return errorResponse('invalid_id');
  return route.handler({ request, env, url, vaultId, waitUntil: (p) => context.waitUntil(p) });
}

export async function onRequest(context) {
  try {
    return await handle(context);
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error.code, error);
    // D1 refuses a row over its limit with this text; local D1 has no limit, so a test raises the same text.
    if (/too big|TOOBIG/i.test(String(error?.message))) return errorResponse('too_large');
    // The name only: a driver message can quote the statement that failed.
    console.error('api: internal error', error?.name);
    return errorResponse('internal');
  }
}
