# Strata Studio — Strata Universal Editor (SUE)

This is an extremely lightweight universal editor that combines image editing, video editing, and audio editing.

A video, audio and image editor — plus a universal file converter — that runs in your browser. Nothing to install: it's plain HTML/CSS/JS, and your files never leave your computer — even the speech-recognition model behind Auto captions runs locally.

Every button, slider and menu item shows a small explainer bubble when you hover over it. You can turn the bubbles off, or change how quickly they appear, with the **Tips** button or in **Preferences** (Ctrl+,). Press **?** in any tab to see its keyboard shortcuts, and **Ctrl+K** to open the command palette and search every command in the current tab.

## Running it

- **Easiest:** double-click `start.bat`. It starts a small local server and opens the app at http://localhost:5178.
- **Manual:** run `node server.js`, then open http://localhost:5178.
- **Without Node:** open `index.html` directly. Everything works except Auto captions (it needs the local server or the desktop app) and possibly microphone recording, which some browsers only allow on `localhost`.

Chrome or Edge is recommended. They support fast MP4 export (WebCodecs) and every canvas and audio feature the app uses.

## Desktop app (Windows)

`dist\Strata Studio.exe` is the whole app as a single **~110 MB** program that works offline. Copy it anywhere and double-click it. Nothing needs to be installed on Windows 10/11. (About 105 MB of that is the built-in speech-recognition model for Auto captions; the app itself is ~3 MB.)

