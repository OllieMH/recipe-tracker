import { describe, expect, it } from 'vitest'
import { checkImages, MAX_IMAGE_B64, MAX_IMAGES } from '../../supabase/functions/_shared/image-input'

const img = (data = 'QUJD', mime_type = 'image/jpeg') => ({ mime_type, data })

describe('checkImages', () => {
  it('accepts a normal set and rejects the wrong shape', () => {
    expect(checkImages([img(), img('QUJD', 'image/png'), img('QUJD', 'image/webp')])).toBe('ok')
    expect(checkImages(Array(MAX_IMAGES + 1).fill(img()))).toBe('too_many_images')
    expect(checkImages([img('QUJD', 'image/gif')])).toBe('invalid_input')
    expect(checkImages([img('')])).toBe('invalid_input')
    expect(checkImages([img('not base64!')])).toBe('invalid_input')
  })

  it('refuses a single or total payload that is too big', () => {
    expect(checkImages([img('A'.repeat(MAX_IMAGE_B64 + 1))])).toBe('images_too_large')
    expect(checkImages([1, 2, 3, 4].map(() => img('A'.repeat(2_900_000))))).toBe('images_too_large')
  })
})
