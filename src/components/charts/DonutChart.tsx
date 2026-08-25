import { useState } from 'react'
import { categoricalColor } from './palette'
import type { CategoryDatum } from '../../lib/insights'

interface DonutChartProps {
  title: string
  data: CategoryDatum[]
  // e.g. "₱" to render "₱1,240" instead of "1,240".
  valuePrefix?: string
  // Names what the centre total counts, e.g. "rides" → "1,240 rides".
  totalLabel?: string
  emptyMessage?: string
}

const RADIUS = 54
const STROKE = 18
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
// The dataviz skill's 2px surface gap between adjacent fills. On a ring the
// neighbours physically touch, unlike spaced bars, so the gap is what keeps
// two slices from reading as one wedge.
const GAP = 2

// Part-to-whole at a glance. Deliberately NOT used for trends (that's a time
// series), for status breakdowns (status colours are reserved and ship with a
// label), or wherever the reader's real job is comparing close magnitudes —
// a ring is bad at that and a bar chart is better. Capped at 6 slices for the
// same reason: past that, adjacent arcs blur and a table serves better.
//
// The palette is the validated categorical set (see palette.ts). Its aqua and
// yellow slots fall under 3:1 against the surface, which the validator flags
// as needing "relief" — met here by the legend carrying every label and value
// as text, so nothing is identified by colour alone.
export function DonutChart({ title, data, valuePrefix = '', totalLabel, emptyMessage }: DonutChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const slices = data.filter((d) => d.value > 0)
  const isSingleSlice = slices.length === 1

  // Centre shows the whole by default, and the focused slice while hovering —
  // so the ring answers "how much of the total is this?" without needing a
  // number stamped on every arc.
  const focused = hovered !== null ? data[hovered] : null
  const centreValue = focused ? focused.value : total
  const centreCaption = focused ? focused.label : (totalLabel ?? 'Total')

  let offset = 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {total === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">{emptyMessage ?? 'No data yet.'}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
            <svg width={140} height={140} viewBox="0 0 140 140" role="img" aria-label={`${title}. Total ${valuePrefix}${total.toLocaleString()}.`}>
              <g transform="rotate(-90 70 70)">
                {/* Track keeps the ring readable when one slice is tiny. */}
                <circle cx={70} cy={70} r={RADIUS} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
                {data.map((d, i) => {
                  if (d.value <= 0) return null
                  const fraction = d.value / total
                  const arc = fraction * CIRCUMFERENCE
                  // A lone 100% slice draws as a full ring — subtracting a gap
                  // would leave a phantom notch with nothing to separate from.
                  const dash = isSingleSlice ? arc : Math.max(1, arc - GAP)
                  const thisOffset = offset
                  offset += arc
                  const dimmed = hovered !== null && hovered !== i
                  return (
                    <circle
                      key={d.label}
                      cx={70}
                      cy={70}
                      r={RADIUS}
                      fill="none"
                      stroke={categoricalColor(i)}
                      strokeWidth={STROKE}
                      strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                      strokeDashoffset={-thisOffset}
                      opacity={dimmed ? 0.35 : 1}
                      className="transition-opacity"
                    />
                  )
                })}
              </g>
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base font-semibold text-slate-800">
                {valuePrefix}
                {centreValue.toLocaleString()}
              </span>
              <span className="max-w-[92px] text-center text-[10px] leading-tight text-slate-400">{centreCaption}</span>
            </div>
          </div>

          {/* Always present: identity is never carried by colour alone, and
              these values are the "relief" the contrast check requires. */}
          <ul className="min-w-[9rem] flex-1 space-y-1.5">
            {data.map((d, i) => {
              const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
              const isHovered = hovered === i
              return (
                <li
                  key={d.label}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  tabIndex={0}
                  className={`flex items-center gap-2 rounded px-1 py-0.5 text-xs transition-colors ${
                    isHovered ? 'bg-slate-50' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: categoricalColor(i) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-slate-600">{d.label}</span>
                  <span className="shrink-0 font-semibold text-slate-700">
                    {valuePrefix}
                    {d.value.toLocaleString()}
                  </span>
                  <span className="w-8 shrink-0 text-right text-slate-400">{pct}%</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
