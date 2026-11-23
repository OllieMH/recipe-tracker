import { describe, expect, it } from 'vitest'
import { scaledSize, thumbPathOf } from './images'

describe('scaledSize', () => {
  it('fits the longer side and keeps the aspect ratio', () => {
    expect(scaledSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(scaledSize(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })
  it('never upscales', () => {
    expect(scaledSize(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
  it('never returns a zero size', () => {
    expect(scaledSize(10000, 1, 1600).height).toBe(1)
  })
})

describe('thumbPathOf', () => {
  it('inserts -thumb before the extension', () => {
    expect(thumbPathOf('abc/123.webp')).toBe('abc/123-thumb.webp')
    expect(thumbPathOf('abc/123.jpg')).toBe('abc/123-thumb.jpg')
  })
})
