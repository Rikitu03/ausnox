import { X } from 'lucide-react'
import { Dialog as RadixDialog, Popover as RadixPopover, Tooltip as RadixTooltip } from 'radix-ui'
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { Button } from './button'

interface OverlayProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: string
  children: ReactNode
  className?: string
}

const scrim = 'fixed inset-0 z-[1100] bg-black/55 anim-fade'

function Header({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <RadixDialog.Title className="text-base font-medium">{title}</RadixDialog.Title>
        {description ? (
          <RadixDialog.Description className="mt-1 text-[13px] text-fg-2">{description}</RadixDialog.Description>
        ) : (
          <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
        )}
      </div>
      <RadixDialog.Close asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-1.5 -mt-1">
          <X />
        </Button>
      </RadixDialog.Close>
    </div>
  )
}

/**
 * Centred modal. Escape closes it and focus returns to the trigger. Only the body scrolls, so the
 * title and close button stay in view. `bare` hands the whole body to the caller (for tabbed layouts
 * that manage their own scrolling regions).
 */
export function Dialog({ open, onOpenChange, title, description, children, className, bare }: OverlayProps & { bare?: boolean }) {
  // Dialogs here are opened from stores, not a Radix Trigger, so Radix has nothing to return focus to.
  // Remember what had focus when the dialog opened and give it back on close.
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open && !opener.current) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [open])
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={scrim} />
        <RadixDialog.Content
          onCloseAutoFocus={(e) => {
            const el = opener.current
            opener.current = null
            if (el?.isConnected) {
              e.preventDefault()
              el.focus()
            }
          }}
          className={cn(
            'anim-rise fixed top-1/2 left-1/2 z-[1101] flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-panel border border-line-strong bg-surface',
            className,
          )}
        >
          <Header title={title} description={description} />
          {bare ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

/**
 * Small non-modal panel anchored to its trigger. Escape or an outside click closes it and focus
 * returns to the trigger. Used for short explanations that do not deserve a full dialog.
 */
export function Popover({
  trigger,
  children,
  label,
  align = 'end',
  className,
}: {
  trigger: ReactNode
  children: ReactNode
  label: string
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          sideOffset={8}
          collisionPadding={12}
          aria-label={label}
          className={cn(
            'anim-rise z-[1150] w-[min(360px,calc(100vw-24px))] rounded-panel border border-line-strong bg-surface shadow-[0_16px_48px_rgb(0_0_0/0.45)] outline-none',
            className,
          )}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}

export const PopoverClose = RadixPopover.Close

/** Side sheet. Used for provenance and for the side panels on narrow screens. */
export function Sheet({ side = 'right', bare, ...props }: OverlayProps & { side?: 'left' | 'right'; bare?: boolean }) {
  return (
    <RadixDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={scrim} />
        <RadixDialog.Content
          className={cn(
            'fixed top-0 bottom-0 z-[1101] flex w-[min(400px,calc(100vw-40px))] flex-col border-line-strong bg-surface',
            side === 'right' ? 'right-0 border-l [animation:slide-right_220ms_var(--ease-out)_both]' : 'left-0 border-r [animation:slide-left_220ms_var(--ease-out)_both]',
            props.className,
          )}
        >
          {bare ? (
            <>
              <RadixDialog.Title className="sr-only">{props.title}</RadixDialog.Title>
              <RadixDialog.Description className="sr-only">{props.description ?? props.title}</RadixDialog.Description>
              <RadixDialog.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close panel" className="absolute top-2.5 right-2.5 z-10">
                  <X />
                </Button>
              </RadixDialog.Close>
              <div className="min-h-0 flex-1 overflow-hidden">{props.children}</div>
            </>
          ) : (
            <>
              <Header title={props.title} description={props.description} />
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{props.children}</div>
            </>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

export function Tooltip({ label, children, side = 'top' }: { label: string; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="anim-fade z-[1200] max-w-64 rounded-md border border-line-strong bg-raised px-2 py-1 text-xs text-fg"
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}

export const TooltipProvider = RadixTooltip.Provider
