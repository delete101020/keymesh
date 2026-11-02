// `npm run dev:server`: applies the migrations to src/.wrangler/state and starts the API with the app on
// http://127.0.0.1:8788. Settings come from src/.dev.vars (gitignored), see README.
//   node testkit/dev-server.mjs [port]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DB_ID, DB_NAME, SRC, WRANGLER, run } from './wrangler-server.mjs';

const port = process.argv[2] ?? '8788';
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
if (!existsSync(join(SRC, '.dev.vars'))) {
  console.error('Thiếu src/.dev.vars (ALLOWED_ORIGINS, REGISTRATION_TOKEN, SERVER_SECRET): xem README.');
  process.exit(1);
}
await run(WRANGLER, ['d1', 'migrations', 'apply', DB_NAME, '--local'], { cwd: SRC, env });
const child = spawn(WRANGLER, ['pages', 'dev', 'public', '--ip', '127.0.0.1', '--port', port, '--d1', `DB=${DB_ID}`], { cwd: SRC, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
