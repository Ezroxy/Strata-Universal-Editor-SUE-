//! Strata Studio desktop launcher.
//!
//! A tiny native window that hosts the app in WebView2 — the web engine that ships with Windows 10/11 —
//! instead of bundling a private copy of Chromium the way Electron does. The whole app (HTML, CSS, JS,
//! fonts) is embedded in this executable and served from memory, so it starts fast and works offline.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    borrow::Cow,
    cell::RefCell,
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    rc::Rc,
    thread,
    time::Duration,
};
use tao::{
    dpi::{LogicalSize, PhysicalPosition, PhysicalSize},
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    platform::windows::IconExtWindows,
    window::{Icon, Theme, WindowBuilder},
};
use wry::{
    http::{header::CONTENT_TYPE, Request, Response},
    NewWindowResponse, PageLoadEvent, WebContext, WebViewBuilder, WebViewBuilderExtWindows,
};

include!(concat!(env!("OUT_DIR"), "/assets.rs"));

const TITLE: &str = "Strata Studio";
/// Custom-protocol origin. `https://*.localhost` counts as a secure context, which the app needs for
/// WebCodecs (fast export), the microphone and the clipboard. Keep it stable: browser storage
/// (autosaved projects, settings) is tied to it.
const ORIGIN: &str = "https://strata.localhost/";
const BG: (u8, u8, u8, u8) = (14, 15, 18, 255);
const WEBVIEW2_DOWNLOAD: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

enum UserEvent {
    Show,
    Downloaded(PathBuf, bool),
    CloseNow,
}

