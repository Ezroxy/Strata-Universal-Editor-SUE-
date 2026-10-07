/* Strata Studio — Windows XP shell. While the XP theme is on, Strata turns into an XP desktop:
   a Bliss-style wallpaper painted on the fly, the top bar becomes the taskbar (Start button, one button per editor,
   a notification area with a clock), an XP Start menu, a Turn Off Computer dialog, and window chrome.
   Three looks (html[data-xp], setting `xpStyle`):
     luna  — one Luna Blue program window; the panes look like XP's own programs (Movie Maker, Paint, Explorer)
     desk  — every panel is its own XP window floating on the desktop
     dream — the XP you remember from a dream: chunky 3D windows on an endless hill
   All styling lives in css/xp.css. */
(() => {
'use strict';
const App = window.App;
const { h } = App;
const STYLES = ['luna', 'desk', 'dream'];
const root = document.documentElement;
const style = () => STYLES.includes(App.settings.xpStyle) ? App.settings.xpStyle : 'luna';
const svgUri = s => 'data:image/svg+xml,' + encodeURIComponent(s);
const img = (s, size = 16, cls = '') => h('img', { src: svgUri(s), width: size, height: size, alt: '', class: cls, draggable: 'false' });

/* ---------- XP-style icons (glossy, 32×32) ---------- */
const S = (body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs>${defs}</defs>${body}</svg>`;
const lg = (id, stops, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const rg = (id, stops, cx = .35, cy = .3, r = .75) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`;
const shadow = `<ellipse cx="17" cy="29.3" rx="12" ry="2" fill="#000" opacity=".18"/>`;
const ICONS = {
  video: S(`${shadow}<rect x="4" y="12" width="24" height="16" rx="2" fill="url(#b)" stroke="#111" stroke-width=".8"/>
    <path d="M4 7.5 27 4l1 5.5L5 13z" fill="url(#c)" stroke="#111" stroke-width=".8"/>
    <path d="M7 7 9.5 12.5M12 6.2l2.5 5.6M17 5.5l2.5 5.6M22 4.7l2.5 5.6" stroke="#fff" stroke-width="2.4"/>
    <rect x="7" y="15.5" width="18" height="9.5" rx="1" fill="url(#s)"/><path d="M7 22l5-4 4 3 3-2 6 4v2H7z" fill="#58b335"/>
    <circle cx="21.5" cy="18" r="1.6" fill="#fff6a8"/><rect x="5" y="13" width="22" height="2" fill="#fff" opacity=".18"/>`,
    lg('b', [[0, '#5b5f68'], [1, '#202227']]) + lg('c', [[0, '#3a3d44'], [1, '#121316']]) + lg('s', [[0, '#3f8ff0'], [1, '#bfe0ff']])),
  audio: S(`${shadow}<circle cx="13" cy="16" r="11.5" fill="url(#d)" stroke="#8b96a6" stroke-width=".8"/>
    <circle cx="13" cy="16" r="11" fill="url(#r)" opacity=".55"/><circle cx="13" cy="16" r="3.4" fill="#eef2f7" stroke="#9aa5b5" stroke-width=".8"/><circle cx="13" cy="16" r="1.3" fill="#fff" stroke="#9aa5b5" stroke-width=".6"/>
    <path d="M23 6.5v14.2a3.3 2.7 0 1 1-1.8-2.4V9l7.6-2v11.6a3.3 2.7 0 1 1-1.8-2.4V8.3z" fill="url(#n)" stroke="#0f3a8a" stroke-width=".7"/>`,
    rg('d', [[0, '#ffffff'], [.6, '#d9dee6'], [1, '#a9b3c2']]) + lg('r', [[0, '#ff9ad5'], [.3, '#9ad7ff'], [.6, '#b7ff9a'], [1, '#ffe08a']], 1, 1) + lg('n', [[0, '#7cb6ff'], [1, '#1648b8']])),
  image: S(`${shadow}<rect x="3" y="5" width="22" height="20" rx="1" fill="#fff" stroke="#8a7a52" stroke-width=".8"/>
    <rect x="5.5" y="7.5" width="17" height="15" fill="url(#k)"/><path d="M5.5 19c4-4 7-5 17-3v6.5h-17z" fill="url(#g)"/><circle cx="18" cy="11" r="2" fill="#ffe46b"/>
    <path d="M30 5.5 18.5 20.5l-2.2-1.6L27.6 3.6z" fill="url(#w)" stroke="#6b3d12" stroke-width=".6"/><path d="m16.3 18.9 2.2 1.6-1 1.4-2.3-1.6z" fill="#c9ccd2"/><path d="M15.2 20.3c-1.6 0-3 1.4-3.4 4 2.2-.1 3.9-.9 4.7-2.4z" fill="#e8402e"/>`,
    lg('k', [[0, '#3b86e8'], [1, '#bfe2ff']]) + lg('g', [[0, '#7fcb3a'], [1, '#2f8c1d']]) + lg('w', [[0, '#e7a85a'], [1, '#a5621f']], 1, 0)),
  folder: S(`${shadow}<path d="M3 8.5a1.5 1.5 0 0 1 1.5-1.5h7l2 2.2h13a1.5 1.5 0 0 1 1.5 1.5V26H3z" fill="url(#a)" stroke="#b98a1e" stroke-width=".8"/>
    <path d="M2 13.2a1.2 1.2 0 0 1 1.2-1.2h25.6a1.2 1.2 0 0 1 1.2 1.4l-1.7 12.6H3.6z" fill="url(#f)" stroke="#c69a2c" stroke-width=".8"/><path d="M3.4 13.5h25.2" stroke="#fff6cf" stroke-width="1"/>`,
    lg('a', [[0, '#f6d26b'], [1, '#e3a92a']]) + lg('f', [[0, '#fff1a8'], [.5, '#fbd970'], [1, '#f0bb3e']])),
  help: S(`${shadow}<circle cx="16" cy="15.5" r="12" fill="url(#h)" stroke="#123f9c" stroke-width=".8"/><ellipse cx="16" cy="9.5" rx="8.5" ry="5" fill="#fff" opacity=".35"/>
    <path d="M12 12.2c0-2.6 1.9-4.3 4.3-4.3 2.5 0 4.2 1.6 4.2 3.7 0 3.2-3.5 3.2-3.5 6.1h-3c0-4 3.3-4.1 3.3-6 0-.8-.5-1.3-1.2-1.3-.8 0-1.2.6-1.2 1.8z" fill="#fff"/><circle cx="15.5" cy="21.6" r="1.9" fill="#fff"/>`,
    rg('h', [[0, '#7bb8ff'], [.7, '#1f62d9'], [1, '#0d3fa6']])),
  search: S(`${shadow}<rect x="5" y="4" width="17" height="22" rx="1" fill="#fff" stroke="#9aa5b5" stroke-width=".8"/><path d="M8 9h11M8 12h11M8 15h7" stroke="#b8c2d2"/>
    <circle cx="18" cy="17" r="6.2" fill="url(#l)" stroke="#2b4f8f" stroke-width="1.6"/><ellipse cx="16.5" cy="15" rx="3" ry="2" fill="#fff" opacity=".6"/><path d="m22.5 21.5 6 6" stroke="url(#p)" stroke-width="3.6" stroke-linecap="round"/>`,
    rg('l', [[0, '#ffffff'], [1, '#9cc8ff']]) + lg('p', [[0, '#7b5a2b'], [1, '#3c2a10']], 1, 1)),
  run: S(`${shadow}<rect x="3" y="5" width="22" height="19" rx="1.5" fill="#fff" stroke="#3b62b8" stroke-width=".8"/><rect x="3" y="5" width="22" height="4" rx="1.5" fill="url(#t)"/>
    <path d="M29 15.5 21 10v3.3h-8.5v4.4H21V21z" fill="url(#e)" stroke="#1d6a14" stroke-width=".8"/>`,
    lg('t', [[0, '#5d9cff'], [1, '#1550c8']]) + lg('e', [[0, '#8fe06a'], [1, '#2c9620']])),
  control: S(`${shadow}<rect x="3" y="4" width="26" height="20" rx="1.5" fill="url(#m)" stroke="#264f9e" stroke-width=".8"/><rect x="5" y="6" width="22" height="16" fill="#eaf2ff"/>
    <path d="M11 9.5a5 5 0 1 0 5 5h-5z" fill="#3c8ef0"/><path d="M12 8.5v5h5a5 5 0 0 0-5-5z" fill="#f5a31a"/>
    <path d="M20 9v10M23.5 9v10" stroke="#8a97ad" stroke-width="1.2"/><rect x="18.6" y="11" width="2.8" height="2.2" fill="#4fae32"/><rect x="22.1" y="15" width="2.8" height="2.2" fill="#e04b2e"/><rect x="9" y="25" width="14" height="3" rx="1" fill="#8d96a6"/>`,
    lg('m', [[0, '#6fa6ff'], [1, '#2a5cc8']])),
  display: S(`${shadow}<rect x="3" y="4" width="26" height="19" rx="2" fill="url(#m)" stroke="#53627a" stroke-width=".8"/><rect x="5.2" y="6.2" width="21.6" height="14.6" fill="url(#k)"/>
    <path d="M5.2 17c6-4 11-4 21.6-1.5v5.3H5.2z" fill="url(#g)"/><path d="M12 23.5h8l1.5 4h-11z" fill="#9aa3b3"/><rect x="8" y="27" width="16" height="2" rx="1" fill="#7c8597"/>`,
    lg('m', [[0, '#e8ecf3'], [1, '#a9b2c3']]) + lg('k', [[0, '#2b6fe0'], [1, '#bde0ff']]) + lg('g', [[0, '#86d042'], [1, '#2f8c1d']])),
  keyboard: S(`${shadow}<path d="M2 14h28v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="url(#k)" stroke="#6d7586" stroke-width=".8"/>
    <g fill="#fff" stroke="#9aa3b3" stroke-width=".5">${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${4.2 + i * 4.1}" y="16" width="3.2" height="2.6" rx=".5"/><rect x="${5.2 + i * 3.6}" y="19.6" width="2.8" height="2.6" rx=".5"/>`).join('')}<rect x="8" y="23" width="16" height="1.8" rx=".5"/></g>`,
    lg('k', [[0, '#f3f5f8'], [1, '#c4cad5']])),
  logoff: S(`<rect x="2" y="2" width="28" height="28" rx="4" fill="url(#o)" stroke="#a65a06" stroke-width=".8"/><rect x="3" y="3" width="26" height="12" rx="3" fill="#fff" opacity=".25"/>
    <path d="M18 8h-8v16h8M14 16h11m-4-4 4 4-4 4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    lg('o', [[0, '#ffd27a'], [1, '#f08a12']])),
  power: S(`<rect x="2" y="2" width="28" height="28" rx="4" fill="url(#o)" stroke="#8a1c0a" stroke-width=".8"/><rect x="3" y="3" width="26" height="12" rx="3" fill="#fff" opacity=".22"/>
    <path d="M11.2 10.5a8 8 0 1 0 9.6 0M16 7v9" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>`,
    lg('o', [[0, '#ff9a6e'], [1, '#d43a14']])),
  recycle: S(`${shadow}<path d="M7 9h18l-2.2 18.5a1.5 1.5 0 0 1-1.5 1.3H10.7a1.5 1.5 0 0 1-1.5-1.3z" fill="url(#b)" stroke="#5f7491" stroke-width=".8"/>
    <rect x="5.5" y="6.5" width="21" height="3.4" rx="1.5" fill="url(#t)" stroke="#5f7491" stroke-width=".8"/>
    <path d="M13 21.5l3-5 3 5h-2.3M16 16.5" fill="none" stroke="#2f9a2f" stroke-width="1.8" stroke-linejoin="round"/><path d="M11.5 12v12M20.5 12v12" stroke="#fff" opacity=".5"/>`,
    lg('b', [[0, '#e8f1ff'], [1, '#9db6d8']], 1, 0) + lg('t', [[0, '#f5f8ff'], [1, '#b6c7e0']])),
  computer: S(`${shadow}<rect x="2" y="4" width="20" height="15" rx="1.5" fill="url(#m)" stroke="#53627a" stroke-width=".8"/><rect x="4" y="6" width="16" height="11" fill="url(#k)"/>
    <path d="M9 19.5h6l1 3H8z" fill="#9aa3b3"/><rect x="21" y="9" width="9" height="18" rx="1" fill="url(#m)" stroke="#53627a" stroke-width=".8"/><rect x="22.5" y="11" width="6" height="1.4" fill="#7c8597"/><circle cx="25.5" cy="23" r="1" fill="#45d14a"/>`,
    lg('m', [[0, '#eef1f6'], [1, '#aeb7c7']]) + lg('k', [[0, '#2b6fe0'], [1, '#9fd0ff']])),
  info: S(`<circle cx="16" cy="16" r="13" fill="url(#i)" stroke="#fff" stroke-width="1.2"/><ellipse cx="16" cy="9.5" rx="9" ry="5" fill="#fff" opacity=".35"/><circle cx="16" cy="9.8" r="2" fill="#fff"/><path d="M13.5 13.5h4v9.5h2v2h-6v-2h1.8v-7.3h-1.8z" fill="#fff"/>`,
    rg('i', [[0, '#7fb6ff'], [1, '#1550c8']])),
  warn: S(`<path d="M16 3 30 28H2z" fill="url(#w)" stroke="#9a6a00" stroke-width="1" stroke-linejoin="round"/><path d="M14.5 11h3l-.6 9h-1.8z" fill="#222"/><circle cx="16" cy="23.5" r="1.7" fill="#222"/>`,
    lg('w', [[0, '#fff2a0'], [1, '#f6c21a']])),
  error: S(`<circle cx="16" cy="16" r="13" fill="url(#e)" stroke="#fff" stroke-width="1.2"/><ellipse cx="16" cy="9.5" rx="9" ry="5" fill="#fff" opacity=".3"/><path d="m11 11 10 10m0-10L11 21" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`,
    rg('e', [[0, '#ff8c78'], [1, '#c4200c']])),
  ok: S(`<circle cx="16" cy="16" r="13" fill="url(#e)" stroke="#fff" stroke-width="1.2"/><ellipse cx="16" cy="9.5" rx="9" ry="5" fill="#fff" opacity=".3"/><path d="m9.5 16.5 4.5 4.5 8.5-9.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    rg('e', [[0, '#8ee068'], [1, '#2a8f1c']])),
  user: S(`<rect width="32" height="32" fill="url(#bg)"/>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="16" cy="9" rx="4.6" ry="7.5" fill="url(#p)" transform="rotate(${a} 16 16)"/>`).join('')}<circle cx="16" cy="16" r="4" fill="url(#c)"/>`,
    lg('bg', [[0, '#9be15d'], [1, '#2f8f2c']]) + lg('p', [[0, '#ff9fd8'], [1, '#c03a8d']]) + rg('c', [[0, '#fff27a'], [1, '#e79b10']])),
  tips: S(`<path d="M16 3a8.5 8.5 0 0 0-5 15.4V22h10v-3.6A8.5 8.5 0 0 0 16 3z" fill="url(#y)" stroke="#a37a00" stroke-width=".8"/><ellipse cx="13.5" cy="8.5" rx="3" ry="2" fill="#fff" opacity=".7"/><rect x="11" y="22.5" width="10" height="5" rx="1.5" fill="url(#m)" stroke="#6d7586" stroke-width=".6"/>`,
    rg('y', [[0, '#fffbe0'], [.6, '#ffe45c'], [1, '#f2b705']]) + lg('m', [[0, '#e8ecf2'], [1, '#9aa3b3']])),
  sound: S(`<path d="M4 12h5l7-6v20l-7-6H4z" fill="url(#s)" stroke="#53627a" stroke-width=".8" stroke-linejoin="round"/><path d="M20 11.5a6 6 0 0 1 0 9M23 8.5a10 10 0 0 1 0 15" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
    lg('s', [[0, '#f3f5f8'], [1, '#aab3c4']])),
  floppy: S(`<path d="M4 4h21l3 3v21H4z" fill="url(#f)" stroke="#123f9c" stroke-width=".8"/><rect x="9" y="4" width="13" height="8" fill="#e3e8f0"/><rect x="18" y="5.5" width="2.5" height="5" fill="#2b4f8f"/><rect x="7.5" y="16" width="17" height="12" rx="1" fill="#fff"/><path d="M10 19.5h12M10 22.5h12M10 25.5h8" stroke="#b8c2d2"/>`,
    lg('f', [[0, '#5d9cff'], [1, '#1648b8']])),
  docs: S(`${shadow}<path d="M3 8.5a1.5 1.5 0 0 1 1.5-1.5h7l2 2.2h13a1.5 1.5 0 0 1 1.5 1.5V26H3z" fill="url(#a)" stroke="#b98a1e" stroke-width=".8"/><rect x="8" y="4" width="15" height="17" fill="#fff" stroke="#9aa5b5" stroke-width=".6" transform="rotate(-6 15 12)"/>
    <path d="M2 13.2a1.2 1.2 0 0 1 1.2-1.2h25.6a1.2 1.2 0 0 1 1.2 1.4l-1.7 12.6H3.6z" fill="url(#f)" stroke="#c69a2c" stroke-width=".8"/>`,
    lg('a', [[0, '#f6d26b'], [1, '#e3a92a']]) + lg('f', [[0, '#fff1a8'], [.5, '#fbd970'], [1, '#f0bb3e']])),
  arrow: S(`<circle cx="16" cy="16" r="13" fill="url(#g)" stroke="#1d6a14" stroke-width=".8"/><ellipse cx="16" cy="10" rx="9" ry="5" fill="#fff" opacity=".35"/><path d="M12 9.5 21 16l-9 6.5z" fill="#fff"/>`,
    rg('g', [[0, '#a6ec7c'], [1, '#2c9620']])),
};
// folders with a picture on them ("My Pictures", "My Music", "My Videos")
const badge = (base, inner) => ICONS[base].replace('</svg>', `<g transform="translate(9 13) scale(.55)">${inner}</g></svg>`);
ICONS.pictures = badge('folder', `<rect x="2" y="3" width="24" height="19" fill="#fff" stroke="#8a7a52"/><rect x="4" y="5" width="20" height="15" fill="#5ea4f2"/><path d="M4 17c6-5 10-6 20-3v6H4z" fill="#58b335"/>`);
ICONS.music = badge('folder', `<path d="M10 3v15a4 3 0 1 1-2.5-2.8V6l13-3v12.5a4 3 0 1 1-2.5-2.8V6.2z" fill="#1d58d8"/>`);
ICONS.videos = badge('folder', `<rect x="1" y="4" width="26" height="18" rx="1.5" fill="#2a2d33"/><rect x="6" y="7" width="16" height="12" fill="#5ea4f2"/>${[0, 1, 2, 3].map(i => `<rect x="2" y="${6 + i * 4}" width="2.5" height="2" fill="#fff"/><rect x="23.5" y="${6 + i * 4}" width="2.5" height="2" fill="#fff"/>`).join('')}`);

// the Start button flag: Strata's three layers, waving in XP colours
const FLAG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 22"><defs>${lg('r', [[0, '#ff8a5c'], [1, '#e2380f']])}${lg('g', [[0, '#a5e15d'], [1, '#3f9a12']])}${lg('b', [[0, '#7cc4ff'], [1, '#1a6fd8']])}</defs>
  <g transform="skewX(-10)" stroke="#000" stroke-opacity=".35" stroke-width=".6">
  <path d="M6 2.2c4-1.6 8.5 1.4 15-.4l-1.2 4.8c-6.3 1.8-10.8-1.2-14.8.4z" fill="url(#r)"/>
  <path d="M5.2 8.6c4-1.6 8.5 1.4 15-.4l-1.2 4.8c-6.3 1.8-10.8-1.2-14.8.4z" fill="url(#g)"/>
  <path d="M4.4 15c4-1.6 8.5 1.4 15-.4L18.2 19.4c-6.3 1.8-10.8-1.2-14.8.4z" fill="url(#b)"/></g></svg>`;
// window caption buttons (minimize · maximize · close) as one strip, and small panel/window icons
const CAP_BTNS = (active = true) => {
  const b = (x, red, glyph) => `<g transform="translate(${x} 0)"><rect x=".5" y=".5" width="20" height="20" rx="3" fill="url(#${red ? 'r' : 'b'})" stroke="#fff" opacity="${active ? 1 : .85}"/><rect x="1.5" y="1.5" width="18" height="8" rx="2" fill="#fff" opacity=".18"/>${glyph}</g>`;
  const defs = lg('b', active ? [[0, '#5c9dff'], [.5, '#2667e8'], [1, '#1a52d6']] : [[0, '#aec4f2'], [1, '#8aa6e6']]) + lg('r', active ? [[0, '#f09c7c'], [.5, '#e0582c'], [1, '#c3401a']] : [[0, '#e2b7a8'], [1, '#d09684']]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 65 21" width="65" height="21"><defs>${defs}</defs>${b(0, 0, '<rect x="5" y="13" width="7" height="3" fill="#fff"/>')}${b(22, 0, '<rect x="5" y="4.5" width="11" height="11" fill="none" stroke="#fff" stroke-width="1.2"/><rect x="5" y="4.5" width="11" height="2.6" fill="#fff"/>')}${b(44, 1, '<path d="m6 6 9 9m0-9-9 9" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>')}</svg>`;
};
const capTitle = (title, icon) => `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="25" viewBox="0 0 900 25">
  <image href="${svgUri(icon)}" x="5" y="4.5" width="16" height="16"/>
  <text x="25" y="17" font-family="'Trebuchet MS', Tahoma, sans-serif" font-weight="700" font-size="13" fill="#0a1b6b" opacity=".75">${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
  <text x="24" y="16" font-family="'Trebuchet MS', Tahoma, sans-serif" font-weight="700" font-size="13" fill="#fff">${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`;
const cssUrl = s => `url("${svgUri(s)}")`;

/* ---------- Bliss-style wallpaper, painted (no photo needed) ---------- */
const rand = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const walls = {};
function paintWall(kind) {
  const W = 1920, H = 1080, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), R = rand(kind === 'dream' ? 7 : 11);
  const dream = kind === 'dream';
  // sky
  const sky = g.createLinearGradient(0, 0, 0, H * .7);
  if (dream) { sky.addColorStop(0, '#0638c9'); sky.addColorStop(.45, '#2f7cf2'); sky.addColorStop(.8, '#8cc4ff'); sky.addColorStop(1, '#e6f4ff'); }
  else { sky.addColorStop(0, '#1c5bd2'); sky.addColorStop(.38, '#3f84e4'); sky.addColorStop(.72, '#93c1f1'); sky.addColorStop(1, '#dbeafa'); }
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // clouds: soft clusters and long thin streaks
  const blob = (x, y, r, a, flat = .55) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.save(); g.translate(x, y); g.scale(1, flat); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore(); };
  const clusters = dream ? [[.16, .2, 1.5], [.5, .12, 1.2], [.83, .28, 1.6], [.36, .38, 1], [.68, .45, .9]] : [[.12, .16, 1], [.3, .31, .8], [.58, .12, .9], [.82, .3, 1.1], [.95, .1, .7], [.46, .44, .6]];
  for (const [cx, cy, s] of clusters) {
    const n = dream ? 90 : 60;
    for (let i = 0; i < n; i++) {
      const dx = (R() - .5) * W * .22 * s, dy = (R() - .6) * H * .08 * s;
      blob(cx * W + dx, cy * H + dy, (dream ? 70 : 45) * s * (.4 + R()), dream ? .5 : .32, dream ? .7 : .5);
    }
    if (dream) for (let i = 0; i < 30; i++) blob(cx * W + (R() - .5) * W * .14 * s, cy * H + (R() - .3) * 30, 60 * s * (.4 + R()), .55, .8);
  }
  if (!dream) for (let i = 0; i < 26; i++) { const x = R() * W, y = H * (.06 + R() * .4); g.save(); g.translate(x, y); g.rotate(-.12 + R() * .1); blob(0, 0, 160 + R() * 260, .16, .08); g.restore(); }
  // the far hill on the right, hazy
  g.beginPath(); g.moveTo(W * .48, H); g.bezierCurveTo(W * .62, H * .7, W * .78, H * .615, W, H * .6); g.lineTo(W, H); g.closePath();
  let hg = g.createLinearGradient(0, H * .6, 0, H * .8); hg.addColorStop(0, dream ? '#59c73f' : '#6aa94a'); hg.addColorStop(1, dream ? '#1f8a17' : '#2f6e1e'); g.fillStyle = hg; g.fill();
  // the main hill
  const hill = new Path2D();
  hill.moveTo(0, H * .64); hill.bezierCurveTo(W * .14, H * .585, W * .3, H * .545, W * .43, H * .55); hill.bezierCurveTo(W * .58, H * .555, W * .7, H * .655, W * .82, H * .705);
  hill.bezierCurveTo(W * .9, H * .735, W * .96, H * .72, W, H * .705); hill.lineTo(W, H); hill.lineTo(0, H); hill.closePath();
  hg = g.createLinearGradient(0, H * .55, 0, H);
  if (dream) { hg.addColorStop(0, '#b7f24a'); hg.addColorStop(.3, '#5fd02a'); hg.addColorStop(1, '#0f7a0c'); }
  else { hg.addColorStop(0, '#a6d343'); hg.addColorStop(.25, '#6cb52f'); hg.addColorStop(.6, '#3f8c1c'); hg.addColorStop(1, '#2a6c12'); }
  g.fillStyle = hg; g.fill(hill);
  g.save(); g.clip(hill);
  // sunlight on the crest, shade in the valley
  let lgt = g.createRadialGradient(W * .3, H * .58, 10, W * .3, H * .6, W * .45); lgt.addColorStop(0, 'rgba(240,255,170,.45)'); lgt.addColorStop(1, 'rgba(240,255,170,0)'); g.fillStyle = lgt; g.fillRect(0, 0, W, H);
  lgt = g.createRadialGradient(W * .85, H * .95, 10, W * .85, H * .95, W * .5); lgt.addColorStop(0, 'rgba(0,40,0,.35)'); lgt.addColorStop(1, 'rgba(0,40,0,0)'); g.fillStyle = lgt; g.fillRect(0, 0, W, H);
  // grass: short strokes, bigger toward the bottom (perspective)
  const n = dream ? 26000 : 52000;
  for (let i = 0; i < n; i++) {
    const x = R() * W, y = H * .53 + R() * R() * H * .5 + R() * H * .02, depth = (y - H * .53) / (H * .47);
    const len = 1.5 + depth * (dream ? 7 : 9) * R(), lit = 28 + R() * 30 - depth * 10 + (x < W * .5 ? 6 : 0);
    g.strokeStyle = `hsla(${dream ? 95 + R() * 25 : 82 + R() * 22},${dream ? 85 : 60}%,${lit}%,${.35 + R() * .4})`;
    g.lineWidth = .6 + depth * 1.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * len * .5, y - len); g.stroke();
  }
  g.restore();
  // a bright rim along the crest
  g.save(); g.strokeStyle = dream ? 'rgba(255,255,220,.6)' : 'rgba(235,250,200,.35)'; g.lineWidth = 3; g.filter = 'blur(2px)'; g.stroke(hill); g.restore();
  if (dream) {   // dream: a fine dither / film grain over everything
    const id = g.getImageData(0, 0, W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const k = (R() - .5) * 26; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
    g.putImageData(id, 0, 0);
  }
  return c.toDataURL('image/jpeg', .9);
}
const wall = kind => walls[kind] || (walls[kind] = paintWall(kind));

/* ---------- the shell ---------- */
let on = false, el = {}, tick = 0, startOpen = false;
const MODES = [['video', 'Strata Video', 'Edit movies on a timeline'], ['audio', 'Strata Audio', 'Record, clean up and mix sound'], ['image', 'Strata Image', 'Paint and retouch pictures']];
const docName = id => id === 'video' ? App.V && App.V.name : id === 'audio' ? App.A && App.A.name : App.I && App.I.doc && App.I.doc.name;
const winTitle = id => { const m = MODES.find(x => x[0] === id); const n = docName(id); return (n ? n + ' - ' : '') + m[1]; };
const PANEL_TITLES = {
  'v-top': [() => winTitle('video'), 'video'], 'v-left': ['Media Library', 'videos'], 'v-viewer': ['Program Monitor', 'display'], 'v-insp': ['Properties', 'control'], 'v-tl': ['Timeline', 'video'],
  'a-top': [() => winTitle('audio'), 'audio'], 'a-main': ['Tracks', 'music'], 'a-side': ['Effects', 'control'], 'a-foot': ['Selection & Levels', 'sound'],
  'i-top': [() => winTitle('image'), 'image'], 'i-opts': ['Tool Options', 'control'], 'i-tools': ['', 'image'], 'i-stagewrap': [() => (App.I && App.I.doc && App.I.doc.name || 'untitled') + ' (canvas)', 'pictures'], 'i-side': ['Layers', 'docs'], 'i-bottom': ['Colors', 'display'],
};

function startMenu() {
  const item = (icon, label, sub, action, cls = '') => {
    const b = h('button', { class: 'xp-sm-item ' + cls, type: 'button' }, img(ICONS[icon], cls.includes('big') ? 32 : 24), h('span', null, h('b', null, label), sub ? h('small', null, sub) : null));
    b.addEventListener('click', () => { closeStart(); action(); });
    return b;
  };
  const sep = () => h('div', { class: 'xp-sm-sep' });
  const left = h('div', { class: 'xp-sm-left' },
    ...MODES.map(([id, name, sub]) => item(id, name, sub, () => App.setMode(id), 'big')),
    sep(),
    item('run', 'Command palette', null, () => App.openPalette()),
    item('keyboard', 'Keyboard shortcuts', null, () => App.showShortcuts()),
    item('help', 'Tour Strata Studio', null, () => App.showWelcome()),
    h('div', { class: 'grow' }), sep(),
    h('button', { class: 'xp-sm-all', type: 'button', onclick: () => { closeStart(); App.openPalette(); } }, h('b', null, 'All Programs'), img(ICONS.arrow, 18)));
  const right = h('div', { class: 'xp-sm-right' },
    item('docs', 'My Projects', null, () => App.openProjectFile(), 'strong'),
    item('pictures', 'My Pictures', null, () => App.setMode('image'), 'strong'),
    item('music', 'My Music', null, () => App.setMode('audio'), 'strong'),
    item('videos', 'My Videos', null, () => App.setMode('video'), 'strong'),
    sep(),
    item('control', 'Control Panel', null, () => App.showSettings()),
    item('display', 'Display Properties', null, () => App.showSettings('appearance')),
    item('sound', 'Sounds and Audio Devices', null, () => App.showSettings('sounds')),
    sep(),
    item('help', 'Help and Support', null, () => App.showShortcuts()),
    item('search', 'Search', null, () => App.openPalette()),
    item('run', 'Run...', null, () => App.openPalette()));
  const foot = h('div', { class: 'xp-sm-foot' },
    h('button', { type: 'button', onclick: () => { closeStart(); App.showWelcome(); } }, img(ICONS.logoff, 24), 'Log Off'),
    h('button', { type: 'button', onclick: () => { closeStart(); turnOff(); } }, img(ICONS.power, 24), 'Turn Off Computer'));
  return h('div', { class: 'xp-start' }, h('div', { class: 'xp-sm-head' }, img(ICONS.user, 48, 'xp-sm-pic'), h('span', null, 'Strata')), h('div', { class: 'xp-sm-body' }, left, right), foot);
}
function toggleStart() { startOpen ? closeStart() : openStart(); }
function openStart() {
  if (!el.start) { el.start = startMenu(); document.body.append(el.start); }
  el.start.classList.add('open'); startOpen = true; root.classList.add('xp-start-open');
  App.sound && App.sound('open');
}
function closeStart() { if (el.start) el.start.classList.remove('open'); startOpen = false; root.classList.remove('xp-start-open'); }

function turnOff() {
  const close = () => { back.remove(); root.classList.remove('xp-gray'); };
  const big = (icon, cls, label, fn) => { const b = h('button', { class: 'xp-off-btn ' + cls, type: 'button' }, h('i', null, icon), h('span', null, label)); b.addEventListener('click', () => { close(); fn(); }); return b; };
  const back = h('div', { class: 'xp-off-back' }, h('div', { class: 'xp-off' },
    h('div', { class: 'xp-off-head' }, h('span', null, 'Turn off computer'), img(FLAG, 28)),
    h('div', { class: 'xp-off-body' },
      big('☾', 'stand', 'Stand By', () => setMin(true)),
      big('⏻', 'off', 'Turn Off', async () => { try { await App.flushAll(); } catch {} App.showWelcome(); }),
      big('↻', 'restart', 'Restart', async () => { try { await App.flushAll(); } catch {} location.reload(); })),
    h('div', { class: 'xp-off-foot' }, h('button', { class: 'btn solid', type: 'button', onclick: close }, 'Cancel'))));
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  root.classList.add('xp-gray');
  document.body.append(back);
}

const setMin = v => { root.classList.toggle('xp-min', v); };
const setMax = v => { root.classList.toggle('xp-max', v); try { localStorage.setItem('strata.xp.max', v ? '1' : '0'); } catch {} };

function build() {
  const top = document.getElementById('topbar'), main = document.getElementById('main');
  root.dataset.xp = style();
  root.style.setProperty('--xp-wall', `url(${wall(style() === 'dream' ? 'dream' : 'bliss')})`);
  // taskbar: Start button, a clock in the notification area
  const brand = top.querySelector('.brand');
  el.flag = img(FLAG, 22, 'xp-flag'); brand.prepend(el.flag);
  el.onBrand = e => { e.stopImmediatePropagation(); toggleStart(); };
  brand.addEventListener('click', el.onBrand, true);
  el.clock = h('span', { class: 'xp-clock', title: 'Clock', tip: 'The time on this computer.' });
  top.querySelector('.tb-right').append(el.clock);
  // the program window (luna): title bar, status bar
  el.title = h('div', { class: 'xp-titlebar' }, el.titleIco = img(ICONS.video, 16), el.titleText = h('span', { class: 'xp-title' }),
    h('div', { class: 'xp-wbtns' },
      h('button', { class: 'xp-wb min', type: 'button', title: 'Minimize', tip: 'Hides the window to show the desktop — click its taskbar button to bring it back.', onclick: () => setMin(true) }),
      h('button', { class: 'xp-wb max', type: 'button', title: 'Maximize', tip: 'Fills the screen, or puts the window back.', onclick: () => setMax(!root.classList.contains('xp-max')) }),
      h('button', { class: 'xp-wb close', type: 'button', title: 'Close', tip: 'Turn off computer…', onclick: () => turnOff() })));
  el.title.addEventListener('dblclick', e => { if (!e.target.closest('.xp-wb')) setMax(!root.classList.contains('xp-max')); });
  el.statusText = h('span', { class: 'xp-st-text' }, 'For Help, press ?');
  el.statusInfo = h('span', { class: 'xp-st-panel' });
  el.status = h('div', { class: 'xp-statusbar' }, el.statusText, el.statusInfo, h('span', { class: 'xp-st-panel xp-st-zoom' }), h('i', { class: 'xp-grip' }));
  main.before(el.title); main.after(el.status);
  el.onOver = e => { const t = e.target.closest && e.target.closest('[data-tip]'); el.statusText.textContent = t ? (t.dataset.tipTitle ? t.dataset.tipTitle + ': ' : '') + t.dataset.tip : 'For Help, press ?'; };
  document.addEventListener('pointerover', el.onOver);
  // desktop icons (seen when the window is minimized)
  el.icons = h('div', { class: 'xp-icons' },
    ...[['computer', 'Strata Studio', () => setMin(false)], ...MODES.map(([id, name]) => [id, name, () => { App.setMode(id); setMin(false); }]), ['docs', 'My Projects', () => App.openProjectFile()], ['recycle', 'Recycle Bin', () => App.showSettings('storage')]]
      .map(([ic, label, fn]) => { const b = h('button', { class: 'xp-icon', type: 'button', title: label, tip: 'Double-click to open.' }, img(ICONS[ic], 32), h('span', null, label)); b.addEventListener('dblclick', fn); b.addEventListener('click', () => { el.icons.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); }); return b; }));
  document.body.prepend(el.icons);
  // taskbar buttons: the active program's button minimizes it, a minimized one comes back
  el.onTab = e => {
    const t = e.target.closest('.tab'); if (!t) return;
    if (root.classList.contains('xp-min')) { setMin(false); return; }
    if (t.dataset.mode === App.active && style() === 'luna') { e.stopImmediatePropagation(); setMin(true); }
  };
  top.querySelector('.tabs').addEventListener('click', el.onTab, true);
  el.onDown = e => { if (startOpen && !e.target.closest('.xp-start, .brand')) closeStart(); };
  document.addEventListener('pointerdown', el.onDown, true);
  el.onKey = e => { if (startOpen && e.key === 'Escape') { closeStart(); e.stopPropagation(); } };
  document.addEventListener('keydown', el.onKey, true);
  try { if (localStorage.getItem('strata.xp.max') === '1') root.classList.add('xp-max'); } catch {}
  // icons for the taskbar buttons and tray, as CSS variables
  for (const k of ['video', 'audio', 'image', 'tips', 'run', 'keyboard', 'display', 'control', 'floppy', 'sound', 'info', 'warn', 'error', 'ok']) root.style.setProperty('--xpi-' + k, cssUrl(ICONS[k]));
  root.style.setProperty('--xp-capbtns', cssUrl(CAP_BTNS(true)));
  root.style.setProperty('--xp-capbtns-off', cssUrl(CAP_BTNS(false)));
  root.style.setProperty('--xp-capclose', cssUrl(CAP_BTNS(true).replace('viewBox="0 0 65 21" width="65"', 'viewBox="44 0 21 21" width="21"')));
  root.style.setProperty('--xp-capclose-off', cssUrl(CAP_BTNS(false).replace('viewBox="0 0 65 21" width="65"', 'viewBox="44 0 21 21" width="21"')));
  update();
  tick = setInterval(update, 1000);
  // switching editors updates the title bar, taskbar and status bar at once
  el.modeObs = new MutationObserver(() => update());
  el.modeObs.observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
}
function update() {
  if (!on) return;
  const d = new Date();
  el.clock.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const id = App.active || 'video';
  el.titleText.textContent = winTitle(id);
  if (el.titleIco.dataset.m !== id) { el.titleIco.src = svgUri(ICONS[id]); el.titleIco.dataset.m = id; }
  document.querySelectorAll('#topbar .tab').forEach(t => { const lbl = t.querySelector('.lbl'); if (lbl) lbl.dataset.xp = winTitle(t.dataset.mode); });
  const info = id === 'video' && App.V && App.V.project ? `${App.V.project.width}×${App.V.project.height} · ${App.V.project.fps} fps`
    : id === 'audio' && App.A ? `${(App.A.sr / 1000).toFixed(1)} kHz · ${App.A.tracks.length} track${App.A.tracks.length === 1 ? '' : 's'}`
    : id === 'image' && App.I && App.I.doc ? `${App.I.doc.w} × ${App.I.doc.h} px` : '';
  el.statusInfo.textContent = info;
  el.status.querySelector('.xp-st-zoom').textContent = Math.round((App.uiScale ? App.uiScale() : 1) * 100) + '%';
  // panel captions for the "desk" and "dream" looks
  if (style() !== 'luna') for (const [cls, [t, ic]] of Object.entries(PANEL_TITLES)) {
    const p = document.querySelector('.module > .' + cls); if (!p) continue;
    const text = typeof t === 'function' ? t() : t;
    if (p.dataset.xpTitle !== text) { p.dataset.xpTitle = text; p.style.setProperty('--xp-cap', cssUrl(capTitle(text, ICONS[ic]))); }
  }
}
function teardown() {
  clearInterval(tick);
  if (el.modeObs) el.modeObs.disconnect();
  closeStart();
  const top = document.getElementById('topbar');
  const brand = top && top.querySelector('.brand');
  if (brand && el.onBrand) brand.removeEventListener('click', el.onBrand, true);
  if (top && el.onTab) top.querySelector('.tabs').removeEventListener('click', el.onTab, true);
  if (el.onOver) document.removeEventListener('pointerover', el.onOver);
  if (el.onDown) document.removeEventListener('pointerdown', el.onDown, true);
  if (el.onKey) document.removeEventListener('keydown', el.onKey, true);
  for (const k of ['flag', 'clock', 'title', 'status', 'icons', 'start']) if (el[k]) el[k].remove();
  document.querySelectorAll('[data-xp-title]').forEach(p => { delete p.dataset.xpTitle; p.style.removeProperty('--xp-cap'); });
  root.classList.remove('xp-min', 'xp-max', 'xp-gray', 'xp-start-open');
  delete root.dataset.xp;
  el = {};
}
function sync() {
  const want = App.settings.theme === 'xp';
  if (want && !on) { on = true; build(); }
  else if (!want && on) { on = false; teardown(); }
  else if (want && on && root.dataset.xp !== style()) { teardown(); build(); }
}
App.on('theme', () => setTimeout(sync, 0));
App.on('setting', k => { if (k === 'xpStyle') sync(); });
App.xp = { icons: ICONS, flag: FLAG, wall, sync, styles: STYLES, turnOff, openStart, closeStart };
// boot once the top bar exists (main.js builds it right after this file loads)
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => setTimeout(sync, 0)); else setTimeout(sync, 0);
})();
