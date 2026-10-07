/* Strata Studio — themes & appearance. Holds the theme catalog and applies the appearance preferences
   (theme, accent, interface font, roundness, density, transparency, decorative effects) to <html>.
   Loaded in <head>, before anything renders, so the app never flashes in the wrong theme. */
(() => {
'use strict';
const App = (window.App = window.App || {});

/* sw = preview swatches [background, panel, accent 1, accent 2, accent 3]; pack = matching UI sound pack */
App.THEMES = [
  { id: 'dark', name: 'Strata Dark', desc: 'The original: deep charcoal with a warm glow behind each editor.', pack: 'soft', dark: true, alpha: 1 },
  { id: 'light', name: 'Strata Light', desc: 'Clean and bright for daylight work. Same layout, light paper tones.', pack: 'soft', dark: false, alpha: 1 },
  { id: 'aero', name: 'Frutiger Aero', desc: 'Liquid glass, sky-blue gradients, glossy jelly buttons and bubbles. Very 2007.', pack: 'glass', dark: false, alpha: 0.6 },
  { id: 'xp', name: 'Windows XP Dreamcore', desc: 'XP as you remember it from a dream: chunky 3D windows on an endless green hill, a Start menu, a taskbar and balloon tips.', pack: 'dream', dark: false, alpha: 1 },
  { id: 'skeuo', name: 'Skeuomorphic Studio', desc: 'Leather, brushed-metal faceplates with screws, fader caps, LCD readouts and LED keys.', pack: 'mech', dark: true, alpha: 1 },
  { id: 'oled', name: 'Midnight OLED', desc: 'True black everywhere: easy on the eyes at night and on OLED screens.', pack: 'minimal', dark: true, alpha: 1 },
  { id: 'synthwave', name: 'Synthwave', desc: 'Neon pink and cyan over a retro sunset grid.', pack: 'synth', dark: true, alpha: 0.84 },
  { id: 'terminal', name: 'Terminal', desc: 'Green phosphor text, monospace everything and CRT scanlines.', pack: 'beep', dark: true, alpha: 1 },
  { id: 'nord', name: 'Nord Frost', desc: 'Calm arctic blues with soft aurora accents.', pack: 'frost', dark: true, alpha: 1 },
  { id: 'paper', name: 'Paper & Ink', desc: 'Cream paper, ink rules, serif type and highlighter marks.', pack: 'paper', dark: false, alpha: 1 },
  { id: 'classic', name: 'Classic 98', desc: 'Grey bevels, navy title bars and a teal desktop. Every pixel crisp.', pack: 'classic', dark: false, alpha: 1 },
  { id: 'pastel', name: 'Pastel Pop', desc: 'Soft candy colours, extra-round corners and bouncy buttons.', pack: 'pop', dark: false, alpha: 0.9 },
  { id: 'noir', name: 'Film Noir', desc: 'Black and white with a brass glint, venetian-blind light, film grain and L.A. Noire type.', pack: 'typewriter', dark: true, alpha: 0.9 },
  { id: 'grove', name: 'Grove Street', desc: 'Green and gold, with San Andreas Pricedown titles and menu type.', pack: 'gta', dark: true, alpha: 1 },
  { id: 'contrast', name: 'High Contrast', desc: 'Pure black and white with bright accents and strong outlines. Easiest to read.', pack: 'clear', dark: true, alpha: 1 },
];
App.themeById = id => App.THEMES.find(t => t.id === id) || App.THEMES[0];

/* interface font choices: [value, label, CSS font stack] */
App.UI_FONTS = [
  ['theme', 'Theme default', ''],
  ['Manrope', 'Manrope (Strata)', "'Manrope', 'Segoe UI', system-ui, sans-serif"],
  ['system', 'System (Segoe UI)', "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif"],
  ['Tahoma', 'Tahoma', "Tahoma, 'Segoe UI', sans-serif"],
  ['Verdana', 'Verdana (wide, very legible)', "Verdana, 'Segoe UI', sans-serif"],
  ['Georgia', 'Georgia (serif)', "Georgia, 'Times New Roman', serif"],
  ['JetBrains Mono', 'JetBrains Mono (monospace)', "'JetBrains Mono', Consolas, monospace"],
  ['L.A. Noire Subtitles', 'L.A. Noire Subtitles', "'L.A. Noire Subtitles', 'Manrope', sans-serif"],
  ['L.A. Noire Futura', 'L.A. Noire Futura', "'L.A. Noire Futura', 'Manrope', sans-serif"],
  ['San Andreas Subtitles', 'San Andreas Subtitles', "'San Andreas Subtitles', 'Manrope', sans-serif"],
];

const hexRgb = hex => { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mixWhite = (hex, k) => '#' + hexRgb(hex).map(v => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')).join('');
const luma = hex => { const [r, g, b] = hexRgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

/** Apply the appearance part of the settings to <html> (works before <body> exists). */
App.applyLook = (S = App.settings || {}) => {
  const root = document.documentElement, st = root.style;
  const t = App.themeById(S.theme);
  const prev = root.dataset.theme;
  root.dataset.theme = t.id;
  root.dataset.density = S.density || 'normal';
  root.dataset.fx = S.themeEffects === false ? 'off' : 'on';
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.content = t.dark ? 'dark' : 'light';
  // roundness and transparency: null = whatever the theme says
  if (S.roundness == null) st.removeProperty('--round'); else st.setProperty('--round', S.roundness);
  const alpha = S.transparency == null ? t.alpha : 1 - S.transparency / 100;
  if (S.transparency == null) st.removeProperty('--panel-alpha'); else st.setProperty('--panel-alpha', alpha.toFixed(2));
  root.classList.toggle('glass', alpha < 0.97);
  // interface font: a listed choice, or any game / imported font by family name
  const f = App.UI_FONTS.find(x => x[0] === S.uiFont);
  const stack = f ? f[2] : S.uiFont ? `"${S.uiFont}", 'Manrope', 'Segoe UI', sans-serif` : '';
  if (stack) st.setProperty('--font', stack); else st.removeProperty('--font');
  // image editor transparency checkerboard
  const chk = { light: ['#ffffff', '#cccccc'], dark: ['#3a3a3e', '#2b2b2f'], contrast: ['#ffffff', '#8a8a8a'] }[S.checker] || ['#ffffff', '#cccccc'];
  st.setProperty('--chk-a', chk[0]); st.setProperty('--chk-b', chk[1]); st.setProperty('--chk-size', (S.checkerSize || 16) + 'px');
  const custom = S.accentMode === 'custom' && /^#[0-9a-f]{6}$/i.test(S.accentColor || '');
  root.classList.toggle('accent-custom', custom);
  if (custom) {
    st.setProperty('--user-accent', S.accentColor);
    st.setProperty('--user-accent-2', mixWhite(S.accentColor, 0.38));
    st.setProperty('--user-accent-ink', luma(S.accentColor) > 0.55 ? '#141414' : '#ffffff');
  }
  root.classList.toggle('reduce-motion', !!S.reduceMotion);
  if (App.emit) App.emit('theme', t, prev !== t.id);
};

// boot: read the saved settings directly (store.js hasn't loaded yet)
try { App.applyLook(JSON.parse(localStorage.getItem('strata.settings') || '{}')); } catch { App.applyLook({}); }
})();
