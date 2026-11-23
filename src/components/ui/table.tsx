import * as React from 'react'
import { cn } from '@/lib/utils'

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}
export function TableHeader(props: React.ComponentProps<'thead'>) {
  return <thead {...props} className={cn('[&_tr]:border-b', props.className)} />
}
export function TableBody(props: React.ComponentProps<'tbody'>) {
  return <tbody {...props} className={cn('[&_tr:last-child]:border-0', props.className)} />
}
export function TableRow(props: React.ComponentProps<'tr'>) {
  return <tr {...props} className={cn('border-b transition-colors hover:bg-muted/50', props.className)} />
}
export function TableHead(props: React.ComponentProps<'th'>) {
  return <th {...props} className={cn('h-10 px-3 text-left align-middle font-medium text-muted-foreground', props.className)} />
}
export function TableCell(props: React.ComponentProps<'td'>) {
  return <td {...props} className={cn('p-3 align-middle', props.className)} />
}
