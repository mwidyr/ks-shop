import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProduct, img, onImgError, sized } from '../lib/api'
import { useCart } from '../lib/cart'
import { money } from '../lib/format'
import { productText, waUrl } from '../lib/wa'
import { useStore } from '../lib/store'
import { btnOutline, btnPrimary, ErrorState, Sheet, Spinner } from './ui'

const Ctx = createContext(null)
export const useQuickAdd = () => useContext(Ctx)

// "Pilih ukuran" bottom sheet used by the quick-add button on product cards. Products with one
// purchasable variant skip it and go straight into the cart.
export function QuickAddProvider({ children }) {
  const [pid, setPid] = useState(null)
  const cart = useCart()
  const open = useCallback(async (card) => {
    setPid(card.id)
  }, [])
  const value = useMemo(() => ({ open }), [open])
  return (
    <Ctx.Provider value={value}>
      {children}
      <QuickAddSheet productId={pid} onClose={() => setPid(null)} cart={cart} />
    </Ctx.Provider>
  )
}

export function variantPick(product) {
  const colors = product.colors || []
  const variants = product.variants || []
  return { colors, variants }
}

function QuickAddSheet({ productId, onClose, cart }) {
  const { t, i18n } = useTranslation()
  const { settings } = useStore()
  const [product, setProduct] = useState(null)
  const [error, setError] = useState(false)
  const [color, setColor] = useState('')
  const [size, setSize] = useState('')

  useEffect(() => {
    if (!productId) return undefined
    let off = false
    setProduct(null); setError(false); setColor(''); setSize('')
    getProduct(productId).then((p) => {
      if (off) return
      setProduct(p)
      const inStock = (p.variants || []).filter((v) => v.stock > 0)
      const colors = [...new Set(inStock.map((v) => v.color))]
      if (colors.length === 1) setColor(colors[0])
    }).catch(() => !off && setError(true))
    return () => { off = true }
  }, [productId])

  // Skip the sheet when there is only one purchasable variant.
  useEffect(() => {
    if (!product) return
    const ok = (product.variants || []).filter((v) => v.stock > 0)
    if (ok.length === 1) {
      const v = ok[0]
      cart.add({ variantId: v.id, productId: product.id, name: product.name, color: v.color, size: v.size, price: v.price, stock: v.stock, image: product.images?.[0] || '', liveCode: product.live_code })
      onClose()
    }
  }, [product]) // eslint-disable-line react-hooks/exhaustive-deps

  const variants = product?.variants || []
  const colors = [...new Set(variants.map((v) => v.color))]
  const sizes = variants.filter((v) => (!color || v.color === color) && String(v.size || '').trim() !== '')
  // products sold by colour only have no size to pick: the colour alone selects the variant
  const sizeless = variants.length > 0 && variants.every((v) => String(v.size || '').trim() === '')
  const needColor = colors.length > 1 && !color
  const chosen = needColor ? undefined : variants.find((v) => v.color === (color || variants[0]?.color) && (sizeless || v.size === size))

  function submit() {
    if (!chosen || chosen.stock <= 0) return
    cart.add({ variantId: chosen.id, productId: product.id, name: product.name, color: chosen.color, size: chosen.size, price: chosen.price, stock: chosen.stock, image: product.images?.[0] || '', liveCode: product.live_code })
    onClose()
  }

  return (
    <Sheet open={Boolean(productId)} onClose={onClose} title={t('product.pick_size')}>
      {error ? <ErrorState onRetry={() => { setError(false); getProduct(productId).then(setProduct).catch(() => setError(true)) }} />
        : !product ? <Spinner label={t('common.loading')} />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <img src={sized(img(product.images?.[0]), 160)} onError={onImgError} alt="" style={{ width: 56, height: 74, borderRadius: 10, objectFit: 'cover' }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <b style={{ fontSize: 15 }}>{product.name}</b>
                  <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{money(product.price)}</span>
                </span>
              </div>
              {colors.length > 1 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label={t('product.color')}>
                  {colors.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={color === c} onClick={() => { setColor(c); setSize('') }}
                      style={{ height: 36, padding: '0 14px', borderRadius: 18, fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-text)', border: color === c ? '2px solid var(--color-text)' : '1px solid var(--color-border)', fontWeight: color === c ? 700 : 400 }}>{c}</button>
                  ))}
                </div>
              )}
              {!sizeless && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }} role="radiogroup" aria-label={t('product.size')}>
                {sizes.map((v) => {
                  const out = v.stock <= 0
                  const on = size === v.size
                  return (
                    <button key={v.id} type="button" role="radio" aria-checked={on} disabled={out} onClick={() => setSize(v.size)}
                      style={{ height: 46, borderRadius: 12, fontSize: 15, background: 'var(--color-surface)', color: out ? 'var(--color-disabled)' : 'var(--color-text)', border: out ? '1px dashed var(--color-border)' : on ? '2px solid var(--color-text)' : '1px solid var(--color-border)', fontWeight: on ? 700 : 400, textDecoration: out ? 'line-through' : 'none' }}>{v.size}</button>
                  )
                })}
              </div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                <a href={waUrl(settings.whatsapp_number, productText(i18n.language, { name: product.name, code: product.live_code, color, size, url: `${window.location.origin}/p/${product.id}` }))} target="_blank" rel="noreferrer" style={{ ...btnOutline, height: 48, padding: 0 }}>{t('common.ask_cs')}</a>
                <button type="button" onClick={submit} disabled={!chosen || chosen.stock <= 0} style={{ ...btnPrimary, height: 48, ...(!chosen ? { background: 'var(--color-border)', color: 'var(--color-disabled)', cursor: 'not-allowed' } : {}) }}>{t('common.add_to_cart')}</button>
              </div>
            </div>
          )}
    </Sheet>
  )
}
