import { useCallback, useEffect, useRef, useState } from 'react'

import { formatBytes, percentOf } from '@/lib/format'
import type { DiskNode } from '@/types'

type ArcLayout = {
  node: DiskNode
  startAngle: number
  endAngle: number
  innerRadius: number
  outerRadius: number
  depth: number
  color: string
  parentSize: number
}

type Size = { width: number; height: number; dpr: number }

const TAU = Math.PI * 2
const MIN_ANGLE = 0.0045
const MAX_DEPTH = 9

function nodeColor(node: DiskNode, depth: number, branch: number): string {
  const hue = (204 + branch * 47 + (node.id * 13) % 22) % 360
  const saturation = Math.max(52, 76 - depth * 2)
  const lightness = Math.max(34, 59 - depth * 2.7)
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

function centerCircleRadius(size: Size): number {
  return Math.max(57, Math.min(74, Math.min(size.width, size.height) * 0.1))
}

function calculateLayouts(root: DiskNode, size: Size): ArcLayout[] {
  const maxRadius = Math.max(110, Math.min(size.width, size.height) / 2 - 20)
  const centerRadius = Math.max(62, Math.min(78, maxRadius * 0.24))
  const ringWidth = (maxRadius - centerRadius) / MAX_DEPTH
  const layouts: ArcLayout[] = []

  const visit = (
    parent: DiskNode,
    depth: number,
    startAngle: number,
    endAngle: number,
    inheritedBranch: number,
  ) => {
    if (depth > MAX_DEPTH || parent.children.length === 0) return
    const childrenSize = parent.children.reduce((sum, child) => sum + child.size_bytes, 0)
    const denominator = Math.max(parent.size_bytes, childrenSize, 1)
    let cursor = startAngle

    parent.children.forEach((child, index) => {
      const availableSweep = endAngle - startAngle
      const sweep = availableSweep * (child.size_bytes / denominator)
      const childStart = cursor
      const visuallyFullCircle = availableSweep >= TAU - MIN_ANGLE
        && availableSweep - sweep < MIN_ANGLE
      const childEnd = visuallyFullCircle ? endAngle : cursor + sweep
      cursor = childEnd
      if (sweep < MIN_ANGLE) return

      const branch = depth === 1 ? index : inheritedBranch
      layouts.push({
        node: child,
        startAngle: childStart,
        endAngle: childEnd,
        innerRadius: centerRadius + (depth - 1) * ringWidth,
        outerRadius: centerRadius + depth * ringWidth,
        depth,
        color: nodeColor(child, depth, branch),
        parentSize: parent.size_bytes,
      })
      visit(child, depth + 1, childStart, childEnd, branch)
    })
  }

  visit(root, 1, -Math.PI / 2, Math.PI * 1.5, 0)
  return layouts
}

function traceArc(
  context: CanvasRenderingContext2D,
  layout: ArcLayout,
  centerX: number,
  centerY: number,
) {
  context.beginPath()
  if (layout.endAngle - layout.startAngle >= TAU - 0.0001) {
    context.arc(centerX, centerY, layout.outerRadius, 0, TAU)
    context.closePath()
    context.moveTo(centerX + layout.innerRadius, centerY)
    context.arc(centerX, centerY, layout.innerRadius, 0, TAU, true)
    context.closePath()
    return
  }
  context.arc(centerX, centerY, layout.outerRadius, layout.startAngle, layout.endAngle)
  context.arc(centerX, centerY, layout.innerRadius, layout.endAngle, layout.startAngle, true)
  context.closePath()
}

function resizeCanvas(canvas: HTMLCanvasElement, size: Size) {
  canvas.width = Math.max(1, Math.round(size.width * size.dpr))
  canvas.height = Math.max(1, Math.round(size.height * size.dpr))
  canvas.style.width = `${size.width}px`
  canvas.style.height = `${size.height}px`
  canvas.getContext('2d')?.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
}

function encodePickColor(id: number): string {
  const encoded = id + 1
  return `rgb(${encoded & 255}, ${(encoded >> 8) & 255}, ${(encoded >> 16) & 255})`
}

function decodePickColor(data: Uint8ClampedArray): number {
  return data[0] + (data[1] << 8) + (data[2] << 16) - 1
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2
}

function interpolate(from: ArcLayout, to: ArcLayout, progress: number): ArcLayout {
  const mix = (a: number, b: number) => a + (b - a) * progress
  return {
    ...to,
    startAngle: mix(from.startAngle, to.startAngle),
    endAngle: mix(from.endAngle, to.endAngle),
    innerRadius: mix(from.innerRadius, to.innerRadius),
    outerRadius: mix(from.outerRadius, to.outerRadius),
  }
}

function collapsed(layout: ArcLayout, anchor: ArcLayout | undefined): ArcLayout {
  const angle = anchor
    ? (anchor.startAngle + anchor.endAngle) / 2
    : (layout.startAngle + layout.endAngle) / 2
  const radius = anchor?.innerRadius ?? layout.innerRadius
  return {
    ...layout,
    startAngle: angle,
    endAngle: angle,
    innerRadius: radius,
    outerRadius: radius,
  }
}

export function SunburstCanvas({
  root,
  onNavigate,
  onNavigateUp,
  highlightedNodeId,
  onHoverNode,
}: {
  root: DiskNode
  onNavigate: (node: DiskNode) => void
  onNavigateUp?: () => void
  highlightedNodeId?: number
  onHoverNode?: (node?: DiskNode) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const interactionRef = useRef<HTMLCanvasElement>(null)
  const pickRef = useRef<HTMLCanvasElement>(null)
  const layoutsRef = useRef<ArcLayout[]>([])
  const byIdRef = useRef(new Map<number, ArcLayout>())
  const activeRootIdRef = useRef(root.id)
  const animationRef = useRef<number | null>(null)
  const animatingRef = useRef(false)
  const pointerRef = useRef({ x: 0, y: 0 })
  const pointerHoverIdRef = useRef<number | undefined>(undefined)
  const notifiedHoverIdRef = useRef<number | undefined>(undefined)
  const [size, setSize] = useState<Size>({ width: 720, height: 680, dpr: 1 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => {
      const bounds = container.getBoundingClientRect()
      setSize({
        width: Math.max(320, bounds.width),
        height: Math.max(360, bounds.height),
        dpr: Math.min(window.devicePixelRatio || 1, 2.5),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const base = baseRef.current
    const interaction = interactionRef.current
    const pick = pickRef.current
    if (!base || !interaction || !pick) return
    ;[base, interaction, pick].forEach((canvas) => resizeCanvas(canvas, size))

    const draw = (layouts: ArcLayout[]) => {
      const centerX = size.width / 2
      const centerY = size.height / 2
      const baseContext = base.getContext('2d')!
      const pickContext = pick.getContext('2d', { willReadFrequently: true })!
      baseContext.clearRect(0, 0, size.width, size.height)
      pickContext.clearRect(0, 0, size.width, size.height)

      for (const layout of layouts) {
        if (layout.endAngle - layout.startAngle < 0.0001) continue
        traceArc(baseContext, layout, centerX, centerY)
        baseContext.fillStyle = layout.color
        baseContext.fill()
        baseContext.strokeStyle = 'rgba(7, 10, 18, 0.72)'
        baseContext.lineWidth = 1.35
        baseContext.stroke()

        traceArc(pickContext, layout, centerX, centerY)
        pickContext.fillStyle = encodePickColor(layout.node.id)
        pickContext.fill()
      }

      const radius = centerCircleRadius(size)
      const gradient = baseContext.createRadialGradient(
        centerX - radius * 0.25,
        centerY - radius * 0.3,
        radius * 0.1,
        centerX,
        centerY,
        radius,
      )
      gradient.addColorStop(0, '#202a3b')
      gradient.addColorStop(1, '#10151f')
      baseContext.beginPath()
      baseContext.arc(centerX, centerY, radius, 0, TAU)
      baseContext.fillStyle = gradient
      baseContext.fill()
      baseContext.strokeStyle = 'rgba(255, 255, 255, 0.11)'
      baseContext.lineWidth = 1
      baseContext.stroke()

      const label = root.name.length > 18 ? `${root.name.slice(0, 17)}…` : root.name
      baseContext.textAlign = 'center'
      baseContext.textBaseline = 'middle'
      baseContext.fillStyle = '#f8fafc'
      baseContext.font = '600 14px Geist Variable, sans-serif'
      baseContext.fillText(label, centerX, centerY - 9)
      baseContext.fillStyle = '#9ba9be'
      baseContext.font = '500 12px Geist Variable, sans-serif'
      baseContext.fillText(formatBytes(root.size_bytes), centerX, centerY + 12)
    }

    const target = calculateLayouts(root, size)
    const previous = layoutsRef.current
    const isNavigation = previous.length > 0 && activeRootIdRef.current !== root.id

    if (!isNavigation) {
      layoutsRef.current = target
      byIdRef.current = new Map(target.map((layout) => [layout.node.id, layout]))
      activeRootIdRef.current = root.id
      draw(target)
      return
    }

    const previousById = new Map(previous.map((layout) => [layout.node.id, layout]))
    const targetById = new Map(target.map((layout) => [layout.node.id, layout]))
    const anchor = previousById.get(root.id) ?? targetById.get(activeRootIdRef.current)
    const ids = new Set([...previousById.keys(), ...targetById.keys()])
    const pairs = [...ids].map((id) => {
      const fromLayout = previousById.get(id)
      const toLayout = targetById.get(id)
      const template = toLayout ?? fromLayout!
      return {
        from: fromLayout ?? collapsed(template, anchor),
        to: toLayout ?? collapsed(template, anchor),
      }
    })
    const startedAt = performance.now()
    animatingRef.current = true

    const frame = (now: number) => {
      const rawProgress = Math.min(1, (now - startedAt) / 360)
      const progress = easeInOutCubic(rawProgress)
      const current = pairs
        .map(({ from, to }) => interpolate(from, to, progress))
        .sort((left, right) => left.depth - right.depth)
      draw(current)
      if (rawProgress < 1) {
        animationRef.current = requestAnimationFrame(frame)
      } else {
        layoutsRef.current = target
        byIdRef.current = new Map(target.map((layout) => [layout.node.id, layout]))
        activeRootIdRef.current = root.id
        animatingRef.current = false
        draw(target)
      }
    }
    animationRef.current = requestAnimationFrame(frame)

    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
      animatingRef.current = false
    }
  }, [root, size])

  const pickAtPointer = (event: React.PointerEvent<HTMLCanvasElement>): ArcLayout | undefined => {
    if (animatingRef.current) return
    const pick = pickRef.current
    if (!pick) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    pointerRef.current = { x, y }
    const context = pick.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const pixel = context.getImageData(
      Math.max(0, Math.min(pick.width - 1, Math.floor(x * size.dpr))),
      Math.max(0, Math.min(pick.height - 1, Math.floor(y * size.dpr))),
      1,
      1,
    ).data
    return byIdRef.current.get(decodePickColor(pixel))
  }

  const clearInteraction = useCallback(() => {
    const canvas = interactionRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, size.width, size.height)
  }, [size])

  const notifyHover = (layout?: ArcLayout) => {
    const id = layout?.node.id
    if (notifiedHoverIdRef.current === id) return
    notifiedHoverIdRef.current = id
    onHoverNode?.(layout?.node)
  }

  const drawHighlight = useCallback((layout: ArcLayout, showTooltip: boolean) => {
    const canvas = interactionRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')!
    context.clearRect(0, 0, size.width, size.height)
    const centerX = size.width / 2
    const centerY = size.height / 2
    traceArc(context, layout, centerX, centerY)
    context.fillStyle = 'rgba(255, 255, 255, 0.22)'
    context.fill()
    context.strokeStyle = 'rgba(255, 255, 255, 0.75)'
    context.lineWidth = 1.4
    context.stroke()

    if (!showTooltip) return
    const { x, y } = pointerRef.current
    const tooltipWidth = 222
    const tooltipHeight = 67
    const left = Math.min(size.width - tooltipWidth - 10, Math.max(10, x + 16))
    const top = Math.min(size.height - tooltipHeight - 10, Math.max(10, y + 16))
    context.fillStyle = 'rgba(10, 14, 22, 0.96)'
    context.strokeStyle = 'rgba(255, 255, 255, 0.13)'
    context.lineWidth = 1
    context.beginPath()
    context.roundRect(left, top, tooltipWidth, tooltipHeight, 10)
    context.fill()
    context.stroke()
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.fillStyle = '#f8fafc'
    context.font = '600 13px Geist Variable, sans-serif'
    const name = layout.node.name.length > 29 ? `${layout.node.name.slice(0, 28)}…` : layout.node.name
    context.fillText(name, left + 12, top + 23)
    context.fillStyle = '#9ba9be'
    context.font = '500 12px Geist Variable, sans-serif'
    context.fillText(
      `${formatBytes(layout.node.size_bytes)} (${percentOf(layout.node.size_bytes, layout.parentSize)} of parent)`,
      left + 12,
      top + 47,
    )
  }, [size])

  useEffect(() => {
    if (pointerHoverIdRef.current !== undefined) return
    const layout = highlightedNodeId === undefined ? undefined : byIdRef.current.get(highlightedNodeId)
    if (layout) drawHighlight(layout, false)
    else clearInteraction()
  }, [clearInteraction, drawHighlight, highlightedNodeId, root])

  const pointerIsInCenter = () => {
    const { x, y } = pointerRef.current
    return Math.hypot(x - size.width / 2, y - size.height / 2) <= centerCircleRadius(size)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const layout = pickAtPointer(event)
    const canvas = interactionRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')!
    context.clearRect(0, 0, size.width, size.height)
    const centerIsInteractive = Boolean(onNavigateUp && pointerIsInCenter())
    pointerHoverIdRef.current = layout?.node.id ?? (centerIsInteractive ? -1 : undefined)
    notifyHover(layout)
    event.currentTarget.style.cursor = layout || centerIsInteractive ? 'pointer' : 'default'
    if (layout) {
      drawHighlight(layout, true)
    } else if (centerIsInteractive) {
      context.beginPath()
      context.arc(size.width / 2, size.height / 2, centerCircleRadius(size), 0, TAU)
      context.fillStyle = 'rgba(255, 255, 255, 0.06)'
      context.fill()
      context.strokeStyle = 'rgba(103, 232, 249, 0.5)'
      context.lineWidth = 1.4
      context.stroke()
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const layout = pickAtPointer(event)
    if (layout?.node.is_dir && layout.node.children.length > 0) onNavigate(layout.node)
    else if (!layout && onNavigateUp && pointerIsInCenter()) onNavigateUp()
  }

  const handlePointerLeave = () => {
    pointerHoverIdRef.current = undefined
    notifyHover()
    clearInteraction()
  }

  return (
    <div ref={containerRef} className="relative size-full min-h-[430px] overflow-hidden" aria-label="Interactive disk usage sunburst">
      <canvas ref={baseRef} className="absolute inset-0" />
      <canvas
        ref={interactionRef}
        className="absolute inset-0 touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerUp={handlePointerUp}
      />
      <canvas ref={pickRef} className="pointer-events-none fixed -left-[99999px] -top-[99999px]" aria-hidden="true" />
    </div>
  )
}
