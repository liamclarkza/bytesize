import type { DiskNode } from '@/types'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** power
  const digits = value >= 100 || power === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[power]}`
}

export function percentOf(value: number, total: number): string {
  if (total <= 0) return '0%'
  const percent = (value / total) * 100
  return `${percent < 1 ? percent.toFixed(1) : percent.toFixed(0)}%`
}

export function flattenTree(root: DiskNode): Map<string, DiskNode> {
  const byPath = new Map<string, DiskNode>()
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()!
    byPath.set(node.path, node)
    stack.push(...node.children)
  }
  return byPath
}

export function countNodes(root: DiskNode): number {
  let count = 0
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()!
    count += 1
    stack.push(...node.children)
  }
  return count
}
