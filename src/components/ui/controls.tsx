import { ChevronDown } from 'lucide-react'
import { Collapsible as RadixCollapsible, Switch as RadixSwitch } from 'radix-ui'
import { useId, useState, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

/** Radio-style choice between a few options. Arrow keys move, like any radio group. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
  size = 'md',
}: {
  label: string
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange(value: T): void
  className?: string
  size?: 'sm' | 'md'
}) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid auto-cols-fr grid-flow-col gap-0.5 rounded-ctl border border-line bg-bg p-0.5', className)}>
      {options.map((o) => {
        const checked = o.value === value
        return (
          <label
            key={String(o.value)}
            title={o.hint}
            className={cn(
              'tap relative flex cursor-pointer items-center justify-center rounded-[6px] px-2 text-center text-[13px] transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-accent',
              size === 'sm' ? 'h-7' : 'h-8',
              checked ? 'bg-raised text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-accent' : 'text-fg-2 hover:text-fg',
            )}
          >
            <input type="radio" name={name} className="sr-only" checked={checked} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        )
      })}
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled, id }: { checked: boolean; onChange(checked: boolean): void; label: string; disabled?: boolean; id?: string }) {
  return (
    <RadixSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-full border border-line-strong bg-bg transition-colors duration-150 disabled:opacity-40 data-[state=checked]:border-fg data-[state=checked]:bg-fg"
    >
      <RadixSwitch.Thumb className="block size-3.5 translate-x-[3px] rounded-full bg-fg-2 transition-transform duration-150 ease-out data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-bg" />
    </RadixSwitch.Root>
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select
        className={cn(
          'tap h-9 w-full appearance-none rounded-ctl border border-line-strong bg-raised pr-8 pl-3 text-[13px] text-fg transition-colors duration-150 hover:bg-hover disabled:opacity-45',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
    </span>
  )
}

/**
 * Number input that keeps the typed text while it is invalid, shows why, and
 * only commits values inside [min, max].
 */
export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step,
  unit,
  hideLabel,
  className,
  describedBy,
}: {
  label: string
  value: number
  onCommit(value: number): void
  min: number
  max: number
  step: number
  unit?: string
  hideLabel?: boolean
  className?: string
  describedBy?: string
}) {
  const id = useId()
  const [text, setText] = useState(String(value))
  const [error, setError] = useState<string | null>(null)
  // Follow the committed value when it changes from outside (reset, defaults, sample mission).
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setText(String(value))
    setError(null)
  }

  const change = (raw: string) => {
    setText(raw)
    const n = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(n)) return setError('Enter a number')
    if (n < min || n > max) return setError(`Must be ${min} to ${max}${unit ? ` ${unit}` : ''}`)
    setError(null)
    if (n !== value) onCommit(n)
  }

  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1 block text-[13px] text-fg-2'}>
        {label}
      </label>
      <span
        className={cn(
          'flex h-9 items-center rounded-ctl border bg-bg transition-colors duration-150 focus-within:border-fg-2',
          error ? 'border-bad' : 'border-line-strong',
        )}
      >
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={text}
          min={min}
          max={max}
          step={step}
          onChange={(e) => change(e.target.value)}
          onBlur={() => error && (setText(String(value)), setError(null))}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(error && `${id}-err`, describedBy) || undefined}
          className="num tap h-full w-full min-w-0 bg-transparent px-2.5 text-[13px] text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {unit && <span className="pr-2.5 text-xs text-fg-3">{unit}</span>}
      </span>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  )
}

export function Collapsible({ title, hint, children, defaultOpen = false }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <RadixCollapsible.Root defaultOpen={defaultOpen}>
      <RadixCollapsible.Trigger className="tap group flex w-full items-center justify-between gap-3 rounded-ctl py-1 text-left">
        <span>
          <span className="block text-[13px] font-medium">{title}</span>
          {hint && <span className="block text-xs text-fg-3">{hint}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-fg-3 transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden />
      </RadixCollapsible.Trigger>
      <RadixCollapsible.Content className="pt-3">{children}</RadixCollapsible.Content>
    </RadixCollapsible.Root>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-md bg-raised', className)} aria-hidden />
}
