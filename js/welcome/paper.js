/* Welcome screen — Paper & Ink: the front page of "The Strata Times". Masthead, headline, three articles (one per
   editor) with engraved illustrations, and a row of classified ads for the other actions. Point at an article and a
   highlighter swipes its headline while a red pen circles it; click to open that editor. */
(() => {
const App = window.App;
const H = '#2a2118';
const ART = {
  // line "engravings" with cross-hatching
  video: `<svg viewBox="0 0 200 120" aria-hidden="true"><g fill="none" stroke="${H}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="70" cy="28" r="20" fill="url(#wpHatch)"/><circle cx="70" cy="28" r="5"/><circle cx="116" cy="30" r="18" fill="url(#wpHatch)"/><circle cx="116" cy="30" r="4.5"/>
    <path d="M70 8v40M50 28h40M56 14l28 28M84 14L56 42M116 12v36M98 30h36"/>
    <rect x="52" y="48" width="84" height="40" rx="4" fill="url(#wpHatch2)"/><path d="M136 58l26-8v36l-26-8z"/><circle cx="68" cy="68" r="7"/><path d="M84 60h40M84 68h30"/>
    <path d="M94 88l-26 30M94 88l26 30M94 88v30"/></g></svg>`,
  audio: `<svg viewBox="0 0 200 120" aria-hidden="true"><g fill="none" stroke="${H}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="80" y="6" width="40" height="60" rx="20" fill="url(#wpHatch2)"/><path d="M84 22h32M82 32h36M82 42h36M84 52h32"/><path d="M100 6v60"/>
    <path d="M70 40v6a30 30 0 0 0 60 0v-6"/><path d="M100 76v24M78 104h44M74 112h52"/>
    <path d="M40 30c-8 10-8 26 0 36M28 22c-14 16-14 36 0 52M160 30c8 10 8 26 0 36M172 22c14 16 14 36 0 52"/></g></svg>`,
  image: `<svg viewBox="0 0 200 120" aria-hidden="true"><g fill="none" stroke="${H}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M66 112l20-104M134 112L114 8M100 8v104M60 92h80"/>
    <rect x="56" y="20" width="88" height="60" fill="#fffdf6"/><path d="M56 70l22-22 16 14 18-24 32 32" fill="url(#wpHatch)"/><circle cx="124" cy="36" r="7" fill="url(#wpHatch2)"/>
    <path d="M150 96c-8-6-4-18 8-18s20 6 18 14-10 6-14 8-8 2-12-4z"/><circle cx="160" cy="86" r="2.5"/><circle cx="168" cy="88" r="2.5"/><path d="M30 116l24-28"/><path d="M52 90l6-6"/></g></svg>`,
};
App.WELCOMES.paper = {
  css: `
.wl-paper { color: ${H}; font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif; background: #e4dac4; display: flex; overflow: auto; }
.wl-paper .wp-page { position: relative; width: min(1180px, 96vw); margin: auto; flex: none; padding: 22px clamp(18px, 3vw, 40px) 18px; background: #f6f0e2; box-shadow: 0 1px 1px rgba(60,40,10,.15), 0 18px 50px -10px rgba(60,40,10,.4); animation: wp-spin .9s cubic-bezier(.2,.8,.2,1) both; }
@keyframes wp-spin { from { opacity: 0; transform: rotate(-200deg) scale(.15); } 70% { opacity: 1; } }
.wl-paper .wp-page::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .5; mix-blend-mode: multiply; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .55  0 0 0 0 .45  0 0 0 0 .3  0 0 0 .22 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"), radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(140,100,40,.25)); }
.wl-paper .wp-ring { position: absolute; right: 7%; bottom: 9%; width: 120px; height: 120px; border-radius: 50%; pointer-events: none; box-shadow: inset 0 0 0 5px rgba(120,70,20,.16), inset 0 0 0 9px rgba(120,70,20,.05), 0 0 0 2px rgba(120,70,20,.08); transform: rotate(20deg) scaleX(1.05); }
.wl-paper .wp-strap { display: flex; justify-content: space-between; gap: 14px; font: 700 10.5px Georgia, serif; letter-spacing: .14em; text-transform: uppercase; border-bottom: 1px solid ${H}; padding-bottom: 6px; }
.wl-paper .wp-mast { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px; padding: 8px 0 6px; }
.wl-paper .wp-mast h1 { margin: 0; text-align: center; font: 900 clamp(46px, 6.4vw, 96px)/1 'Playfair Display', Georgia, serif; letter-spacing: -.01em; white-space: nowrap; }
.wl-paper .wp-ear { font: 400 11.5px/1.4 Georgia, serif; border: 1px solid ${H}; padding: 6px 9px; max-width: 190px; }
.wl-paper .wp-ear b { display: block; font: 700 10px Georgia; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 2px; }
.wl-paper .wp-ear.wp-r { justify-self: end; text-align: right; }
.wl-paper .wp-rule { border-top: 3px solid ${H}; border-bottom: 1px solid ${H}; height: 6px; margin: 2px 0 10px; }
.wl-paper .wp-motto { text-align: center; font: italic 400 13px Georgia, serif; margin: -4px 0 8px; letter-spacing: .02em; }
.wl-paper .wp-head { text-align: center; margin: 4px 0 4px; font: 800 clamp(28px, 3.6vw, 52px)/1.02 'Playfair Display', Georgia, serif; letter-spacing: -.01em; text-transform: uppercase; }
.wl-paper .wp-deck { text-align: center; font: italic 400 clamp(14px, 1.25vw, 18px)/1.4 Georgia, serif; margin: 6px auto 14px; max-width: 760px; }
.wl-paper .wp-cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid ${H}; }
.wl-paper .wp-art { position: relative; text-align: left; padding: 12px 18px 10px; border: 0; background: none; color: inherit; font: inherit; }
.wl-paper .wp-art + .wp-art { border-left: 1px solid rgba(42,33,24,.55); }
.wl-paper .wp-kick { font: 700 10.5px Georgia, serif; letter-spacing: .18em; text-transform: uppercase; color: var(--c); }
.wl-paper .wp-art h2 { position: relative; display: inline; margin: 0; font: 800 clamp(19px, 1.7vw, 26px)/1.15 'Playfair Display', Georgia, serif; background-image: linear-gradient(transparent 52%, rgba(255,226,77,.85) 52%, rgba(255,226,77,.85) 88%, transparent 88%); background-size: 0% 100%; background-repeat: no-repeat; transition: background-size .5s cubic-bezier(.3,.8,.3,1); }
.wl-paper .wp-art:hover h2, .wl-paper .wp-art:focus-visible h2 { background-size: 100% 100%; }
.wl-paper .wp-art:focus-visible { outline: 1px dashed ${H}; outline-offset: -4px; }
.wl-paper .wp-hl { margin: 4px 0 8px; display: block; }
.wl-paper .wp-art svg { display: block; width: 100%; height: clamp(70px, 11vh, 120px); margin: 6px 0 8px; }
.wl-paper .wp-art p { margin: 0 0 8px; font: 400 13.5px/1.5 Georgia, serif; text-align: justify; hyphens: auto; }
.wl-paper .wp-art p::first-letter { float: left; font: 800 3.1em/.82 'Playfair Display', Georgia, serif; margin: 4px 6px 0 0; color: var(--c); }
.wl-paper .wp-brief { margin: 6px 0 8px; padding: 6px 0 0; border-top: 1px dotted rgba(42,33,24,.6); font: 400 12.5px/1.45 Georgia; list-style: none; }
.wl-paper .wp-brief li::before { content: '■ '; font-size: 8px; vertical-align: 2px; color: var(--c); }
.wl-paper .wp-cont { font: italic 400 12.5px Georgia; color: var(--c); }
.wl-paper .wp-cont b { font-style: normal; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
.wl-paper .wp-circle { position: absolute; left: 6px; top: 22px; width: calc(100% - 12px); height: 64px; pointer-events: none; overflow: visible; }
.wl-paper .wp-circle path { fill: none; stroke: #c4291f; stroke-width: 2.4; stroke-linecap: round; stroke-dasharray: 900; stroke-dashoffset: 900; opacity: .85; }
.wl-paper .wp-art:hover .wp-circle path, .wl-paper .wp-art:focus-visible .wp-circle path { animation: wp-draw .7s .15s ease-out forwards; }
@keyframes wp-draw { to { stroke-dashoffset: 0; } }
.wl-paper .wp-stamp { position: absolute; right: 18px; top: 40%; padding: 2px 12px; border: 3px solid #c4291f; border-radius: 4px; font: 400 34px 'Bebas Neue', sans-serif; letter-spacing: .12em; color: #c4291f; transform: rotate(-12deg) scale(1.6); opacity: 0; mix-blend-mode: multiply; pointer-events: none; }
.wl-paper .wp-art.wp-go .wp-stamp { animation: wp-stamp .3s cubic-bezier(.3,1.6,.5,1) forwards; }
@keyframes wp-stamp { to { opacity: .9; transform: rotate(-12deg) scale(1); } }
.wl-paper .wp-class { margin-top: 10px; border-top: 3px double ${H}; padding-top: 6px; }
.wl-paper .wp-class h3 { margin: 0 0 6px; text-align: center; font: 700 11px Georgia; letter-spacing: .3em; text-transform: uppercase; }
.wl-paper .wp-ads { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)) 1.25fr; gap: 8px; }
.wl-paper .wp-ad { text-align: left; border: 1px solid ${H}; background: none; padding: 6px 9px 7px; font: 400 12px/1.35 Georgia, serif; color: inherit; transition: background .2s; }
.wl-paper .wp-ad b { display: block; font: 800 13px 'Playfair Display', Georgia; text-transform: uppercase; letter-spacing: .04em; }
.wl-paper .wp-ad kbd { font: 700 10.5px 'JetBrains Mono', monospace; }
.wl-paper .wp-ad:hover { background: rgba(255,226,77,.5); }
.wl-paper .wp-ad.wp-sub { display: flex; flex-direction: column; gap: 6px; }
.wl-paper .wp-ad.wp-sub button { align-self: flex-start; border: 1px solid ${H}; background: ${H}; color: #f6f0e2; font: 700 11.5px Georgia; padding: 4px 12px; letter-spacing: .06em; }
.wl-paper .wp-ad.wp-sub button:hover { background: #c4291f; border-color: #c4291f; }
.wl-paper .wl-startup { font: 400 12px Georgia; } .wl-paper .wl-startup input { accent-color: ${H}; }
@media (max-height: 820px) {
  .wl-paper .wp-page { padding-top: 14px; padding-bottom: 12px; }
  .wl-paper .wp-mast h1 { font-size: clamp(40px, 5.2vw, 72px); }
  .wl-paper .wp-head { font-size: clamp(24px, 2.8vw, 40px); }
  .wl-paper .wp-deck { margin-bottom: 8px; }
  .wl-paper .wp-art svg { height: 64px; margin: 4px 0 6px; }
  .wl-paper .wp-art p { font-size: 12.5px; line-height: 1.42; }
  .wl-paper .wp-brief { display: none; }
  .wl-paper .wp-ear, .wl-paper .wp-motto { font-size: 11px; }
}
@media (max-width: 860px) { .wl-paper .wp-ear { display: none; } .wl-paper .wp-ads { grid-template-columns: 1fr 1fr; } }
`,
  build(root, api) {
    const M = api.modes;
    const d = new Date(), DATE = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const STORY = {
      video: 'Local editors report that cutting, layering and animating footage has never been simpler. The new multitrack timeline handles ripple and slip edits, keyframes, titles and even automatic captions — and it exports straight to MP4.',
      audio: 'Musicians and podcasters alike are recording, cleaning and mastering sound without leaving their desks. Noise reduction, an equalizer and some twenty-five effects stand ready, and loudness is measured the way broadcasters do it.',
      image: 'Photographers have found a darkroom in their computer: layers, masks and selections, a healing brush, Camera Raw and more than seventy filters. Painters, meanwhile, report that the brushes feel "just like MS Paint, only better".',
    };
    const HEAD = { video: 'Footage Tamed On Multitrack Timeline', audio: 'Studio Sound Comes Home', image: 'Darkroom Opens Its Doors To All' };
    const KICK = { video: 'The Video Desk', audio: 'Arts & Sound', image: 'Pictures' };
    const circle = `<svg class="wp-circle" viewBox="0 0 300 64" preserveAspectRatio="none"><path d="M18 34 C 20 8, 140 2, 250 8 S 300 40, 260 54 S 60 66, 22 50 C 6 42, 10 22, 40 14"/></svg>`;
    root.innerHTML = `
      <svg width="0" height="0" style="position:absolute"><defs>
        <pattern id="wpHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="${H}" stroke-width="1"/></pattern>
        <pattern id="wpHatch2" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><line x1="0" y1="0" x2="0" y2="4" stroke="${H}" stroke-width=".8"/></pattern></defs></svg>
      <div class="wp-page">
        <div class="wp-ring"></div>
        <div class="wp-strap"><span>Vol. I · No. 1</span><span>${DATE}</span><span>Price: Free · Works offline</span></div>
        <div class="wp-mast">
          <div class="wp-ear"><b>Today's forecast</b>100% offline with light autosaves. Your files stay on this computer.</div>
          <h1>The Strata Times</h1>
          <div class="wp-ear wp-r"><b>Late edition</b>Press <b style="display:inline">1</b>, <b style="display:inline">2</b> or <b style="display:inline">3</b> to open an editor. Esc to fold the paper.</div>
        </div>
        <div class="wp-rule"></div>
        <div class="wp-motto">“All the edits fit to print”</div>
        <div class="wp-head">Three Studios Open Under One Roof</div>
        <div class="wp-deck">${api.esc(api.tagline)} Readers may begin with any one of them.</div>
        <div class="wp-cols">${M.map(m => `<button class="wp-art" data-pick="${m.id}" aria-label="Open the ${m.name} editor" style="--c:${m.color}"${api.tip(m.name + ' editor', m.tip, m.key)}>
          ${circle}<div class="wp-kick">${KICK[m.id]}</div><span class="wp-hl"><h2>${HEAD[m.id]}</h2></span>${ART[m.id]}<p>${STORY[m.id]}</p>
          <ul class="wp-brief">${m.pts.map(p => `<li>${p}</li>`).join('')}</ul>
          <div class="wp-cont">Continued in the <b>${m.name} editor</b> <span style="white-space:nowrap">— press ${m.key} ▸</span></div><div class="wp-stamp">Extra!</div></button>`).join('')}</div>
        <div class="wp-class"><h3>— Classifieds —</h3><div class="wp-ads">
          <button class="wp-ad" data-act="open"${api.tip('Open project', api.actions[0].tip)}><b>Wanted</b>Your earlier projects. Bring back any .strata file — Open project…</button>
          <button class="wp-ad" data-act="palette"${api.tip('Command palette', api.actions[1].tip, 'Ctrl+K')}><b>For hire</b>Tireless assistant finds any command by name. Call <kbd>Ctrl K</kbd>.</button>
          <button class="wp-ad" data-act="shortcuts"${api.tip('Shortcuts', api.actions[2].tip, '?')}><b>Lost &amp; found</b>Every keyboard shortcut, in one list. Press <kbd>?</kbd></button>
          <button class="wp-ad" data-act="prefs"${api.tip('Preferences', api.actions[3].tip, 'Ctrl+,')}><b>Redecorate</b>Fifteen themes, sounds and fonts. See Preferences, <kbd>Ctrl ,</kbd></button>
          <button class="wp-ad" data-act="convert"${api.tip('Convert files', api.actions[4].tip, 'Alt+4')}><b>Exchange</b>Any file traded for any format, no loss. MKV for MP4, FLAC for WAV. <kbd>Alt 4</kbd></button>
          <div class="wp-ad wp-sub"><b>Subscriptions</b><span class="wp-su"></span><button data-act="close"${api.tip('Continue', 'Fold the paper: close the welcome screen and keep working.', 'Esc')}>Fold the paper · Esc</button></div>
        </div></div>
      </div>`;
    root.querySelector('.wp-su').append(api.startup('Deliver this paper at every start'));
    const arts = [...root.querySelectorAll('.wp-art')];
    return {
      key(e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const cur = arts.indexOf(document.activeElement); arts[cur < 0 ? 0 : (cur + (e.key === 'ArrowRight' ? 1 : 2)) % 3].focus(); return true; }
        return false;
      },
      leave(id) { arts[M.findIndex(m => m.id === id)].classList.add('wp-go'); return 480; },
    };
  },
};
})();
