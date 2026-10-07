# HANDOFF — Strata Studio (video / audio / image editor)

Notes for the next person or Claude instance picking up this project. Read the overview first, then the detailed notes
further down, then `README.md`.

## Overview

### What it is
Strata Studio (repo: *Strata Universal Editor — SUE*) is one app that combines a **video editor** (multitrack timeline),
an **audio editor** (recording, effects, mastering) and an **image editor** (layers, Camera Raw, 70+ filters). It's
written in plain HTML/CSS/JS with no build step and no npm dependencies. Everything runs locally, including the speech
model behind Auto captions. You can use it in the browser or as a native Windows app (Rust + WebView2).

### Install and run
- **Requirements:** [Node.js](https://nodejs.org) (any recent version) and Chrome or Edge. Nothing to `npm install`.
- **Browser:** `node server.js`, then open http://localhost:5178. On Windows you can double-click `start.bat` instead. The
  server sends the COOP/COEP headers that Auto captions needs (multi-threaded WASM).
- **Windows desktop app:** install Rust (https://rustup.rs), then run `build-desktop.bat`. The result is
  `dist\Strata Studio.exe` (~110 MB, everything embedded). Rebuild it after any change to `index.html`, `css/`, `js/`,
  `fonts/`, `vendor/` or `models/`.
- **What isn't in the git repo:**
  - **Build output:** `dist/` and `desktop/target/`.
  - **The extracted GTA San Andreas / L.A. Noire fonts** (`fonts/game/`). They're copyrighted and marked "personal use
    only", so they aren't published. Without them, the Film Noir and Grove Street themes and the game-font options fall back
    to the other fonts. To regenerate them from your own game copies, run
    `node tools/fonts/build-game-fonts.mjs <gtaFolder> <laNoireFolder>` (details under "Game fonts" below).
- The Whisper model (`models/`, ~77 MB) and ONNX runtime (`vendor/`, ~27 MB) **are** committed, because captions need them.

### What's finished
- **Video:**
  - Multitrack timeline with blade, ripple, roll and slip edits.
  - Keyframes, chroma key and titles.
  - Auto captions with local Whisper (word timestamps, SRT/VTT import and export).
  - Silence cutter.
  - Fade handles on clips, loudness normalizing (−14 / −16 / −23 LUFS) and YouTube chapters from markers.
  - MP4 / WebM / GIF export.
- **Audio:**
  - Live recording with a real-time waveform.
  - 25+ effects, noise reduction and LUFS loudness.
  - Auto-duck, envelopes and markers.
  - Voice leveler, de-esser, and export of each region as its own file.
- **Image:**
  - Layers, masks and selections.
  - A Photoshop-style Filter menu (68 filters), Filter Gallery and Liquify.
  - A full Camera Raw filter.
  - Healing brush, clone, content-aware fill and remove background.
  - Text with outline, shadow, letter / line spacing and style presets.
- **Drag and drop between the three editors:** audio → video, image → video, frames → image, and more.
- **15 themes, each with its own animated welcome screen:**
  - Themes: Terminal, Frutiger Aero, Windows XP, Windows 98, Paper, Film Noir, Synthwave, Grove Street and more.
  - Each theme has synthesized UI sounds.
  - A Preferences window with all settings.
- **Polish:** autosave, a command palette (Ctrl+K), a shortcuts sheet (?), and hover explainers on every control.
- **Interface size** (50–200 %, View ▸ Interface size, Preferences ▸ Appearance, Ctrl+Alt+= / - / 0).
- **Windows XP Dreamcore theme:** an XP desktop with 3D windows, working title-bar buttons, taskbar, Start menu, balloon tips
  and its own welcome screen and Dream sound pack.
- **Timeline mouse control:** the wheel zooms at the pointer (or scrolls, per Preferences), and pressing the wheel and
  dragging pans the video and audio timelines.
- **Windows desktop app:**
  - Single instance; remembers the window position.
  - Downloads go to the Downloads folder.
  - Autosave is flushed when the window closes.

### In progress
- Nothing is half-done. The last task (the Windows XP Dreamcore theme) is finished and tested in headless Chromium. **The Windows exe has not been rebuilt since** (the work was done in a Linux cloud session), so run
  `build-desktop.bat` once on Windows.
- `qa/harness.js` is a temporary QA script that runs every menu command in the browser preview. It isn't part of the app.

### What's next (ideas, not started)
- Image features that aren't implemented yet: Vanishing Point, Neural Filters and Smart Filters.
- Subject, sky and depth masks in Camera Raw are heuristics. A small local segmentation model would make them much better.
- Cross-platform desktop builds (macOS / Linux). wry and tao support them, but only Windows has been built and tested.
- Smaller ideas from the QA pass: LUT (.cube) import for video and Camera Raw, a de-click / de-clip repair effect,
  speed ramps (speed keyframes) on video clips, and "Remove background" with a real segmentation model instead of the
  colour-distance heuristic.
- Ask the user what they want next. They value creative, polished, "10x" work with plain-language UI text.

---

# Detailed notes (for whoever continues the work)

## What the project is
- A browser-based video, audio and image editor written in plain HTML, CSS and JS. There's no build step. The only third-party
  code is the vendored speech-recognition runtime for Auto captions (`vendor/`, `models/`, see below).
- Scripts are classic (not modules) and share one namespace: `window.App`. Inside it, `App.V` is video, `App.A` is audio and `App.I` is image.
- Run it with `node server.js` and open http://localhost:5178. A preview server named "strata" may already be running in the Claude browser pane.
- There's also a native Windows desktop build:
  - Rust + `wry`/`tao` (WebView2) in `desktop/`.
  - Built with `build-desktop.bat`, which produces `dist\Strata Studio.exe` (~110 MB, everything embedded — ~105 MB of it is the
    Whisper model + ONNX runtime).
  - **Rebuild the exe after changing any web files.**
- The user (Mouad) wants polished, "10x" quality. Every control needs a hover explainer, which is the `tip:` attribute on elements. Write user-facing text in plain language.

> **START HERE:** there is no open task. The latest finished work is **"Windows XP Dreamcore theme"** below.

## Earlier request — DONE (2026-10-07, second request of the day)
"Make the Image section as feature-packed as Photoshop, add Camera Raw Filter with the same features, and add a local
speech-to-text model for auto-captioning videos." The user picked **Whisper Base** and **built into the exe**.

### Image: Photoshop-style Filter menu (`js/image/fx-core.js`, `fx-filters.js`, `liquify.js`, `filter-gallery.js`)
- `fx-core.js` = `App.IF.X` pixel engine (blurs, warps, median, morphology, convolution, noise, voronoi, bokeh, HSV, …).
- `fx-filters.js`: `I.FX` (68 filters) + `I.ADJ2` (13 adjustments) and the menus: `I.filterMenuItems()` replaces the old Filter
  menu (Last Filter Ctrl+Alt+F, Filter Gallery, Adaptive Wide Angle, Camera Raw Filter, Smart Denoise, Enhance Detail, Lens
  Correction, Liquify, and Blur / Blur Gallery / Distort / Noise / Pixelate / Render / Sharpen / Stylize / Video / Other
  submenus); `I.adjustExtraItems()` is appended to the Adjust menu; `I.filterKeys()` adds the Photoshop shortcuts.
- `I.fxDialog` (index.js) was extended: param types slider / select / toggle / color / point (click on the image) / button /
  head, `heavy` filters compute on OK, every run is stored as `I.lastFilter` for Ctrl+Alt+F.
- Liquify (`I.liquify()`): forward warp, reconstruct, smooth, twirl, pucker, bloat, push left, freeze/thaw masks, hand, zoom.
- Filter Gallery (`I.filterGallery()`): 47 effects in Artistic / Brush Strokes / Distort / Sketch / Stylize / Texture with a
  stackable effect-layer list.
- Not implemented (say so if asked): Vanishing Point, Neural Filters (cloud models), Convert for Smart Filters.

### Camera Raw Filter (`js/image/camraw-core.js`, `camraw-worker.js`, `camraw.js`; Filter ▸ Camera Raw Filter…, Shift+Ctrl+A)
- `camraw-core.js` is worker-safe (`self.CR`): `CR.defaults()`, `CR.process(src, w, h, S, aux, cache, tile)` and
  `CR.renderTiled` (1536 px tiles with margins; tiled vs whole-image max diff 1). An untouched image comes back bit-exact.
- Panels: Profile (11 incl. creative + amount), Light, Color (WB as shot/auto/custom + picker), Effects (texture, clarity,
  dehaze, vignette styles, grain, glow), Curve (parametric + point RGB/R/G/B), Color Mixer (HSL) / B&W Mixer, Color Grading
  (3-way wheels + global, blending, balance), Detail (sharpen + masking, luminance/color NR), Optics (CA, distortion, lens
  vignette, defringe with sampler), Geometry (Upright level, perspective, rotate, aspect, scale, offset), Lens Blur (depth from
  the subject map, focus picker, 5 bokeh shapes, boost, near/far range, depth visualisation), Calibration.
- Tools strip: Edit, Crop & rotate, Remove (heal/clone), Masking (subject, sky, background, brush, linear, radial, luminance
  range; 14 local sliders each), Red eye (red/pet), Presets (16 built-in + user), Snapshots, ⋯ menu (reset, previous, copy /
  paste settings, preview quality), Zoom, Hand, Color samplers, Grid. Histogram with clipping warnings (U / O), before/after
  views, internal undo. OK renders full size in the worker and writes one history step ("Camera Raw Filter"; a crop adds
  "Camera Raw crop").
- Subject / sky / depth maps are heuristics at ≤384 px (no ML): subject = colour contrast vs the frame border + centre prior →
  Otsu → connected regions → guided-filter edge snap. Works well on clear subjects, rough on busy scenes.
- Debug hook: `I.cameraRaw._debug` (`S`, `requestRender`, `setTool`, `addMask`, `retouch()`, `finish`, `last`, `shown`).

### Auto captions (video) — `js/video/captions.js` + `captions-worker.js` (Clip ▸ Auto captions…, Ctrl+Shift+C)
- Model: `models/whisper-base/` (onnx-community/whisper-base_timestamped, 8-bit `*_quantized.onnx`, has alignment heads →
  word timestamps). Runtime: `vendor/transformers/transformers.min.js` (transformers.js 4.3.1, ESM) +
  `vendor/ort/ort-wasm-simd-threaded.asyncify.{mjs,wasm}`. No network access (`env.allowRemoteModels = false`).
- **Gotcha:** `env.localModelPath` must be a site-relative path (`/models/`), not an `http(s)://` URL — transformers.js 4
  skips its local "file exists" check for http URLs and the tokenizer silently fails to load.
- Speed: server.js and the desktop launcher send COOP/COEP/CORP headers → `crossOriginIsolated` → multi-threaded WASM.
  Measured: 25 s of speech in 6 s incl. model load; 2 min in 16 s.
- Worker: own VAD (20 ms energy frames → speech regions → ≤28 s chunks cut at pauses), language detection by asking the model
  for the most likely language token (transformers.js has none), per-chunk `return_timestamps: 'word'` (falls back to
  segments), repeat-loop cleanup, cancel between chunks.
- Main thread: renders the chosen clips' sound to 16 kHz mono with OfflineAudioContext (240 s blocks), groups words into
  captions by measured width (balanced 2-line wrap, breaks at sentence ends, commas, pauses > 0.7 s, max duration), editable
  transcript list (edits keep timing by re-spreading words), 8 looks, live preview, .srt download. Captions become text clips
  (`c.caption = true`, `c.capText` = raw text, `c.text.words = [[t0, t1], …]` seconds from clip start + `c.in`) on a new
  "Captions" track. `render.js` draws `text.hl` = color / box / reveal word highlights (`drawWords`); the inspector shows
  Word highlight + colour for caption clips. File menu: Export captions (.srt), Import captions (.srt / .vtt).
- Captions need http(s) (module worker): `start.bat`/`server.js` or the desktop exe, not `file://`.
- Debug hook: `App.V.captions._debug` (`words`, `cues`, `look`, `generate()`).

### Status — exe smoke-tested and deployed (2026-10-07, third session)
- Everything above was tested in the browser preview (all filters, gallery, Liquify, Camera Raw panels/tools/OK, captions
  incl. 2-minute chunking, Stop, SRT round-trip, VTT, restyle, inspector).
- **Bug found in the exe and fixed: Auto captions hung forever after loading the model.** WebView2 can't start a worker *from
  inside another worker* when the script comes from the custom protocol (`strata.localhost`) — the nested worker fails with
  no message. ONNX Runtime creates its thread pool exactly that way. Fix in `captions-worker.js`: `ortPaths()` fetches
  `vendor/ort/ort-wasm-simd-threaded.asyncify.mjs` into a **blob: URL** and sets `env.backends.onnx.wasm.wasmPaths =
  { mjs: blobUrl, wasm: realUrl }` (+ `env.useWasmCache = false`); pthreads then start from the blob, which works. Verified in
  the exe: model ready in 1.4 s on 8 threads, 8.8 s of synthesized speech transcribed in 2.5 s with word timestamps.
  **Any future worker-inside-a-worker code must use blob: URLs in the desktop app.**
- Theme audit of the new features (Camera Raw, Liquify, Filter Gallery, filter dialogs, Auto captions) across the themes. They
  follow all themes (they're built from themed components). Fixed:
  - Camera Raw histogram + curve were drawn on a hard-coded black overlay (muddy grey box in light themes): now `App.th.well`
    with a hairline border; light themes draw the histogram with `multiply` instead of `lighter`.
  - Frutiger Aero's translucent glass made the editor ghost through the four big work-area dialogs: `.cr/.lq/.fg/.cap-modal`
    are now ~97% opaque in Aero (`themes.css`).
  - Terminal scanlines / Film Noir grain (`[data-fx="on"] body::after`) are hidden while Camera Raw, Liquify or the Filter
    Gallery is open (colour-critical work).
  - Liquify's Forward Warp tool had an empty icon (`warp` didn't exist in `icons.js`) — added.
  - `App.setTheme` no longer throws "Transition was aborted" when themes are switched quickly (View Transition promises caught).
- `dist\Strata Studio.exe` rebuilt (110.6 MB), smoke-tested with an isolated profile (`LOCALAPPDATA` pointed at a temp folder
  + debug port 9333 — keeps the user's real autosaves untouched), and copied to the user's Desktop
  (opens in ~0.5 s, closes cleanly). CDP helpers: `$TEMP/claude/cdp2.mjs` (expression arg, `CDP_TIMEOUT`), `cdp3.mjs` (reads
  the expression from a file — use it for big payloads).

## Earlier request — DONE (2026-10-07, fourth session): live recording, empty-state fix, drag & drop between editors
- **Live recording waveform** (`js/audio/index.js`, "recording" section): `MediaRecorder` (lossy Opus, decoded only on Stop) was
  replaced by raw PCM capture — an AudioWorklet created from a blob URL (`CAPTURE_WORKLET`, fallback ScriptProcessor) posts
  2048-sample blocks; `addCaptured()` keeps the chunks + min/max peaks per 256 samples; a temporary `.a-live` lane
  (`liveRow`/`drawLive`, redrawn from `A.placeLines`) shows the waveform while recording; Stop waits for the worklet's `'done'`
  handshake, concatenates the chunks into the new track (lossless, exact length). Mono mics stay mono (`getSettings().channelCount`).
- **Empty audio state**: `.empty .ico` also hit the icons inside the buttons (10 px bottom margin → misaligned); now `.empty > .ico`.
- **Drag & drop between editors** — `js/core/xfer.js` (`App.xfer`), loaded after `silence.js`:
  - Payload `{kind, from, name, duration?, file(), audio()?, image()?}`; `X.start(e, p)` inside a dragstart, `X.source(el, make)`,
    `X.zone(el, {accepts, label, over, leave, drop})` (only in-app payloads; desktop files keep `App.fileDrop`), `X.tab(tabEl, mode)`
    = spring-loaded top-bar tabs (hold 450 ms → switch editor; drop on a tab → `X.receivers[mode].receive(p)`), `X.send(p, mode)`.
  - Receivers: video (import → `O.placeMedia` on a free track at the playhead / drop time), audio (`A.addTrackFrom` → new track),
    image (`I.openImage` → new document; canvas drops → new layer centred on the drop point via `openImage(..., at)`).
  - Sources: audio track grip `.at-grip` (whole track, or the selection if the track is selected), image doc tabs + layer rows
    (`I.docPayload` / `I.layerPayload`), video media-bin items (`P.mediaPayload`: sound / frame / image) and the viewer's
    "Drag this frame" button (`.xfer-grip`).
  - Zones: video timeline (existing `setupDrop`, `foreign()` payloads), media bin, viewer; audio lanes (`.a-dropline` marker);
    image viewport + doc-tab bar. Menus: audio track menu "Send to Video editor", image "Send layer to Video editor";
    `I.sendToVideo` now places on the timeline. The drop hint is a `.toast.xfer-hint` so each theme colours it.
- Tested in the browser preview with synthetic DragEvents (all directions, spring tabs, tab drops, refusals, layer reorder still
  works) and a fake microphone stream (live lane grows, exact-length mono track on Stop).
- Exe: smoke-tested after the user closed their copy (live recording via the blob-URL AudioWorklet works under COEP; the xfer
  receivers are registered). The parked old build in `%TEMP%\claude\old-builds\` was deleted. The Desktop exe is current.

## Latest request — DONE (2026-10-07, cloud session): Windows XP Dreamcore theme
User: "make the Windows XP theme look exactly like Windows XP, everything … make two or three drafts". Three drafts were
shown (Luna program window, every panel a window on the desktop, Dreamcore); the user picked **Dreamcore**, so the XP theme
(id `xp`, name "Windows XP Dreamcore") is now only that look. The draft commit is in the history if the others are wanted.

### Files
- `js/core/xpshell.js` — builds the desktop while the theme is `xp` (`sync()` on the `theme` event; `teardown()` removes
  everything):
  - **Wallpaper:** `paintWalls()` paints the hill (transparent PNG, grass strokes, grain) and a cloud strip that tiles
    sideways (no photo). `.xp-wall` stacks sky (CSS), clouds (`.xp-cloud-track` drifts with a transform animation),
    hill and haze, behind `#main` (z-index 2).
  - **Taskbar:** the old top bar, restyled. Brand = Start button (capture-phase click opens the Start menu), tabs = taskbar
    buttons showing window titles (`.lbl[data-xp]`), tray icons + `.xp-clock`.
  - **Windows:** every `.module > .panel` is a window. Its 32px top *border* is the title bar. Gradient, title and buttons
    are background layers (`--xp-cap` is an SVG with the title text, per panel; `--xp-capbtns*` are the button strips in
    each hover state). `capHit()` maps a click in the border to min / max / close, using `--xp-cap-h`, `--xp-btn-top`,
    `--xp-btn-right` from the CSS.
    - **Side panels** (`PANELS` kind `side`): minimize or close clicks the editor's own toggle button.
    - **Core panels:** wobble and explain.
    - **Maximize:** sets `.xp-maxed` (absolutely positioned below the main window, `grid-area: auto`).
    - **Main window:** minimize = desktop (`html.xp-min`, desktop icons); maximize = `html.xp-tight` (saved in
      `strata.xp.tight`); close = Turn Off Computer.
  - **Also:** Start menu (`startMenu()`), Turn Off Computer (`turnOff()`, greys the screen), Ctrl+Esc opens Start, and the
    active editor's taskbar button minimizes it, like XP.
- `css/xp.css` — generated from a small Python template during the session, but now edited directly.
  - **Tokens:** `--xp-*` (padding/gaps/extrusion tiers by screen size: ≥1040 px tall = full depth, ≤860 px = 26 px title
    bars), `--grain`, cursors `--xp-arrow` / `--xp-hand`.
  - **Rules:** taskbar, Start menu, Turn Off, desktop icons, Luna controls (menus, push buttons, trackbar thumb, check
    boxes, tab controls, scrollbars with arrow buttons, combo boxes), dialogs, tooltips, balloon toasts (`.toast` with a
    tail and a "Strata Studio" title), Explorer task-pane sections, Paint tool box and colour wells, and the windows.
  - **Theme effects off / reduce motion:** stop the cloud drift and hide the haze.
- `js/welcome/xp.js` — the Dreamcore welcome screen (see the welcome list below).
- `js/core/sound.js` — new **Dream** pack (`dream`, the XP theme's pack): slowed tones routed to a long dark `haze` reverb
  (`o.haze`, `makeHaze()`), balanced against Soft with `TRIM.dream`.

### Tested
- Real mouse at 1600×900, 1366×768 and 150 % interface size:
  - caption hover states, maximize/restore (incl. double-click), hiding and restoring side panels;
  - core-window wobble and the Tools close button;
  - tight mode, minimize to desktop and back from the taskbar;
  - clip dragging inside a window, the welcome screen's buttons, and theme switching away and back.
- Every menu command in all three editors with the theme on: no errors.
- Screenshots at 1920×1080, 1600×900 and 1366×768.

## Earlier request — DONE (2026-10-07, cloud session): Interface size, wheel zoom, middle-button pan
User: "scale the UI of the whole program up or down with a slider … the scroll wheel zooms the video and audio timelines …
press the scroll wheel to move through the timeline", with a QA pass so there are no bugs.

### Interface size (`js/core/uiscale.js`, loaded in `<head>` right after `themes.js`)
- Applies CSS `zoom` to `<html>` plus `--uiz` on `:root`. Setting `uiScale` (0.5–2), applied before the first paint.
- **Why it doesn't break the pointer maths:** Chromium's standardized CSS zoom (128+) reports rectangles and mouse
  positions in screen pixels, but sizes, scroll offsets and CSS lengths in unscaled pixels. Mixing them was why zoom was
  skipped before. `uiscale.js` puts everything in unscaled page pixels, the way real browser zoom does:
  - `MouseEvent` `clientX/Y`, `pageX/Y`, `x/y` and `movementX/Y` are divided by the scale.
  - `getBoundingClientRect` / `getClientRects` (Element and Range) are divided too.
  - `innerWidth/innerHeight` are divided, `devicePixelRatio` is multiplied (so canvases stay crisp), and `elementFromPoint`
    and friends multiply their arguments back.
  - Width/height `@media` rules are rewritten through the CSSOM (`(max-width: 1500px)` → `2250px` at 150 %), including
    stylesheets injected later into `<head>`.
  - Engines without `Element.prototype.currentCSSZoom` get no shims and the setting is disabled (`App.uiScaleSupported`).
- **Rules for new code:**
  - In CSS, never write `vh` / `vw`; write `calc(80 * var(--vh))` (tokens defined at the top of `app.css`).
  - CSS injected at runtime goes through `App.fixViewportUnits(css)` (`welcome.js` already does).
  - Nothing else is needed: pointer code written the usual way just works.
- UI: View ▸ Interface size in all three editors (`App.uiScaleMenu()`), the fine-tune window (`App.uiScaleDialog()`, slider
  applies on release so it doesn't move under the mouse), Preferences ▸ Appearance ▸ Interface size, and Ctrl+Alt+= / - / 0
  (`App.uiScaleKey`, routed in `main.js` before the modal check). API: `App.uiScale()`, `App.setUiScale(z, {toast})`,
  `App.stepUiScale(±1)`, event `'uiscale'`.

### Timeline mouse control (`App.timelineNav` in `js/core/ui.js`)
- Shared by the video timeline (`T.body`) and the audio editor (`el.tracks`, plus the ruler and marker strip with
  `zoomOnly`). Callbacks: `zoom(factor, clientX)`, `panX(px)`, `panY(px)`.
- Wheel = zoom at the pointer (setting `timelineWheel: 'zoom'`, default) or native scroll (`'scroll'`). Ctrl+wheel and
  pinch always zoom, Shift+wheel and sideways swipes scroll left/right, Alt+wheel scrolls up/down, and the wheel over the
  track names scrolls. Wheel steps are batched per animation frame.
- Middle button + drag pans both ways (capture-phase `pointerdown`, so clips, markers and rulers never see it; the browser's
  autoscroll is suppressed). View ▸ Mouse wheel (`App.wheelMenu()`) and Preferences ▸ Interface ▸ Timelines switch modes.

### Tested (headless Chromium, real mouse via Playwright)
- At 75 %, 100 % and 150 %:
  - ruler clicks, clip drags, audio click and selection, and brush dots land exactly;
  - context menus, menubar and submenus, tooltips and Preferences are placed correctly;
  - Camera Raw samplers and Liquify warps match between 100 % and 150 %.
- All 15 welcome screens fill the window at 150 % and look like a smaller window at 100 %. All 175 rewritten welcome-screen
  values compute identically at 100 %.
- Wheel zoom keeps the time under the pointer fixed (also for a burst of 8 wheel steps). Shift, Alt, the track-name column,
  Ctrl and scroll mode all work. Middle-drag pans by exactly the mouse distance and never moves clips or changes the selection.
- Shortcuts, the fine-tune window, the Preferences slider, a preferences reset, out-of-range values and a reload all work.
- Full menu sweeps (`qa/harness.js`) at 100 % and 150 %: no errors.
- **Testing tip:** `QA.drag` builds synthetic events from page coordinates, so run it at 100 %. At other sizes, drive
  Playwright's real mouse and multiply page coordinates by `App.uiScale()`.

## Earlier request — DONE (2026-10-07, cloud session): QA pass + new features
User: "Do a round of QA and testing … full read of the whole codebase. Squash any bugs, and add features you think the
image, audio and video editors should have." Done in a Claude Code cloud session (Linux, headless Chromium) on branch
`claude/handoff-continuation-h2cb0d`. Commits: "Fix bugs found in a full QA pass", "Remove silences: …", then the
features commit.

### Bugs fixed
- **Dialogs (`js/core/ui.js`):** a `modalStack` means only the top-most modal answers Enter / Esc. Before, Enter in a
  prompt opened from Camera Raw (Presets ▸ Create) also pressed Camera Raw's OK, and Esc closed the parent window too.
- **Video:**
  - "Color" in the media bin used to overwrite 5 s of footage on the bottom track. `O.addColor` now uses
    `V.freeVideoTrack` (and commits first).
  - Audio-only .webm / .mp4 files import as audio (`importFiles` checks `videoWidth`).
  - Closing the Exporting window cancels the export (`runJob` `finished` flag + `onClose`).
  - Detach audio keeps volume keyframes, mute and pitch; freeze frame waits for a decoded frame; the drop preview uses
    the still-length setting.
- **Audio:**
  - Remove silences in auto mode used to delete *everything* when the pauses were digital silence (−120 dB frames
    pulled the floor estimate down). Fixed in `D.detectSilence` (`js/core/dsp.js`).
  - An effect that fails part-way is still undoable; track move / colour and marker colour now commit.
- **Image:** tool name readable in the XP / Classic 98 options bar (`css/themes.css`); the workflow bar fits at 1280 px.
- **Layout:** the audio top bar fits one row from ~1500 px (was ~1700 px).
- **Core:** DSP worker crash rejects pending jobs; Preferences ▸ Fonts no longer adds a listener per visit;
  `server.js` survives malformed URLs (400) and the path check is `root + path.sep`.

### New features
- **Video (`js/video/timeline.js`):**
  - *Fade handles:* small knobs (`.c-fade.in/.out`) on the top corners of every audible clip. Drag to set
    `fadeIn` / `fadeOut`, double-click to remove (`startFade`). Hidden when the clip is narrower than 44 px.
  - *Normalize loudness* (`O.normalizeLoudness(target, clips)`): Clip menu, clip right-click and a "Normalize" button in
    the Inspector's Audio section. Targets −14 (YouTube), −16 (podcast), −23 LUFS (broadcast). Boost capped at +12 dB
    and peaks at −1 dBFS; the toast warns when a clip couldn't reach the target.
  - *Chapters from markers* (`O.chapters()`): File / Timeline menus and ruler right-click. Builds a YouTube chapter
    list (adds "0:00 Intro" when needed, warns about < 3 chapters or chapters < 10 s), with Copy and Download .txt.
- **Audio:**
  - *Voice leveler* (`leveler` in `js/audio/effects.js`, Volume & dynamics): rides the gain of speech towards a target
    level (10 ms blocks, moving window, smoothed gain; limiter at the end if peaks pass −1 dB).
  - *De-esser* (`deess`, Repair): zero-phase high-passed band + envelope follower. Zero-phase matters: a normal biquad
    shifted the band's phase and the subtraction made hiss *louder*.
  - *Export regions as files* (`A.exportRegions()`): File menu and the marker menu. One file per region marker,
    WAV 16/24, M4A or Opus, stereo or mono, named `<project> - 01 <label>.ext`.
- **Image:**
  - *Content-aware fill* (`I.contentAwareFill`): Edit menu, viewport right-click, Shift+F5. Fills the selection from
    the surroundings.
  - `F.heal` (`js/image/filters.js`) got a much better patch search (sparse ring sample, dense coarse grid with early-out,
    pixel refinement, overlap check). This also improves the Healing brush.
  - *Remove background* (`I.removeBackground`, Layer menu): adds a layer mask from `backgroundMask` (colour distance to
    the border). Heuristic, so it refuses when < 2 % or > 97 % of the image looks like background.
  - *Text styles* (`js/image/tools.js`): outline (colour + width), shadow (soft / hard / glow), letter spacing and line
    spacing, plus presets (Clean, Meme, Soft shadow, Neon) in a "Style" window from the Text options bar
    (`I.textStyleWin`). The keys live in `TEXT_KEYS` / `TEXT_DEF`, so old text layers still render.

### How it was tested
- Every menu command in all three editors via `qa/harness.js` (`QA.applyMode = true; QA.sweep('video'|'audio'|'image')`
  → `bad: []`, `errors: []`), key sweeps, mouse drags, export (MP4 / WebM / GIF / WAV / M4A / Opus, re-imported),
  project save → open round trips, autosave across a reload, fake-mic recording, all 15 welcome screens, every
  Preferences page and Whisper captions.
- Headless runner: Playwright with the preinstalled Chromium (`/opt/pw-browsers`), `node server.js` on 5178, a script
  per test that `page.evaluate`s against `window.App`. Headless Chromium runs the AudioContext at 44.1 kHz.

## Earlier request — DONE (2026-10-07, sixth session): one welcome screen PER THEME
User: "the startup menu should go with the theme you last chose … Terminal greenish, Frutiger Aero something Aero … XP, 98,
Paper and all those — creative, not generic", then "make each welcome screen very impressive, you have creative freedom".
**Shown at every start now:** the `welcome` setting defaults to `'always'`, and older saves that had the old default
`'first'` are migrated once (`welcomeThemed` flag in `store.js`). Users can change it in Preferences ▸ Interface or with the
"Show at startup" switch that every screen has.

### Architecture
- `js/core/welcome.js` (loaded after `core/prefs.js`, before `main.js`) — `App.showWelcome(themeId?)`, `App.closeWelcome()`,
  `App.WELCOMES[themeId] = { css, build(root, api) → { key(e), leave(id) → ms, dispose() } }`, `App.WELCOME_MODES`.
  It picks the screen for `App.settings.theme`, injects its CSS once (`<style data-welcome="…">`), and handles everything
  shared: `[data-pick="video|audio|image"]` / `[data-act="open|palette|shortcuts|prefs|close"]` clicks, keys 1/2/3 (open),
  Esc (close), Ctrl+K, ?, Ctrl+, and Enter/Space on a focused pick. `scene.key(e)` gets first say (return true = handled);
  `scene.leave(id)` can play a short exit (skipped with reduced motion) before `App.setMode(id)` + close.
- `api`: `modes` (with the theme's real `--video/--audio/--image` colours, read from a hidden probe element because `<html>`
  animates those variables right after a theme switch), `actions`, `tagline` (desktop-aware), `reduce`, `fx`, `tip(title,
  body, key)` (hover explainer attributes for HTML strings), `icon`, `logo`, colour helpers (`mix rgba luma inkOn`), and
  managed resources that are all released on close: `loop(fn)` (rAF), `after`, `every`, `wait`, `on(target, type, fn)`,
  `canvas(el, maxDpr)` (DPR-sharp, ResizeObserver, `s.onResize`), plus `startup(label)` (the switch) and `choose / run / close`.
- One file per theme in **`js/welcome/<theme>.js`**; every class is prefixed per theme (`wd- wb- wa- wx- wk- wo- ws- wt- wn-
  wp- w9- wq- wz- wg- wc-`) because the app has global classes like `.num`, `.hint`, `.tip` that otherwise leak in.
- The old generic welcome (`showWelcome` in main.js, `.welcome*` / `.wl-*` CSS in app.css and themes.css) was removed.
  `--welcome-bg` tokens are now unused but harmless. `sound.js` plays press sounds for `.wlx [data-pick], .wlx [data-act]`.

### The 15 screens
- **dark** "Sediment": editors settle in as rock layers (canvas), hovered layer swells with details, film grain.
- **light** Bento grid with live canvas previews (film playing with timeline + scrub on hover, live recording + spectrum +
  LUFS, raw/edited photo split), rotating tips, action tiles.
- **aero** Frutiger Aero: sky, sun glare, flowing light swooshes, glossy hill, soap bubbles; three glossy orbs with real
  `-webkit-box-reflect` reflections; Aero glass "Welcome Center" panel; orbs pop into bubbles when chosen.
- **xp** (Dreamcore, since the cloud session): the dream desktop (sky, drifting clouds, painted hill from `App.xp.walls()`),
  ghost 3D windows in the sky, a giant striped dialog "What do you want to make today?" with "Video." "Audio." "Image." buttons,
  a small "Are you sure you want to waste your life away? [No.]" dialog (No. = continue), and an XP taskbar with the links.
- **skeuo** "Strata SS-3" console on stitched leather: embossed title, brushed-metal plate with screws, scrolling dot-matrix
  LCD, analog VU meter, illuminated pads, rotary selector (wheel / drag / arrows), bat toggle switches for the actions.
- **oled** "Orbit": particle-logo sun (scatters from the mouse) + three planets on tilted orbits on true black; hover slows
  time and opens a card; invisible focus targets follow the planets for keyboard users.
- **synthwave** outrun sunset: striped sun (painted off-screen so the stripes don't cut the sky), wireframe mountains,
  racing neon grid, palms, chrome title + flickering neon "Studio", neon signs, VHS on-screen display + scanlines.
- **terminal** green-phosphor CRT boot log → ANSI-Shadow logo → ↑/↓/Enter menu, status line with the actions, scanlines,
  rolling refresh bar, flicker. Any key skips the boot (and reduced motion prints it instantly).
- **nord** arctic night: aurora curtains (sprite columns, tinted to the hovered editor), jagged snowy ridges with parallax,
  frozen lake mirroring the sky, falling snow, frosted-glass cards.
- **paper** "The Strata Times" front page: masthead, headline, three articles with hatched SVG engravings and drop caps,
  highlighter + red-pen circle on hover, "Extra!" stamp when chosen, classifieds for the actions, coffee ring.
- **classic** Windows 98: teal desktop with pixel icons (double-click), draggable "Welcome to Strata 98" window, Start menu
  with "Shut Down…", taskbar with quick launch and clock; the startup switch is the classic "Show this screen…" checkbox.
- **pastel** isometric clay slabs (CSS 3D, `@property --wp-pull/--wp-drop`), bobbing candy cubes, frosted card.
- **noir** opening titles: letterbox + timecode, 24 fps grain, venetian-blind light, ceiling-fan shadow, rain; L.A. Noire
  fonts; words fill with silver / brass / red "footage" on hover; any key or click skips the intro.
- **grove** San Andreas front end: Pricedown loading screen, halftone Los Santos sunset, SA menu (Video/Audio/Image, Load
  Game, Options, Controls, Continue), HUD clock + money, "MISSION PASSED! RESPECT +" when an editor is chosen.
- **contrast** Swiss typographic poster: giant type, thick rules, full-width rows that flood with the accent colour, big
  targets and strong focus rings, no decorative motion.

### Tested (browser preview)
- Every theme: renders without console errors; 1/2/3 open the right editor and close the screen (modalCount back to 0); Esc
  closes; actions close the screen and open their window; the startup switch writes `welcome` ('always' ↔ 'never'); with
  `reduce-motion` every editor choice is visible. Layouts checked at 800×500, 1024×640, 1280×800 and 1440×900 (Paper,
  Contrast and Light compact themselves on short windows).
- Testing gotchas: the hidden browser pane throttles timers and pauses CSS animations — finish finite animations with
  `document.getAnimations()` + `finish()` before screenshots; after `App.setTheme` wait until `<html data-theme>` changes.
- The design concepts in `design/welcome/` (not embedded in the exe) are the raw material some screens were adapted from.
- Desktop exe rebuilt (110.9 MB), smoke-tested with an isolated profile (`LOCALAPPDATA` → temp folder + debug port 9333): the
  welcome screen shows at launch, all 15 open without errors and were screenshotted from inside WebView2
  (scratchpad helper `cdpshot.mjs`: switches theme, opens the screen, `Page.captureScreenshot`). Copied to the Desktop.

## Previous step (2026-10-07, fifth session): 10 welcome-screen concepts (design exploration, done)
- The user first asked for 10 creative start-screen samples to pick from; that's what's below. They then asked for the
  per-theme approach above instead of picking one.
- Concepts live in `design/welcome/` (design exploration only — not loaded by the app or the exe). Open
  `http://localhost:5178/design/welcome/index.html` (gallery: ←/→ flip, O overview, H hides the bar, `#n` deep-links).
  Shared content/helpers: `common.js` (`SW.modes`, `SW.tagline`, `SW.logo()`, `SW.icon()`, `SW.choose()`, `SW.keys()`).
  01 Strata (sediment canvas) · 02 Light Table · 03 Oscilloscope · 04 Opening Titles · 05 Lava Lamp (SVG goo filter) ·
  06 Bento (live canvas previews) · 07 Isometric Stack (CSS 3D slabs, `@property --pull/--drop`) · 08 Boot Sequence (terminal,
  ↑/↓ + Enter) · 09 Orbit (particle logo + planets) · 10 Zine Collage (ransom note from the game fonts).
- Gotchas found: a `filter` on a `preserve-3d` element flattens it (put filters on the faces); duplicate ids between an SVG
  `<filter>` and a div break `getElementById`; the browser pane only runs rAF/CSS animations while visible or screenshotting.

## Previous request — DONE (2026-10-07)
All four parts are finished, tested in the browser pane and in the rebuilt `dist\Strata Studio.exe` (~3 MB).
1. **Auto-cut silences** (audio + video). Verified end-to-end: delete / shorten / mute / mark, marker ripple, undo, click-free joins
   (max sample jump stays at the signal's own slope), video splits + ripple, linked detached-audio partners, "All tracks" mode.
   Fixes made while testing: stats line printed `null` for mute/mark; Apply now re-detects if a slider moved within the same frame;
   video Mute no longer splits silent partner clips; preview colours follow the theme.
2. **Preferences window** (`js/core/prefs.js`, `App.showPrefs(section)`, Ctrl+,). Pages: Appearance, Sounds, Interface,
   Projects & saving, Video, Audio, Image, Fonts, Storage & backup, About. Every option is wired and applies live.
3. **15 themes + UI sounds.**
4. **Game fonts** extracted (see below). The temporary `tools/fonts/_preview/` folder was deleted.

### Themes (`js/core/themes.js` + `css/themes.css`)
- `themes.js` loads in `<head>`: `App.THEMES` catalog, `App.UI_FONTS`, and `App.applyLook(settings)`, which sets `data-theme`,
  `data-density`, `data-fx` (decorative effects), `.glass`, `.accent-custom`, `.reduce-motion` and inline vars (`--round`,
  `--panel-alpha`, `--font`, `--user-accent*`, `--chk-*`) on `<html>`. Theme switches use View Transitions (`App.setTheme`).
- `app.css` defaults live on `:root, [data-theme]`; each theme overrides tokens on `[data-theme="id"]` (never `html[...]`) so the
  gallery's live previews (`.theme-mini` with a real-class mock UI, scaled 0.4) render any theme in place.
- New tokens: `--ink` (r,g,b triplet for overlays: `rgba(var(--ink),.05)`), `--video/-2/-ink` (same for audio/image; the body maps
  them to `--accent` per editor), `--topbar-bg --menu-bg --toast-bg --pal-bg --scrim --tip-* --stage-bg --img-stage-bg
  --welcome-bg --panel-sheen --thumb --knob --clip-base/-2 --clip-sel --clip-text --heading-font --wall --round --panel-alpha`.
  All px border-radii are `calc(Npx * var(--round))`.
- `--accent-soft/-line/-glow` now live on `body` (they used to resolve on :root, so they were always orange — fixed).
- Canvas code reads colours from `App.th` (cached in ui.js, refreshed on the `'theme'` event, which also fires one debounced resize).

### UI sounds (`js/core/sound.js`)
- `App.sound(event, v, {force, pack})`, 14 synthesized packs in `PACKS`; events: click select on off tick open close menu grab drop
  success error warn notify switch; categories in `App.SOUND_CATS`. Hooks: global pointerdown/change/input/dragstart/drop, plus
  calls in ui.js (modal, menus, popover, palette, toast, splitter), main.js (editor switch, welcome), timeline clip move/trim,
  audio time-shift and marker drags. Never on image painting. Silent until the first user gesture and while media plays.
- `TRIM` balances the packs (measured with `App.soundMeasure(pack, event)` = offline render → peak and loudest-30 ms dB).
  At the default 55 % volume all packs sit around −48…−43 dB short-term, loudest peak −22 dBFS. Re-measure if you edit a sound.

### Settings added (`js/core/store.js`, `App.SETTING_DEFAULTS`)
theme accentMode accentColor uiFont roundness transparency density themeEffects checker checkerSize · sounds soundVolume soundPack
soundCats soundQuiet · toastPos toastTime welcome startMode · autosaveSpeed undoSize (`App.undoLimit(base)`) newVideo newImage
snapDefault rippleDefault stillDur audioView zeroSnapDefault. User fonts: IndexedDB `font:<family>` → `App.userFonts`
(`App.addUserFont`, `App.removeUserFont`, `App.loadUserFonts` at boot).

### Ideas not done
- ("Interface size" was done later — see "Interface size, wheel zoom, middle-button pan" above.)

### Game fonts: done
- **Tools** live in `tools/fonts/`:
  - `textures.mjs`: DDS, DXT and RenderWare TXD decoding, plus a PNG writer.
  - `gsmem.mjs`: emulates PS2 GS memory swizzle. The GTA files are the **PS2** version: textures are 4-bit, uploaded as PSMCT16 256×256, then read back as PSMT4.
  - `ttf.mjs`: bitmap → bicubic upsample → marching squares → RDP simplify → quadratic curve fit → TrueType writer.
  - `build-game-fonts.mjs`: run `node tools/fonts/build-game-fonts.mjs [gtaFolder] [laNoireFolder]` to regenerate.
- **Source folders:**
  - GTA SA (PS2 version): the game folder containing `models\fonts.txd` and `data\fonts.dat`.
  - L.A. Noire (PC): `<game folder>\final\pc\out.wad.pc`. The fonts are BMFont v3 entries; each font's DDS sheet is the next WAD entry.
- **Output:**
  - 10 TTFs in `fonts/game/`: San Andreas Subtitles / Pricedown / Gothic / Menu, and L.A. Noire Heroic / Chandler / Notebook / Subtitles / Typewriter / Futura.
  - `css/gamefonts.css` and `js/core/gamefonts.js` (`App.GAME_FONTS`), both included in `index.html`.
- **Integration:**
  - `App.fontOptions(base, current)` builds grouped `<optgroup>` lists. `App.select` now accepts `{group, options}` and `[value, label, style]`.
  - `App.ensureFont`, `App.isGameFont`, and a `'font-loaded'` event re-render the image text layers and the video frame.
  - `App.userFonts` is a placeholder for user-imported fonts, to be filled by the planned Fonts preferences page.
  - The image text tool and the video title inspector use the grouped lists. Picking a game font turns Bold off, since these fonts have one weight.
- **Licensing:** these typefaces are copyrighted (Rockstar). Each font's name table already states "Personal use only". Remind the user that the shared desktop exe embeds them.

## Key architecture notes
- Script order is in `index.html`:
  0. `core/themes` (in `<head>`)
  1. `core/icons`, `ui`, `gamefonts`, `store`, `sound`, `dsp`, `mux`, `demux`, `silence`
  2. `video/*`
  3. `audio/effects`, `audio/index`
  4. `image/filters`, `tools`, `index`, `fx-core`, `fx-filters`, `liquify`, `filter-gallery`, `camraw-core`, `camraw`
     (`video/captions.js` loads after `video/exportui.js`; workers: `image/camraw-worker.js`, `video/captions-worker.js`)
  5. `core/prefs`, `core/welcome`, `welcome/<theme>.js` ×15, `main.js`
- **UI kit** (`js/core/ui.js`):
  - elements: `h`, `btn`, `App.modal({title, body, buttons, width, clear, left, onClose})` (returns `{close, el, body, foot}`)
  - controls: `App.slider` (`row.set`/`row.get`), `App.select`, `App.toggle`, `App.seg` (`.set`), `App.color`, `App.colorPopover`
  - menus and feedback: `App.menubar`, `App.contextMenu`, `App.toast(msg, type, ms, {label, fn})`
  - other: `App.commandPalette`, `App.cssVar`
  - Icons live in `js/core/icons.js` (latest additions: `captions`).
- **Autosave**: `App.makeSaver(mod, fn, delay)` returns `touch`. `touch.now()` returns a promise, and saves queue so they never overlap. `App.flushAll()` saves all opened editors; the desktop app calls it before closing. A `'store-cleared'` event resets the saved-blob caches.
- **Image editor** (`js/image/index.js` and `tools.js`):
  - multiple document tabs, layer masks (white + alpha), live text layers, free transform, healing brush
  - selection tools: subject, colour range, feather and the rest
  - autosave to IndexedDB under `image:docs` and `image:L:<id>:<ver>`
- **Desktop launcher**: `desktop/src/main.rs`.
  - Serves the embedded files at `https://strata.localhost/`.
  - Downloads go to Downloads, with an in-app toast and "Show in folder".
  - Single instance, saves window size and position, and flushes autosave on close.
  - For debugging, set the env var `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` and run the CDP helper in `$TEMP/claude/cdp.mjs`.

## Testing tips
- Drive the app from the browser pane with `javascript_exec`.
- Before testing, close any welcome or modal overlays: `document.querySelectorAll('.modal-back,.welcome-back').forEach(m=>m.remove()); App.modalCount=0`.
- Screenshots can time out when the pane is hidden. Prefer JS checks.
- When you're done, clear test data from the preview's IndexedDB. Neutralize `flushSave` first so the unload doesn't save it again (see the earlier pattern: set `m.flushSave=()=>{}`, then `App.store.clear()`).
- Reset the viewport with `resize_window` preset "desktop".
- After web changes, rebuild the desktop exe with `build-desktop.bat` (embeds `vendor/` and `models/` too; ~110 MB output).
- `requestAnimationFrame` doesn't fire while the pane is hidden: kick renders manually in tests (e.g. `I.cameraRaw._debug.requestRender()`).
- For long or complex shell edits write a Python patch script to the scratchpad and run it — heredocs with mixed quotes break.
- **Line endings:** the repo mixes CRLF files (`index.html`, `css/app.css`, `js/core/ui.js`, `HANDOFF.md`, …) and LF files.
  Keep each file's ending. A Python script that opens files in text mode silently converts CRLF to LF and turns a small
  diff into thousands of changed lines; open them with `newline=''` instead.
