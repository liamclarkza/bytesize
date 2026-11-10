type Segment = { start: number; length: number; color: string }

const rings: Array<{ radius: number; width: number; segments: Segment[] }> = [
  {
    radius: 49,
    width: 9,
    segments: [
      { start: 0, length: 16, color: '#318fe4' },
      { start: 16, length: 11, color: '#347cdd' },
      { start: 27, length: 8, color: '#3869d9' },
      { start: 35, length: 7, color: '#3d55d7' },
      { start: 42, length: 9, color: '#633dde' },
      { start: 51, length: 7, color: '#8135d7' },
      { start: 58, length: 5, color: '#9c31cd' },
      { start: 63, length: 6.5, color: '#bc30bd' },
      { start: 69.5, length: 5, color: '#d52fa5' },
      { start: 74.5, length: 3.5, color: '#e63288' },
      { start: 78, length: 5.5, color: '#ee3d65' },
      { start: 83.5, length: 4, color: '#f04b45' },
      { start: 87.5, length: 2.5, color: '#ee7033' },
      { start: 90, length: 4.5, color: '#e4a62d' },
      { start: 94.5, length: 3, color: '#91cf2d' },
      { start: 97.5, length: 2.5, color: '#35ca68' },
    ],
  },
  {
    radius: 37,
    width: 9,
    segments: [
      { start: 0, length: 24, color: '#329be5' },
      { start: 24, length: 18, color: '#3866da' },
      { start: 42, length: 12, color: '#6740de' },
      { start: 54, length: 9, color: '#9634d0' },
      { start: 63, length: 8, color: '#c330b9' },
      { start: 71, length: 7, color: '#df318f' },
      { start: 78, length: 6, color: '#ef4162' },
      { start: 84, length: 6, color: '#ef6238' },
      { start: 90, length: 6, color: '#e4aa2d' },
      { start: 96, length: 4, color: '#48ca58' },
    ],
  },
  {
    radius: 25,
    width: 9,
    segments: [
      { start: 0, length: 42, color: '#348ede' },
      { start: 42, length: 21, color: '#6c3cdb' },
      { start: 63, length: 15, color: '#cf31ae' },
      { start: 78, length: 12, color: '#ef4d47' },
      { start: 90, length: 10, color: '#6fd239' },
    ],
  },
]

export function BytesizeMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className={className}>
      <circle cx="60" cy="60" r="57" fill="#0b111c" stroke="rgba(103,232,249,0.16)" />
      <g transform="rotate(-90 60 60)">
        {rings.flatMap((ring) => ring.segments.map((segment) => (
          (() => {
            const circumference = Math.PI * 2 * ring.radius
            return (
              <circle
                key={`${ring.radius}-${segment.start}`}
                cx="60"
                cy="60"
                r={ring.radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={ring.width}
                strokeDasharray={`${circumference * segment.length / 100} ${circumference * (100 - segment.length) / 100}`}
                strokeDashoffset={-circumference * segment.start / 100}
              />
            )
          })()
        )))}
      </g>
      <circle cx="60" cy="60" r="17" fill="#111a28" stroke="rgba(255,255,255,0.12)" />
    </svg>
  )
}
