/* Shared content + helpers for the welcome-screen concepts (design exploration only — not loaded by the app). */
(() => {
const MODES = [
  { id: 'video', name: 'Video', color: '#ff7849', deep: '#c2410c', light: '#ffc2a3', icon: 'film', key: '1',
    desc: 'Cut, layer and animate footage on a multitrack timeline.',
    pts: ['Blade, ripple, roll & slip edits', 'Keyframes, chroma key & titles', 'Auto captions & silence cutting', 'Fast MP4 / WebM / GIF export'] },
  { id: 'audio', name: 'Audio', color: '#35d6b4', deep: '#0f8a72', light: '#b5f3e6', icon: 'wave', key: '2',
    desc: 'Record, clean up and master sound with pro tools.',
    pts: ['Live recording & noise reduction', 'EQ, compressor & 25+ effects', 'Loudness (LUFS) & auto-duck', 'Envelopes, markers & live preview'] },
  { id: 'image', name: 'Image', color: '#a08aff', deep: '#5b3fd6', light: '#d9d0ff', icon: 'image', key: '3',
    desc: 'Retouch photos or paint from scratch — MS Paint meets a darkroom.',
    pts: ['Layers, masks & selections', 'Camera Raw, Liquify & 70+ filters', 'Healing brush, clone & text', 'Develop sliders & one-click looks'] },
];
const W = window.SW = {
  modes: MODES,
  title: 'Strata Studio',
  tagline: 'Video, audio and image editing — together, private, and fully offline.',
  actions: [['folder', 'Open project…'], ['command', 'Command palette', 'Ctrl K'], ['keyboard', 'Shortcuts', '?']],
  /** the real app logo (three slanted bars) */
  logo: (size = 40, cols = ['#ff7849', '#35d6b4', '#a08aff']) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><g transform="skewX(-12) translate(4 0)"><rect x="2" y="5" width="22" height="6" rx="3" fill="${cols[0]}"/><rect x="4" y="13" width="22" height="6" rx="3" fill="${cols[1]}"/><rect x="6" y="21" width="22" height="6" rx="3" fill="${cols[2]}"/></g></svg>`,
  /** an icon from the app's own icon set */
  icon: (name, size = 18, sw = 1.8) => `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.App && App.ICONS[name]) || ''}</svg>`,
  /** feedback when an editor is picked (the real screen would open it) */
  choose(id) {
    const m = MODES.find(x => x.id === id);
    let el = document.getElementById('sw-pick');
    if (!el) {
      el = document.createElement('div'); el.id = 'sw-pick';
      el.style.cssText = 'position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(20px);opacity:0;z-index:99999;padding:10px 18px;border-radius:999px;font:700 13px Manrope,sans-serif;color:#111;box-shadow:0 10px 40px rgba(0,0,0,.4);transition:opacity .25s,transform .35s cubic-bezier(.2,1.4,.4,1);pointer-events:none;white-space:nowrap';
      document.body.append(el);
    }
    el.style.background = m.color;
    el.textContent = `→ Opening the ${m.name} editor`;
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)'; });
    clearTimeout(el._t); el._t = setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(20px)'; }, 1600);
  },
  /** 1 / 2 / 3 pick an editor in every concept */
  keys(extra) {
    addEventListener('keydown', e => {
      const m = MODES.find(x => x.key === e.key);
      if (m) W.choose(m.id);
      extra && extra(e);
    });
  },
};
})();
