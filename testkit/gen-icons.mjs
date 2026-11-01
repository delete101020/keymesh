// Renders the app icon to the PNGs the manifest and iOS need, with Chrome so no image library is
// added. The PNGs are committed; run this only when the icon changes:  node testkit/gen-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, newProfile, removeProfile } from './e2e/cdp.mjs';

const OUT = fileURLToPath(new URL('../src/public/icons/', import.meta.url));
const BG = '#2563d4';
const FG = '#ffffff';

// The `key` glyph of ui/icons.js, on a 24-unit grid.
const glyph = (scale) => {
  const at = (512 - 24 * scale) / 2;
  return `<g transform="translate(${at} ${at}) scale(${scale})" fill="none" stroke="${FG}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2M15 8l3 3M17 6l2 2"/></g>`;
};
const svg = ({ radius, scale }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${radius}" fill="${BG}"/>${glyph(scale)}</svg>\n`;

// Rounded for browsers. Maskable and Apple icons are full squares: the OS applies its own mask, and
// a maskable glyph must stay inside the central 80% circle.
const ROUNDED = svg({ radius: 96, scale: 15 });
const SQUARE = svg({ radius: 0, scale: 15 });
const MASKABLE = svg({ radius: 0, scale: 11 });
const PNGS = [
  ['icon-192.png', ROUNDED, 192],
  ['icon-512.png', ROUNDED, 512],
  ['icon-maskable-512.png', MASKABLE, 512],
  ['apple-touch-icon-180.png', SQUARE, 180],
];

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'icon.svg'), ROUNDED);

const profile = await newProfile();
const chrome = await launchChrome({ profile });
try {
  const { targetId } = await chrome.conn.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await chrome.conn.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => chrome.conn.send(method, params, sessionId);
  await send('Page.enable');
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const [name, source, size] of PNGS) {
    await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    const page = `<!doctype html><html><body style="margin:0"><img width="${size}" height="${size}" style="display:block" src="data:image/svg+xml,${encodeURIComponent(source)}"></body></html>`;
    const loaded = new Promise((resolve) => {
      chrome.conn.onEvent((m) => m.method === 'Page.loadEventFired' && m.sessionId === sessionId && resolve());
    });
    await send('Page.navigate', { url: `data:text/html,${encodeURIComponent(page)}` });
    await loaded;
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    await writeFile(join(OUT, name), Buffer.from(data, 'base64'));
    console.log(`${name} ${size}×${size}`);
  }
} finally {
  await chrome.stop();
  await removeProfile(profile);
}
