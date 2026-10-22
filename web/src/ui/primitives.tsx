import type { ButtonHTMLAttributes, ReactNode } from 'react'

export const cx = (...xs: (string | false | null | undefined)[]): string => xs.filter(Boolean).join(' ')

export function Panel({ children, className, title, right }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode }) {
  return (
    <section
      className={cx(
        'pointer-events-auto rounded-xl border border-white/[0.08] bg-panel/85 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md',
        className,
      )}
    >
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3.5 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">{title}</h2>
          {right}
        </header>
      )}
      <div className="px-3.5 py-3">{children}</div>
    </section>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx('skeleton inline-block h-3.5 rounded', className ?? 'w-12')} aria-hidden />
}

type Tone = 'default' | 'primary' | 'ghost' | 'danger' | 'quiet'

export function Button({
  tone = 'default',
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; active?: boolean }) {
  const tones: Record<Tone, string> = {
    default: 'border-white/10 bg-white/[0.04] text-white/85 hover:bg-white/[0.09] hover:text-white',
    primary: 'border-you/60 bg-you/90 text-[#1a0d02] font-semibold hover:bg-you',
    ghost: 'border-ghost/50 bg-ghost/10 text-ghost hover:bg-ghost/20',
    danger: 'border-loss/50 bg-loss/10 text-loss hover:bg-loss/20',
    quiet: 'border-transparent bg-transparent text-white/60 hover:text-white hover:bg-white/[0.06]',
  }
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-you',
        'disabled:pointer-events-none disabled:opacity-35',
        tones[tone],
        active && 'border-you/70 bg-you/15 text-you',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'sm',
  label,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[]
  onChange: (v: T) => void
  size?: 'xs' | 'sm'
  label?: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-white/10 bg-black/25 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          disabled={o.disabled}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[5px] transition-colors disabled:opacity-35',
            size === 'xs' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
            o.value === value ? 'bg-white/[0.12] text-white shadow-sm' : 'text-white/55 hover:text-white/90',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'you' | 'ghost' | 'gain' | 'loss' }) {
  const tones = {
    default: 'border-white/15 text-white/70',
    you: 'border-you/50 text-you',
    ghost: 'border-ghost/50 text-ghost',
    gain: 'border-gain/50 text-gain',
    loss: 'border-loss/50 text-loss',
  }
  return (
    <span className={cx('inline-flex items-center rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wider', tones[tone])}>
      {children}
    </span>
  )
}

export function Stat({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">{label}</div>
      <div className="tabular text-sm text-white/90">{children}</div>
      {hint && <div className="text-[10px] text-white/40">{hint}</div>}
    </div>
  )
}
