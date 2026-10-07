/* Welcome screen — Windows XP Luna: the classic XP log-on screen. A short boot screen with the moving blue
   blocks, then "To begin, click your editor" with the three editors as user accounts (with their own pictures).
   Picking one shows "welcome" while the editor loads; the red power button continues to Strata. */
(() => {
const App = window.App;
const PICS = {
  // little "account pictures", drawn in SVG
  video: `<svg viewBox="0 0 64 64"><defs><linearGradient id="wxv1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b7ce8"/><stop offset="1" stop-color="#bfe0ff"/></linearGradient></defs><rect width="64" height="64" fill="url(#wxv1)"/><circle cx="50" cy="14" r="7" fill="#fff6c8"/><path d="M0 50 Q20 40 40 47 T64 44 V64 H0Z" fill="#3c9a2c"/><g transform="rotate(-8 30 36)"><rect x="12" y="28" width="36" height="22" rx="2" fill="#222"/><path d="M12 22 L48 18 L48 25 L12 29Z" fill="#fff"/><path d="M16 21.6 L21 28.4 M25 20.6 L30 27.4 M34 19.6 L39 26.4 M43 18.6 L47 24" stroke="#222" stroke-width="3"/><rect x="16" y="33" width="12" height="2.4" fill="#fff" opacity=".8"/><rect x="16" y="38" width="20" height="2.4" fill="#fff" opacity=".55"/></g></svg>`,
  audio: `<svg viewBox="0 0 64 64"><defs><radialGradient id="wxa1" cx=".3" cy=".25" r="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#e2731d"/></radialGradient><linearGradient id="wxa2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4b3a"/><stop offset="1" stop-color="#a5150b"/></linearGradient></defs><rect width="64" height="64" fill="url(#wxa1)"/><g transform="rotate(38 32 32)"><rect x="29.5" y="2" width="5" height="30" rx="1.5" fill="#6b3f1c"/><rect x="27.5" y="0" width="9" height="8" rx="2" fill="#2b2b2b"/><path d="M32 30 C20 28 16 36 19 42 C21 46 17 50 20 56 C24 63 40 63 44 56 C47 50 43 46 45 42 C48 36 44 28 32 30Z" fill="url(#wxa2)"/><path d="M26 40 C30 38 34 38 38 40" stroke="#fff" stroke-width="1.2" fill="none" opacity=".5"/><rect x="25" y="46" width="14" height="3" rx="1" fill="#222"/><circle cx="32" cy="53" r="2.3" fill="#ffd27a"/><path d="M30.8 8 V46 M33.2 8 V46" stroke="#e8e8e8" stroke-width=".5"/></g></svg>`,
  image: `<svg viewBox="0 0 64 64"><defs><linearGradient id="wxi1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6fe0"/><stop offset=".7" stop-color="#9cc8f5"/></linearGradient><radialGradient id="wxi2" cx=".45" cy=".2" r=".9"><stop offset="0" stop-color="#8ad04a"/><stop offset="1" stop-color="#2e7d17"/></radialGradient></defs><rect width="64" height="64" fill="url(#wxi1)"/><ellipse cx="18" cy="16" rx="11" ry="4" fill="#fff" opacity=".85"/><ellipse cx="44" cy="10" rx="8" ry="3" fill="#fff" opacity=".7"/><path d="M-6 64 C4 40 30 30 70 44 V64Z" fill="url(#wxi2)"/><path d="M40 64 C46 52 58 48 70 50 V64Z" fill="#3d8f1f"/></svg>`,
};
App.WELCOMES.xp = {
  css: `
.wl-xp { background: #5a7edc; color: #fff; font-family: Tahoma, 'Segoe UI', sans-serif; }
.wl-xp .wx-top, .wl-xp .wx-bot { position: absolute; left: 0; right: 0; height: 12.5%; background: linear-gradient(180deg, #00309c, #0b3aa8); z-index: 2; }
.wl-xp .wx-top { top: 0; }
.wl-xp .wx-top::after { content: ''; position: absolute; left: 0; right: 0; bottom: -2px; height: 2px; background: linear-gradient(90deg, rgba(255,255,255,0) 0%, #a7c3f5 20%, #fff 45%, #a7c3f5 70%, rgba(255,255,255,0) 100%); }
.wl-xp .wx-bot { bottom: 0; display: flex; align-items: center; padding: 0 5vw; gap: 2vw; }
.wl-xp .wx-bot::before { content: ''; position: absolute; left: 0; right: 0; top: -2px; height: 2px; background: linear-gradient(90deg, rgba(249,151,54,0) 0%, #f99736 35%, #f8a144 65%, rgba(249,151,54,0) 100%); }
.wl-xp .wx-mid { position: absolute; left: 0; right: 0; top: 12.5%; bottom: 12.5%; background: radial-gradient(ellipse 45% 70% at 8% 0%, rgba(255,255,255,.42), transparent 70%), linear-gradient(180deg, #6a8ee6, #5a7edc 40%, #5072d6); overflow: hidden; }
.wl-xp .wx-div { position: absolute; left: 50%; top: 9%; bottom: 9%; width: 1px; background: linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.9) 30%, rgba(255,255,255,.9) 70%, rgba(255,255,255,0)); }
.wl-xp .wx-left { position: absolute; right: calc(50% + 34px); top: 50%; transform: translateY(-50%); text-align: right; animation: wx-in .6s .1s both; }
.wl-xp .wx-brand { display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
.wl-xp .wx-brand h1 { margin: 0; font: 400 clamp(40px, 4vw, 60px)/1 'Franklin Gothic Medium', 'Trebuchet MS', Tahoma, sans-serif; letter-spacing: -.01em; text-shadow: 1px 2px 3px rgba(0,30,110,.45); }
.wl-xp .wx-brand h1 i { font-style: italic; color: #ffb64d; font-size: .62em; margin-left: 6px; vertical-align: super; }
.wl-xp .wx-brand svg { filter: drop-shadow(1px 2px 2px rgba(0,30,110,.4)); }
.wl-xp .wx-sub { margin: 10px 2px 0 0; font: 400 13px Tahoma, sans-serif; color: #dbe7ff; }
.wl-xp .wx-begin { margin: 34px 2px 0 0; font: 400 clamp(17px, 1.5vw, 22px) 'Franklin Gothic Medium', 'Trebuchet MS', Tahoma, sans-serif; color: #fff; }
.wl-xp .wx-users { position: absolute; left: calc(50% + 1px); right: 0; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 6px; animation: wx-in .6s .25s both; }
@keyframes wx-in { from { opacity: 0; } }
.wl-xp .wx-user { position: relative; display: flex; align-items: center; gap: 16px; padding: 10px 24px 10px 36px; border-radius: 0 12px 12px 0; width: min(560px, 46vw); }
.wl-xp .wx-user.wx-sel { background: linear-gradient(90deg, #2753c4, #3c66d4 60%, rgba(60,102,212,0)); }
.wl-xp .wx-pic { width: 58px; height: 58px; flex: none; border-radius: 6px; border: 2px solid #fff; overflow: hidden; box-shadow: 1px 1px 3px rgba(0,20,90,.5); transition: border-color .15s, box-shadow .15s; background: #fff; }
.wl-xp .wx-pic svg { display: block; width: 100%; height: 100%; }
.wl-xp .wx-user:hover .wx-pic, .wl-xp .wx-user.wx-sel .wx-pic { border-color: #ffc93c; box-shadow: 0 0 0 2px #f99736, 1px 1px 4px rgba(0,20,90,.6); }
.wl-xp .wx-name { font: 400 20px 'Franklin Gothic Medium', Tahoma, sans-serif; color: #fff; text-shadow: 1px 1px 2px rgba(0,20,90,.4); }
.wl-xp .wx-desc { font: 400 12px Tahoma, sans-serif; color: #dbe7ff; margin-top: 3px; }
.wl-xp .wx-pts { display: none; margin: 8px 0 0; padding: 0; list-style: none; font: 400 11.5px Tahoma, sans-serif; color: #e9f0ff; }
.wl-xp .wx-pts li { display: inline; } .wl-xp .wx-pts li + li::before { content: ' · '; color: #9cb8f2; }
.wl-xp .wx-user.wx-sel .wx-pts { display: block; }
.wl-xp .wx-go { position: absolute; right: 18px; top: 50%; width: 26px; height: 26px; margin-top: -13px; border-radius: 4px; background: linear-gradient(180deg, #59c44a, #2f9b26); border: 1px solid #fff; display: none; place-items: center; color: #fff; box-shadow: 1px 1px 2px rgba(0,20,90,.4); }
.wl-xp .wx-user.wx-sel .wx-go { display: grid; }
.wl-xp .wx-loading { display: none; font: 400 12px Tahoma; color: #fff; margin-top: 4px; }
.wl-xp .wx-user.wx-busy .wx-loading { display: block; } .wl-xp .wx-user.wx-busy .wx-pts, .wl-xp .wx-user.wx-busy .wx-go { display: none; }
.wl-xp .wx-off { display: flex; align-items: center; gap: 10px; background: none; border: 0; padding: 0; color: #fff; font: 400 14px 'Franklin Gothic Medium', Tahoma, sans-serif; }
.wl-xp .wx-off i { width: 30px; height: 30px; border-radius: 4px; background: linear-gradient(180deg, #f07254, #d1360f); border: 1px solid #fff; display: grid; place-items: center; box-shadow: 1px 1px 3px rgba(0,0,0,.35); }
.wl-xp .wx-off:hover i { background: linear-gradient(180deg, #ff8a6c, #e24a22); }
.wl-xp .wx-links { margin-left: auto; text-align: right; font: 400 12px Tahoma, sans-serif; color: #dbe7ff; line-height: 1.7; }
.wl-xp .wx-links button { background: none; border: 0; padding: 0; color: #fff; font: inherit; text-decoration: underline; text-decoration-color: rgba(255,255,255,.35); text-underline-offset: 2px; }
.wl-xp .wx-links button:hover { text-decoration-color: #fff; color: #ffe08a; }
.wl-xp .wx-links .wl-startup { font: 400 12px Tahoma; color: #dbe7ff; }
.wl-xp .wl-startup input { accent-color: #2f9b26; }
.wl-xp .wx-boot { position: absolute; inset: 0; z-index: 10; background: #000; display: grid; place-items: center; transition: opacity .35s; }
.wl-xp .wx-boot.wx-gone { opacity: 0; pointer-events: none; }
.wl-xp .wx-boot .wx-bl { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.wl-xp .wx-boot h2 { margin: 0; font: 400 42px 'Franklin Gothic Medium', 'Trebuchet MS', sans-serif; color: #fff; display: flex; align-items: center; gap: 14px; }
.wl-xp .wx-boot h2 i { font-style: italic; color: #ff8c1a; font-size: .66em; vertical-align: super; }
.wl-xp .wx-boot small { font: 400 12px Tahoma; color: #8b8b8b; margin-top: -2px; letter-spacing: .02em; }
.wl-xp .wx-bar { margin-top: 56px; width: 160px; height: 18px; border: 2px solid #b2b2b2; border-radius: 4px; padding: 2px; overflow: hidden; position: relative; }
.wl-xp .wx-bar b { position: absolute; top: 2px; width: 9px; height: 10px; border-radius: 2px; background: linear-gradient(180deg, #a6c8ff, #2f63e0 50%, #1c46b4); animation: wx-run 1.6s linear infinite; }
.wl-xp .wx-bar b:nth-child(2) { animation-delay: .1s; } .wl-xp .wx-bar b:nth-child(3) { animation-delay: .2s; }
@keyframes wx-run { from { left: -30px; } to { left: 170px; } }
.wl-xp .wx-bootfoot { position: absolute; left: 0; right: 0; bottom: 34px; text-align: center; font: 400 11px Tahoma; color: #7a7a7a; }
.wl-xp .wx-welcome { position: absolute; inset: 0; z-index: 9; display: none; align-items: center; background: radial-gradient(ellipse 45% 70% at 8% 0%, rgba(255,255,255,.42), transparent 70%), #5a7edc; }
.wl-xp .wx-welcome.wx-on { display: flex; animation: wx-in .25s both; }
.wl-xp .wx-welcome span { margin-left: 22vw; font: italic 400 clamp(60px, 7vw, 96px) 'Franklin Gothic Medium', 'Trebuchet MS', sans-serif; color: #fff; text-shadow: 2px 3px 6px rgba(0,30,110,.45); letter-spacing: -.01em; }
`,
  build(root, api) {
    const M = api.modes;
    const logo = api.logo(54, M.map(m => m.color));
    root.innerHTML = `
      <div class="wx-top"></div>
      <div class="wx-mid"><div class="wx-div"></div>
        <div class="wx-left"><div class="wx-brand">${logo}<h1>Strata Studio<i>xp</i></h1></div>
          <div class="wx-sub">${api.esc(api.tagline)}</div>
          <div class="wx-begin">To begin, click your editor</div></div>
        <div class="wx-users">${M.map((m, i) => `<div class="wx-user" data-pick="${m.id}" tabindex="0" role="button" aria-label="Open the ${m.name} editor"${api.tip(m.name + ' editor', m.tip, m.key)}>
          <div class="wx-pic">${PICS[m.id]}</div>
          <div><div class="wx-name">${m.name}</div><div class="wx-desc">${m.desc}</div><ul class="wx-pts">${m.pts.map(p => `<li>${p}</li>`).join('')}</ul><div class="wx-loading">Loading your personal settings…</div></div>
          <span class="wx-go">${api.icon('chevRight', 16, 3)}</span></div>`).join('')}</div>
      </div>
      <div class="wx-bot">
        <button class="wx-off" data-act="close"${api.tip('Continue', 'Close the welcome screen and go back to what you were doing.', 'Esc')}><i>${api.icon('x', 16, 3)}</i>Continue to Strata Studio</button>
        <div class="wx-links"><div>After you start, you can switch editors any time with Alt+1, Alt+2 and Alt+3.</div>
          <div>${api.actions.map(a => `<button data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${a.label}</button>`).join(' &nbsp;·&nbsp; ')} &nbsp;&nbsp;<span class="wx-su"></span></div></div>
      </div>
      <div class="wx-welcome"><span>welcome</span></div>
      <div class="wx-boot"><div class="wx-bl"><h2>${api.logo(46, M.map(m => m.color))}Strata Studio<i>xp</i></h2><small>Video · Audio · Image</small><div class="wx-bar"><b></b><b></b><b></b></div></div><div class="wx-bootfoot">Copyright © Strata Studio · works offline</div></div>`;
    root.querySelector('.wx-su').append(api.startup('Show at startup'));
    const users = [...root.querySelectorAll('.wx-user')], boot = root.querySelector('.wx-boot');
    let sel = -1;
    const select = i => { sel = i; users.forEach((u, k) => u.classList.toggle('wx-sel', k === i)); };
    users.forEach((u, i) => { u.addEventListener('pointerenter', () => select(i)); u.addEventListener('focus', () => select(i)); });
    const endBoot = () => boot.classList.add('wx-gone');
    if (api.reduce) endBoot(); else api.after(1700, endBoot);
    api.on(boot, 'pointerdown', endBoot);
    return {
      key(e) {
        if (!boot.classList.contains('wx-gone') && !['Escape', '1', '2', '3'].includes(e.key)) { endBoot(); return true; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const dn = e.key === 'ArrowDown'; const n = sel < 0 ? (dn ? 0 : 2) : (sel + (dn ? 1 : 2)) % 3; users[n].focus(); return true; }
        if (e.key === 'Enter' && sel >= 0 && document.activeElement === root) { api.choose(M[sel].id); return true; }
        return false;
      },
      leave(id) {
        endBoot();
        const i = M.findIndex(m => m.id === id);
        select(i); users[i].classList.add('wx-busy');
        api.after(380, () => root.querySelector('.wx-welcome').classList.add('wx-on'));
        return 1000;
      },
    };
  },
};
})();
