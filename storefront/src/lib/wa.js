import { money } from './format'

// WhatsApp hand-off: every CS entry point opens wa.me with the message already filled in.
// The number is configured in Ralulu Hub (Store Profile) and arrives with the store settings.
export function waUrl(number, text) {
  if (!number) return ''
  return `https://wa.me/${number}?text=${encodeURIComponent(text || '')}`
}

const T = {
  id: {
    hello: 'Halo ralulu,', askProduct: 'Halo, saya mau tanya produk ini:', product: 'Saya mau tanya produk ini:', code: 'Kode live', color: 'Warna', size: 'Ukuran',
    cart: 'Saya mau minta CS pesankan produk berikut:', total: 'Total', topic: 'Saya butuh bantuan:',
    order: 'Saya mau tanya soal pesanan', store: 'Saya butuh bantuan memilih toko', storeLast: 'Nomor terakhir',
    topics: { order: 'Saya mau pesan / minta CS pesankan', size: 'Cara memilih ukuran', store: 'Tidak menemukan nomor toko 7-ELEVEN / FamilyMart', status: 'Cek pesanan saya', return: 'Retur / tukar', other: 'Pertanyaan lain' },
  },
  en: {
    hello: 'Hello ralulu,', askProduct: 'Hello, I have a question about this product:', product: 'I have a question about this product:', code: 'Live code', color: 'Colour', size: 'Size',
    cart: 'Please help me order the following items:', total: 'Total', topic: 'I need help with:',
    order: 'I have a question about my order', store: 'I need help choosing a store', storeLast: 'Last number',
    topics: { order: 'I want to order / please order for me', size: 'How to choose my size', store: "I can't find my 7-ELEVEN / FamilyMart store number", status: 'Check my order', return: 'Return / exchange', other: 'Other question' },
  },
  zh: {
    hello: '你好 ralulu，', askProduct: '你好，我想詢問這個商品：', product: '我想詢問這個商品：', code: '直播代碼', color: '顏色', size: '尺寸',
    cart: '請幫我下單以下商品：', total: '合計', topic: '我需要協助：',
    order: '我想詢問訂單', store: '我需要協助選擇門市', storeLast: '最近輸入的店號',
    topics: { order: '我要訂購／請客服幫我下單', size: '如何選擇尺寸', store: '找不到 7-ELEVEN／全家 店號', status: '查詢我的訂單', return: '退換貨', other: '其他問題' },
  },
}
const L = (lang) => T[lang] || T.id

export function productText(lang, { name, code, color, size, url }) {
  const t = L(lang)
  const lines = [t.askProduct, `${name}${code ? ` (#${code})` : ''}`]
  if (color || size) lines.push([color && `${t.color}: ${color}`, size && `${t.size}: ${size}`].filter(Boolean).join('・'))
  if (url) lines.push(url)
  return lines.join('\n')
}

export function cartText(lang, items, total) {
  const t = L(lang)
  const lines = [t.hello, t.cart]
  items.forEach((i) => {
    const v = [i.color, i.size].filter(Boolean).join(' / ')
    lines.push(`- ${i.name}${v ? ` (${v})` : ''} x${i.qty} = ${money(i.price * i.qty)}`)
  })
  lines.push(`${t.total}: ${money(total)}`)
  return lines.join('\n')
}

export function topicText(lang, key) {
  const t = L(lang)
  return `${t.hello}\n${t.topics[key] || t.topic}`
}
export function orderText(lang, orderNo) {
  const t = L(lang)
  return `${t.hello}\n${t.order} ${orderNo}`
}
export function storeHelpText(lang, chain, last) {
  const t = L(lang)
  return `${t.hello}\n${t.store} ${chain}${last ? `\n${t.storeLast}: ${last}` : ''}`
}

// Final step after checkout: both buttons open our CS chat with the real order number filled in.
export const confirmText = (orderNo) => `halo kak saya mau konfirmasi pesanan ${orderNo}`

// https://line.me/R/oaMessage/%40<id>/?<url-encoded message>; "@" must be %40 and spaces %20.
export function lineUrl(lineId, text) {
  const id = String(lineId || '').trim()
  if (!id) return ''
  return `https://line.me/R/oaMessage/${encodeURIComponent(id.startsWith('@') ? id : `@${id}`)}/?${encodeURIComponent(text || '')}`
}
