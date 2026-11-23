import { useEffect, useRef } from 'react'

/**
 * An image from a paste event, or null. Text pastes are left alone: when the clipboard
 * also carries plain text we assume the user is pasting text, not a picture.
 */
export function imageFromClipboardData(data: Pick<DataTransfer, 'items' | 'getData'> | null): File | null {
  if (!data) return null
  if (data.getData('text/plain')) return null
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
  }
  return null
}

/** Calls `onImage` when the user pastes an image anywhere on the page (Ctrl+V / ⌘V). */
export function useImagePaste(onImage: (file: File) => void) {
  const handler = useRef(onImage)
  handler.current = onImage

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromClipboardData(e.clipboardData)
      if (!file) return
      e.preventDefault()
      handler.current(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])
}

/** Reads an image from the clipboard via the async API (for the "Lim inn bilde" button). */
export async function readClipboardImage(): Promise<File | null> {
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (type) {
      const blob = await item.getType(type)
      return new File([blob], `utklipp.${type.split('/')[1] ?? 'png'}`, { type })
    }
  }
  return null
}
