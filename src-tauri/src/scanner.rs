use rayon::prelude::*;
use serde::Serialize;
use std::{
    cell::Cell,
    collections::{HashMap, HashSet},
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

#[derive(Clone, Debug, Serialize)]
pub struct DiskNode {
    pub id: u32,
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub is_dir: bool,
    pub children: Vec<DiskNode>,
}

#[derive(Clone, Serialize)]
struct ScanProgress {
    bytes_scanned: u64,
    estimated_total_bytes: Option<u64>,
    files_scanned: u64,
    discovered_files: u64,
    processed_files: u64,
    total_files: Option<u64>,
    skipped_entries: usize,
    current_path: String,
    phase: &'static str,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub root: DiskNode,
    pub files_scanned: u64,
    pub skipped_entries: usize,
    pub skipped_bytes: u64,
    pub protected_entries: usize,
    pub access_limited: bool,
}

struct ScanExclusions {
    all: HashSet<PathBuf>,
    protected: HashSet<PathBuf>,
}

struct FileRecord {
    path: PathBuf,
    is_dir: bool,
    size_bytes: u64,
}

struct MeasuredBatch {
    records: Vec<FileRecord>,
    bytes_scanned: u64,
    skipped_entries: usize,
    skipped_bytes: u64,
    current_path: String,
}

const FILE_BATCH_SIZE: usize = 512;
const DISCOVERY_EMIT_INTERVAL: usize = 128;

fn cancelled(flag: &AtomicBool) -> Result<(), String> {
    if flag.load(Ordering::Relaxed) {
        Err("Scan cancelled".into())
    } else {
        Ok(())
    }
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn sort_tree(node: &mut DiskNode) {
    node.children
        .sort_unstable_by_key(|child| std::cmp::Reverse(child.size_bytes));
    for child in &mut node.children {
        sort_tree(child);
    }
}

fn assign_ids(node: &mut DiskNode, next: &mut u32) {
    node.id = *next;
    *next = next.saturating_add(1);
    for child in &mut node.children {
        assign_ids(child, next);
    }
}

fn emit_progress(app: &AppHandle, progress: ScanProgress) {
    let _ = app.emit("scan-progress", progress);
}

fn allocated_size(metadata: &std::fs::Metadata) -> u64 {
    metadata.blocks().saturating_mul(512)
}

fn estimated_used_space(root_path: &Path) -> Option<u64> {
    let is_volume_root = if root_path == Path::new("/") {
        true
    } else {
        let parent = root_path.parent()?;
        let root_device = std::fs::metadata(root_path).ok()?.dev();
        let parent_device = std::fs::metadata(parent).ok()?.dev();
        root_device != parent_device
    };
    if !is_volume_root {
        return None;
    }

    let total = fs2::total_space(root_path).ok()?;
    let available = fs2::available_space(root_path).ok()?;
    let used = total.saturating_sub(available);
    (used > 0).then_some(used)
}

fn measure_batch(paths: Vec<PathBuf>, cancel_flag: &AtomicBool) -> MeasuredBatch {
    let current_path = paths
        .last()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_default();
    let outcomes: Vec<_> = paths
        .into_par_iter()
        .filter_map(|path| {
            if cancel_flag.load(Ordering::Relaxed) {
                return None;
            }
            Some(match std::fs::symlink_metadata(&path) {
                Ok(metadata) => Ok(FileRecord {
                    path,
                    is_dir: false,
                    size_bytes: allocated_size(&metadata),
                }),
                Err(_) => Err(path),
            })
        })
        .collect();

    let mut records = Vec::with_capacity(outcomes.len());
    let mut bytes_scanned = 0u64;
    let mut skipped_entries = 0usize;
    let mut skipped_bytes = 0u64;
    for outcome in outcomes {
        match outcome {
            Ok(record) => {
                bytes_scanned = bytes_scanned.saturating_add(record.size_bytes);
                records.push(record);
            }
            Err(path) => {
                skipped_entries += 1;
                skipped_bytes = skipped_bytes.saturating_add(
                    std::fs::symlink_metadata(path)
                        .map(|metadata| allocated_size(&metadata))
                        .unwrap_or(0),
                );
            }
        }
    }

    MeasuredBatch {
        records,
        bytes_scanned,
        skipped_entries,
        skipped_bytes,
        current_path,
    }
}

fn scan_exclusions(root_path: &Path, include_protected: bool) -> ScanExclusions {
    let mut all = HashSet::new();
    let mut protected = HashSet::new();
    let root_device = std::fs::metadata(root_path)
        .map(|metadata| metadata.dev())
        .ok();

    // APFS can expose the startup volume again inside its own /Volumes folder.
    // Never descend into that alias or the scan repeats the same filesystem.
    if let Ok(entries) = std::fs::read_dir(root_path.join("Volumes")) {
        for entry in entries.flatten() {
            let path = entry.path();
            if root_path == Path::new("/")
                || root_device
                    .and_then(|device| {
                        std::fs::metadata(&path)
                            .map(|metadata| metadata.dev() == device)
                            .ok()
                    })
                    .unwrap_or(false)
            {
                all.insert(path);
            }
        }
    }

    // The writable APFS data volume is already surfaced through firmlinks such
    // as /Users and /Applications. Traversing it again double-counts the disk.
    if root_path == Path::new("/") {
        all.insert(root_path.join("System/Volumes/Data"));
    }

    if include_protected {
        return ScanExclusions { all, protected };
    }

    // Merely opening these directories can trigger a separate macOS TCC prompt.
    // In accessible-only mode, stop at the directory entry without reading it.
    if let Ok(users) = std::fs::read_dir(root_path.join("Users")) {
        for user in users.flatten() {
            let home = user.path();
            if !home.is_dir() {
                continue;
            }
            for relative in [
                "Desktop",
                "Documents",
                "Downloads",
                "Library/Calendars",
                "Library/HomeKit",
                "Library/IdentityServices",
                "Library/Mail",
                "Library/Messages",
                "Library/Metadata/CoreSpotlight",
                "Library/Safari",
                "Pictures/Photos Library.photoslibrary",
            ] {
                let path = home.join(relative);
                all.insert(path.clone());
                protected.insert(path);
            }
        }
    }

    ScanExclusions { all, protected }
}

fn build_tree(root_path: &Path, records: Vec<FileRecord>) -> Result<DiskNode, String> {
    let mut nodes = HashMap::with_capacity(records.len());
    for record in records {
        let node = DiskNode {
            id: 0,
            name: display_name(&record.path),
            path: record.path.to_string_lossy().into_owned(),
            size_bytes: record.size_bytes,
            is_dir: record.is_dir,
            children: Vec::new(),
        };
        nodes.insert(record.path, node);
    }

    let mut paths: Vec<_> = nodes.keys().cloned().collect();
    paths.sort_unstable_by_key(|path| std::cmp::Reverse(path.components().count()));

    for path in paths {
        if path == root_path {
            continue;
        }

        let Some(child) = nodes.remove(&path) else {
            continue;
        };
        if let Some(parent_path) = path.parent() {
            if let Some(parent) = nodes.get_mut(parent_path) {
                parent.size_bytes = parent.size_bytes.saturating_add(child.size_bytes);
                parent.children.push(child);
            }
        }
    }

    let mut root = nodes
        .remove(root_path)
        .ok_or_else(|| "The selected folder could not be read.".to_string())?;
    sort_tree(&mut root);
    assign_ids(&mut root, &mut 1);
    Ok(root)
}

pub fn scan(
    path: String,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
    include_protected: bool,
) -> Result<ScanResult, String> {
    let root_path = PathBuf::from(path);
    if !root_path.exists() {
        return Err("The selected folder no longer exists.".into());
    }
    if !root_path.is_dir() {
        return Err("Please select a folder or mounted volume.".into());
    }

    let mut records = Vec::new();
    let mut pending_files = Vec::with_capacity(FILE_BATCH_SIZE);
    let mut discovered_entries = 0usize;
    let mut discovered_files = 0u64;
    let mut processed_files = 0u64;
    let mut bytes_scanned = 0u64;
    let mut skipped_entries = 0usize;
    let mut skipped_bytes = 0u64;
    let estimated_total_bytes = estimated_used_space(&root_path);
    let exclusions = scan_exclusions(&root_path, include_protected);
    let protected_entries = Cell::new(0usize);

    emit_progress(
        &app,
        ScanProgress {
            bytes_scanned: 0,
            estimated_total_bytes,
            files_scanned: 0,
            discovered_files: 0,
            processed_files: 0,
            total_files: None,
            skipped_entries: 0,
            current_path: root_path.to_string_lossy().into_owned(),
            phase: "discovering",
        },
    );

    let walker = WalkDir::new(&root_path)
        .follow_links(false)
        .same_file_system(true)
        .into_iter()
        .filter_entry(|entry| {
            let excluded = exclusions.all.contains(entry.path());
            if excluded && exclusions.protected.contains(entry.path()) {
                protected_entries.set(protected_entries.get() + 1);
            }
            !excluded
        });

    for entry in walker {
        cancelled(&cancel_flag)?;
        match entry {
            Ok(entry) => {
                discovered_entries += 1;
                let is_dir = entry.file_type().is_dir();
                let path = entry.into_path();
                if is_dir {
                    records.push(FileRecord {
                        path: path.clone(),
                        is_dir: true,
                        size_bytes: 0,
                    });
                } else {
                    discovered_files += 1;
                    pending_files.push(path.clone());
                }

                if pending_files.len() >= FILE_BATCH_SIZE {
                    let batch_len = pending_files.len() as u64;
                    let measured = measure_batch(std::mem::take(&mut pending_files), &cancel_flag);
                    cancelled(&cancel_flag)?;
                    processed_files = processed_files.saturating_add(batch_len);
                    bytes_scanned = bytes_scanned.saturating_add(measured.bytes_scanned);
                    skipped_entries += measured.skipped_entries;
                    skipped_bytes = skipped_bytes.saturating_add(measured.skipped_bytes);
                    records.extend(measured.records);
                    emit_progress(
                        &app,
                        ScanProgress {
                            bytes_scanned,
                            estimated_total_bytes,
                            files_scanned: processed_files,
                            discovered_files,
                            processed_files,
                            total_files: None,
                            skipped_entries: skipped_entries + protected_entries.get(),
                            current_path: measured.current_path,
                            phase: "discovering",
                        },
                    );
                }

                if discovered_entries % DISCOVERY_EMIT_INTERVAL == 0 {
                    emit_progress(
                        &app,
                        ScanProgress {
                            bytes_scanned,
                            estimated_total_bytes,
                            files_scanned: processed_files,
                            discovered_files,
                            processed_files,
                            total_files: None,
                            skipped_entries: skipped_entries + protected_entries.get(),
                            current_path: path.to_string_lossy().into_owned(),
                            phase: "discovering",
                        },
                    );
                }
            }
            Err(error) => {
                discovered_entries += 1;
                skipped_entries += 1;
                if let Some(path) = error.path() {
                    skipped_bytes = skipped_bytes.saturating_add(
                        std::fs::symlink_metadata(path)
                            .map(|metadata| allocated_size(&metadata))
                            .unwrap_or(0),
                    );
                    if discovered_entries % DISCOVERY_EMIT_INTERVAL == 0 {
                        emit_progress(
                            &app,
                            ScanProgress {
                                bytes_scanned,
                                estimated_total_bytes,
                                files_scanned: processed_files,
                                discovered_files,
                                processed_files,
                                total_files: None,
                                skipped_entries: skipped_entries + protected_entries.get(),
                                current_path: path.to_string_lossy().into_owned(),
                                phase: "discovering",
                            },
                        );
                    }
                }
            }
        }
    }

    if !pending_files.is_empty() {
        let batch_len = pending_files.len() as u64;
        let measured = measure_batch(pending_files, &cancel_flag);
        cancelled(&cancel_flag)?;
        processed_files = processed_files.saturating_add(batch_len);
        bytes_scanned = bytes_scanned.saturating_add(measured.bytes_scanned);
        skipped_entries += measured.skipped_entries;
        skipped_bytes = skipped_bytes.saturating_add(measured.skipped_bytes);
        records.extend(measured.records);
        emit_progress(
            &app,
            ScanProgress {
                bytes_scanned,
                estimated_total_bytes,
                files_scanned: processed_files,
                discovered_files,
                processed_files,
                total_files: None,
                skipped_entries: skipped_entries + protected_entries.get(),
                current_path: measured.current_path,
                phase: "discovering",
            },
        );
    }

    skipped_entries += protected_entries.get();

    emit_progress(
        &app,
        ScanProgress {
            bytes_scanned,
            estimated_total_bytes,
            files_scanned: processed_files,
            discovered_files,
            processed_files,
            total_files: None,
            skipped_entries,
            current_path: root_path.to_string_lossy().into_owned(),
            phase: "finalizing",
        },
    );
    cancelled(&cancel_flag)?;

    Ok(ScanResult {
        root: build_tree(&root_path, records)?,
        files_scanned: discovered_files,
        skipped_entries,
        skipped_bytes,
        protected_entries: protected_entries.get(),
        access_limited: !include_protected,
    })
}

#[cfg(test)]
mod tests {
    use super::{build_tree, FileRecord};
    use std::path::PathBuf;

    #[test]
    fn builds_bottom_up_totals_and_sorts_largest_first() {
        let root = PathBuf::from("/scan-root");
        let records = vec![
            FileRecord {
                path: root.clone(),
                is_dir: true,
                size_bytes: 0,
            },
            FileRecord {
                path: root.join("folder"),
                is_dir: true,
                size_bytes: 0,
            },
            FileRecord {
                path: root.join("folder/video.mov"),
                is_dir: false,
                size_bytes: 10,
            },
            FileRecord {
                path: root.join("note.txt"),
                is_dir: false,
                size_bytes: 4,
            },
        ];

        let tree = build_tree(&root, records).expect("tree should build");

        assert_eq!(tree.size_bytes, 14);
        assert_eq!(tree.children[0].name, "folder");
        assert_eq!(tree.children[0].size_bytes, 10);
        assert_eq!(tree.children[0].children[0].name, "video.mov");
        assert!(tree.id > 0);
        assert_ne!(tree.id, tree.children[0].id);
    }
}
