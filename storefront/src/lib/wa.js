import { money } from './format'
import { getLang } from './lang'

// CS hand-off links and messages. A message is written in the language the website is shown in (Indonesian /
// English / Chinese); the product names and colours in it are the ones the API returns for that language, which
// follow the translations set in Ralulu Hub. Product Code, size and quantity are never translated. The numbers /
// IDs are configured in Ralulu Hub (Store Profile) and arrive with the store settings.

const TEXT = {
  id: {
    greeting: 'Hi Ralulu👋 aku mau tanya sesuatu',
    ask_product: 'Hi Ralulu 👋 aku mau tanya tentang produk ini',
    not_checked_out: '⏳ BELUM CHECKOUT', want_buy: 'Hi Ralulu 👋 aku mau beli produk berikut',
    ask_order: 'Hi Ralulu 👋 aku mau tanya tentang pesanan saya', order: 'Pesanan', customer: 'Pelanggan', phone: 'Nomor HP',
    confirmed: '✅ ORDER CONFIRMED', placed: 'Hi Ralulu 👋 aku sudah berhasil membuat pesanan!', ordered: 'Produk dipesan:',
    subtotal: 'Subtotal produk', discount: 'Diskon', shipping: 'Ongkir', total: 'Total',
  },
  en: {
    greeting: 'Hi Ralulu👋 I have a question',
    ask_product: 'Hi Ralulu 👋 I have a question about this product',
    not_checked_out: '⏳ NOT CHECKED OUT YET', want_buy: 'Hi Ralulu 👋 I would like to buy the following products',
    ask_order: 'Hi Ralulu 👋 I have a question about my order', order: 'Order', customer: 'Customer', phone: 'Phone',
    confirmed: '✅ ORDER CONFIRMED', placed: 'Hi Ralulu 👋 I have successfully placed an order!', ordered: 'Products ordered:',
    subtotal: 'Product subtotal', discount: 'Discount', shipping: 'Shipping', total: 'Total',
  },
  zh: {
    greeting: 'Hi Ralulu👋 我想詢問一些問題',
    ask_product: 'Hi Ralulu 👋 我想詢問這個商品',
    not_checked_out: '⏳ 尚未結帳', want_buy: 'Hi Ralulu 👋 我想購買以下商品',
    ask_order: 'Hi Ralulu 👋 我想詢問我的訂單', order: '訂單', customer: '顧客', phone: '手機號碼',
    confirmed: '✅ 訂單已成立', placed: 'Hi Ralulu 👋 我已經成功下單了！', ordered: '訂購商品：',
    subtotal: '商品小計', discount: '折扣', shipping: '運費', total: '總計',
  },
}
const tx = () => TEXT[getLang()] || TEXT.id

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
export const greetingText = () => tx().greeting

// "P021 - Kaos Bahu Miring - Merah - Freesize": Product Code, name, then colour and size when chosen.
export function productLine({ code, name, color, size }) {
  return [code, name, color, size].map((v) => String(v ?? '').trim()).filter(Boolean).join(' - ')
}

// keeps the blank separator lines ('') but drops the optional lines that are null / false
const compact = (lines) => lines.filter((l) => l !== null && l !== undefined && l !== false).join('\n')

// Question about one product (product page card / bottom bar, quick add): the line + the product link.
export function productText({ code, name, color, size, url }) {
  return compact([tx().ask_product, '', productLine({ code, name, color, size }), url || null])
}

// Cart / checkout buttons: what is in the cart, no prices or total (CS confirms the shipping method).
// One line per product, starting straight with the Product Code (no numbering).
export function cartText(items) {
  if (!items?.length) return greetingText()
  const lines = items.map((i) => `${productLine({ code: i.code || i.liveCode, name: i.name, color: i.color, size: i.size })} × ${i.qty}`)
  return compact([tx().not_checked_out, '', tx().want_buy, '', ...lines])
}

// Question about an existing order (My Orders, Order Detail, Return).
export function orderQuestionText({ orderNo, name, phone }) {
  const w = tx()
  return compact([w.ask_order, '', `${w.order}: ${orderNo}`, name ? `${w.customer}: ${name}` : null, phone ? `${w.phone}: ${phone}` : null])
}

// Checkout success: the order confirmation with every detail CS needs.
export function orderConfirmedText({ orderNo, name, phone, storeLabel, items, subtotal, shippingFee, discount, total }) {
  const w = tx()
  const lines = (items || []).map((i) => {
    const variant = [i.color, i.size].map((v) => String(v ?? '').trim()).filter(Boolean).join(' / ')
    const label = `${[i.code || i.liveCode, i.name].filter(Boolean).join(' - ')}${variant ? ` (${variant})` : ''}`
    return `${label} × ${i.qty} @ ${money(i.price)} = ${money(i.price * i.qty)}`
  })
  return compact([
    w.confirmed, '',
    w.placed, '',
    `${w.order}: ${orderNo}`, '',
    name ? `${w.customer}: ${name}` : null, phone ? `${w.phone}: ${phone}` : null, storeLabel || null,
    '', w.ordered, ...lines, '',
    `${w.subtotal}: ${money(subtotal)}`,
    discount > 0 ? `${w.discount}: -${money(discount)}` : null,
    `${w.shipping}: ${money(shippingFee)}`,
    `${w.total}: ${money(total)}`,
  ])
}
