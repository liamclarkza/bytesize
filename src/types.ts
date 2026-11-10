export type DiskNode = {
  id: number
  name: string
  path: string
  size_bytes: number
  is_dir: boolean
  children: DiskNode[]
}

export type ScanProgress = {
  bytes_scanned: number
  estimated_total_bytes: number | null
  files_scanned: number
  discovered_files: number
  processed_files: number
  total_files: number | null
  skipped_entries: number
  current_path: string
  phase: 'discovering' | 'measuring' | 'finalizing'
}

export type ScanResult = {
  root: DiskNode
  files_scanned: number
  skipped_entries: number
  skipped_bytes: number
  protected_entries: number
  access_limited: boolean
}

export type VolumeInfo = {
  name: string
  path: string
  total_bytes: number
  available_bytes: number
}
