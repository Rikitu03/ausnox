import { CircleCheck, CircleHelp, CircleX, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Feasibility } from '@/services'
import { cn } from '@/utils/cn'

/** Ausnox mark, redrawn from the Figma logo: a disc with a wave cut through it. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-5', className)} aria-hidden>
      <path
        fill="currentColor"
        d="M12 1.5a10.5 10.5 0 1 0 10.2 13c-2 1.3-4.1 1.300-5.500-.1-1.700-1.700-3.900-1.600-6.400.1 1-4.700 3.800-8.700 8.600-11.200A10.500 10.500 0 0 0 12 1.500Z"
      />
    </svg>
  )
}

type Tone = 'info' | 'warn' | 'bad' | 'ok' | 'unknown'
const TONES: Record<Tone, { icon: LucideIcon; color: string; word: string }> = {
  info: { icon: Info, color: 'text-fg-2', word: 'Note' },
  warn: { icon: TriangleAlert, color: 'text-warn', word: 'Warning' },
  bad: { icon: CircleX, color: 'text-bad', word: 'Problem' },
  ok: { icon: CircleCheck, color: 'text-ok', word: 'OK' },
  unknown: { icon: CircleHelp, color: 'text-fg-2', word: 'Unknown' },
}

/** Message with an icon and words, so status never rests on colour alone. */
export function StatusAlert({
  tone,
  title,
  children,
  action,
  className,
  live,
}: {
  tone: Tone
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
  live?: boolean
}) {
  const { icon: Icon, color, word } = TONES[tone]
  return (
    <div
      role={live ? (tone === 'bad' ? 'alert' : 'status') : undefined}
      className={cn('flex gap-3 rounded-card border border-line bg-raised p-3', className)}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', color)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">
          <span className="sr-only">{word}: </span>
          {title}
        </p>
        {children && <div className="mt-1 text-[13px] text-fg-2">{children}</div>}
        {action && <div className="mt-2.5 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}

export const FEASIBILITY: Record<Feasibility, { icon: LucideIcon; color: string; label: string; short: string }> = {
  feasible: { icon: CircleCheck, color: 'text-ok', label: 'Feasible under selected assumptions', short: 'Feasible' },
  infeasible: { icon: CircleX, color: 'text-bad', label: 'Infeasible under selected assumptions', short: 'Infeasible' },
  indeterminate: { icon: CircleHelp, color: 'text-fg-2', label: 'Indeterminate', short: 'Indeterminate' },
}

/** Panel that floats over the map on desktop. The same content is reused inside sheets. */
export function Panel({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <section
      aria-label={label}
      className={cn('flex min-h-0 flex-col overflow-hidden rounded-panel border border-line bg-surface', className)}
    >
      {children}
    </section>
  )
}

export function PanelHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-raised/50 px-5 py-5">
      <div className="min-w-0">
        <h2 className="text-lg leading-6 font-semibold tracking-tight">{title}</h2>
        {meta && <div className="mt-1 text-xs leading-5 text-fg-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}

export function Section({
  title,
  aside,
  children,
  className,
}: {
  title?: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('border-b border-line px-5 py-5 last:border-b-0', className)}>
      {(title || aside) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h3 className="text-sm font-semibold text-fg">{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </div>
  )
}

/** Label over a figure. The figure is mono and tabular so columns of numbers line up. */
export function Stat({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  emphasis?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs leading-5 text-fg-2">{label}</dt>
      <dd
        className={cn(
          'num mt-1 break-words',
          emphasis ? 'text-[30px] leading-10 tracking-tight text-fg' : 'text-lg leading-7 text-fg',
        )}
      >
        {value}
      </dd>
      {sub && <dd className="mt-1 text-xs leading-5 text-fg-2">{sub}</dd>}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-card bg-bg p-4">
      <Icon className="size-4 text-fg-3" aria-hidden />
      <p className="text-[13px] font-medium">{title}</p>
      {children && <p className="text-[13px] text-fg-2">{children}</p>}
      {action && <div className="mt-1 flex flex-wrap gap-2">{action}</div>}
    </div>
  )
}

/** Native disclosure keeps supporting science one keyboard action away. */
export function Details({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="science-details group/details">
      <summary className="cursor-pointer rounded-ctl py-2 text-[13px] font-medium text-fg-2 marker:text-accent hover:text-fg">
        {title}
      </summary>
      <div className="space-y-3 pt-2 pb-1 text-[13px] leading-5 text-fg-2">{children}</div>
    </details>
  )
}
