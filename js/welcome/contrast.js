/* Welcome screen — High Contrast: a Swiss-style typographic poster. Giant type on pure black, thick white rules and
   three full-width rows (one per editor) that flood with their accent colour when pointed at or focused. Large text,
   big targets, strong focus rings and almost no motion — built to be the easiest screen to read. */
(() => {
const App = window.App;
App.WELCOMES.contrast = {
  css: `
.wl-contrast { background: #000; color: #fff; font-family: 'Segoe UI', Manrope, system-ui, sans-serif; display: flex; flex-direction: column; padding: clamp(18px, 3vh, 34px) clamp(18px, 3.4vw, 54px); gap: 0; overflow: auto; }
.wl-contrast .wc-top { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 24px; padding-bottom: 14px; border-bottom: 6px solid #fff; }
.wl-contrast h1 { margin: 0; font: 900 clamp(64px, 11.5vw, 190px)/.82 'Segoe UI', Manrope, sans-serif; letter-spacing: -.045em; text-transform: uppercase; }
.wl-contrast h1 span { display: block; font-size: .42em; letter-spacing: -.02em; color: #ffd400; margin-top: .12em; }
.wl-contrast .wc-side { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; padding-bottom: 6px; text-align: right; }
.wl-contrast .wc-side p { margin: 0; max-width: 380px; font: 600 clamp(15px, 1.25vw, 19px)/1.4 'Segoe UI', sans-serif; }
.wl-contrast .wc-keys { font: 700 15px 'Segoe UI'; }
.wl-contrast .wc-keys kbd, .wl-contrast .wc-row kbd { display: inline-grid; place-items: center; min-width: 30px; height: 30px; padding: 0 8px; border: 2px solid currentColor; border-radius: 4px; font: 800 15px 'Segoe UI'; background: transparent; color: inherit; }
.wl-contrast .wc-rows { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.wl-contrast .wc-row { flex: 1 0 auto; min-height: 96px; display: grid; grid-template-columns: clamp(70px, 9vw, 140px) minmax(0, 1.25fr) minmax(0, 1.6fr) auto; align-items: center; gap: clamp(14px, 2vw, 34px); padding: 10px 14px; border: 0; border-bottom: 3px solid #fff; background: #000; color: #fff; text-align: left; font: inherit; }
.wl-contrast .wc-row:hover, .wl-contrast .wc-row:focus-visible, .wl-contrast .wc-row.wc-on { background: var(--c); color: #000; outline: none; }
.wl-contrast .wc-row:focus-visible { box-shadow: inset 0 0 0 6px #fff, inset 0 0 0 10px #000; }
.wl-contrast .wc-n { font: 900 clamp(44px, 6vw, 96px)/1 'Segoe UI', sans-serif; letter-spacing: -.04em; color: var(--c); }
.wl-contrast .wc-row:hover .wc-n, .wl-contrast .wc-row:focus-visible .wc-n, .wl-contrast .wc-row.wc-on .wc-n { color: #000; }
.wl-contrast .wc-name { font: 900 clamp(44px, 6.6vw, 110px)/.9 'Segoe UI', sans-serif; letter-spacing: -.04em; text-transform: uppercase; }
.wl-contrast .wc-desc { font: 600 clamp(15px, 1.2vw, 19px)/1.4 'Segoe UI', sans-serif; }
.wl-contrast .wc-desc ul { margin: 8px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 18px; font-weight: 500; font-size: clamp(14px, 1.05vw, 17px); }
.wl-contrast .wc-desc li::before { content: '— '; }
.wl-contrast .wc-go { display: flex; align-items: center; gap: 12px; font: 800 16px 'Segoe UI'; text-transform: uppercase; letter-spacing: .04em; }
.wl-contrast .wc-go svg { width: 34px; height: 34px; }
.wl-contrast .wc-bot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 26px; padding-top: 16px; }
.wl-contrast .wc-a { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 16px; border: 3px solid #fff; background: #000; color: #fff; font: 800 16px 'Segoe UI'; }
.wl-contrast .wc-a:hover, .wl-contrast .wc-a:focus-visible { background: #fff; color: #000; outline: 3px solid #ffd400; outline-offset: 3px; }
.wl-contrast .wc-a.wc-pri { background: #ffd400; color: #000; border-color: #ffd400; }
.wl-contrast .wc-a.wc-pri:hover, .wl-contrast .wc-a.wc-pri:focus-visible { background: #fff; border-color: #fff; }
.wl-contrast .wc-grow { flex: 1; }
.wl-contrast .wl-startup { font: 700 16px 'Segoe UI'; gap: 10px; }
.wl-contrast .wl-startup input { width: 22px; height: 22px; accent-color: #ffd400; }
@media (max-height: 780px) {
  .wl-contrast h1 { font-size: clamp(56px, 9vw, 120px); }
  .wl-contrast .wc-desc ul { display: none; }
  .wl-contrast .wc-name { font-size: clamp(40px, 5.6vw, 86px); }
  .wl-contrast .wc-n { font-size: clamp(38px, 5vw, 72px); }
}
@media (max-width: 900px) { .wl-contrast .wc-row { grid-template-columns: 70px 1fr auto; } .wl-contrast .wc-desc { display: none; } }
`,
  build(root, api) {
    const M = api.modes;
    root.innerHTML = `
      <div class="wc-top"><h1>Strata<span>Studio</span></h1>
        <div class="wc-side"><p>${api.esc(api.tagline)}</p><div class="wc-keys">Press <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> to open · <kbd>Esc</kbd> to skip</div></div></div>
      <div class="wc-rows">${M.map((m, i) => `<button class="wc-row" data-pick="${m.id}" aria-label="Open the ${m.name} editor" style="--c:${m.color}"${api.tip(m.name + ' editor', m.tip, m.key)}>
        <span class="wc-n">0${i + 1}</span><span class="wc-name">${m.name}</span>
        <span class="wc-desc">${m.desc}<ul>${m.pts.map(p => `<li>${p}</li>`).join('')}</ul></span>
        <span class="wc-go">Open <kbd>${m.key}</kbd>${api.icon('chevRight', 34, 3)}</span></button>`).join('')}</div>
      <div class="wc-bot">${api.actions.map(a => `<button class="wc-a" data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${api.icon(a.icon, 20, 2.4)}${a.label}</button>`).join('')}
        <span class="wc-grow"></span><span class="wc-su"></span>
        <button class="wc-a wc-pri" data-act="close"${api.tip('Continue', 'Close the welcome screen and keep working.', 'Esc')}>Continue</button></div>`;
    root.querySelector('.wc-su').append(api.startup('Show at startup'));
    const rows = [...root.querySelectorAll('.wc-row')];
    return {
      key(e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const cur = rows.indexOf(document.activeElement), dn = e.key === 'ArrowDown'; rows[cur < 0 ? (dn ? 0 : 2) : (cur + (dn ? 1 : 2)) % 3].focus(); return true; }
        return false;
      },
      leave(id) { rows[M.findIndex(m => m.id === id)].classList.add('wc-on'); return 160; },
    };
  },
};
})();
