import { useEffect, useState } from 'react'
import { Settings, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function FullDiskAccessDialog({
  open,
  onOpenSettings,
  onContinue,
}: {
  open: boolean
  onOpenSettings: () => void
  onContinue: (dontAskAgain: boolean) => void
}) {
  const [dontAskAgain, setDontAskAgain] = useState(false)

  useEffect(() => {
    if (open) setDontAskAgain(false)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onContinue(dontAskAgain)}>
      <DialogContent className="border-white/10 bg-[#111822] text-slate-100 sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 grid size-11 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200">
            <ShieldCheck className="size-5" />
          </div>
          <DialogTitle>Enable Full Disk Access for complete scans</DialogTitle>
          <DialogDescription className="leading-6 text-slate-400">
            Without Full Disk Access, macOS prevents Bytesize from measuring protected locations such as Mail, Messages, Desktop, and Documents. You only need to enable it once.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          <Button onClick={onOpenSettings} className="h-11 rounded-xl bg-cyan-400 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
            <Settings className="size-4" />
            Open Full Disk Access settings
          </Button>
          <Button onClick={() => onContinue(dontAskAgain)} variant="outline" className="h-11 rounded-xl border-white/10 bg-white/[0.025] text-sm text-slate-200 hover:bg-white/[0.06] hover:text-white">
            Continue with accessible scans
          </Button>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-sm text-slate-400">
          <Checkbox checked={dontAskAgain} onCheckedChange={(checked) => setDontAskAgain(checked === true)} />
          Don’t ask again
        </label>
      </DialogContent>
    </Dialog>
  )
}
