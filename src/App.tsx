import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { open } from '@tauri-apps/plugin-dialog'

import { ResultsScreen } from '@/components/ResultsScreen'
import { FullDiskAccessDialog } from '@/components/FullDiskAccessDialog'
import { ScanningScreen } from '@/components/ScanningScreen'
import { StartScreen } from '@/components/StartScreen'
import { createSampleResult, sampleVolumes } from '@/lib/sample-data'
import type { DiskNode, ScanProgress, ScanResult, VolumeInfo } from '@/types'

type Screen = 'start' | 'scanning' | 'results'

const initialProgress: ScanProgress = {
  bytes_scanned: 0,
  estimated_total_bytes: null,
  files_scanned: 0,
  discovered_files: 0,
  processed_files: 0,
  total_files: null,
  skipped_entries: 0,
  current_path: '',
  phase: 'discovering',
}

const FULL_DISK_ACCESS_DISMISSED_KEY = 'bytesize.full-disk-access-prompt.dismissed'

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function removePaths(node: DiskNode, paths: Set<string>): DiskNode | undefined {
  if (paths.has(node.path)) return
  const children = node.children
    .map((child) => removePaths(child, paths))
    .filter((child): child is DiskNode => Boolean(child))
  return {
    ...node,
    children,
    size_bytes: node.children.length
      ? children.reduce((sum, child) => sum + child.size_bytes, 0)
      : node.size_bytes,
  }
}