fn main() {
    if !claim_single_instance() {
        return;
    }
    let data_dir = data_dir();
    let _ = fs::create_dir_all(&data_dir);

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    // ---- window: restore last size/position if it is still on a connected monitor ----
    let mut wb = WindowBuilder::new()
        .with_title(TITLE)
        .with_visible(false) // shown once the app has painted → no white flash
        .with_theme(Some(Theme::Dark))
        .with_background_color(BG)
        .with_min_inner_size(LogicalSize::new(980.0, 640.0));
    let saved = load_geometry(&data_dir).filter(|g| {
        event_loop.available_monitors().any(|m| {
            let (p, s) = (m.position(), m.size());
            let (x, y) = (g.x + 80, g.y + 20);
            x >= p.x && y >= p.y && x < p.x + s.width as i32 && y < p.y + s.height as i32
        })
    });
    match &saved {
        Some(g) => {
            wb = wb
                .with_position(PhysicalPosition::new(g.x, g.y))
                .with_inner_size(PhysicalSize::new(g.w, g.h))
                .with_maximized(g.max);
        }
        None => {
            if let Some(m) = event_loop.primary_monitor() {
                let sf = m.scale_factor();
                let ms = m.size().to_logical::<f64>(sf);
                let (w, h) = (1440f64.min(ms.width * 0.92), 900f64.min(ms.height * 0.88));
                let p = m.position();
                wb = wb.with_inner_size(LogicalSize::new(w, h)).with_position(PhysicalPosition::new(
                    p.x + ((ms.width - w) / 2.0 * sf) as i32,
                    p.y + ((ms.height - h) / 2.0 * sf * 0.7) as i32,
                ));
            }
        }
    }
    if let Ok(icon) = Icon::from_resource(1, None) {
        wb = wb.with_window_icon(Some(icon));
    }
    let window = match wb.build(&event_loop) {
        Ok(w) => w,
        Err(e) => return fatal(&format!("Could not create the window.\n\n{e}")),
    };

    // ---- web view ----
    let mut context = WebContext::new(Some(data_dir.join("WebView")));
    let saved_files: Rc<RefCell<HashSet<PathBuf>>> = Rc::default();
    let (p_load, p_ipc, p_dl) = (proxy.clone(), proxy.clone(), proxy.clone());
    let (files_ipc, files_dl) = (saved_files.clone(), saved_files.clone());
    let built = WebViewBuilder::new_with_web_context(&mut context)
        .with_custom_protocol("strata".into(), |_, req| serve(&req))
        .with_https_scheme(true)
        .with_url("strata://localhost/index.html")
        .with_background_color(BG)
        .with_devtools(cfg!(debug_assertions))
        .with_hotkeys_zoom(false) // the editors use Ctrl+wheel themselves
        .with_browser_accelerator_keys(false) // frees Ctrl+R / Ctrl+N / F5 … for the app's own shortcuts
        .with_clipboard(true)
        .with_initialization_script("window.__strataDesktop = true;")
        .with_navigation_handler(|url| {
            let inside = url.starts_with(ORIGIN) || url.starts_with("about:") || url.starts_with("blob:") || url.starts_with("data:");
            if !inside {
                open_external(&url);
            }
            inside
        })
        .with_new_window_req_handler(|url, _| {
            open_external(&url);
            NewWindowResponse::Deny
        })
        .with_on_page_load_handler(move |ev, _| {
            if let PageLoadEvent::Finished = ev {
                let _ = p_load.send_event(UserEvent::Show);
            }
        })
        .with_ipc_handler(move |req: Request<String>| {
            let msg = req.body();
            if cfg!(debug_assertions) { eprintln!("[strata] ipc: {msg}"); }
            if msg == "close-ok" {
                let _ = p_ipc.send_event(UserEvent::CloseNow);
            } else if let Some(path) = msg.strip_prefix("reveal:") {
                let p = PathBuf::from(path);
                if files_ipc.borrow().contains(&p) {
                    reveal(&p); // only files this app saved
                }
            }
        })
        // exports go straight to Downloads (never overwriting); the app then shows where they went
        .with_download_started_handler(|_, path| {
            *path = unique_path(path);
            true
        })
        .with_download_completed_handler(move |_, path, ok| {
            if let Some(p) = &path {
                files_dl.borrow_mut().insert(p.clone());
            }
            let _ = p_dl.send_event(UserEvent::Downloaded(path.unwrap_or_default(), ok));
        })
        .build(&window);
    let webview = match built {
        Ok(w) => w,
        Err(e) => {
            open_external(WEBVIEW2_DOWNLOAD);
            return fatal(&format!(
                "Strata Studio needs the Microsoft Edge WebView2 Runtime, which is built into Windows 11 and most Windows 10 PCs.\n\n\
                 The download page has been opened — install it, then start Strata Studio again.\n\n({e})"
            ));
        }
    };

    // safety net in case the page never reports that it finished loading
    let p_show = proxy.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(3000));
        let _ = p_show.send_event(UserEvent::Show);
    });

    let mut shown = false;
    let mut closing = false;
    let mut normal = window.outer_position().ok().map(|p| {
        let s = window.inner_size();
        (p.x, p.y, s.width, s.height)
    });
    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(UserEvent::Show) if !shown => {
                shown = true;
                window.set_visible(true);
                // Windows applies the launcher's "start minimized/hidden" hint to the first window shown
                // (e.g. when started from a script); the app should always open on screen.
                if window.is_minimized() {
                    window.set_minimized(false);
                }
                window.set_focus();
                let _ = webview.focus();
            }
            Event::UserEvent(UserEvent::Downloaded(path, ok)) => {
                let js = if ok {
                    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                    format!(
                        "window.App&&App.toast({},'ok',7000,{{label:'Show in folder',fn:()=>window.ipc.postMessage({})}})",
                        js_str(&format!("Saved to Downloads · {name}")),
                        js_str(&format!("reveal:{}", path.display()))
                    )
                } else {
                    "window.App&&App.toast('The file could not be saved','err',5000)".to_string()
                };
                let _ = webview.evaluate_script(&js);
            }
            Event::WindowEvent { event: WindowEvent::Moved(_) | WindowEvent::Resized(_), .. } => {
                if shown && !window.is_maximized() && !window.is_minimized() {
                    if let Ok(p) = window.outer_position() {
                        let s = window.inner_size();
                        normal = Some((p.x, p.y, s.width, s.height));
                    }
                }
            }
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
                if closing {
                    *control_flow = ControlFlow::Exit;
                    return;
                }
                closing = true;
                if cfg!(debug_assertions) { eprintln!("[strata] close requested"); }
                if let Some((x, y, w, h)) = normal {
                    save_geometry(&data_dir, &Geometry { x, y, w, h, max: window.is_maximized() });
                }
                // Hide right away so closing feels instant, let autosave finish, then quit.
                window.set_visible(false);
                let _ = webview.evaluate_script(
                    "(async()=>{try{await Promise.race([window.App&&App.flushAll?App.flushAll():0,new Promise(r=>setTimeout(r,4000))])}catch(e){}window.ipc.postMessage('close-ok')})()",
                );
                let p = proxy.clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_secs(5));
                    let _ = p.send_event(UserEvent::CloseNow);
                });
            }
            Event::UserEvent(UserEvent::CloseNow) => { if cfg!(debug_assertions) { eprintln!("[strata] CloseNow -> Exit"); } *control_flow = ControlFlow::Exit }
            Event::LoopDestroyed => { if cfg!(debug_assertions) { eprintln!("[strata] loop destroyed"); } }
            _ => {}
        }
    });
}

