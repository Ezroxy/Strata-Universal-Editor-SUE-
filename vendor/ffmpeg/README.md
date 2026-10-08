# FFmpeg (WebAssembly) — the Converter's engine

These files are the multi-threaded WebAssembly build of FFmpeg from the
[ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) project, package
[`@ffmpeg/core-mt` 0.12.10](https://www.npmjs.com/package/@ffmpeg/core-mt) (the `dist/esm` folder):

| File | What it is |
| --- | --- |
| `ffmpeg-core.js` | Emscripten loader (ES module) |
| `ffmpeg-core.wasm` | FFmpeg 5.1 compiled to WebAssembly, with x264, x265, libvpx, LAME, Opus, Vorbis, Theora, libwebp, zlib… |
| `ffmpeg-core.worker.js` | The helper each FFmpeg thread runs in |

**Licence:** GPL-2.0-or-later (FFmpeg is built with GPL components such as x264 and x265).
Source code: <https://github.com/ffmpegwasm/ffmpeg.wasm> (build scripts) and <https://ffmpeg.org/download.html>.
Distributing Strata Studio with these files (the desktop exe embeds them) means the GPL applies to that distribution.

**One local change** in `ffmpeg-core.js`: the error handler in `exec()` / `ffprobe()` read `e.message` without checking
that the thrown value was an Error, which turned some engine failures into an unrelated "Cannot read properties of
undefined" message. It now reads `if(!(e&&e.message&&e.message.startsWith("Aborted"))){throw e}`.

**Known limits of this build** (worked around in `js/convert/formats.js`):

- VP9 encoding hangs, so WebM is written with VP8.
- The libopus encoder hangs on stereo and surround, so Opus uses FFmpeg's own encoder.
- More than 4 encoder threads can abort a run, so the Converter always passes `-threads 4` or fewer.
- Each output file is built in memory: about 2 GB at most.

Used by `js/convert/ffworker.js`, and loaded only when the Convert tab needs it.
