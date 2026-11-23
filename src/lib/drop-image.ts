import { useState, useRef, type DragEvent } from 'react'

/** First image in a file list, or null. */
export function firstImage(files: ArrayLike<File> | null | undefined): File | null {
  return Array.from(files ?? []).find((f) => f.type.startsWith('image/')) ?? null
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

/**
 * Drag-and-drop for a picture area. Spread `props` on the container and use `dragging`
 * to highlight it. Only reacts to files being dragged, not to text or links.
 */
export function useImageDrop(onImage: (file: File) => void) {
  const [dragging, setDragging] = useState(false)
  const handler = useRef(onImage)
  handler.current = onImage

  const props = {
    onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault() // required, otherwise the browser rejects the drop
      e.dataTransfer.dropEffect = 'copy'
      setDragging(true)
    },
    onDragLeave(e: DragEvent) {
      // Moving over a child element also fires dragleave: only react when really leaving.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
    },
    onDrop(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragging(false)
      const file = firstImage(e.dataTransfer.files)
      if (file) handler.current(file)
    },
  }

  return { dragging, props }
}
