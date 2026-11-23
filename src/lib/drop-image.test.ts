import { describe, expect, it } from 'vitest'
import { firstImage } from './drop-image'

const f = (type: string, name = 'a') => new File(['x'], name, { type })

describe('firstImage', () => {
  it('picks the first image, skipping other files', () => {
    const img = f('image/jpeg', 'b')
    expect(firstImage([f('application/pdf'), img, f('image/png')])).toBe(img)
  })
  it('returns null without images', () => {
    expect(firstImage([f('text/plain')])).toBeNull()
    expect(firstImage([])).toBeNull()
    expect(firstImage(null)).toBeNull()
  })
})
