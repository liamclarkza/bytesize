import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const indeterminate = value === undefined || value === null
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        key={indeterminate ? "indeterminate" : "determinate"}
        data-slot="progress-indicator"
        className={cn(
          "h-full bg-primary",
          indeterminate
            ? "w-1/3 flex-none animate-[scan-indeterminate_1.25s_ease-in-out_infinite]"
            : "w-full flex-1 transition-transform duration-200 ease-out"
        )}
        style={indeterminate ? undefined : { transform: `translateX(-${100 - Math.max(0, Math.min(100, value ?? 0))}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
