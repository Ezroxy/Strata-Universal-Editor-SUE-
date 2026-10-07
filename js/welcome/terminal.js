/* Welcome screen — Terminal: a green-phosphor CRT boots Strata Studio. A boot log checks each engine, the name is
   drawn in ANSI-Shadow block letters, then a menu waits for ↑ / ↓ and Enter (or 1 2 3). Any key skips the boot. */
(() => {
const App = window.App;
App.WELCOMES.terminal = {
  css: `
.wl-terminal { background: #000; color: #4dff7c; font: 500 14px/1.65 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace; }
.wl-terminal .wt-tube { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, #03200c 0%, #010a03 70%, #000 100%); border-radius: 18px / 22px; box-shadow: inset 0 0 120px 40px rgba(0,0,0,.85), inset 0 0 18px rgba(77,255,124,.18); overflow: hidden; }
.wl-terminal .wt-scr { position: absolute; inset: 0 0 38px 0; overflow: hidden; padding: 5vh max(5vw, calc(50vw - 540px)) 0; text-shadow: 0 0 6px rgba(77,255,124,.55), 0 0 1px rgba(200,255,210,.9); }
.wl-terminal[data-fx="on"] .wt-scr { animation: wt-flicker 4.5s infinite steps(1); }
@keyframes wt-flicker { 0%, 100% { opacity: 1; } 31% { opacity: .96; } 32% { opacity: 1; } 77% { opacity: .97; } 78% { opacity: 1; } }
.wl-terminal .wt-ln { white-space: pre; min-height: 1.65em; }
.wl-terminal .wt-dim { color: #1f9c43; text-shadow: 0 0 4px rgba(31,156,67,.4); } .wl-terminal .wt-ok { color: #b8ff3a; } .wl-terminal .wt-hi { color: #d6ffe0; font-weight: 700; } .wl-terminal .wt-acc { color: #3affd0; }
.wl-terminal .wt-cur { display: inline-block; width: .6em; height: 1.15em; vertical-align: -.2em; background: #8dffad; box-shadow: 0 0 8px #4dff7c; animation: wt-blink 1.05s steps(1) infinite; }
@keyframes wt-blink { 50% { opacity: 0; } }
.wl-terminal .wt-logo { display: inline-block; margin: 10px 0 2px; font: 600 clamp(11px, 1.12vw, 17px)/1.05 'Cascadia Mono', 'JetBrains Mono', Consolas, monospace; white-space: pre; color: #6dff93; text-shadow: 0 0 10px rgba(77,255,124,.75), 0 0 28px rgba(77,255,124,.35); }
.wl-terminal .wt-logo .wt-row { display: block; animation: wt-in .3s both; }
@keyframes wt-in { from { opacity: 0; transform: translateX(-10px); } }
.wl-terminal .wt-sub { letter-spacing: .5em; color: #8dffad; }
.wl-terminal .wt-menu { margin: 8px 0 0; }
.wl-terminal .wt-it { display: flex; border-radius: 2px; padding: 1px 0; }
.wl-terminal .wt-it .wt-pt { width: 3ch; color: transparent; text-shadow: none; }
.wl-terminal .wt-it .wt-k { width: 5ch; color: #1f9c43; }
.wl-terminal .wt-it .wt-nm { width: 9ch; font-weight: 700; }
.wl-terminal .wt-it .wt-ds { color: #26ad4c; }
.wl-terminal .wt-it.wt-on { background: #4dff7c; color: #001a07; text-shadow: none; box-shadow: 0 0 18px rgba(77,255,124,.45); }
.wl-terminal .wt-it.wt-on > * { color: #001a07 !important; }
.wl-terminal .wt-det { margin: 10px 0 0 3ch; border-left: 2px solid #4dff7c; padding: 2px 0 2px 2ch; min-height: 7.6em; }
.wl-terminal .wt-det .wt-ln { color: #3ee06a; }
.wl-terminal .wt-hidden { display: none; }
.wl-terminal .wt-status { position: absolute; left: 0; right: 0; bottom: 0; height: 38px; display: flex; align-items: stretch; font: 600 12px/38px 'JetBrains Mono', monospace; background: #021006; border-top: 1px solid rgba(77,255,124,.35); text-shadow: 0 0 5px rgba(77,255,124,.45); z-index: 3; }
.wl-terminal .wt-seg { padding: 0 14px; color: #3ee06a; white-space: nowrap; border: 0; background: none; font: inherit; }
.wl-terminal .wt-seg.wt-hd { background: #4dff7c; color: #001a07; font-weight: 800; letter-spacing: .08em; text-shadow: none; }
.wl-terminal .wt-seg.wt-md { background: #0a2e15; color: #b8ff3a; font-weight: 800; }
.wl-terminal .wt-seg .wt-kb { color: #d6ffe0; }
.wl-terminal button.wt-seg:hover, .wl-terminal label.wt-seg:hover, .wl-terminal .wt-seg:focus-visible { background: #0a2e15; color: #d6ffe0; outline: none; }
.wl-terminal .wt-grow { flex: 1; }
.wl-terminal .wl-startup input { accent-color: #4dff7c; }
.wl-terminal .wt-scan, .wl-terminal .wt-roll, .wl-terminal .wt-glass { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
.wl-terminal .wt-scan { background: repeating-linear-gradient(180deg, rgba(0,0,0,.28) 0 1px, transparent 1px 3px); }
.wl-terminal .wt-roll { background: linear-gradient(180deg, transparent 0, rgba(120,255,160,.06) 45%, rgba(120,255,160,.1) 50%, transparent 56%); height: 30%; animation: wt-roll 7s linear infinite; }
@keyframes wt-roll { from { transform: translateY(-100%); } to { transform: translateY(400%); } }
.wl-terminal .wt-glass { background: radial-gradient(ellipse at 28% 14%, rgba(255,255,255,.07), transparent 42%), radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(0,0,0,.6) 100%); border-radius: 18px / 22px; }
.wl-terminal[data-fx="off"] .wt-scan, .wl-terminal[data-fx="off"] .wt-roll { display: none; }
`,
  build(root, api) {
    const M = api.modes;
    root.dataset.fx = api.fx ? 'on' : 'off';
    root.innerHTML = `<div class="wt-tube"><div class="wt-scr"></div>
      <div class="wt-status"><span class="wt-seg wt-hd">STRATA</span><span class="wt-seg wt-md">BOOT</span><span class="wt-seg">~/projects</span><span class="wt-seg wt-ok">● offline-ready</span><span class="wt-grow"></span></div>
      <div class="wt-roll"></div><div class="wt-scan"></div><div class="wt-glass"></div></div>`;
    const scr = root.querySelector('.wt-scr'), status = root.querySelector('.wt-status'), smode = root.querySelector('.wt-md');
    for (const a of api.actions) status.append(api.el(`<button class="wt-seg" data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${a.key ? `<span class="wt-kb">${a.key.replace('Ctrl+', 'Ctrl ')}</span> ` : ''}${a.short.toLowerCase()}</button>`));
    const su = api.startup('at startup'); su.classList.add('wt-seg'); status.append(su);
    status.append(api.el(`<button class="wt-seg" data-act="close"${api.tip('Continue', 'Close the welcome screen and keep working where you left off.', 'Esc')}><span class="wt-kb">Esc</span> exit</button>`));
    const clock = api.el('<span class="wt-seg"></span>'); status.append(clock);
    const tick = () => { clock.textContent = new Date().toTimeString().slice(0, 5); }; tick(); api.every(10000, tick);

    let fast = api.reduce, ready = false, sel = 0, items = [], det = null, detTok = 0;
    const sleep = ms => (fast ? Promise.resolve() : api.wait(ms));   // skipped (any key) or reduced motion: print instantly
    const line = (html = '', cls = '') => { const d = document.createElement('div'); d.className = 'wt-ln ' + cls; d.innerHTML = html; scr.append(d); scr.scrollTop = scr.scrollHeight; return d; };
    const pad = (s, n) => s + ' ' + '.'.repeat(Math.max(2, n - s.length)) + ' ';
    async function type(el, prefix, txt, ms = 34) {
      for (let i = 0; i <= txt.length; i++) { el.innerHTML = prefix + api.esc(txt.slice(0, i)) + '<span class="wt-cur"></span>'; await sleep(ms + Math.random() * 26); }
      el.innerHTML = prefix + api.esc(txt);
    }
    const PROMPT = '<span class="wt-ok">you@strata</span> <span class="wt-acc">~</span> <span class="wt-dim">$</span> ';
    const GL = {
      S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
      T: ['████████╗', '╚══██╔══╝', '   ██║   ', '   ██║   ', '   ██║   ', '   ╚═╝   '],
      R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
      A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
    };
    const LOGO = [0, 1, 2, 3, 4, 5].map(r => [...'STRATA'].map(ch => GL[ch][r]).join(''));

    async function boot() {
      await type(line(), PROMPT, 'strata --welcome');
      await sleep(240);
      line('<span class="wt-dim">Strata Studio · cold start · phosphor warm-up OK</span>');
      await sleep(160);
      const checks = [
        ['video engine', 'timeline, effects, titles, export'],
        ['audio engine', '48 kHz · live recording · 25+ effects'],
        ['image engine', 'layers, Camera Raw, Liquify, 70+ filters'],
        ['captions', 'speech model runs on this computer'],
        ['projects', 'autosave on · undo history kept'],
        ['network', 'not needed — nothing gets uploaded'],
      ];
      for (const [k, v] of checks) {
        const l = line(`<span class="wt-dim">[    ]</span> ${pad(k, 16)}`);
        await sleep(90 + Math.random() * 120);
        l.innerHTML = `<span class="wt-dim">[</span> <span class="wt-ok">ok</span> <span class="wt-dim">]</span> ${pad(k, 16).replace(/(\.+)/, '<span class="wt-dim">$1</span>')}<span class="wt-hi">${v}</span>`;
      }
      const bar = line(''), N = 38;
      for (let i = 0; i <= N; i++) { bar.innerHTML = `<span class="wt-dim">loading workspace</span> [${'█'.repeat(i)}<span class="wt-dim">${'░'.repeat(N - i)}</span>] ${String(Math.round(i / N * 100)).padStart(3)}%`; await sleep(12); }
      await sleep(160);
      const lg = document.createElement('div'); lg.className = 'wt-logo'; scr.append(lg);
      for (const r of LOGO) { lg.append(api.el(`<span class="wt-row">${r}</span>`)); await sleep(60); }
      line(`<span class="wt-sub">S T U D I O</span>   <span class="wt-dim">— ${api.esc(api.tagline)}</span>`);
      line();
      menu();
    }
    function menu() {
      line(`<span class="wt-acc">?</span> <b class="wt-hi">What would you like to make today?</b>  <span class="wt-dim">↑ ↓ to move · Enter to open · or press 1 2 3</span>`);
      const box = document.createElement('div'); box.className = 'wt-menu'; scr.append(box);
      items = M.map((m, i) => {
        const it = api.el(`<div class="wt-it" data-pick="${m.id}" role="button" tabindex="0" aria-label="Open the ${m.name} editor"${api.tip(m.name + ' editor', m.tip, m.key)}><span class="wt-pt">❯</span><span class="wt-k">[${m.key}]</span><span class="wt-nm">${m.name}</span><span class="wt-ds">${m.desc}</span></div>`);
        it.addEventListener('pointerenter', () => select(i));
        it.addEventListener('focus', () => select(i));
        box.append(it); return it;
      });
      det = document.createElement('div'); det.className = 'wt-det'; scr.append(det);
      ready = true; select(0, true);
    }
    async function select(i, force) {
      if (!ready || (i === sel && !force)) return;
      sel = i; const m = M[i];
      items.forEach((it, k) => it.classList.toggle('wt-on', k === i));
      smode.textContent = m.name.toUpperCase();
      const tok = ++detTok; det.innerHTML = '';
      det.append(line(`<span class="wt-dim"># what's inside ${m.name.toLowerCase()}</span>`));
      for (const p of m.pts) { await api.wait(api.reduce ? 0 : 50); if (tok !== detTok) return; det.append(line(`<span class="wt-ok">+</span> ${p}`)); }
    }
    boot();
    api.on(root, 'pointerdown', () => { if (!ready) fast = true; });
    return {
      key(e) {
        if (!ready) { if (!['Escape', '1', '2', '3'].includes(e.key) && !e.ctrlKey) { fast = true; return true; } return false; }
        if (e.key === 'ArrowDown') { select((sel + 1) % 3); return true; }
        if (e.key === 'ArrowUp') { select((sel + 2) % 3); return true; }
        if (e.key === 'Enter') { api.choose(M[sel].id); return true; }
        return false;
      },
      leave(id) {
        const m = M.find(x => x.id === id), i = M.indexOf(m);
        if (ready) { select(i); det.classList.add('wt-hidden'); }
        const l = line(); type(l, PROMPT, `strata open ${id}`, 9).then(() => line(`<span class="wt-dim">→ opening the</span> <b class="wt-hi">${m.name}</b> <span class="wt-dim">editor</span><span class="wt-cur"></span>`));
        scr.scrollTop = scr.scrollHeight;
        return 520;
      },
    };
  },
};
})();
