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
  - MP4 / WebM / GIF export.
- **Audio:**
  - Live recording with a real-time waveform.
  - 25+ effects, noise reduction and LUFS loudness.
  - Auto-duck, envelopes and markers.
- **Image:**
  - Layers, masks and selections.
  - A Photoshop-style Filter menu (68 filters), Filter Gallery and Liquify.
  - A full Camera Raw filter.
  - Healing brush, clone and text.
- **Drag and drop between the three editors:** audio → video, image → video, frames → image, and more.
- **15 themes, each with its own animated welcome screen:**
  - Themes: Terminal, Frutiger Aero, Windows XP, Windows 98, Paper, Film Noir, Synthwave, Grove Street and more.
  - Each theme has synthesized UI sounds.
  - A Preferences window with all settings.
- **Polish:** autosave, a command palette (Ctrl+K), a shortcuts sheet (?), and hover explainers on every control.
- **Windows desktop app:**
  - Single instance; remembers the window position.
  - Downloads go to the Downloads folder.
  - Autosave is flushed when the window closes.

### In progress
- Nothing is half-done. The last task (one welcome screen per theme) is finished and tested in the browser and the exe.
- `qa/harness.js` is a temporary QA script that runs every menu command in the browser preview. It isn't part of the app.

### What's next (ideas, not started)
- Image features that aren't implemented yet: Vanishing Point, Neural Filters and Smart Filters.
- An "Interface size" (zoom) setting. In the desktop app this could go through wry's `WebView::zoom`, because CSS `zoom`
  breaks the canvas pointer maths.
- Subject, sky and depth masks in Camera Raw are heuristics. A small local segmentation model would make them much better.
- Cross-platform desktop builds (macOS / Linux). wry and tao support them, but only Windows has been built and tested.
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

> **START HERE:** there is no open task. The latest finished work is **"One welcome screen per theme"** below.

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

## Latest request — DONE (2026-10-07, sixth session): one welcome screen PER THEME
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
- **xp** XP log-on screen: boot screen with moving blue blocks, "To begin, click your editor", editors as user accounts with
  SVG account pictures, "Loading your personal settings…" → big italic "welcome" when chosen, red "Continue" power button.
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
- "Interface size" (zoom) was skipped: CSS `zoom` breaks the canvas pointer maths. In the desktop app it could be done safely
  through an IPC message to wry's `WebView::zoom`.

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
