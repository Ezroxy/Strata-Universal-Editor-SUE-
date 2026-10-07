//! Embeds the web app (index.html, css/, js/, fonts/, vendor/ speech runtime, models/ speech model) into the
//! executable and attaches the icon.
use std::{env, fs, path::Path};

fn main() {
    let manifest = env::var("CARGO_MANIFEST_DIR").unwrap();
    let root = Path::new(&manifest).parent().expect("desktop/ must live inside the app folder");

    let mut files = Vec::new();
    for entry in ["index.html", "css", "js", "fonts", "vendor", "models"] {
        let p = root.join(entry);
        println!("cargo:rerun-if-changed={}", p.display());
        collect(root, &p, &mut files);
    }
    files.sort();
    let mut out = String::from("/// (path relative to the app root, file bytes)\npub static ASSETS: &[(&str, &[u8])] = &[\n");
    for (rel, abs) in &files {
        out += &format!("    ({rel:?}, include_bytes!({abs:?})),\n");
    }
    out += "];\n";
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join("assets.rs"), out).unwrap();

    println!("cargo:rerun-if-changed=icon.ico");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("icon.ico")
            .set("FileDescription", "Strata Studio")
            .set("ProductName", "Strata Studio")
            .set("OriginalFilename", "Strata Studio.exe");
        res.compile().expect("failed to embed the icon (is the Windows SDK installed?)");
    }
}

fn collect(root: &Path, p: &Path, out: &mut Vec<(String, String)>) {
    if p.is_dir() {
        for e in fs::read_dir(p).unwrap() {
            collect(root, &e.unwrap().path(), out);
        }
    } else if p.is_file() {
        let rel = p.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
        out.push((rel, p.to_string_lossy().into_owned()));
    }
}
