import { useMemo } from 'react'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RoundTripRoute, TerrainRaster } from '@/services'
import { formatDistance } from '@/utils/format'

const AXIS = { fontSize: 12, fill: '#8a8882', fontFamily: 'IBM Plex Mono, monospace' }
const GRID = 'rgb(236 233 226 / 0.08)'
const tooltipStyle = {
  contentStyle: { background: '#212120', border: '1px solid rgb(236 233 226 / 0.18)', borderRadius: 8, fontSize: 12, padding: '6px 10px' },
  labelStyle: { color: '#aba9a3', marginBottom: 2 },
  itemStyle: { color: '#ecebe7', padding: 0 },
  cursor: { stroke: 'rgb(236 233 226 / 0.3)' },
}

/**
 * Elevation along the round trip: outbound then return on one distance axis,
 * with slope as a thin line against the configured limit.
 */
export function ElevationProfile({ route, maxSlopeDeg, height = 260 }: { route: RoundTripRoute; maxSlopeDeg: number; height?: number }) {
  const { data, turnM } = useMemo(() => {
    const thin = <T,>(arr: T[], n: number) => {
      const stride = Math.max(1, Math.ceil(arr.length / n))
      return arr.filter((_, i) => i % stride === 0 || i === arr.length - 1)
    }
    const out = thin(route.outbound.samples, 140).map((s) => ({ d: s.distanceM, out: s.elevationM, back: null as number | null, slope: s.slopeDeg }))
    const turn = route.outbound.distanceM
    // Join the two series at the turnaround so the line is continuous.
    out[out.length - 1]!.back = out[out.length - 1]!.out
    const back = thin(route.inbound.samples, 140)
      .slice(1)
      .map((s) => ({ d: turn + s.distanceM, out: null as number | null, back: s.elevationM as number | null, slope: s.slopeDeg }))
    return { data: [...out, ...back], turnM: turn }
  }, [route])

  const elevations = data.map((p) => p.out ?? p.back ?? 0)
  const lo = Math.floor(Math.min(...elevations) / 10) * 10 - 10
  const hi = Math.ceil(Math.max(...elevations) / 10) * 10 + 10

  return (
    <figure>
      <div style={{ height }} role="img" aria-label={`Elevation profile. Outbound ${formatDistance(route.outbound.distanceM)} climbing ${Math.round(route.outbound.ascentM)} metres, return ${formatDistance(route.inbound.distanceM)} climbing ${Math.round(route.inbound.ascentM)} metres. Steepest slope ${route.maxSlopeDeg.toFixed(1)} degrees against a limit of ${maxSlopeDeg} degrees.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="d"
              type="number"
              domain={[0, 'dataMax']}
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              tickFormatter={(v: number) => (v / 1000).toFixed(1)}
              tickCount={7}
            />
            <YAxis yAxisId="z" domain={[lo, hi]} tick={AXIS} tickLine={false} axisLine={false} width={44} unit=" m" tickCount={5} />
            <YAxis yAxisId="s" orientation="right" domain={[0, Math.max(20, Math.ceil(maxSlopeDeg / 5) * 5 + 5)]} tick={AXIS} tickLine={false} axisLine={false} width={36} unit="°" tickCount={5} />
            <Tooltip
              {...tooltipStyle}
              labelFormatter={(v) => `${formatDistance(Number(v))} from habitat`}
              formatter={(value, name) => [
                name === 'slope' ? `${Number(value).toFixed(1)}°` : `${Number(value).toFixed(1)} m`,
                name === 'out' ? 'Outbound elevation' : name === 'back' ? 'Return elevation' : 'Slope',
              ]}
            />
            <ReferenceLine yAxisId="s" y={maxSlopeDeg} stroke="#ea8273" strokeDasharray="4 4" label={{ value: `Slope limit ${maxSlopeDeg}°`, position: 'insideTopRight', fill: '#ea8273', fontSize: 12 }} />
            <ReferenceLine yAxisId="z" x={turnM} stroke="rgb(236 233 226 / 0.3)" label={{ value: 'Destination', position: 'insideTopLeft', fill: '#aba9a3', fontSize: 12 }} />
            <Line yAxisId="s" dataKey="slope" stroke="#8a8882" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Area yAxisId="z" dataKey="out" stroke="#7ed3de" strokeWidth={2} fill="#7ed3de" fillOpacity={0.1} dot={false} isAnimationActive={false} connectNulls={false} />
            <Area yAxisId="z" dataKey="back" stroke="#ece6da" strokeWidth={2} strokeDasharray="6 5" fill="#ece6da" fillOpacity={0.06} dot={false} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
        <span className="w-full text-fg-3">Distance walked from the habitat, km</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-out" aria-hidden />Outbound elevation</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-ret" aria-hidden />Return elevation</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-fg-3" aria-hidden />Slope, right axis</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-bad" aria-hidden />Slope limit</span>
      </figcaption>
    </figure>
  )
}

function histogram(values: Float32Array, validity: Uint8Array, min: number, step: number, bins: number) {
  const counts = new Array<number>(bins).fill(0)
  let n = 0
  for (let i = 0; i < values.length; i++) {
    if (validity[i] !== 1) continue
    counts[Math.max(0, Math.min(bins - 1, Math.floor((values[i]! - min) / step)))]!++
    n++
  }
  return counts.map((c, i) => ({ from: min + i * step, share: n ? (c / n) * 100 : 0 }))
}

/** Share of valid terrain cells per slope or elevation band. */
export function TerrainHistogram({ raster, kind, limitDeg }: { raster: TerrainRaster; kind: 'slope' | 'elevation'; limitDeg?: number }) {
  const data = useMemo(() => {
    if (kind === 'slope') return histogram(raster.slopeDeg, raster.validity, 0, 2, 10).map((b) => ({ ...b, label: `${b.from}–${b.from + 2}°` }))
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < raster.elevationM.length; i++) {
      if (raster.validity[i] !== 1) continue
      min = Math.min(min, raster.elevationM[i]!)
      max = Math.max(max, raster.elevationM[i]!)
    }
    const lo = Math.floor(min / 20) * 20
    const bins = Math.max(1, Math.ceil((max - lo) / 20))
    return histogram(raster.elevationM, raster.validity, lo, 20, bins).map((b) => ({ ...b, label: `${b.from}–${b.from + 20} m` }))
  }, [raster, kind])

  const top = data.reduce((a, b) => (b.share > a.share ? b : a))
  return (
    <div
      className="h-32"
      role="img"
      aria-label={`${kind === 'slope' ? 'Slope' : 'Elevation'} distribution of valid cells. Most common band ${top.label}, ${top.share.toFixed(0)} percent of cells.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="from" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={kind === 'slope' ? 1 : 'preserveStartEnd'} unit={kind === 'slope' ? '°' : ''} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} unit="%" tickCount={4} />
          <Tooltip {...tooltipStyle} cursor={{ fill: 'rgb(236 233 226 / 0.06)' }} labelFormatter={(_, p) => p[0]?.payload?.label ?? ''} formatter={(v) => [`${Number(v).toFixed(1)}% of cells`, '']} separator="" />
          <Bar dataKey="share" fill="#aba9a3" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          {kind === 'slope' && limitDeg !== undefined && limitDeg <= 20 && (
            <ReferenceLine x={Math.floor(limitDeg / 2) * 2} stroke="#ea8273" strokeDasharray="4 4" label={{ value: 'Limit', position: 'insideTopRight', fill: '#ea8273', fontSize: 12 }} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