function App() {
  const tauriRuntime = isTauriRuntime()
  const [screen, setScreen] = useState<Screen>('start')
  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [loadingVolumes, setLoadingVolumes] = useState(true)
  const [progress, setProgress] = useState<ScanProgress>(initialProgress)
  const [scanPath, setScanPath] = useState('')
  const [scanIncludeProtected, setScanIncludeProtected] = useState(false)
  const [fullDiskAccess, setFullDiskAccess] = useState(false)
  const [showAccessPrompt, setShowAccessPrompt] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [result, setResult] = useState<ScanResult>()
  const [error, setError] = useState<string>()
  const runIdRef = useRef(0)
  const accessPromptDismissedRef = useRef(false)

  useEffect(() => {
    document.documentElement.classList.toggle('tauri', tauriRuntime)
    return () => document.documentElement.classList.remove('tauri')
  }, [tauriRuntime])

  useEffect(() => {
    if (!tauriRuntime) return
    let active = true
    const checkAccess = async () => {
      try {
        const granted = await invoke<boolean>('has_full_disk_access')
        if (!active) return
        setFullDiskAccess(granted)
        if (granted) {
          setShowAccessPrompt(false)
        } else if (!accessPromptDismissedRef.current && localStorage.getItem(FULL_DISK_ACCESS_DISMISSED_KEY) !== 'true') {
          setShowAccessPrompt(true)
        }
      } catch {
        if (active) setFullDiskAccess(false)
      }
    }
    void checkAccess()
    const refresh = () => { void checkAccess() }
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
    }
  }, [tauriRuntime])

  useEffect(() => {
    let active = true
    let loading = false
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const mounted = tauriRuntime
          ? await invoke<VolumeInfo[]>('list_volumes')
          : sampleVolumes
        if (active) setVolumes(mounted)
      } catch (reason) {
        if (active) setError(String(reason))
      } finally {
        loading = false
        if (active) setLoadingVolumes(false)
      }
    }
    void load()
    const interval = window.setInterval(() => { void load() }, 2500)
    const refresh = () => { void load() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [tauriRuntime])

  const beginScan = useCallback(async (path: string, demo = false, includeProtected = false) => {
    const runId = ++runIdRef.current
    setError(undefined)
    setScanPath(path)
    setScanIncludeProtected(includeProtected)
    setProgress({ ...initialProgress, current_path: path })
    setScreen('scanning')

    if (demo || !tauriRuntime) {
      const sample = createSampleResult()
      await new Promise((resolve) => window.setTimeout(resolve, 650))
      if (runId !== runIdRef.current) return
      setProgress({
        bytes_scanned: sample.root.size_bytes,
        estimated_total_bytes: sample.root.size_bytes,
        files_scanned: sample.files_scanned,
        discovered_files: sample.files_scanned,
        processed_files: sample.files_scanned,
        total_files: sample.files_scanned,
        skipped_entries: sample.skipped_entries,
        current_path: path,
        phase: 'finalizing',
      })
      setResult(sample)
      setScanPath(sample.root.path)
      setScreen('results')
      return
    }

    let unlisten: UnlistenFn | undefined
    try {
      unlisten = await listen<ScanProgress>('scan-progress', (event) => {
        if (runId === runIdRef.current) setProgress(event.payload)
      })
      const scanResult = await invoke<ScanResult>('scan_directory', { path, includeProtected })
      if (runId !== runIdRef.current) return
      setResult(scanResult)
      setScreen('results')
    } catch (reason) {
      if (runId !== runIdRef.current) return
      const message = String(reason)
      if (!message.toLowerCase().includes('cancel')) setError(message)
      setScreen('start')
    } finally {
      unlisten?.()
    }
  }, [tauriRuntime])

  useEffect(() => {
    if (!tauriRuntime) return
    const unlisten = getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') setDropActive(true)
      if (event.payload.type === 'leave' || event.payload.type === 'drop') setDropActive(false)
      if (event.payload.type === 'drop' && event.payload.paths[0]) {
        void beginScan(event.payload.paths[0], false, true)
      }
    })
    return () => { void unlisten.then((dispose) => dispose()) }
  }, [beginScan, tauriRuntime])

  const pickFolder = async () => {
    if (!tauriRuntime) {
      await beginScan('/', true)
      return
    }
    const selection = await open({ directory: true, multiple: false, title: 'Choose a folder or volume to scan' })
    if (typeof selection === 'string') await beginScan(selection, false, true)
  }

  const cancelScan = () => {
    runIdRef.current += 1
    if (tauriRuntime) void invoke('cancel_scan')
    setScreen('start')
  }

  const startOver = () => {
    runIdRef.current += 1
    setResult(undefined)
    setError(undefined)
    setScreen('start')
  }

  const reveal = async (path: string) => {
    if (tauriRuntime) await invoke('reveal_in_finder', { path })
  }

  const trashItems = async (paths: string[]) => {
    if (tauriRuntime) {
      for (const path of paths) await invoke('move_to_trash', { path })
      await beginScan(scanPath, false, fullDiskAccess || scanIncludeProtected)
      return
    }

    const removed = new Set(paths)
    setResult((previous) => {
      if (!previous) return previous
      const root = removePaths(previous.root, removed)
      return root ? { ...previous, root } : previous
    })
  }

  if (screen === 'scanning') {
    return <ScanningScreen path={scanPath} progress={progress} onCancel={cancelScan} />
  }

  if (screen === 'results' && result) {
    return (
      <ResultsScreen
        result={result}
        fullDiskAccess={fullDiskAccess}
        onStartOver={startOver}
        onReveal={reveal}
        onTrash={trashItems}
      />
    )
  }

  return (
    <>
      <StartScreen
        volumes={volumes}
        loadingVolumes={loadingVolumes}
        error={error}
        onPick={() => { void pickFolder() }}
        onScan={(path) => { void beginScan(path, false, fullDiskAccess) }}
        dropActive={dropActive}
      />
      <FullDiskAccessDialog
        open={showAccessPrompt}
        onOpenSettings={() => { if (tauriRuntime) void invoke('open_full_disk_access') }}
        onContinue={(dontAskAgain) => {
          if (dontAskAgain) localStorage.setItem(FULL_DISK_ACCESS_DISMISSED_KEY, 'true')
          accessPromptDismissedRef.current = true
          setShowAccessPrompt(false)
        }}
      />
    </>
  )
}

export default App
