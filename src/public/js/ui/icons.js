// Stroke icons built with createElementNS (no markup strings, no <use>). Paths come from design/.
const SVG = 'http://www.w3.org/2000/svg';
const c = (cx, cy, r) => ['circle', { cx, cy, r }];
const r = (x, y, width, height, rx = 2) => ['rect', { x, y, width, height, rx }];
const p = (d) => ['path', { d }];

const ICONS = {
  search: [c(11, 11, 7), p('m20 20-3.5-3.5')],
  lock: [r(4, 11, 16, 10), p('M8 11V7a4 4 0 0 1 8 0v4')],
  copy: [r(9, 9, 12, 12), p('M5 15V5a2 2 0 0 1 2-2h10')],
  eye: [p('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'), c(12, 12, 3)],
  eyeOff: [p('M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6'), p('M9.9 9.9a3 3 0 0 0 4.2 4.2')],
  ext: [p('M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5')],
  plus: [p('M12 5v14M5 12h14')],
  back: [p('m15 18-6-6 6-6')],
  up: [p('m6 15 6-6 6 6')],
  down: [p('m6 9 6 6 6-6')],
  more: [c(5, 12, 1.3), c(12, 12, 1.3), c(19, 12, 1.3)],
  inbox: [p('M22 12h-6l-2 3h-4l-2-3H2'), p('M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z')],
  clock: [c(12, 12, 9), p('M12 7v5l3 2')],
  warn: [p('M12 3 2 20h20z'), p('M12 10v4M12 17h.01')],
  link: [p('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1'), p('M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1')],
  fork: [c(6, 5, 2), c(18, 5, 2), c(12, 19, 2), p('M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5')],
  history: [p('M3 12a9 9 0 1 0 3-6.7L3 8'), p('M3 3v5h5M12 7v5l3 2')],
  dup: [r(8, 8, 13, 13), p('M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3')],
  dice: [r(3, 3, 18, 18, 3), c(8.5, 8.5, 1), c(15.5, 15.5, 1), c(15.5, 8.5, 1), c(8.5, 15.5, 1)],
  x: [p('M18 6 6 18M6 6l12 12')],
  edit: [p('M12 20h9'), p('M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z')],
  star: [p('m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z')],
  gear: [c(12, 12, 3), p('M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1')],
  key: [c(8, 15, 4), p('m10.8 12.2 8.2-8.2M15 8l3 3M17 6l2 2')],
  user: [c(12, 8, 4), p('M4 21a8 8 0 0 1 16 0')],
  ticket: [p('M3 8a2 2 0 0 0 0 4 2 2 0 0 0 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 1 0-4V6H3z'), p('M14 6v12')],
  term: [r(3, 4, 18, 16), p('m7 9 3 3-3 3M13 15h4')],
  file: [p('M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z'), p('M14 3v5h5M9 13h6M9 17h6')],
  note: [p('M5 3h10l4 4v14H5z'), p('M9 9h6M9 13h6M9 17h3')],
  db: [['ellipse', { cx: 12, cy: 5, rx: 8, ry: 3 }], p('M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3')],
  server: [r(3, 4, 18, 7, 1.5), r(3, 13, 18, 7, 1.5), p('M7 7.5h.01M7 16.5h.01')],
  shield: [p('M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z'), p('m9 12 2 2 4-4')],
  qr: [r(3, 3, 7, 7, 1), r(14, 3, 7, 7, 1), r(3, 14, 7, 7, 1), p('M14 14h3v3h-3zM21 14v.01M14 21h.01M17 21h4v-4')],
  upload: [p('M12 15V3M7 8l5-5 5 5'), p('M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4')],
  download: [p('M12 3v12M7 10l5 5 5-5'), p('M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4')],
};

export function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of ICONS[name]) {
    const shape = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, String(v));
    svg.append(shape);
  }
  return svg;
}
