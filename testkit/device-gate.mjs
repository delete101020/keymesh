// A TCP forward from its own loopback port to the dev server, one per emulator. The iOS simulator shares
// the Mac's loopback and has no airplane mode, so cutting it off from the server alone means stopping this
// forward while the laptop keeps talking to the server directly (KM-006 plan §1, Concern 1).
//   node testkit/device-gate.mjs [listenPort=8789] [targetPort=8788]
// Ctrl-C (or killing the process) is "this device lost the server"; starting it again brings it back.
import { createServer, connect } from 'node:net';
import { fileURLToPath } from 'node:url';

export function startGate({ listen = 8789, target = 8788, host = '127.0.0.1' } = {}) {
  const sockets = new Set();
  const server = createServer((inbound) => {
    const outbound = connect(target, host);
    for (const s of [inbound, outbound]) {
      sockets.add(s);
      s.on('close', () => sockets.delete(s));
      s.on('error', () => {
        inbound.destroy();
        outbound.destroy();
      });
    }
    inbound.pipe(outbound);
    outbound.pipe(inbound);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listen, host, () =>
      resolve({
        url: `http://${host}:${server.address().port}`,
        // Drops open connections too: a keep-alive socket would otherwise still reach the server.
        stop: () =>
          new Promise((done) => {
            for (const s of sockets) s.destroy();
            server.close(() => done());
          }),
      }),
    );
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [listen = '8789', target = '8788'] = process.argv.slice(2);
  const gate = await startGate({ listen: Number(listen), target: Number(target) });
  console.log(`device gate ${gate.url} -> 127.0.0.1:${target} (Ctrl-C cắt riêng thiết bị này khỏi server)`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => gate.stop().then(() => process.exit(0)));
}
