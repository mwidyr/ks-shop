import { money } from './format'

// CS hand-off links and messages. Every message is Indonesian whatever language the site is shown in:
// the CS team reads one format (client sheet "CS", column "MSG (Click to Chat)"). The numbers / IDs are
// configured in Ralulu Hub (Store Profile) and arrive with the store settings.

// https://wa.me/<number>?text=<message>
export function waUrl(number, text) {
  if (!number) return ''
  return `https://wa.me/${number}?text=${encodeURIComponent(text || '')}`
}

// https://line.me/R/oaMessage/%40<id>/?<url-encoded message>; "@" must be %40 and spaces %20.
export function lineUrl(lineId, text) {
  const id = String(lineId || '').trim()
  if (!id) return ''
  return `https://line.me/R/oaMessage/${encodeURIComponent(id.startsWith('@') ? id : `@${id}`)}/?${encodeURIComponent(text || '')}`
}

// General question: CS / header / menu / home / host / error buttons.
export const greetingText = () => 'Hi Ralulu👋 aku mau tanya sesuatu'

// "C002 - Kaos Bahu Miring - Merah - Freesize": Product Code, name, then colour and size when chosen.
export function productLine({ code, name, color, size }) {
  return [code, name, color, size].map((v) => String(v ?? '').trim()).filter(Boolean).join(' - ')
}

// keeps the blank separator lines ('') but drops the optional lines that are null / false
const compact = (lines) => lines.filter((l) => l !== null && l !== undefined && l !== false).join('\n')

// Question about one product (product page card / bottom bar, quick add): the line + the product link.
export function productText({ code, name, color, size, url }) {
  return compact(['Hi Ralulu 👋 aku mau tanya tentang produk ini', '', productLine({ code, name, color, size }), url || null])
}

// Cart / checkout buttons: what is in the cart, no prices or total (CS confirms the shipping method).
export function cartText(items) {
  if (!items?.length) return greetingText()
  const lines = items.map((i, n) => `${n + 1}. ${productLine({ code: i.code || i.liveCode, name: i.name, color: i.color, size: i.size })} × ${i.qty}`)
  return compact(['⏳ BELUM CHECKOUT', '', 'Hi Ralulu 👋 aku mau beli produk berikut', '', ...lines])
}

// Question about an existing order (My Orders, Order Detail, Return).
export function orderQuestionText({ orderNo, name, phone }) {
  return compact(['Hi Ralulu 👋 aku mau tanya tentang pesanan saya', '', `Pesanan: ${orderNo}`, name ? `Pelanggan: ${name}` : null, phone ? `Nomor HP: ${phone}` : null])
}

// Checkout success: the order confirmation with every detail CS needs.
export function orderConfirmedText({ orderNo, name, phone, storeLabel, items, subtotal, shippingFee, discount, total }) {
  const lines = (items || []).map((i, n) => {
    const variant = [i.color, i.size].map((v) => String(v ?? '').trim()).filter(Boolean).join(' / ')
    const label = `${[i.code || i.liveCode, i.name].filter(Boolean).join(' - ')}${variant ? ` (${variant})` : ''}`
    return `${n + 1}. ${label} × ${i.qty} @ ${money(i.price)} = ${money(i.price * i.qty)}`
  })
  return compact([
    '✅ ORDER CONFIRMED', '',
    'Hi Ralulu 👋 aku sudah berhasil membuat pesanan!', '',
    `Pesanan: ${orderNo}`, '',
    name ? `Pelanggan: ${name}` : null, phone ? `Nomor HP: ${phone}` : null, storeLabel || null,
    '', 'Produk dipesan:', ...lines, '',
    `Subtotal produk: ${money(subtotal)}`,
    discount > 0 ? `Diskon: -${money(discount)}` : null,
    `Ongkir: ${money(shippingFee)}`,
    `Total: ${money(total)}`,
  ])
}
