#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::mpsc;
use tauri::{AppHandle, Emitter};

use base64::{engine::general_purpose::STANDARD, Engine};

#[derive(Clone, Serialize)]
struct EmotionState {
    emotion: String,
    line: String,
    #[serde(rename = "statusLine")]
    status_line: String,
    source: String,
    timestamp: u64,
}

#[derive(Clone, Serialize)]
struct EmotionUpdate {
    #[serde(flatten)]
    state: EmotionState,
    #[serde(rename = "imageData")]
    image_data: String,
}

fn get_project_root() -> PathBuf {
    // viewers/tauri/src-tauri/ → project root is 3 levels up
    let exe = std::env::current_exe().unwrap_or_default();
    let mut root = exe.parent().unwrap_or(std::path::Path::new(".")).to_path_buf();

    // In dev mode, try to find state.json by walking up
    for _ in 0..10 {
        if root.join("core").join("state.json").exists() {
            return root;
        }
        if !root.pop() {
            break;
        }
    }

    // Fallback: use current dir and walk up
    let mut cwd = std::env::current_dir().unwrap_or_default();
    for _ in 0..10 {
        if cwd.join("core").join("state.json").exists() {
            return cwd;
        }
        if !cwd.pop() {
            break;
        }
    }

    std::env::current_dir().unwrap_or_default()
}

fn read_image_base64(assets_dir: &PathBuf, emotion: &str) -> String {
    let path = assets_dir.join(format!("{}.webp", emotion));
    if let Ok(bytes) = fs::read(&path) {
        format!("data:image/webp;base64,{}", STANDARD.encode(&bytes))
    } else {
        String::new()
    }
}

fn read_state(state_path: &PathBuf) -> Option<EmotionState> {
    let content = fs::read_to_string(state_path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    Some(EmotionState {
        emotion: v["emotion"].as_str().unwrap_or("neutral").to_string(),
        line: v["line"].as_str().unwrap_or("").to_string(),
        status_line: v["statusLine"].as_str().unwrap_or("").to_string(),
        source: v["source"].as_str().unwrap_or("hook").to_string(),
        timestamp: v["timestamp"].as_u64().unwrap_or(0),
    })
}

#[tauri::command]
fn get_initial_state() -> Option<EmotionUpdate> {
    let root = get_project_root();
    let state = read_state(&root.join("core").join("state.json"))?;
    let image_data = read_image_base64(&root.join("assets"), &state.emotion);
    Some(EmotionUpdate { state, image_data })
}

#[tauri::command]
fn get_lines() -> String {
    let root = get_project_root();
    let lines_path = root.join("assets").join("characters").join("default").join("lines.json");
    fs::read_to_string(lines_path).unwrap_or_else(|_| "{}".to_string())
}

fn start_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let root = get_project_root();
        let state_path = root.join("core").join("state.json");

        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
        let mut watcher = RecommendedWatcher::new(tx, notify::Config::default())
            .expect("Failed to create watcher");

        watcher
            .watch(state_path.parent().unwrap(), RecursiveMode::NonRecursive)
            .expect("Failed to watch state.json directory");

        let assets_dir = root.join("assets");

        // Send initial state
        if let Some(state) = read_state(&state_path) {
            let image_data = read_image_base64(&assets_dir, &state.emotion);
            let _ = app.emit("emotion-update", EmotionUpdate { state, image_data });
        }

        for res in rx {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    // Small delay for write completion
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    if let Some(state) = read_state(&state_path) {
                        let image_data = read_image_base64(&assets_dir, &state.emotion);
                        let _ = app.emit("emotion-update", EmotionUpdate { state, image_data });
                    }
                }
            }
        }
    });
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_initial_state, get_lines])
        .setup(|app| {
            start_watcher(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
