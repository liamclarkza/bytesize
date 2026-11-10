import { FolderDown, HardDrive } from 'lucide-react'

import { BytesizeMark } from '@/components/BytesizeMark'
import { Card, CardContent } from '@/components/ui/card'
import { formatBytes } from '@/lib/format'
import { beginWindowDrag } from '@/lib/window-drag'
import type { VolumeInfo } from '@/types'

export function StartScreen({
  volumes,
  loadingVolumes,
  error,
  onPick,
  onScan,
  dropActive,
}: {
  volumes: VolumeInfo[]
  loadingVolumes: boolean
  error?: string
  onPick: () => void
  onScan: (path: string) => void
  dropActive: boolean
}) {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#090d14] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_5%,rgba(58,105,181,0.16),transparent_43%),radial-gradient(circle_at_12%_88%,rgba(7,177,185,0.08),transparent_32%)]" />
      <header onMouseDown={beginWindowDrag} className="app-titlebar relative h-[62px] shrink-0" />

      <section className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-8 pb-10 pt-[4vh]">
        <div className="mb-6 flex items-center gap-5">
          <BytesizeMark className="size-24 drop-shadow-[0_0_28px_rgba(51,151,227,0.18)]" />
          <div className="text-[42px] font-semibold tracking-[-0.05em] text-white">Bytesize</div>
        </div>
        <h1 className="text-center text-[38px] font-semibold tracking-[-0.045em] text-white">
          See what’s taking up space.
        </h1>
        <p className="mt-3 max-w-xl text-center text-sm leading-6 text-slate-400">
          Choose a folder or drive. Bytesize maps every file into a fast, interactive view you can explore and clean up.
        </p>

        <button
          type="button"
          onClick={onPick}
          className={`mt-8 flex w-full max-w-xl items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-5 text-left transition ${dropActive ? 'scale-[1.01] border-cyan-300/60 bg-cyan-300/[0.1] shadow-[0_12px_50px_rgba(34,211,238,0.12)]' : 'border-white/[0.14] bg-white/[0.025] hover:border-cyan-300/35 hover:bg-white/[0.045]'}`}
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200">
            <FolderDown className="size-5" />
          </span>
          <span>
            <span className="block text-lg font-semibold text-slate-100">{dropActive ? 'Drop to scan this folder' : 'Choose a folder to scan'}</span>
            <span className="mt-1 block text-sm text-slate-400">Or drag and drop a folder here</span>
          </span>
        </button>

        <div className="mt-7 w-full max-w-3xl">
          <h2 className="mb-3 px-1 text-sm font-medium text-slate-200">Choose a mounted volume to scan</h2>
          <div className={`grid gap-3 ${volumes.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {loadingVolumes && [0, 1].map((item) => (
              <div key={item} className="h-[88px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" />
            ))}
            {volumes.map((volume) => {
              const used = Math.max(0, volume.total_bytes - volume.available_bytes)
              const usedPercent = volume.total_bytes > 0 ? Math.min(100, (used / volume.total_bytes) * 100) : 0
              return (
                <Card
                  key={volume.path}
                  role="button"
                  tabIndex={0}
                  onClick={() => onScan(volume.path)}
                  onKeyDown={(event) => event.key === 'Enter' && onScan(volume.path)}
                  className="group border-white/[0.07] bg-white/[0.03] py-0 shadow-none transition hover:border-cyan-300/25 hover:bg-white/[0.055]"
                >
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-slate-400 group-hover:text-cyan-300">
                      <HardDrive className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium text-slate-200">{volume.name}</span>
                        <span className="shrink-0 text-sm text-slate-400">{formatBytes(volume.available_bytes)} free</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${usedPercent}%` }} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-3 text-sm text-slate-400">
                        <span className="truncate">{volume.path}</span>
                        <span className="shrink-0">{formatBytes(volume.total_bytes)} total</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {error && <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-2.5 text-sm text-red-200">{error}</div>}
      </section>
    </main>
  )
}
