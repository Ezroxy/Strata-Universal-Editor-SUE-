/* Welcome screen — Windows XP Dreamcore: the XP desktop from a dream. Clouds drift over the endless green hill,
   ghostly 3D windows float in the sky, and a giant striped dialog asks what you want to make today
   ("Video." "Audio." "Image."). A second little dialog asks the important question ("No." continues to Strata),
   and an XP taskbar along the bottom holds the usual links and the "Show at startup" switch. */
(() => {
const App = window.App;
const ext = (n, a = '#1546e0', b = '#b4cbff', edge = '#0a2a9e') => Array.from({ length: n }, (_, i) => `${i + 1}px ${i + 1}px 0 ${Math.floor(i / 2) % 2 ? b : a}`).concat(`${n + 1}px ${n + 1}px 0 ${edge}`).join(', ');
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .42 0 0 0 0 .37 0 0 0 0 .26 0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")`;
const CAP = 'linear-gradient(180deg, #8fc0ff 0%, #3d86ff 10%, #1a5cf0 45%, #1150e8 70%, #2f74ff 92%, #0b3bc4 100%)';
const icon = id => { const s = App.xp && App.xp.icons[id]; return s ? `<img src="data:image/svg+xml,${encodeURIComponent(s)}" width="40" height="40" alt="">` : ''; };
App.WELCOMES.xp = {
  css: `
.wl-xp { background: linear-gradient(180deg, #0638c9 0%, #2f7cf2 42%, #8cc4ff 70%, #e6f4ff 90%); color: #000; font-family: Tahoma, 'Segoe UI', sans-serif; perspective: 1400px; }
.wl-xp .wd-sky { position: absolute; inset: 0; background: radial-gradient(ellipse 55% 45% at 20% 6%, rgba(255,255,255,.4), transparent 70%); }
.wl-xp .wd-clouds { position: absolute; left: 0; right: 0; top: 0; bottom: 33%; overflow: hidden; }
.wl-xp .wd-track { position: absolute; top: 2%; left: 0; width: 200%; height: 100%; background-repeat: repeat-x; background-size: 50% auto; animation: wd-drift 240s linear infinite; }
@keyframes wd-drift { to { transform: translateX(-50%); } }
.wl-xp .wd-hill { position: absolute; inset: 0; background: center bottom / cover no-repeat; }
.wl-xp .wd-haze { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 38% at 50% 60%, rgba(255,255,236,.25), transparent 70%), radial-gradient(ellipse at center, transparent 55%, rgba(20,40,120,.32)); pointer-events: none; }
/* ghost windows far away in the sky */
.wl-xp .wd-ghost { position: absolute; border: 5px solid #1747e6; border-top-width: 24px; border-radius: 9px 9px 2px 2px; background: ${GRAIN}, #efe9d4; box-shadow: ${ext(14)}; opacity: .55; filter: blur(1.2px) saturate(1.1); animation: wd-float 9s ease-in-out infinite; }
.wl-xp .wd-ghost::before { content: ''; position: absolute; left: -5px; right: -5px; top: -24px; height: 24px; border-radius: 8px 8px 0 0; background: ${CAP}; }
.wl-xp .wd-g1 { left: -4vw; top: 8vh; width: 30vw; height: 22vh; transform: rotateY(18deg) rotateX(6deg); animation-delay: -2s; }
.wl-xp .wd-g2 { right: -6vw; top: 4vh; width: 34vw; height: 26vh; transform: rotateY(-20deg) rotateX(4deg); animation-delay: -5s; opacity: .45; }
.wl-xp .wd-g3 { right: 12vw; top: 46vh; width: 16vw; height: 12vh; transform: rotateY(-12deg); animation-delay: -1s; opacity: .4; filter: blur(2px); }
@keyframes wd-float { 50% { translate: 0 -10px; } }
/* the big dialog */
.wl-xp .wd-stage { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); width: min(760px, 88vw); transform-style: preserve-3d; }
.wl-xp .wd-win { position: relative; border: 7px solid #1747e6; border-top-width: 0; border-radius: 12px 12px 3px 3px; background: ${GRAIN}, #efe9d4; box-shadow: ${ext(28)}, 44px 56px 40px rgba(0,30,90,.35); animation: wd-rise .9s cubic-bezier(.2,1.4,.4,1) both, wd-bob 7s 1s ease-in-out infinite; }
@keyframes wd-rise { from { transform: translateY(60vh) rotateX(24deg) scale(.86); opacity: 0; } }
@keyframes wd-bob { 50% { transform: translateY(-8px); } }
.wl-xp .wd-cap { display: flex; align-items: center; gap: 8px; height: 40px; margin: 0 -7px; padding: 0 9px 0 12px; border-radius: 11px 11px 0 0; background: ${CAP}; color: #fff; font: 700 18px 'Trebuchet MS', Tahoma, sans-serif; text-shadow: 1px 1px 0 #0a1b6b; }
.wl-xp .wd-cap img { width: 22px; height: 22px; }
.wl-xp .wd-cap span { flex: 1; }
.wl-xp .wd-x { width: 30px; height: 30px; border: 1.5px solid #fff; border-radius: 5px; background: linear-gradient(180deg, #f09c7c, #e0582c 50%, #c3401a); display: grid; place-items: center; color: #fff; padding: 0; box-shadow: inset 0 1px 0 rgba(255,255,255,.4); }
.wl-xp .wd-x:hover { filter: brightness(1.15); }
.wl-xp .wd-body { padding: clamp(18px, 3.4vh, 34px) clamp(18px, 3vw, 40px) clamp(20px, 3.6vh, 36px); text-align: center; }
.wl-xp .wd-q { margin: 0; font: 400 clamp(22px, 2.4vw, 34px)/1.2 Tahoma, 'Segoe UI', sans-serif; color: #111; letter-spacing: -.01em; }
.wl-xp .wd-sub { margin: 8px 0 0; font: 400 13px Tahoma, sans-serif; color: #4a4636; }
.wl-xp .wd-picks { display: flex; justify-content: center; gap: clamp(10px, 1.6vw, 22px); margin-top: clamp(18px, 3.4vh, 30px); }
.wl-xp .wd-pick { flex: 1 1 0; max-width: 210px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 10px 12px; border: 2px solid #003c74; border-radius: 5px; color: #000;
  background: linear-gradient(180deg, #ffffff 0%, #fcfcfb 20%, #f3f2ec 70%, #e3e1d6 92%, #d6d2c5 100%); box-shadow: 4px 4px 0 #0d34b8, 5px 5px 0 #b4cbff, 6px 6px 0 #0d34b8; transition: transform .12s, box-shadow .12s; }
.wl-xp .wd-pick b { font: 400 22px Tahoma, sans-serif; }
.wl-xp .wd-pick small { font: 400 11px/1.35 Tahoma, sans-serif; color: #4a4636; }
.wl-xp .wd-pick:hover, .wl-xp .wd-pick:focus-visible { box-shadow: inset 1px 1px 0 #fff0cf, inset -1px -1px 0 #f9b84f, inset 2px 2px 0 #fdd889, inset -2px -2px 0 #f6a926, 4px 4px 0 #0d34b8, 5px 5px 0 #b4cbff, 6px 6px 0 #0d34b8; outline: none; }
.wl-xp .wd-pick:active, .wl-xp .wd-pick.wd-down { transform: translate(4px, 4px); box-shadow: 1px 1px 0 #0d34b8, 2px 2px 0 #b4cbff; }
/* the little question */
.wl-xp .wd-ask { position: absolute; right: -4%; bottom: -24%; width: min(340px, 60vw); border: 5px solid #1747e6; border-top-width: 0; border-radius: 9px 9px 2px 2px; background: ${GRAIN}, #efe9d4; box-shadow: ${ext(14)}; animation: wd-rise .9s .35s cubic-bezier(.2,1.4,.4,1) both, wd-bob 6s 1.4s ease-in-out infinite reverse; z-index: 2; }
.wl-xp .wd-ask .wd-cap { height: 28px; margin: 0 -5px; font-size: 13px; border-radius: 8px 8px 0 0; }
.wl-xp .wd-ask p { margin: 14px 16px 10px; font: 400 13px Tahoma, sans-serif; text-align: center; }
.wl-xp .wd-no { display: block; margin: 0 auto 14px; min-width: 78px; height: 26px; border: 2px solid #003c74; border-radius: 3px; font: 400 13px Tahoma, sans-serif; color: #000;
  background: linear-gradient(180deg, #ffffff 0%, #f3f2ec 70%, #d6d2c5 100%); box-shadow: inset 0 0 0 1px #cee7ff, 2px 2px 0 #0d34b8; }
.wl-xp .wd-no:hover { box-shadow: inset 1px 1px 0 #fff0cf, inset -1px -1px 0 #f9b84f, inset 2px 2px 0 #fdd889, inset -2px -2px 0 #f6a926, 2px 2px 0 #0d34b8; }
/* taskbar */
.wl-xp .wd-task { position: absolute; left: 0; right: 0; bottom: 0; height: 34px; display: flex; align-items: center; color: #fff; font: 11px Tahoma, sans-serif; z-index: 3;
  background: linear-gradient(180deg, #1f2f86 0%, #3165c4 3%, #3682e5 6%, #4490e6 10%, #3883e5 12%, #2b71e0 15%, #2663da 18%, #235bd6 20%, #2258d5 23%, #2157d6 38%, #245ddb 54%, #2562df 86%, #245fdc 89%, #2158d4 92%, #1d4ec0 95%, #1941a5 98%);
  box-shadow: 0 -2px 0 #0a2a9e, 0 -4px 0 #b4cbff, 0 -6px 0 #1546e0, 0 -8px 0 #b4cbff, 0 -10px 0 #0a2a9e; }
.wl-xp .wd-start { height: 34px; display: flex; align-items: center; gap: 5px; padding: 0 24px 0 9px; border-radius: 0 15px 15px 0; color: #fff; border: 0; font: italic 700 21px/1 'Franklin Gothic Medium', 'Trebuchet MS', Tahoma, sans-serif; text-shadow: 1px 1px 2px rgba(10,50,10,.85);
  background: linear-gradient(180deg, #2f8a2f 0%, #63c35f 5%, #44a843 14%, #3a9d39 50%, #33922f 78%, #2a842a 92%, #1d6b1d 100%); box-shadow: inset 0 1px 1px rgba(255,255,255,.55), inset -4px 0 6px -3px rgba(0,0,0,.55); }
.wl-xp .wd-start:hover { filter: brightness(1.1); }
.wl-xp .wd-links { display: flex; gap: 3px; padding: 0 6px; flex: 1; min-width: 0; overflow: hidden; }
.wl-xp .wd-links button { height: 26px; padding: 0 12px; border-radius: 3px; border: 1px solid #1a49b4; color: #fff; font: 11px Tahoma, sans-serif; white-space: nowrap;
  background: linear-gradient(180deg, #4e98f6 0%, #3c87f2 10%, #3a83f0 55%, #2f74e8 100%); box-shadow: inset 1px 1px 0 rgba(255,255,255,.4); }
.wl-xp .wd-links button:hover { background: linear-gradient(180deg, #6eb0ff, #4f97fb 55%, #4084f2); }
.wl-xp .wd-tray { height: 34px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border-left: 1px solid #1042af;
  background: linear-gradient(180deg, #0c59b9 1%, #139ee9 6%, #18b5f2 10%, #139beb 14%, #1290e8 19%, #0d8dea 63%, #0d9ff1 81%, #0f9eed 88%, #119be9 91%, #1392e2 94%, #137ed7 97%, #095bc9 100%); }
.wl-xp .wl-startup { color: #fff; font: 11px Tahoma, sans-serif; }
.wl-xp .wd-hint { position: absolute; left: 0; right: 0; bottom: 48px; text-align: center; font: 12px Tahoma, sans-serif; color: rgba(255,255,255,.92); text-shadow: 1px 1px 2px rgba(0,30,80,.6); z-index: 3; }
/* leaving: the dialog rushes past you */
.wl-xp.wd-leave .wd-win { animation: wd-go .6s cubic-bezier(.5,0,.8,.4) forwards; }
.wl-xp.wd-leave .wd-ask { animation: wd-go .5s cubic-bezier(.5,0,.8,.4) forwards; }
@keyframes wd-go { to { transform: translateZ(500px) scale(1.25); opacity: 0; } }
@media (max-height: 640px) { .wl-xp .wd-ask { display: none; } .wl-xp .wd-pick small { display: none; } }
`,
  build(root, api) {
    const M = api.modes;
    const walls = App.xp ? App.xp.walls() : null;
    root.innerHTML = `
      <div class="wd-sky"></div>
      <div class="wd-clouds"><div class="wd-track"${walls ? ` style="background-image:url(${walls.clouds})"` : ''}></div></div>
      <div class="wd-ghost wd-g1"></div><div class="wd-ghost wd-g2"></div><div class="wd-ghost wd-g3"></div>
      <div class="wd-hill"${walls ? ` style="background-image:url(${walls.hill})"` : ''}></div>
      <div class="wd-haze"></div>
      <div class="wd-stage">
        <div class="wd-win" role="dialog" aria-label="Strata Studio">
          <div class="wd-cap">${icon('computer').replace('width="40" height="40"', 'width="22" height="22"')}<span>Strata Studio</span>
            <button class="wd-x" data-act="close" aria-label="Close"${api.tip('Close', 'Go straight to Strata without picking an editor.', 'Esc')}>${api.icon('x', 15, 3.2)}</button></div>
          <div class="wd-body">
            <p class="wd-q">What do you want to make today?</p>
            <p class="wd-sub">${api.esc(api.tagline)}</p>
            <div class="wd-picks">${M.map(m => `<button class="wd-pick" data-pick="${m.id}" aria-label="Open the ${m.name} editor"${api.tip(m.name + ' editor', m.tip, m.key)}>${icon(m.id)}<b>${m.name}.</b><small>${api.esc(m.desc)}</small></button>`).join('')}</div>
          </div>
        </div>
        <div class="wd-ask" role="dialog" aria-label="Question">
          <div class="wd-cap"><span>Strata Studio</span></div>
          <p>Are you sure you want to waste your life away?</p>
          <button class="wd-no" data-act="close"${api.tip('No.', 'Close the welcome screen and carry on where you left off.', 'Esc')}>No.</button>
        </div>
      </div>
      <div class="wd-hint">Press 1, 2 or 3 to open an editor · Alt+1, Alt+2 and Alt+3 switch editors any time</div>
      <div class="wd-task">
        <button class="wd-start" data-act="palette"${api.tip('start', 'Opens the command palette — find and run any command by typing its name.', 'Ctrl+K')}>${App.xp ? `<img src="data:image/svg+xml,${encodeURIComponent(App.xp.flag)}" width="22" height="22" alt="">` : ''}start</button>
        <div class="wd-links">${api.actions.map(a => `<button data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${a.label}</button>`).join('')}</div>
        <div class="wd-tray"></div>
      </div>`;
    root.querySelector('.wd-tray').append(api.startup('Show at startup'));
    const picks = [...root.querySelectorAll('.wd-pick')];
    if (api.reduce) root.querySelectorAll('.wd-win, .wd-ask, .wd-ghost, .wd-track').forEach(e => { e.style.animation = 'none'; });
    return {
      key(e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const i = picks.indexOf(document.activeElement), n = i < 0 ? 0 : (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
          picks[n].focus(); return true;
        }
        return false;
      },
      leave(id) {
        const b = root.querySelector(`.wd-pick[data-pick="${id}"]`);
        if (b) b.classList.add('wd-down');
        if (api.reduce) return 200;
        api.after(140, () => root.classList.add('wd-leave'));
        return 760;
      },
    };
  },
};
})();