/// Serves an embedded file for `https://strata.localhost/<path>`.
fn serve(req: &Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let path = req.uri().path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    match ASSETS.iter().find(|(p, _)| *p == path) {
        Some((p, bytes)) => Response::builder()
            .header(CONTENT_TYPE, mime(p))
            .header("Cache-Control", "no-store") // served from memory anyway; avoids stale files after an update
            // cross-origin isolation: lets the captions model run on several CPU threads (SharedArrayBuffer)
            .header("Cross-Origin-Opener-Policy", "same-origin")
            .header("Cross-Origin-Embedder-Policy", "require-corp")
            .header("Cross-Origin-Resource-Policy", "same-origin")
            .body(Cow::Borrowed(*bytes))
            .unwrap(),
        None => Response::builder()
            .status(404)
            .header(CONTENT_TYPE, "text/plain")
            .body(Cow::Borrowed(&b"Not found"[..]))
            .unwrap(),
    }
}

fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "wasm" => "application/wasm",
        "css" => "text/css; charset=utf-8",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "json" => "application/json",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn data_dir() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)))
        .unwrap_or_default()
        .join("StrataStudio")
}

struct Geometry {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    max: bool,
}

fn load_geometry(dir: &Path) -> Option<Geometry> {
    let s = fs::read_to_string(dir.join("window.txt")).ok()?;
    let v: Vec<i64> = s.split_whitespace().filter_map(|t| t.parse().ok()).collect();
    if v.len() != 5 || v[2] < 400 || v[3] < 300 {
        return None;
    }
    Some(Geometry { x: v[0] as i32, y: v[1] as i32, w: v[2] as u32, h: v[3] as u32, max: v[4] != 0 })
}

fn save_geometry(dir: &Path, g: &Geometry) {
    let _ = fs::write(dir.join("window.txt"), format!("{} {} {} {} {}", g.x, g.y, g.w, g.h, g.max as u8));
}

/// `name.ext` → `name (1).ext`, `name (2).ext`, … if the file already exists.
fn unique_path(p: &Path) -> PathBuf {
    if p.as_os_str().is_empty() || !p.exists() {
        return p.to_path_buf();
    }
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (1..)
        .map(|n| p.with_file_name(format!("{stem} ({n}){ext}")))
        .find(|c| !c.exists())
        .unwrap()
}

/// JavaScript string literal.
fn js_str(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\u{2028}' => o.push_str("\\u2028"),
            '\u{2029}' => o.push_str("\\u2029"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn reveal(p: &Path) {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("explorer").raw_arg(format!("/select,\"{}\"", p.display())).spawn();
}

/// Opens web links in the user's normal browser (the app window only ever shows Strata itself).
fn open_external(url: &str) {
    if url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:") {
        let _ = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn();
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

/// Only one Strata window at a time (both would autosave into the same storage). A second launch
/// brings the existing window to the front instead.
fn claim_single_instance() -> bool {
    use windows_sys::Win32::{
        Foundation::{GetLastError, ERROR_ALREADY_EXISTS},
        System::Threading::CreateMutexW,
        UI::WindowsAndMessaging::{FindWindowW, IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW},
    };
    let name = wide("Local\\StrataStudio.SingleInstance");
    unsafe {
        // The handle is intentionally never closed: it marks this process as the running instance.
        let h = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
        if !h.is_null() && GetLastError() == ERROR_ALREADY_EXISTS {
            let hwnd = FindWindowW(std::ptr::null(), wide(TITLE).as_ptr());
            if !hwnd.is_null() {
                ShowWindow(hwnd, if IsIconic(hwnd) != 0 { SW_RESTORE } else { SW_SHOW });
                SetForegroundWindow(hwnd);
            }
            return false;
        }
    }
    true
}

fn fatal(msg: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
    unsafe {
        MessageBoxW(std::ptr::null_mut(), wide(msg).as_ptr(), wide(TITLE).as_ptr(), MB_ICONERROR | MB_OK);
    }
}
