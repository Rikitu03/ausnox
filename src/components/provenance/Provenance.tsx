import { CircleDashed, CircleHelp, ExternalLink, Eye, FlaskConical, History, Sigma, type LucideIcon } from 'lucide-react'
import { services, type ProvenanceKind, type ProvenanceRecord } from '@/services'
import { Sheet } from '@/components/ui/overlay'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

export type BadgeKind = ProvenanceKind | 'illustrative'

export const KIND_META: Record<BadgeKind, { label: string; icon: LucideIcon; meaning: string }> = {
  observed: { label: 'Observed', icon: Eye, meaning: 'Measured by a NASA or USGS instrument, from a documented product' },
  derived: { label: 'Derived', icon: Sigma, meaning: 'Computed from observed data or from published astronomical equations' },
  simulated: { label: 'Simulated', icon: FlaskConical, meaning: 'A hypothetical assumption or its consequence. Not a measurement' },
  historical: { label: 'Historical', icon: History, meaning: 'Recorded at a known past time and place. Not a forecast' },
  unknown: { label: 'Unknown', icon: CircleHelp, meaning: 'Missing, invalid, outside coverage or not supported' },
  illustrative: { label: 'Illustrative', icon: CircleDashed, meaning: 'Synthetic demo data standing in until the real dataset or model is integrated' },
}

const records = () => services.mapData.listProvenance()
export const findRecord = (id: string): ProvenanceRecord | undefined => records().find((r) => r.id === id)

/** What to show for a record today: its scientific kind, or "illustrative" while a stand-in is served. */
export const badgeKind = (r: ProvenanceRecord): BadgeKind => (r.integration === 'demo-stand-in' ? 'illustrative' : r.kind)

/** Static label. Icon and word together, so the category never depends on colour. */
export function KindBadge({ kind, className }: { kind: BadgeKind; className?: string }) {
  const { label, icon: Icon } = KIND_META[kind]
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded-[5px] border border-line-strong px-1.5 text-xs whitespace-nowrap text-fg-2', className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}

/** Badge that opens the source details for one dataset or model. */
export function SourceBadge({ id, kind, className }: { id: string; kind?: BadgeKind; className?: string }) {
  const record = findRecord(id)
  const open = useUiStore((s) => s.openProvenance)
  const shown = kind ?? (record ? badgeKind(record) : 'unknown')
  const { label, icon: Icon } = KIND_META[shown]
  return (
    <button
      type="button"
      onClick={() => open(id)}
      aria-label={`${label}. Show source: ${record?.title ?? 'unknown source'}`}
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-[5px] border border-line-strong px-1.5 text-xs whitespace-nowrap text-fg-2 transition-colors duration-150 hover:border-fg-3 hover:text-fg',
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </button>
  )
}

const INTEGRATION: Record<ProvenanceRecord['integration'], string> = {
  planned: 'Planned. Not ingested yet',
  'demo-stand-in': 'Demo stand-in shown. Real data or model not integrated yet',
  integrated: 'In use',
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 py-2">
      <dt className="text-[13px] text-fg-3">{label}</dt>
      <dd className="text-[13px] text-fg">{children}</dd>
    </div>
  )
}

export function RecordDetails({ record }: { record: ProvenanceRecord }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={record.kind} />
        {record.integration === 'demo-stand-in' && <KindBadge kind="illustrative" />}
      </div>
      <dl className="mt-3 divide-y divide-line">
        <Row label="Status">{INTEGRATION[record.integration]}</Row>
        {record.mission && <Row label="Mission">{record.mission}</Row>}
        {record.instrument && <Row label="Instrument">{record.instrument}</Row>}
        {record.provider && <Row label="Provider">{record.provider}</Row>}
        <Row label="Measures">{record.measures}</Row>
        <Row label="Coverage">{record.coverage}</Row>
        {record.resolution && <Row label="Resolution">{record.resolution}</Row>}
        <Row label="Limits">
          <ul className="space-y-1.5">
            {record.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Row>
        <Row label="Credit">{record.attribution}</Row>
      </dl>
      {record.sourceUrl && (
        <a
          href={record.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
        >
          Open source page
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
    </div>
  )
}

/** One drawer for every "where does this come from" question in the app. */
export function ProvenanceDrawer() {
  const id = useUiStore((s) => s.provenanceId)
  const open = useUiStore((s) => s.openProvenance)
  const setView = useUiStore((s) => s.setView)
  const record = id ? findRecord(id) : undefined
  return (
    <Sheet
      open={id !== null}
      onOpenChange={(o) => !o && open(null)}
      title={record?.title ?? 'Source not found'}
      description="Where this comes from and what it can and cannot tell you"
    >
      {record ? (
        <RecordDetails record={record} />
      ) : (
        <p className="text-[13px] text-fg-2">No source record is registered for this item, so treat it as unknown.</p>
      )}
      <button
        type="button"
        onClick={() => {
          open(null)
          setView('sources')
        }}
        className="mt-6 text-[13px] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg"
      >
        All data sources and methods
      </button>
    </Sheet>
  )
}
