import { cva, type VariantProps } from 'class-variance-authority'
import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '@/utils/cn'

const buttonVariants = cva(
  'tap inline-flex shrink-0 items-center justify-center gap-2 rounded-ctl text-[13px] font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-fg text-bg hover:bg-white',
        secondary: 'border border-line-strong bg-raised text-fg hover:bg-hover',
        ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
        danger: 'text-bad hover:bg-bad/10',
      },
      size: {
        sm: 'h-8 px-2.5',
        md: 'h-9 px-3.5',
        lg: 'h-11 px-4 text-sm font-semibold',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({ className, variant, size, loading, disabled, children, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle className="anim-spin" aria-hidden />}
      {children}
    </button>
  )
}
