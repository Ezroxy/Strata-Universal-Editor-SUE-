/* Strata Studio — drag & drop between the three editors.
   A payload describes one thing being carried and offers it in the forms each editor can use:
     { kind: 'audio'|'image'|'video', from: 'audio'|'image'|'video', name, icon, duration?,
       file():  Promise<File>                      — anything the Video editor can import
       audio(): Promise<{channels, sampleRate}>   — sound for the Audio editor (optional)
       image(): Promise<Blob>                     — a picture for the Image editor (optional) }
   Editors register receivers (what a drop on their tab does) and drop zones (where in the editor a drop lands).
   While dragging, hovering the Video / Audio / Image tab for a moment switches to that editor (“spring-loaded tabs”). */
(() => {
'use strict';
const App = window.App;
const { h, icon } = App;
const X = App.xfer = { current: null, receivers: {} };
const MIME = 'application/x-strata-xfer';

/** Is a drag (ours, or files from the desktop) in progress over this event? */
X.isOurs = e => !!(X.current && e.dataTransfer && e.dataTransfer.types.includes(MIME));
const hasFiles = e => e.dataTransfer && e.dataTransfer.types.includes('Files');

/* ---------- drag ghost ---------- */
let ghost = null;
const makeGhost = p => {
  ghost && ghost.remove();
  ghost = h('div', { class: 'xfer-ghost' }, h('span', { class: 'xg-ico' }, icon(p.icon || ({ audio: 'wave', image: 'image', video: 'film' }[p.kind]), 15)), h('span', null, p.name));
  document.body.append(ghost);
  return ghost;
};

/** Begin carrying payload p from inside a dragstart handler (ghost = false keeps the element's own drag image). */
X.start = (e, p, ghost = true) => {
  X.current = p;
  try {
    e.dataTransfer.setData(MIME, p.kind);
    if (!e.dataTransfer.getData('text/plain')) e.dataTransfer.setData('text/plain', p.name);
    e.dataTransfer.effectAllowed = 'copyMove';
    if (ghost) { const g = makeGhost(p); e.dataTransfer.setDragImage(g, 14, 14); }
  } catch {}
  document.body.classList.add('xfer-on');
  document.body.dataset.xferKind = p.kind;
  e.target.addEventListener('dragend', () => end(), { once: true });
  App.sound && App.sound('grab');
};
/** Make `el` draggable; make(e) returns a payload (or null to refuse). */
X.source = (el, make) => {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', e => { const p = make(e); if (!p) { e.preventDefault(); return; } X.start(e, p); });
};
// Pointer events don't fire during a native drag — if one arrives while we still think we're dragging, the drag ended
// somewhere we didn't hear about (e.g. its source element was rebuilt), so tidy up.
addEventListener('pointermove', () => { if (X.current) end(); }, true);
addEventListener('drop', () => { if (X.current) setTimeout(() => X.current && end(), 0); });
const end = () => {
  X.current = null;
  document.body.classList.remove('xfer-on');
  delete document.body.dataset.xferKind;
  ghost && ghost.remove(); ghost = null;
  hint.hide();
  clearTimeout(spring.t); spring.el && spring.el.classList.remove('xfer-spring'); spring.el = null;
};
X.end = end;

/* ---------- floating hint next to the cursor ("Drop to add a track at 0:12") ---------- */
const hint = (() => {
  let el = null;
  return {
    show(e, text) { if (!el) { el = h('div', { class: 'toast xfer-hint' }); /* styled like a toast so every theme colours it */ document.body.append(el); } el.textContent = text; el.style.left = e.clientX + 16 + 'px'; el.style.top = e.clientY + 18 + 'px'; el.style.display = ''; },
    hide() { if (el) el.style.display = 'none'; },
  };
})();
X.hint = hint;

/**
 * Drop zone. opts: { accepts(p) → bool, label(p, e) → string (hint text), over(p, e) (draw indicators),
 *                    leave(), drop(p, e) }. Only reacts to in-app payloads (desktop files keep their own handlers).
 */
X.zone = (el, o) => {
  let inside = 0;
  const ok = e => X.isOurs(e) && (!o.accepts || o.accepts(X.current, e));
  el.addEventListener('dragenter', e => { if (!ok(e)) return; inside++; el.classList.add('xfer-over'); });
  el.addEventListener('dragover', e => {
    if (!ok(e)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    el.classList.add('xfer-over');
    o.over && o.over(X.current, e);
    const t = o.label && o.label(X.current, e);
    t ? hint.show(e, t) : hint.hide();
  });
  el.addEventListener('dragleave', e => {
    if (!X.current) return;
    if (el.contains(e.relatedTarget)) return;
    inside = 0; el.classList.remove('xfer-over'); hint.hide(); o.leave && o.leave();
  });
  el.addEventListener('drop', async e => {
    if (!ok(e)) return;
    e.preventDefault(); e.stopPropagation();
    const p = X.current;
    inside = 0; el.classList.remove('xfer-over'); o.leave && o.leave();
    end();
    App.sound && App.sound('drop');
    try { await o.drop(p, e); } catch (err) { console.error(err); App.toast(err.message || 'Could not drop that here', 'err'); }
  });
};

/* ---------- spring-loaded editor tabs ---------- */
const spring = { el: null, t: 0 };
/** Wire a top-bar tab: hovering it during a drag switches editor; dropping on it sends the payload there. */
X.tab = (tabEl, mode) => {
  const arm = e => {
    if (!X.current && !hasFiles(e)) return;
    e.preventDefault();
    const accept = !X.current || (X.receivers[mode] && X.receivers[mode].accepts(X.current));
    e.dataTransfer.dropEffect = accept ? 'copy' : 'none';
    if (App.active === mode) return;
    if (spring.el !== tabEl) {
      clearTimeout(spring.t); spring.el && spring.el.classList.remove('xfer-spring');
      spring.el = tabEl; tabEl.classList.add('xfer-spring');
      spring.t = setTimeout(() => { tabEl.classList.remove('xfer-spring'); spring.el = null; App.setMode(mode); }, 450);
    }
    if (X.current) hint.show(e, accept ? `Keep holding to open the ${mode} editor — or drop here to send it` : `The ${mode} editor can’t use this`);
  };
  tabEl.addEventListener('dragenter', arm);
  tabEl.addEventListener('dragover', arm);
  tabEl.addEventListener('dragleave', e => { if (tabEl.contains(e.relatedTarget)) return; if (spring.el === tabEl) { clearTimeout(spring.t); tabEl.classList.remove('xfer-spring'); spring.el = null; } hint.hide(); });
  tabEl.addEventListener('drop', async e => {
    if (!X.current) return;   // desktop files dropped on a tab: let the editor's own drop area handle them after the switch
    e.preventDefault(); e.stopPropagation();
    const p = X.current; end();
    const r = X.receivers[mode];
    if (!r || !r.accepts(p)) return App.toast(`The ${mode} editor can’t use ${p.kind === 'audio' ? 'sound' : 'this'}`, 'warn');
    App.setMode(mode);
    try { await r.receive(p); } catch (err) { console.error(err); App.toast(err.message || 'Could not send that', 'err'); }
  });
};
/** Send a payload to an editor without dragging (used by “Send to …” menu items). */
X.send = async (p, mode) => {
  const r = X.receivers[mode];
  if (!r || !r.accepts(p)) return App.toast(`The ${mode} editor can’t use this`, 'warn');
  App.setMode(mode);
  await r.receive(p);
};

/* ---------- shared helpers for building payloads ---------- */
X.wavFile = (channels, sampleRate, name) => new File([App.dsp.encodeWAV(channels, sampleRate, 24)], name.replace(/\.[^.]+$/, '') + '.wav', { type: 'audio/wav' });
X.pngFile = (blob, name) => new File([blob], name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
X.canvasBlob = cv => new Promise(r => cv.toBlob(r, 'image/png'));
/** decode any audio/video file to channels at the audio editor's rate */
X.decode = async file => {
  const ab = await App.ac().decodeAudioData(await file.arrayBuffer());
  return { channels: Array.from({ length: Math.min(2, ab.numberOfChannels) }, (_, i) => ab.getChannelData(i).slice()), sampleRate: ab.sampleRate };
};
/** first frame-ish of a video file as a PNG blob */
X.videoFrame = (url, t = 0.5) => new Promise((res, rej) => {
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
  const fail = () => rej(new Error('Could not read a frame from this video'));
  v.addEventListener('error', fail, { once: true });
  v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(t, Math.max(0, (v.duration || 1) / 2)); }, { once: true });
  v.addEventListener('seeked', () => {
    const c = App.canvas(v.videoWidth || 1280, v.videoHeight || 720); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(b => { v.removeAttribute('src'); v.load(); b ? res(b) : fail(); }, 'image/png');
  }, { once: true });
});
})();
