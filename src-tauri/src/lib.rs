mod scanner;

use serde::Serialize;
use std::{
    collections::HashSet,
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
struct ScanState {
    cancelled: Arc<AtomicBool>,
}

#[derive(Serialize)]
struct VolumeInfo {
    name: String,
    path: String,
    total_bytes: u64,
    available_bytes: u64,
}

fn volume_info(path: PathBuf, fallback_name: &str) -> Option<(u64, VolumeInfo)> {
    let metadata = std::fs::metadata(&path).ok()?;
    if !metadata.is_dir() {
        return None;
    }
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(fallback_name)
        .to_string();

    Some((
        metadata.dev(),
        VolumeInfo {
            name,
            total_bytes: fs2::total_space(&path).unwrap_or(0),
            available_bytes: fs2::available_space(&path).unwrap_or(0),
            path: path.to_string_lossy().into_owned(),
        },
    ))
}

#[tauri::command]
fn list_volumes() -> Vec<VolumeInfo> {
    let mut volumes = Vec::new();
    let mut seen_devices = HashSet::new();
    if let Some((device, volume)) = volume_info(PathBuf::from("/"), "Macintosh HD") {
        seen_devices.insert(device);
        volumes.push(volume);
    }

    if let Ok(entries) = std::fs::read_dir("/Volumes") {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some((device, volume)) = volume_info(path, "External volume") {
                if seen_devices.insert(device) {
                    volumes.push(volume);
                }
            }
        }
    }

    if volumes.len() > 1 {
        volumes[1..].sort_unstable_by(|left, right| left.name.cmp(&right.name));
    }
    volumes
}

#[tauri::command]
async fn scan_directory(
    path: String,
    include_protected: bool,
    app: AppHandle,
    state: State<'_, ScanState>,
) -> Result<scanner::ScanResult, String> {
    let cancelled = Arc::clone(&state.cancelled);
    cancelled.store(false, Ordering::Relaxed);

    tauri::async_runtime::spawn_blocking(move || {
        scanner::scan(path, app, cancelled, include_protected)
    })
    .await
    .map_err(|error| format!("The scan worker stopped unexpectedly: {error}"))?
}

#[tauri::command]
fn cancel_scan(state: State<'_, ScanState>) {
    state.cancelled.store(true, Ordering::Relaxed);
}

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err("That item no longer exists.".into());
    }

    Command::new("open")
        .arg("-R")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open Finder: {error}"))
}

#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if path.trim().is_empty() || target == Path::new("/") || target == Path::new("/Volumes") {
        return Err("Bytesize will not move a system root to the Trash.".into());
    }
    if !target.exists() {
        return Err("That item no longer exists.".into());
    }

    trash::delete(target).map_err(|error| format!("Could not move the item to the Trash: {error}"))
}

#[tauri::command]
fn open_full_disk_access() -> Result<(), String> {
    Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open System Settings: {error}"))
}

#[tauri::command]
fn has_full_disk_access() -> bool {
    let Some(home) = std::env::var_os("HOME") else {
        return false;
    };
    let database = PathBuf::from(home).join("Library/Application Support/com.apple.TCC/TCC.db");
    std::fs::File::open(database).is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ScanState::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.handle()
                    .set_activation_policy(tauri::ActivationPolicy::Regular)?;
                if let Some(window) = app.get_webview_window("main") {
                    window.show()?;
                    window.set_focus()?;
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_volumes,
            scan_directory,
            cancel_scan,
            reveal_in_finder,
            move_to_trash,
            open_full_disk_access,
            has_full_disk_access
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bytesize");
}

#[cfg(test)]
mod tests {
    use super::list_volumes;
    use std::{collections::HashSet, os::unix::fs::MetadataExt};

    #[test]
    fn mounted_volumes_do_not_repeat_the_same_filesystem() {
        let volumes = list_volumes();
        let mut devices = HashSet::new();
        for volume in volumes {
            let device = std::fs::metadata(&volume.path)
                .expect("listed volume should still exist")
                .dev();
            assert!(devices.insert(device), "duplicate volume: {}", volume.path);
        }
    }
}
