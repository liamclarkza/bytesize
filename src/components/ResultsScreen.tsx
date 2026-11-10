import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  CirclePlus,
  File,
  Folder,
  FolderOpen,
  GripVertical,
  PackageOpen,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'

import { SunburstCanvas } from '@/components/SunburstCanvas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { flattenTree, formatBytes, percentOf } from '@/lib/format'
import { beginWindowDrag } from '@/lib/window-drag'
import type { DiskNode, ScanResult } from '@/types'

function findPath(root: DiskNode, id: number): DiskNode[] | undefined {
  if (root.id === id) return [root]
  for (const child of root.children) {
    const path = findPath(child, id)
    if (path) return [root, ...path]
  }
}

export function ResultsScreen({
  result,
  fullDiskAccess,
  onStartOver,
  onReveal,
  onTrash,
}: {
  result: ScanResult
  fullDiskAccess: boolean
  onStartOver: () => void
  onReveal: (path: string) => Promise<void>
  onTrash: (paths: string[]) => Promise<void>
}) {
  const [currentRoot, setCurrentRoot] = useState(result.root)
  const [queue, setQueue] = useState<Set<string>>(new Set())
  const [confirmPaths, setConfirmPaths] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [draggedNode, setDraggedNode] = useState<DiskNode>()
  const [dragPoint, setDragPoint] = useState({ x: 0, y: 0 })
  const [overCollector, setOverCollector] = useState(false)
  const [hoveredNode, setHoveredNode] = useState<DiskNode>()
  const collectorRef = useRef<HTMLDivElement>(null)
  const byPath = useMemo(() => flattenTree(result.root), [result.root])
  const breadcrumbs = findPath(result.root, currentRoot.id) ?? [result.root]
  const queueNodes = [...queue].map((path) => byPath.get(path)).filter((node): node is DiskNode => Boolean(node))

  useEffect(() => {
    setCurrentRoot(result.root)
    setQueue(new Set())
    setDraggedNode(undefined)
  }, [result])

  const navigate = (node: DiskNode) => {
    if (node.is_dir && node.children.length) {
      setHoveredNode(undefined)
      setCurrentRoot(node)
    }
  }

  const navigateUp = () => {
    if (breadcrumbs.length < 2) return
    setHoveredNode(undefined)
    setCurrentRoot(breadcrumbs[breadcrumbs.length - 2])
  }

  const toggleQueue = (node: DiskNode) => {
    setQueue((previous) => {
      const next = new Set(previous)
      if (next.has(node.path)) next.delete(node.path)
      else next.add(node.path)
      return next
    })
  }

  const addToQueue = (node: DiskNode) => {
    setQueue((previous) => new Set(previous).add(node.path))
  }

  const pointIsOverCollector = (x: number, y: number) => {
    const bounds = collectorRef.current?.getBoundingClientRect()
    return Boolean(bounds && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom)
  }

  const finishPointerDrag = (node: DiskNode, x: number, y: number) => {
    if (pointIsOverCollector(x, y)) addToQueue(node)
    setDraggedNode(undefined)
    setOverCollector(false)
  }

  useEffect(() => {
    if (!draggedNode) return

    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'grabbing'
    const move = (event: PointerEvent) => {
      setDragPoint({ x: event.clientX, y: event.clientY })
      setOverCollector(pointIsOverCollector(event.clientX, event.clientY))
    }
    const finish = (event: PointerEvent) => finishPointerDrag(draggedNode, event.clientX, event.clientY)
    const cancel = () => {
      setDraggedNode(undefined)
      setOverCollector(false)
    }

    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', cancel, true)
    return () => {
      document.body.style.cursor = previousCursor
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', cancel, true)
    }
  }, [draggedNode])

  const confirmDelete = async () => {
    if (!confirmPaths.length) return
    setDeleting(true)
    try {
      await onTrash(confirmPaths)
      setQueue(new Set())
      setConfirmPaths([])
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-[#080c12] text-slate-100">
      <header onMouseDown={beginWindowDrag} className="app-titlebar flex h-[62px] shrink-0 items-center border-b border-white/[0.06] bg-[#0b1018]/95 px-5">
        <div className="flex min-w-0 items-center gap-4">
          <Button variant="ghost" onClick={onStartOver} className="h-9 rounded-lg px-2.5 text-sm text-slate-200 hover:bg-white/[0.06] hover:text-white">
            <ArrowLeft className="size-4" />
            New scan
          </Button>
          <Separator orientation="vertical" className="h-5 bg-white/[0.08]" />
          <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label="Current folder">
            {breadcrumbs.map((node, index) => (
              <div key={node.id} className="flex min-w-0 items-center gap-1">
                {index > 0 && <ChevronRight className="size-3 shrink-0 text-slate-700" />}
                <button
                  type="button"
                  onClick={() => navigate(node)}
                  className={`max-w-40 truncate rounded-md px-2 py-1 transition ${node.id === currentRoot.id ? 'bg-white/[0.06] text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {index === 0 ? result.root.name : node.name}
                </button>
              </div>
            ))}
          </nav>
        </div>
      </header>

      {result.access_limited && result.protected_entries > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-300/10 bg-amber-300/[0.045] px-5 py-2 text-sm text-amber-100/85">
          <ShieldAlert className="size-3.5 shrink-0 text-amber-300/80" />
          <span>
            {fullDiskAccess
              ? `${result.protected_entries.toLocaleString()} protected locations were skipped in this scan. Start a new scan to include them now that Full Disk Access is enabled.`
              : `${result.protected_entries.toLocaleString()} protected locations were skipped. For a complete drive map, enable Bytesize in System Settings → Privacy & Security → Full Disk Access.`}
          </span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_390px]">
        <section className="flex min-w-0 flex-col border-r border-white/[0.06] bg-[radial-gradient(circle_at_48%_48%,rgba(30,64,96,0.14),transparent_48%)]">
          <div className="min-h-0 flex-1">
            <SunburstCanvas
              root={currentRoot}
              onNavigate={navigate}
              onNavigateUp={breadcrumbs.length > 1 ? navigateUp : undefined}
              highlightedNodeId={hoveredNode?.id}
              onHoverNode={setHoveredNode}
            />
          </div>
          <div className="pointer-events-none flex h-12 shrink-0 items-center gap-4 border-t border-white/[0.04] bg-[#080c12]/90 px-5 text-sm text-slate-400">
            <span>Click a segment to zoom</span>
            <span className="border-l border-white/10 pl-4">{result.files_scanned.toLocaleString()} files scanned</span>
            {!result.access_limited && result.skipped_entries > 0 && (
              <span className="flex min-w-0 items-center gap-1.5 border-l border-white/10 pl-4 text-slate-400">
                <ShieldAlert className="size-3.5 shrink-0" />
                <span className="truncate">{result.skipped_entries.toLocaleString()} system-managed or unreadable items skipped</span>
              </span>
            )}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col bg-[#0b1018]">
          <div className="shrink-0 px-5 pb-4 pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold tracking-tight text-slate-100">{currentRoot.name}</div>
                <div className="mt-1 truncate text-sm text-slate-400">{currentRoot.path}</div>
              </div>
              <Badge variant="outline" className="shrink-0 border-cyan-300/15 bg-cyan-300/[0.06] text-sm font-medium text-cyan-100">
                {formatBytes(currentRoot.size_bytes)}
              </Badge>
            </div>
            <div className="mt-5 flex items-center justify-between">
              <span className="text-sm font-medium uppercase tracking-[0.13em] text-slate-400">Largest items</span>
              <span className="text-sm text-slate-400">{currentRoot.children.length} items</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-y border-white/[0.055] px-2 py-2">
            {currentRoot.children.map((node) => {
              const queued = queue.has(node.path)
              const highlighted = Boolean(hoveredNode && findPath(node, hoveredNode.id))
              return (
                <div
                  key={node.id}
                  onClick={() => navigate(node)}
                  onPointerEnter={() => setHoveredNode(node)}
                  onPointerLeave={() => setHoveredNode(undefined)}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 ${highlighted ? 'bg-cyan-300/[0.07] ring-1 ring-inset ring-cyan-300/10' : 'hover:bg-white/[0.045]'}`}
                >
                  <button
                    type="button"
                    aria-label={`Drag ${node.name} to collector`}
                    className="-mr-2 flex h-8 w-4 touch-none items-center justify-center text-slate-500 opacity-0 hover:text-slate-300 group-hover:opacity-100 active:cursor-grabbing"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      event.currentTarget.setPointerCapture(event.pointerId)
                      setDraggedNode(node)
                      setDragPoint({ x: event.clientX, y: event.clientY })
                      setOverCollector(pointIsOverCollector(event.clientX, event.clientY))
                    }}
                  >
                    <GripVertical className="size-3.5" />
                  </button>
                  <div className={`grid size-8 shrink-0 place-items-center rounded-lg border ${node.is_dir ? 'border-blue-300/10 bg-blue-400/[0.07] text-blue-300/80' : 'border-white/[0.06] bg-white/[0.035] text-slate-500'}`}>
                    {node.is_dir ? <Folder className="size-4" /> : <File className="size-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-200">{node.name}</span>
                      <span className="shrink-0 text-sm tabular-nums text-slate-300">{formatBytes(node.size_bytes)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.055]">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-600/70 to-cyan-400/80" style={{ width: `${Math.max(1, (node.size_bytes / Math.max(currentRoot.size_bytes, 1)) * 100)}%` }} />
                      </div>
                      <span className="w-10 text-right text-xs tabular-nums text-slate-400">{percentOf(node.size_bytes, currentRoot.size_bytes)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={`Reveal ${node.name} in Finder`}
                          variant="ghost"
                          size="icon-xs"
                          onClick={(event) => { event.stopPropagation(); void onReveal(node.path) }}
                          className="text-slate-500 hover:bg-white/[0.07] hover:text-slate-200"
                        >
                          <FolderOpen className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reveal in Finder</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={queued ? `Remove ${node.name} from collector` : `Add ${node.name} to collector`}
                          variant="ghost"
                          size="icon-xs"
                          onClick={(event) => { event.stopPropagation(); toggleQueue(node) }}
                          className={queued ? 'text-cyan-300 hover:text-cyan-200' : 'text-slate-500 hover:bg-white/[0.07] hover:text-cyan-200'}
                        >
                          {queued ? <X className="size-3.5" /> : <CirclePlus className="size-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{queued ? 'Remove from collector' : 'Add to collector'}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={`Move ${node.name} to Trash`}
                          variant="ghost"
                          size="icon-xs"
                          onClick={(event) => { event.stopPropagation(); setConfirmPaths([node.path]) }}
                          className="text-slate-500 hover:bg-red-400/[0.08] hover:text-red-300"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Move to Trash</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )
            })}
            {currentRoot.children.length === 0 && (
              <div className="grid h-full min-h-48 place-items-center text-center">
                <div>
                  <PackageOpen className="mx-auto size-6 text-slate-500" />
                  <p className="mt-3 text-sm text-slate-400">Nothing else inside this item</p>
                </div>
              </div>
            )}
          </div>

          <div
            ref={collectorRef}
            className={`shrink-0 p-4 transition ${queue.size || overCollector ? 'bg-cyan-300/[0.035]' : ''}`}
          >
            {queue.size ? (
              <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.045] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-cyan-100">
                      Collector <span className="font-normal text-slate-400">with {queue.size} {queue.size === 1 ? 'item' : 'items'}</span>
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-400">
                      {formatBytes(queueNodes.reduce((sum, node) => sum + node.size_bytes, 0))} ready to move
                    </div>
                  </div>
                  <Button onClick={() => setConfirmPaths([...queue])} size="sm" className="h-8 rounded-lg bg-red-500/90 px-3 text-sm text-white hover:bg-red-400">
                    <Trash2 className="size-3" />
                    Move to Trash
                  </Button>
                </div>
              </div>
            ) : (
              <div className={`flex min-h-20 items-center justify-center rounded-xl border border-dashed px-4 py-4 text-center text-sm transition ${overCollector ? 'scale-[1.01] border-cyan-300/45 bg-cyan-300/[0.08] text-cyan-200' : 'border-white/[0.1] text-slate-400'}`}>
                {overCollector ? 'Release to add to collector' : 'Drag items here to collect them for cleanup'}
              </div>
            )}
          </div>
        </aside>
      </div>

      {draggedNode && (
        <div
          className="pointer-events-none fixed z-[100] flex max-w-64 items-center gap-2.5 rounded-xl border border-cyan-300/25 bg-[#121b28]/95 px-3 py-2.5 shadow-[0_16px_55px_rgba(0,0,0,0.55)] backdrop-blur-md"
          style={{ left: dragPoint.x + 14, top: dragPoint.y + 14 }}
        >
          <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-cyan-300/10 text-cyan-200">
            {draggedNode.is_dir ? <Folder className="size-3.5" /> : <File className="size-3.5" />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-100">{draggedNode.name}</div>
            <div className="mt-0.5 text-sm text-slate-400">{formatBytes(draggedNode.size_bytes)} ready to collect</div>
          </div>
        </div>
      )}

      <Dialog open={confirmPaths.length > 0} onOpenChange={(open) => !open && !deleting && setConfirmPaths([])}>
        <DialogContent className="border-white/10 bg-[#111822] text-slate-100 sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-red-400/10 text-red-300">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle>Move {confirmPaths.length === 1 ? 'this item' : `${confirmPaths.length} items`} to the Trash?</DialogTitle>
            <DialogDescription className="text-slate-400">
              Bytesize never permanently deletes files. You can recover these items from the macOS Trash until you empty it.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-28 overflow-y-auto rounded-lg bg-black/20 p-3 text-sm leading-5 text-slate-400">
            {confirmPaths.map((path) => <div key={path} className="truncate">{path}</div>)}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting} className="border-white/10 bg-transparent text-slate-300 hover:bg-white/[0.05] hover:text-white">Cancel</Button>
            </DialogClose>
            <Button onClick={() => void confirmDelete()} disabled={deleting} className="bg-red-500 text-white hover:bg-red-400">
              <Trash2 className="size-4" />
              {deleting ? 'Moving…' : 'Move to Trash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