- **How it works:** it doesn't bundle a browser the way Electron does (~150 MB). It uses **WebView2**, the Edge web engine that's already part of Windows. The app's files are embedded in the exe and served from memory, so it opens in about half a second.
- **Saving:** work autosaves to `%LOCALAPPDATA%\StrataStudio` and is saved again when you close the window. Window size and position are remembered. Exports go to your **Downloads** folder, with a *Show in folder* button.
- **Shortcuts:** browser shortcuts like Ctrl+R and Ctrl+N belong to the app here, so they do the editor's actions instead of reloading the page.
- **Rebuilding:** after changing anything in `index.html`, `css`, `js`, `fonts`, `vendor` or `models`, run `build-desktop.bat`. It needs Rust (https://rustup.rs). The launcher source is in `desktop/src/main.rs`.
- **Older PCs:** a very old Windows 10 PC without WebView2 gets a message that opens Microsoft's free download page.
- **Sharing:** the exe isn't code-signed. If you send it over the internet, Windows SmartScreen will say "unknown publisher", and the recipient needs to click *More info → Run anyway*. Copying it over USB or a local network usually avoids that.

## Themes, sounds and preferences
- **15 themes**, switchable from the palette button in the top bar or **Preferences ▸ Appearance** (with live previews): Strata Dark and Light, Frutiger Aero, Windows XP Dreamcore, Skeuomorphic Studio, Midnight OLED, Synthwave, Terminal, Nord Frost, Paper & Ink, Classic 98, Pastel Pop, Film Noir, Grove Street and High Contrast.
- **A welcome screen for every theme**, shown each time Strata starts (turn it off with its "Show at startup" switch or in Preferences ▸ Interface): rock layers that settle in (Strata Dark), live previews in a bento grid (Light), glossy bubbles over a green hill (Frutiger Aero), a dreamlike XP desktop with a giant 3D dialog (Windows XP Dreamcore), a hardware console with VU meters and a rotary selector (Skeuomorphic), planets orbiting a particle logo (Midnight OLED), a neon outrun sunset (Synthwave), a CRT boot sequence (Terminal), an aurora over snowy peaks (Nord Frost), a newspaper front page (Paper & Ink), a Windows 98 desktop with a Start menu (Classic 98), clay slabs in 3D (Pastel Pop), opening titles in the rain (Film Noir), a San Andreas style menu (Grove Street) and a bold typographic poster (High Contrast). Press 1, 2 or 3 to open an editor, Esc to skip; every screen also has a way into the Converter.
- **UI sounds:** every theme has its own subtle sound pack (15 packs, all synthesized live, no audio files). Choose a pack, the volume and which kinds of actions make a sound, or turn them off. They stay quiet while your media plays.
- **Windows XP Dreamcore** turns Strata into the XP desktop you remember from a dream: an endless green hill with drifting clouds, every panel a chunky striped 3D window whose title-bar buttons work (maximize a window, hide side panels; the main window's buttons show the desktop, tighten the layout or open Turn Off Computer), a taskbar with a Start menu and clock, yellow balloon tips, big XP cursors and a slowed-down "Dream" sound pack.
- **Interface size:** make everything bigger or smaller, from 50% to 200%, under **View ▸ Interface size** in any editor, in **Preferences ▸ Appearance**, or with **Ctrl+Alt+=** / **Ctrl+Alt+-** (**Ctrl+Alt+0** goes back to 100%).
- **Timelines and the mouse:** in the Video and Audio tabs the mouse wheel zooms in and out at the pointer. Shift + wheel scrolls left and right, Alt + wheel scrolls up and down, and pressing the wheel and dragging moves the view in any direction. Prefer the wheel to scroll? Switch it under **View ▸ Mouse wheel** or **Preferences ▸ Interface**.
- **Preferences** (Ctrl+,) also covers: accent colour, interface font, corner roundness, glass transparency, density, notification placement, start-up behaviour, autosave timing, undo history, defaults for new video projects and images, timeline and canvas options, fonts (preview the game fonts or **import your own** .ttf/.otf/.woff files) and storage (usage, clearing, exporting and importing your preferences).

## Your work is saved automatically

- Each editor autosaves to your browser (IndexedDB) a moment after every change. When you reopen Strata Studio you're back where you left off. The pill in the top bar shows *Saved*, *Saving…* or *Unsaved changes*.
- **File ▸ Save project** (Ctrl+S) downloads a portable `.strata` file that contains everything: the timeline and its media, audio tracks with envelopes and markers, or images with layers, masks and editable text. Open it again with **File ▸ Open project**, or drop it onto the window.
- To start over, use **Preferences ▸ Storage & backup**, or turn autosave off.

## Video tab
- Multitrack timeline: add as many video/overlay and audio tracks as you like, each with hide, mute, solo and lock. Track heights cycle between compact, normal and tall.
- Cutting:
  - **S** splits at the playhead.
  - **Q** and **W** ripple-trim to the playhead.
  - The **Blade tool (C)** cuts where you click. Shift+click cuts every track.
  - Drag a clip's edge to trim it. The viewer shows the frame at the edit point as you drag.
  - **Ctrl+drag a cut** for a rolling edit, which moves the cut point between two clips without leaving a gap.
  - The **Slip tool (Y)** changes which part of the source plays without moving the clip.
  - Ripple editing, snapping, ripple delete and close-gap. Click the marker on a cut point to add a transition (or an audio crossfade) there.
- Editing: drag to move clips, Alt+drag to duplicate, Ctrl+drop to insert, and box-select multiple clips. Also copy/paste, copy/paste attributes, nudge, markers, in/out range, loop and J/K/L shuttle. Deleting shows a toast with an Undo button.
- **Keyframes:** click the diamond next to position, scale, rotation, opacity, volume and more to animate them. Choose ease, linear or hold interpolation, and press [ / ] to jump between keyframes. Keyframes move with the clip when you trim it.
- Inspector:
  - Transform, which you can also drag directly in the viewer.
  - Crop, fit/fill and blend modes.
  - Rounded corners, borders and shadows, with one-click picture-in-picture placements.
  - **Chroma key** (green/blue screen) with an eyedropper, tolerance, softness and spill removal. It runs on the GPU.
  - Ken-Burns motion, and color controls with one-click looks.
  - Per-clip speed with **Keep pitch**, so voices don't sound like chipmunks when sped up. Also volume, pan and fades.
- 18 transitions and animated title presets, including credits, typewriter, lower third and neon. Color mattes, freeze frame and detach audio.
- **Auto captions** (Clip ▸ Auto captions…, Ctrl+Shift+C): turns speech into timed captions with OpenAI's Whisper model, running on your own computer — no internet, nothing uploaded.
  - Detects the language automatically (or pick one of 30+), or translates the speech into English captions.
  - Listen to the whole timeline, the selected clips, one clip, or only the In → Out range.
  - Proofread every caption in an editable list before adding it; edits keep their timing.
  - 8 looks (Clean, Subtitles, Pop words, Highlight box, Word by word, Minimal, Impact, Neon) plus font, size, color, position, caption length, 1–2 balanced lines, UPPERCASE, box and outline. **Word highlights** color the word being spoken, slide a box behind it, or reveal words as they're said.
  - Captions land as editable text clips on a new "Captions" track. Restyle them all at once later, download them as **.srt**, or import **.srt / .vtt** subtitles (File menu).
- Audio scrubbing: you hear the audio while dragging the playhead.
- **Fast export:** frame-accurate rendering through WebCodecs. It runs much faster than real time and keeps going while the tab is in the background.
  - Formats: MP4 (H.264/AAC), WebM, animated **GIF**, and audio-only M4A, WAV or Opus.
  - One-click presets: Original, YouTube, Social, Web, 4K master, GIF and Audio only.
  - Quality levels, a size estimate, and export of the whole timeline or just the in→out range.
- Send a frame to the Image tab or the mix to the Audio tab.

## Audio tab
- Multitrack waveform editor with an overview strip, spectrogram view, sample-level zoom and selections that can span several tracks.
- Edit: cut, copy, paste, delete, silence, trim, duplicate or split to a new track, insert silence, time-shift, and snap to zero crossings.
- **Volume envelopes:** with the envelope tool (E), click a track to add points and drag them to make parts louder or quieter. They play back live, and you can bake them in later.
- **Markers and regions (M):** labelled, color-coded markers or regions for chapters and edit notes.
- Effects. Each has presets, a searchable rack, and a **live preview** that loops the selection while you move the sliders, with A/B comparison against the original.
  - Dynamics and volume: amplify, normalize, fades with curves, compressor, limiter, noise gate, **loudness normalize (LUFS)** and **auto-duck**, which lowers music under a voice track automatically.
  - EQ and filters: 10-band graphic EQ with a live response curve, high/low-pass, hum remover
  - Pitch and time: pitch shift and tempo change that keep the other unchanged, speed, reverse. Heavy processing runs in a background thread so the interface stays responsive.
  - Space and modulation: reverb, echo, chorus, tremolo, stereo width
  - Character: distortion, bitcrusher
  - Repair: noise reduction (capture a profile first), DC removal, invert
- Generators: tone, noise, click track, silence.
- Analysis: integrated / short-term / momentary loudness in LUFS, peak level, dynamics, DC offset and clipping, and a spectrum plot.
- Microphone recording, with a choice of input device, plays your existing tracks while you record. Live spectrum analyzer and level meters.
- Export WAV (16/24/32-bit), M4A (AAC) or Opus, optionally loudness-normalized for streaming or podcasts. You can also send the mix to the Video tab.

## Image tab
- **Multiple images in tabs.** Every image you open or create gets its own tab with its own layers and undo history. Drop files onto the tab bar to open them, or onto the canvas to add them as layers.
- A guided **workflow bar**: Open, then Crop & rotate, then Adjust, then Paint & retouch, then Export.
- Paint tools (MS Paint style): brush, pencil, eraser, fill bucket, gradient and shapes (rectangle, rounded, ellipse, line, arrow, triangle, star, heart, speech bubble). Left-click paints the primary color, right-click the secondary. There's a palette plus a full color picker.
- **Editable text layers:** text stays live. Click it with the Text tool (or double-click it) to change the words, font, size, style or color, and drag it with the Move tool. It only becomes pixels if you paint on it or choose *Rasterize*.
- **Layer masks:** hide parts of a layer without erasing anything.
  - Paint black to hide and white to reveal. Grey partly hides, and gradients make smooth fades.
  - Create a mask from a selection with one click.
  - Invert, disable, view the mask itself, show it as a red overlay (\\), apply it, or load it as a selection.
  - Filters and adjustments work on a selected mask too. For example, blur a mask to soften its edge.
- **Free transform (Ctrl+T):** scale, rotate, flip and move a layer or a selection with handles, or type exact values. Masks follow their layer.
- **Healing brush (J):** paint over a blemish, spot or scratch and it's replaced with matching texture from nearby, blended seamlessly. There's also the clone stamp, and a retouch brush that can blur, sharpen, dodge, burn or change saturation.
- Selections: rectangle, ellipse, lasso and magic wand, with add/subtract/intersect modes. The **Select** menu adds:
  - **Select subject / background** for plain backdrops, and **color range** with soft edges.
  - Selection from layer transparency.
  - Feather, grow, shrink, border, smooth and reselect.
  - Painting and filters stay inside the selection.
- Layers: opacity, 16 blend modes, drag to reorder, lock/hide (Alt+click to solo), merge down, merge visible, layer via copy/cut, drop shadow and outline.
- **Adjust panel** (Lightroom-style): live sliders for exposure, contrast, highlights, shadows, temperature, tint, vibrance, saturation, clarity, fade, vignette and grain, plus 12 one-click looks and a histogram.
- Adjust and Filter menus: levels, curves, hue/saturation, color balance, black & white, photo filter, channel mixer, gradient map, selective color, shadows/highlights, replace color, color lookup, HDR toning, equalize, auto tone / contrast / color and more. Each opens with a live preview and a hold-to-compare button.
- **Photoshop-style Filter menu** with 68 filters, organised like Photoshop: Blur (Gaussian, lens, motion, radial, smart, surface, shape…), **Blur Gallery** (field, iris, tilt-shift, spin), Distort (displace, pinch, polar, ripple, shear, spherize, twirl, wave, zigzag), Noise (add, despeckle, dust & scratches, median, reduce), Pixelate (color halftone, crystallize, facet, fragment, mezzotint, mosaic, pointillize), Render (clouds, difference clouds, fibers, lens flare, lighting effects), Sharpen (smart sharpen, unsharp mask…), Stylize (diffuse, emboss, extrude, find edges, oil paint, solarize, tiles, trace contour, wind), Video, Other (custom kernel, high pass, maximum, minimum, offset), plus Adaptive Wide Angle, Lens Correction, Smart Denoise and Enhance Detail. **Last Filter** (Ctrl+Alt+F) repeats the previous one.
- **Liquify** (Shift+Ctrl+X): forward warp, reconstruct, smooth, twirl, pucker, bloat, push left, freeze/thaw masks, with brush size, density, pressure and rate.
- **Filter Gallery**: 47 artistic effects (Artistic, Brush Strokes, Distort, Sketch, Stylize, Texture) with thumbnails and a stack of effect layers.
- **Camera Raw Filter** (Shift+Ctrl+A): a full develop workspace modelled on Adobe Camera Raw — profiles, Light, Color, Effects (texture, clarity, dehaze, vignette, grain, glow), point & parametric Curves, Color Mixer / B&W Mixer, 3-way Color Grading wheels, Detail, Optics (chromatic aberration, distortion, defringe), Geometry (upright, perspective), **Lens Blur** with bokeh shapes and a focus picker, Calibration; plus Crop & rotate, Remove (heal/clone), **Masking** (subject, sky, background, brush, linear, radial, luminance range), Red eye, presets, snapshots, before/after, histogram with clipping warnings and color samplers. It renders in a background thread and applies at full resolution.
- Crop with aspect-ratio presets, straighten, resize, canvas size, rotate and flip. View options include a grid, rulers and a pixel grid when zoomed in. The status bar shows the color under the cursor. The History panel lets you click back to any earlier step.
- Export as PNG, JPEG or WebP with quality and scale settings, or copy the finished image to the clipboard.

## Convert tab
A universal file converter (**Alt+4**, or *Convert files…* in any editor's File menu, the welcome screen or the command palette). Drop in any video, sound, picture or subtitle file and get it back in another format: MKV → MP4, MP4 → MP3, MOV → GIF, FLAC → WAV, WAV → MP3, AVI → MP4, PNG → JPEG, AVIF/SVG → PNG, MKV → SRT and hundreds more combinations. It runs FFmpeg on your own computer (nothing is uploaded).

- **Reads almost anything:** hundreds of containers and codecs (MKV, MP4, MOV, AVI, WMV, FLV, TS/MTS, WebM, MP3, FLAC, WAV, AAC, AC3, DTS, Opus, OGG, WMA, PNG, JPEG, WebP, TIFF, BMP, GIF, SRT, ASS…). Pictures FFmpeg can't open (AVIF, SVG) are decoded by the browser first.
- **Writes:** video MP4, MKV, MOV, WebM, AVI, WMV, FLV, TS, MPEG-2, OGV and animated GIF · audio MP3, AAC, ALAC, FLAC, WAV, AIFF, OGG, Opus, WMA, AC3, or the original sound pulled out untouched · pictures PNG, JPEG, WebP, GIF, BMP, TIFF, ICO, TGA · subtitles SRT, VTT, ASS.
- **Full quality:** at *Best*, every stream the new format can hold is copied exactly as it is (no loss, and usually done in a second or two, e.g. MKV → MP4). Only what doesn't fit is re-encoded, at the highest settings (H.264 CRF 16, AAC/MP3 320 kbps…). Lossless targets keep the source's bit depth. The panel on the right shows exactly what will happen ("Copy the H.264 video as it is — no quality loss") and a size estimate.
- **Settings per file:** quality (Best / High / Balanced / Small), video codec (H.264, H.265, ProRes), resolution, frame rate, which sound tracks and subtitles to keep, bitrate, sample rate, channels, bit depth, loudness evening (−14 LUFS), trimming, keeping or stripping tags, the frame to grab from a video, the picture for a sound-only video (animated waveform, spectrum, black or your own image), and GIF size and speed. *Make default* remembers them for new files.
- **A queue:** add many files and convert them all, one after another, while you keep working in the other tabs (the Convert tab shows its progress). Each result can be downloaded, saved automatically, packed into a ZIP with the others, opened in the Video, Audio or Image editor, or dragged onto their tabs. Things from the editors can come in too: the Video media bin (right-click ▸ *Convert to another format…*), the Audio editor's mix and the Image editor's picture.
- **Limits:** each result is built in memory, so it can be up to about 2 GB. WebM is written with VP8 video. Long video re-encodes run at roughly real time for HD (copies are instant). A trimmed copy leaves subtitles out (FFmpeg can't keep their timing exact across a cut); convert the whole file, or save them as SRT, to keep them.

## Project layout
```
index.html          app shell
css/app.css         design system and layout
js/core/            UI kit (tooltips, menus, modals, color picker, command palette), icons,
                    storage/autosave/.strata files, DSP (worker), MP4/WebM/GIF muxers, demuxers,
                    themes, UI sounds, Preferences window, silence remover, welcome screens,
                    interface size (uiscale.js)
js/welcome/         one welcome screen per theme
css/themes.css      the 15 themes
js/video/           model + keyframes, compositor, playback, offline export, timeline,
                    media bins, viewer, inspector, export dialog, Auto captions (+ speech worker)
vendor/             transformers.js + ONNX Runtime (WebAssembly) for local speech recognition
models/whisper-base OpenAI Whisper base (8-bit) used by Auto captions
js/audio/           effect definitions and the editor
js/image/           filters (incl. healing), tools, the editor, Photoshop-style filters, Liquify,
                    Filter Gallery and Camera Raw (+ its render worker)
js/convert/         the Convert tab: formats + planner, engine host, the ffmpeg worker, the workspace
css/convert.css     the Convert tab's styles (and its colour in every theme)
vendor/ffmpeg/      FFmpeg compiled to WebAssembly (multi-threaded; GPL, see its README)
fonts/              bundled web fonts (so everything works offline)
desktop/            native Windows launcher (Rust + WebView2) → build-desktop.bat → dist\
server.js           zero-dependency static server
```
