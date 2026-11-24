// Validation of photos sent to import-recipe. Pure (no Deno APIs) so the tests can import it.
// Limits keep the whole request well under Gemini's 20 MB and the (undocumented) body limit of Edge Functions.

export const MAX_IMAGES = 4
export const MAX_IMAGE_B64 = 3_000_000 // per image, base64 characters (about 2.2 MB of picture)
export const MAX_TOTAL_B64 = 8_000_000 // all images together
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export interface ImageInput {
  mime_type: string
  data: string
}

export type ImageCheck = 'ok' | 'too_many_images' | 'images_too_large' | 'invalid_input'

export function checkImages(images: ImageInput[]): ImageCheck {
  if (images.length > MAX_IMAGES) return 'too_many_images'
  let total = 0
  for (const img of images) {
    if (!(IMAGE_TYPES as readonly string[]).includes(img.mime_type)) return 'invalid_input'
    if (img.data.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(img.data)) return 'invalid_input'
    if (img.data.length > MAX_IMAGE_B64) return 'images_too_large'
    total += img.data.length
  }
  return total > MAX_TOTAL_B64 ? 'images_too_large' : 'ok'
}
