import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  url: string | undefined
  alt: string
  className?: string
}

/** A recipe picture that quietly disappears if it cannot be loaded (expired URL, deleted file). */
export default function RecipeImage({ url, alt, className }: Props) {
  const [failed, setFailed] = useState(false)
  if (!url || failed) return null
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('w-full object-cover', className)}
    />
  )
}
