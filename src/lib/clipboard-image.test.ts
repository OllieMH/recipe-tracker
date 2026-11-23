import { describe, expect, it } from 'vitest'
import { imageFromClipboardData } from './clipboard-image'

const file = (type: string) => new File(['x'], 'a', { type })
const data = (text: string, items: { kind: string; type: string; file?: File }[]) =>
  ({
    getData: (t: string) => (t === 'text/plain' ? text : ''),
    items: items.map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file ?? null })),
  }) as unknown as DataTransfer

describe('imageFromClipboardData', () => {
  it('returns a pasted image', () => {
    const f = file('image/png')
    expect(imageFromClipboardData(data('', [{ kind: 'file', type: 'image/png', file: f }]))).toBe(f)
  })
  it('ignores pastes that carry text', () => {
    const f = file('image/png')
    expect(imageFromClipboardData(data('hei', [{ kind: 'file', type: 'image/png', file: f }]))).toBeNull()
  })
  it('ignores non-image files and empty clipboards', () => {
    expect(imageFromClipboardData(data('', [{ kind: 'file', type: 'application/pdf', file: file('application/pdf') }]))).toBeNull()
    expect(imageFromClipboardData(null)).toBeNull()
  })
})
