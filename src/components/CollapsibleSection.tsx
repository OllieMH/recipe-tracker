import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const key = (id: string) => `section-open:${id}`

function readOpen(id: string): boolean {
  try {
    return localStorage.getItem(key(id)) !== '0'
  } catch {
    return true
  }
}

interface Props {
  /** Stable id: the open/closed choice is remembered per section in this browser. */
  id: string
  title: string
  /** Controls shown next to the title while the section is open. */
  actions?: ReactNode
  children: ReactNode
}

export default function CollapsibleSection({ id, title, actions, children }: Props) {
  const [open, setOpen] = useState(() => readOpen(id))

  function toggle() {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(key(id), next ? '1' : '0')
    } catch {
      /* private mode etc.: the choice just isn't remembered */
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-lg font-semibold"
        >
          <ChevronDown className={cn('size-5 transition-transform print:hidden', !open && '-rotate-90')} aria-hidden />
          {title}
        </button>
        {open && <div className="print:hidden">{actions}</div>}
      </div>
      {/* Always rendered so collapsed sections still appear when printing */}
      <div className={cn('space-y-3', !open && 'hidden print:block')}>{children}</div>
    </section>
  )
}
