// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import AttachmentThumb from './AttachmentThumb'
import ImagePreviewModal from './ImagePreviewModal'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function render(node) {
  const el = document.createElement('div'); document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(node) })
  return { el, root }
}

describe('AttachmentThumb', () => {
  it('previews on tap and deletes with the X, without opening a new tab', async () => {
    const onPreview = vi.fn()
    const onDelete = vi.fn()
    const { el } = await render(<AttachmentThumb url="/uploads/a.jpg" onPreview={onPreview} onDelete={onDelete} deleteLabel="Remove" />)
    expect(el.querySelector('a')).toBeNull()
    await act(async () => { el.querySelector('img').closest('button').click() })
    expect(onPreview).toHaveBeenCalledTimes(1)
    await act(async () => { el.querySelector('button[aria-label="Remove"]').click() })
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onPreview).toHaveBeenCalledTimes(1)
  })
  it('has no X when it cannot be deleted', async () => {
    const { el } = await render(<AttachmentThumb url="/uploads/a.jpg" onPreview={() => {}} />)
    expect(el.querySelectorAll('button')).toHaveLength(1)
  })
})

describe('ImagePreviewModal', () => {
  it('closes with the X, with Esc, and with the browser Back button', async () => {
    const onClose = vi.fn()
    const { el, root } = await render(<ImagePreviewModal images={[{ url: '/uploads/a.jpg' }]} onClose={onClose} />)
    expect(window.history.state?.imagePreview).toBe(true)
    await act(async () => { el.querySelector('button[aria-label="Close"]').click() })
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(onClose).toHaveBeenCalledTimes(3)
    await act(async () => { root.unmount() })
  })
})
