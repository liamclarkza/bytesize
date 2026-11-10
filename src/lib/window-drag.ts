import { getCurrentWindow } from '@tauri-apps/api/window'
import type { MouseEvent } from 'react'

const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"], [data-no-window-drag]'

export function beginWindowDrag(event: MouseEvent<HTMLElement>) {
  if (event.button !== 0 || !('__TAURI_INTERNALS__' in window)) return

  const target = event.target
  if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) return

  event.preventDefault()
  const currentWindow = getCurrentWindow()
  if (event.detail >= 2) {
    void currentWindow.toggleMaximize()
  } else {
    void currentWindow.startDragging()
  }
}
