// Recipe pictures: resize in the browser, store in the private `recipe-images` bucket,
// read back through short-lived signed URLs.

import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export const BUCKET = 'recipe-images'
const MAX_FILE_BYTES = 25 * 1024 * 1024 // refuse absurdly large inputs before decoding
const FULL_SIDE = 1600
const THUMB_SIDE = 480
const SIGNED_URL_SECONDS = 3600

/** Fit inside `max` on the longer side. Never upscales. */
export function scaledSize(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/** "<id>/123.webp" -> "<id>/123-thumb.webp" */
export const thumbPathOf = (path: string) => path.replace(/(\.\w+)$/, '-thumb$1')

/** Only files inside the recipe's own folder may be deleted: copies share the original's picture. */
const ownsPath = (recipeId: string, path: string | null | undefined): path is string =>
  !!path && path.startsWith(`${recipeId}/`)

interface Encoded {
  blob: Blob
  ext: string
}

async function encode(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<Encoded> {
  const { width, height } = scaledSize(bitmap.width, bitmap.height, maxSide)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)

  const toBlob = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality))
  const webp = await toBlob('image/webp')
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' }
  // Some browsers cannot encode WebP and silently return PNG: use JPEG instead.
  const jpeg = await toBlob('image/jpeg')
  if (!jpeg) throw new Error('could not encode image')
  return { blob: jpeg, ext: 'jpg' }
}

export const IMAGE_ERROR = 'Kunne ikke lese bildet. Prøv et JPEG-, PNG- eller WebP-bilde.'

async function prepare(file: File) {
  if (!file.type.startsWith('image/') || file.size > MAX_FILE_BYTES) throw new Error(IMAGE_ERROR)
  let bitmap: ImageBitmap
  try {
    // 'from-image' applies the EXIF rotation phones write into photos
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(IMAGE_ERROR)
  }
  try {
    const full = await encode(bitmap, FULL_SIDE, 0.82)
    const thumb = await encode(bitmap, THUMB_SIDE, 0.8)
    return { full, thumb }
  } finally {
    bitmap.close()
  }
}

const AI_SIDE = 2000 // higher than for pictures: small print has to stay legible
const AI_TARGET_BYTES = 600 * 1024

/**
 * A photo or screenshot made ready for recipe reading: upright, at most 2000 px, JPEG of
 * about 600 KB or less (quality steps down until it fits), as base64 without the data: prefix.
 */
export async function prepareForAi(file: File): Promise<{ mime_type: 'image/jpeg'; data: string }> {
  if (!file.type.startsWith('image/') || file.size > MAX_FILE_BYTES) throw new Error(IMAGE_ERROR)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(IMAGE_ERROR)
  }
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, AI_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(IMAGE_ERROR)
    ctx.fillStyle = '#fff' // transparent PNG screenshots must not turn black as JPEG
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)

    let blob: Blob | null = null
    for (const quality of [0.85, 0.75, 0.65, 0.55]) {
      blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
      if (blob && blob.size <= AI_TARGET_BYTES) break
    }
    if (!blob) throw new Error(IMAGE_ERROR)
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.onerror = () => rej(r.error)
      r.readAsDataURL(blob)
    })
    return { mime_type: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
  } finally {
    bitmap.close()
  }
}

async function removeFiles(recipeId: string, path: string | null | undefined) {
  if (!ownsPath(recipeId, path)) return
  await supabase.storage.from(BUCKET).remove([path, thumbPathOf(path)])
}

/** Resizes and uploads a picture, sets it on the recipe and removes the previous one. */
export async function uploadRecipeImage(recipeId: string, file: File, previousPath?: string | null): Promise<string> {
  const { full, thumb } = await prepare(file)
  const path = `${recipeId}/${Date.now()}.${full.ext}`
  const opts = (b: Blob) => ({ contentType: b.type, cacheControl: '31536000', upsert: false })

  const storage = supabase.storage.from(BUCKET)
  const up1 = await storage.upload(path, full.blob, opts(full.blob))
  if (up1.error) throw up1.error
  const up2 = await storage.upload(thumbPathOf(path), thumb.blob, opts(thumb.blob))
  if (up2.error) {
    await removeFiles(recipeId, path)
    throw up2.error
  }

  const { error } = await supabase.from('recipes').update({ image_path: path }).eq('id', recipeId)
  if (error) {
    await removeFiles(recipeId, path)
    throw error
  }
  await removeFiles(recipeId, previousPath)
  return path
}

export async function removeRecipeImage(recipeId: string, path: string): Promise<void> {
  const { error } = await supabase.from('recipes').update({ image_path: null }).eq('id', recipeId)
  if (error) throw error
  await removeFiles(recipeId, path)
}

/** Deletes a recipe's own picture files (call before deleting the recipe row). */
export const removeImageFiles = removeFiles

/** Signed URLs for a set of object paths. Returns path -> url. */
export function useSignedUrls(paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))].sort()
  return useQuery({
    queryKey: ['image-urls', unique],
    enabled: unique.length > 0,
    staleTime: (SIGNED_URL_SECONDS - 600) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS)
      if (error) throw error
      const map = new Map<string, string>()
      for (const row of data) if (row.path && row.signedUrl) map.set(row.path, row.signedUrl)
      return map
    },
  })
}
