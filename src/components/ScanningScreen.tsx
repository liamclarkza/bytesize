import { Database, FileSearch, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatBytes } from '@/lib/format'
import { beginWindowDrag } from '@/lib/window-drag'
import type { ScanProgress } from '@/types'

export function ScanningScreen({
  path,
  progress,
  onCancel,
}: {
  path: string
  progress: ScanProgress
  onCancel: () => void
}) {
  const visualProgress = progress.phase === 'finalizing'
    ? 100
    : progress.estimated_total_bytes
      ? Math.min(99, (progress.bytes_scanned / progress.estimated_total_bytes) * 100)
      : undefined
  const phaseLabel = {
    discovering: 'Scanning files',
    measuring: 'Measuring sizes',
    finalizing: 'Assembling chart',
  }[progress.phase]

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#090d14] px-8 text-slate-100">
      <div onMouseDown={beginWindowDrag} className="absolute inset-x-0 top-0 h-[62px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.11),transparent_36%)]" />
      <section className="relative w-full max-w-xl text-center">
        <div className="relative mx-auto mb-8 grid size-24 place-items-center">
          <div className="absolute inset-0 animate-[spin_3s_linear_infinite] rounded-full border border-transparent border-t-cyan-300/90 border-r-blue-500/50" />
          <div className="absolute inset-2 animate-[spin_2.2s_linear_infinite_reverse] rounded-full border-[7px] border-blue-500/15 border-l-cyan-400/70 border-t-blue-400/50" />
          <Database className="size-5 text-white" />
        </div>
        <div className="mb-2 flex items-center justify-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-cyan-200/90">
          <FileSearch className="size-3.5" />
          {phaseLabel}
        </div>
        <h1 className="text-[30px] font-semibold tracking-[-0.035em] text-white">Building your disk map</h1>
        <p className="mx-auto mt-3 max-w-md truncate text-sm text-slate-400">{path}</p>

        <div className="mt-9 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 text-left shadow-[0_20px_80px_rgba(0,0,0,0.2)]">
          <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
            <span>{progress.phase === 'finalizing' ? 'Scan complete' : progress.estimated_total_bytes ? 'Estimated from used drive space' : 'Measuring folder contents'}</span>
            <span className="tabular-nums text-slate-300">{visualProgress === undefined ? 'In progress' : `${Math.round(visualProgress)}%`}</span>
          </div>
          <Progress value={visualProgress} className="h-2 bg-white/[0.06] [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-cyan-300" />
          <div className="mt-5 grid grid-cols-3 divide-x divide-white/[0.07]">
            <div className="px-3 first:pl-0">
              <div className="text-sm uppercase tracking-[0.11em] text-slate-400">Measured</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{formatBytes(progress.bytes_scanned)}</div>
            </div>
            <div className="px-5">
              <div className="text-sm uppercase tracking-[0.11em] text-slate-400">Files</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-slate-100">
                {progress.processed_files.toLocaleString()}
              </div>
            </div>
            <div className="px-5 pr-0">
              <div className="text-sm uppercase tracking-[0.11em] text-slate-400">Skipped</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{progress.skipped_entries.toLocaleString()}</div>
            </div>
          </div>
          <div className="mt-5 truncate rounded-lg bg-black/25 px-3 py-2 text-sm text-slate-400">
            {progress.current_path || 'Preparing scanner…'}
          </div>
        </div>

        <Button onClick={onCancel} variant="outline" className="mt-7 rounded-xl border-white/10 bg-transparent text-sm text-slate-300 hover:bg-white/[0.05] hover:text-white">
          <X className="size-3.5" />
          Cancel scan
        </Button>
        <p className="mt-4 text-sm text-slate-400">You can safely cancel at any time. No files are changed.</p>
      </section>
    </main>
  )
}
