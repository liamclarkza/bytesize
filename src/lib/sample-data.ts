import type { DiskNode, ScanResult, VolumeInfo } from '@/types'

type SeedNode = [name: string, size: number, children?: SeedNode[]]

const GB = 1024 ** 3
const MB = 1024 ** 2

const seed: SeedNode[] = [
  ['Users', 0, [
    ['user', 0, [
      ['Library', 0, [
        ['Application Support', 47 * GB, [
          ['Steam', 31 * GB], ['MobileSync', 9.4 * GB], ['Adobe', 4.1 * GB], ['Other', 2.5 * GB],
        ]],
        ['Caches', 18.2 * GB, [
          ['com.apple.Safari', 5.2 * GB], ['Homebrew', 4.8 * GB], ['Xcode', 4.4 * GB], ['Other', 3.8 * GB],
        ]],
        ['Containers', 12.8 * GB], ['Developer', 9.6 * GB], ['Mail', 6.1 * GB],
      ]],
      ['Movies', 66 * GB, [
        ['Final Cut Projects', 36 * GB], ['Screen Recordings', 17 * GB], ['Exports', 13 * GB],
      ]],
      ['Projects', 43 * GB, [
        ['client-work', 16 * GB], ['archives', 11 * GB], ['bytesize', 8.2 * GB], ['experiments', 7.8 * GB],
      ]],
      ['Downloads', 28 * GB, [
        ['macOS installers', 12 * GB], ['design-assets.zip', 7.2 * GB], ['video-footage', 5.8 * GB], ['Other', 3 * GB],
      ]],
      ['Pictures', 24 * GB], ['Music', 14 * GB], ['Documents', 8.7 * GB],
    ]],
  ]],
  ['Applications', 64 * GB, [
    ['Xcode.app', 18.5 * GB], ['Final Cut Pro.app', 8.1 * GB], ['Adobe Photoshop.app', 6.4 * GB],
    ['Docker.app', 4.6 * GB], ['Logic Pro.app', 3.9 * GB], ['Other apps', 22.5 * GB],
  ]],
  ['System', 39 * GB, [
    ['Library', 22 * GB], ['Volumes', 8.4 * GB], ['iOSSupport', 5.7 * GB], ['Other', 2.9 * GB],
  ]],
  ['private', 26 * GB, [
    ['var', 20 * GB, [['folders', 11 * GB], ['vm', 5.2 * GB], ['log', 2.1 * GB], ['Other', 1.7 * GB]]],
    ['tmp', 6 * GB],
  ]],
  ['Library', 17 * GB],
  ['usr', 6.4 * GB],
  ['opt', 3.2 * GB],
  ['.DocumentRevisions-V100', 940 * MB],
]

export function createSampleResult(): ScanResult {
  let nextId = 1
  const build = (item: SeedNode, parentPath: string): DiskNode => {
    const [name, explicitSize, childrenSeed = []] = item
    const path = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`
    const children = childrenSeed.map((child) => build(child, path))
    const childSize = children.reduce((sum, child) => sum + child.size_bytes, 0)
    return {
      id: nextId++,
      name,
      path,
      size_bytes: Math.max(explicitSize, childSize),
      is_dir: children.length > 0 || !name.includes('.'),
      children,
    }
  }

  const children = seed.map((item) => build(item, '/'))
  return {
    root: {
      id: nextId++,
      name: 'Macintosh HD',
      path: '/',
      size_bytes: children.reduce((sum, child) => sum + child.size_bytes, 0),
      is_dir: true,
      children,
    },
    files_scanned: 428_391,
    skipped_entries: 259,
    skipped_bytes: 0,
    protected_entries: 0,
    access_limited: false,
  }
}

export const sampleVolumes: VolumeInfo[] = [
  {
    name: 'Macintosh HD',
    path: '/',
    total_bytes: 494.4 * GB,
    available_bytes: 118.7 * GB,
  },
  {
    name: 'Studio Archive',
    path: '/Volumes/Studio Archive',
    total_bytes: 2 * 1024 * GB,
    available_bytes: 824 * GB,
  },
]
