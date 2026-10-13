// API fixtures: what the backend would answer so that each storefront page shows exactly the artboard's data.
// Photos are neutralised by the runner, so only names / prices / flags / texts matter here.
const NOW = new Date('2026-10-08T12:00:00+08:00')
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString()

export const settings = {
  shop_name: 'ralulu', free_shipping_minimarket: 1500, free_shipping_courier: 1500, free_shipping_active: true, free_shipping_start: '', free_shipping_end: '',
  shipping_options: [
    { id: 1, name: '7-Eleven', chain_type: 'cvs_711', fee: 60 }, { id: 2, name: 'FamilyMart', chain_type: 'cvs_familymart', fee: 60 }, { id: 3, name: 'Alamat Customer', chain_type: 'courier', fee: 100 },
  ],
  whatsapp_number: '6282220056883', cs_hours: 'Setiap hari 10:00–22:00', cs_hours_note: '', social: { youtube: '', instagram: '', facebook: '', tiktok: '' },
  rewards: { welcome_balance: 100, referral_reward: 50, point_value: 1, refund_credit_bonus_pct: 5 }, whatsapp_login: true, splash_url: 'x',
}

let nextId = 100
export const card = (name, price, o = {}) => ({
  id: o.id ?? nextId++, sku: o.sku || 'P', name, category: o.category || '', price, compare_at: o.compare_at || 0, image: 'x', in_stock: o.in_stock !== false,
  is_live: Boolean(o.live), is_new: Boolean(o.new), live_code: o.live ? 'A12' : '', sold: 1, created_at: daysAgo(o.new ? 2 : 40), wear_size: o.wear || '',
})
const host = (name, o = {}) => ({
  id: o.id ?? nextId++, slug: name.toLowerCase(), name, alias: [], avatar_url: 'x', live_status: o.status || 'offline', live_title: o.title || '', viewer_count: o.viewers ?? null,
  next_live_at: o.next || null, next_live_title: o.nextTitle || '', item_count: o.items ?? 12, has_replay: Boolean(o.replay), wearing_image: 'x', watch_url: 'https://www.tiktok.com/@' + name.toLowerCase(),
})
export const hosts = {
  rara: host('RARA', { id: 1, status: 'live', viewers: 1284, title: 'Spesial rajut musim gugur' }),
  anna: host('ANNA', { id: 2, next: '2026-10-08T20:00:00+08:00' }),
  bella: host('BELLA', { id: 3, replay: true }),
  cici: host('CICI', { id: 4, next: '2026-10-10T14:00:00+08:00' }),
  dinda: host('DINDA', { id: 5, replay: true }),
  lala: host('LALA', { id: 6, status: 'live', viewers: 836 }),
}
Object.values(hosts).forEach((h) => { h.thumbs = ['x', 'x', 'x']; h.item_count = 12 })
export const topic = (title, summary, slug) => ({ id: nextId++, type: 'topic', slug, title, summary, category_label: '', cover_url: 'x', cover_alt: '', author: 'RARA', read_minutes: 4, published_at: daysAgo(1), tags: [], is_featured: false })

const tile = (id, name, featured) => ({ id, name, display: name, slug: name.toLowerCase(), cover_url: 'x', count: 5, featured, children: [] })
export const categoryTree = [
  { id: 100, name: 'Atasan', display: 'Atasan', slug: 'atasan', cover_url: 'x', count: 5, children: [tile(1, 'Kaos', true), tile(2, 'Kemeja', false), tile(3, 'Rajut', false), tile(4, 'Atasan lengan panjang', false), tile(5, 'Atasan motif', false)] },
  { id: 200, name: 'Jaket・Bawahan', display: 'Jaket・Bawahan', slug: 'jaket', cover_url: 'x', count: 5, children: [tile(6, 'Jaket suede', false), tile(7, 'Jaket utility', true), tile(8, 'Jaket rajut', false), tile(9, 'Rok', false), tile(10, 'Atasan unik', false)] },
  { id: 300, name: 'Aksesori', display: 'Aksesori', slug: 'aksesori', cover_url: 'x', count: 4, children: [tile(11, 'Kalung', false), tile(12, 'Cincin', false), tile(13, 'Mutiara', false), tile(14, 'Seri hati', false)] },
]

function home() {
  const live = [card('Kemeja kotak longgar dua saku', 590, { id: 1 }), card('Jaket rajut tweed resleting', 890, { id: 2 }), card('Rok asimetris suede', 690, { id: 3 })]
  return {
    modules: [
      { key: 'live', title: 'Area Live', subtitle: 'Semua live ›', data: { host: hosts.rara, products: live, coupon: { code: 'RARA100', value: 100 } } },
      { key: 'categories', title: 'Kategori pilihan', subtitle: 'Lihat semua ›', data: ['Kemeja', 'Kaos', 'Rajut', 'Jaket', 'Rok', 'Aksesori'].map((n, i) => ({ id: i + 1, name: n, display: n, slug: n.toLowerCase(), cover_url: 'x', count: 5 })) },
      { key: 'best_sellers', title: 'Produk terlaris', subtitle: 'Lihat semua ›', data: [
        card('Kaos longgar motif huruf', 290, { compare_at: 490, live: true }), card('Kaos lengan panjang polos slim', 390), card('Kemeja kotak longgar dua saku', 590, { live: true }),
        card('Rok asimetris suede', 690),
      ] },
      { key: 'new_in', title: 'Baru minggu ini', subtitle: 'Lihat semua ›', data: [
        card('Atasan sabrina rumbai paku', 690, { compare_at: 990, new: true }), card('Jaket bomber pendek suede', 1490, { compare_at: 1990, new: true }),
        card('Kemeja garis kerah berdiri', 590), card('Kardigan rajut kotak', 790),
      ] },
      { key: 'hosts', title: 'Host populer', subtitle: 'Semua host ›', data: [hosts.rara, hosts.anna, hosts.bella, hosts.cici] },
      { key: 'topics', title: 'Topik gaya', subtitle: 'Semua topik ›', data: [
        topic('Tren outfit minggu ini', '3 outfit yang paling banyak ditanya minggu ini', 'tren'), topic('Rekomendasi outfit tampak langsing', 'Warna gelap, garis lurus, proporsi pinggang tinggi', 'langsing'),
        topic('Panduan outfit kerja', '5 outfit seminggu tanpa mengulang', 'kerja'), topic('Inspirasi outfit kencan', 'Kencan pertama yang lembut dan santai', 'kencan'), topic('Item tren musim ini', 'Suede, kotak, rajut kembali tren', 'tren-item'),
      ] },
    ],
  }
}

export const me = { id: 1, name: 'Nama member', phone: '886912345678', email: 'email', birthday: '', language: 'id', referral_code: 'RALU1234', balance: 0, points: 0, counts: { coupons: 0, favorites: 0, orders: 3 }, profile: {}, tier: 'regular' }

const it = (name, color, size, qty, price, id) => ({ id, product_id: id, image: 'x', name, color, size, qty, price, reviewed: false })
const order = (no, status, items, total, o = {}) => ({
  order_no: no, status, created_at: o.created || '2026-10-06T10:00:00+08:00', updated_at: o.updated || o.created || '2026-10-06T10:00:00+08:00', tracking_number: '', customer_name: 'Nama', shipping_address: 'Alamat toko', chain: '7-ELEVEN', chain_type: 'cvs_711', store_name: o.store || 'Nama toko (Mandarin)', store_code: '024842',
  store_verified: true, shipping_fee: 0, discount: 0, subtotal: total, total, items,
})
export const orders = {
  RL2610090012: order('RL2610090012', 'pending', [it('Kaos lengan panjang polos slim', 'Putih krem', 'M', 2, 390, 5)], 780, { created: '2026-10-08T09:00:00+08:00' }),
  RL2610080031: order('RL2610080031', 'picking', [it('Jaket rajut tweed resleting', 'Abu', 'F', 1, 890, 2)], 890),
  RL2610060007: order('RL2610060007', 'shipped', [it('Kemeja kotak longgar dua saku', 'Kotak khaki', 'M', 1, 590, 1), it('Rok asimetris suede', 'Caramel', 'S', 1, 690, 3)], 1180),
  RL2609280044: order('RL2609280044', 'delivered', [it('Kaos longgar motif huruf', 'Putih', 'M', 1, 290, 4)], 290, { created: '2026-09-28T10:00:00+08:00', updated: '2026-10-02T10:00:00+08:00' }),
  RL2609200019: order('RL2609200019', 'return', [it('Rok asimetris suede', 'Caramel', 'M', 1, 690, 3)], 690, { created: '2026-09-20T10:00:00+08:00' }),
}

const wishCards = [
  card('Kemeja kotak longgar dua saku', 590, { id: 1, compare_at: 0 }), card('Jaket rajut tweed resleting', 890, { id: 2, compare_at: 1290 }),
  card('Jaket bomber pendek suede', 1490, { id: 6 }), { ...card('Kalung moonstone', 290, { id: 7 }), stock_left: 2 },
]

const searchRara = () => ({
  hosts: [{ ...hosts.rara, live_title: 'Spesial rajut musim gugur' }],
  products: [card('Kardigan rajut kotak', 790, { id: 11 }), card('Kaos longgar motif huruf', 290, { id: 12, compare_at: 490 })],
  articles: [
    { id: 901, type: 'host_article', slug: 'a1', author_slug: 'rara', title: 'Jurnal gaya RARA: tinggi 158 cm pakai celana lebar tanpa terlihat pendek', cover_url: 'x', published_at: daysAgo(3) },
    { id: 902, type: 'host_article', slug: 'a2', author_slug: 'rara', title: 'Coba produk baru: 5 item favoritku minggu ini', cover_url: 'x', published_at: daysAgo(5) },
  ],
  hosts_for_products: [], suggestions: ['RARA', 'Kemeja kotak longgar dua saku'], worn_ids: [11, 12],
  live_products: [card('Kemeja kotak longgar dua saku', 590, { id: 1, live: true }), card('Jaket rajut tweed resleting', 890, { id: 2, live: true }), card('Rok asimetris suede', 690, { id: 3 })],
})

const product = (id, name, price, o = {}) => ({ id, sku: 'P' + id, name, price, compare_at: o.compare_at || 0, images: ['x'], in_stock: true, live_code: o.live ? 'A12' : '', created_at: daysAgo(o.new ? 2 : 40) })
const listProducts = [
  product(21, 'Kemeja kotak longgar dua saku', 590, { compare_at: 890, live: true }), product(22, 'Kemeja garis kerah berdiri', 590, { compare_at: 890 }),
  product(23, 'Kemeja garis bordir longgar', 590, { new: true }), product(24, 'Atasan kerut motif kucing', 490, { compare_at: 790 }),
  product(25, 'Atasan sabrina rumbai paku', 690, { compare_at: 990 }), product(26, 'Atasan lengan panjang tipis motif', 490),
]
const stores = {
  found: { status: 'found', results: [{ code: '123456', name: '○○門市', addr: '台北市○○區○○路 123 號' }] },
  candidates: { status: 'candidates', more: true, results: [{ code: '123456', name: '公益門市', addr: '台中市南屯區公益路二段 ○○ 號' }, { code: '234567', name: '新公益門市', addr: '台中市西區公益路 ○○ 號' }, { code: '345678', name: '公益東興門市', addr: '台中市南屯區東興路 ○○ 號' }] },
  not_found: { status: 'not_found', results: [] },
}
const variant = (id, color, size, stock = 9) => ({ id, sku: 'V' + id, color, size, price: 590, compare_at: 890, stock })
const prod = (id, name, price, o = {}) => ({ id, sku: 'P' + id, name, category: 'Atasan', description: o.desc || '', price, compare_at: o.compare_at || 0, images: ['x', 'x', 'x', 'x'], colors: ['Kotak khaki'], in_stock: true, sold: 5,
  created_at: daysAgo(40), variants: o.variants || [variant(id * 10 + 1, o.color || 'Caramel', 'S'), variant(id * 10 + 2, o.color || 'Caramel', 'M')], measurements: {}, live_code: o.live ? 'A12' : '', video_url: o.video || '', video_poster_url: o.video ? 'x' : '',
  hosts: o.hosts || [], looks: o.looks || [], wear: o.wear || [] })
export const products = {
  1: prod(1, 'Kemeja kotak longgar dua saku', 590, { compare_at: 890, live: true, color: 'Kotak khaki', video: 'https://example.invalid/v.mp4', hosts: [hosts.rara],
    looks: [card('Rok asimetris suede', 690, { id: 3 }), card('Kalung mutiara bar', 290, { id: 8 }), card('Jaket bomber pendek suede', 1490, { id: 6 })], wear: [{ host: 'RARA', slug: 'rara', height_cm: 158, weight_kg: 48, size: 'M' }] }),
  3: prod(3, 'Rok asimetris suede', 690), 8: prod(8, 'Kalung mutiara bar', 290, { variants: [variant(81, '', 'F')] }), 6: prod(6, 'Jaket bomber pendek suede', 1490, { color: 'Cokelat' }),
}
const hostNamed = (n, o) => ({ ...host(n, o), thumbs: ['x', 'x', 'x'] })
export const liveData = () => {
  const A = hostNamed('Host A', { id: 11, status: 'live', viewers: 1284, title: 'Spesial rajut musim gugur' })
  const B = hostNamed('Host B', { id: 12, next: '2026-10-10T14:00:00+08:00', nextTitle: 'Outfit cewek streetwear' })
  const C = hostNamed('Host C', { id: 13, next: '2026-10-11T20:00:00+08:00', nextTitle: 'Kaos polos banyak warna' })
  const D = hostNamed('Host D', { id: 14, next: '2026-10-19T20:00:00+08:00' })
  const A2 = { ...A, next_live_at: '2026-10-08T20:00:00+08:00', next_live_title: 'Spesial rajut musim gugur' }
  const lp = (id, name, price, code) => ({ ...card(name, price, { id, live: true }), live_code: code })
  return {
    live: [A], scheduled: [A2, B, C], hosts: [A, B, C, D], coupon: { code: 'RARA100', value: 100 },
    products: [lp(1, 'Kemeja kotak longgar dua saku', 590, 'A12'), lp(2, 'Atasan kerut motif kucing', 490, 'A15'), lp(3, 'Jaket utility kerah kontras', 1290, 'A18'), lp(4, 'Rok asimetris suede', 690, 'A21')],
    replays: [{ id: 1, host_name: 'Host A', host_slug: 'host a', title: '3 cara pakai kemeja kotak', url: '#', duration_sec: 2712, aired_on: '2026-10-01' }, { id: 2, host_name: 'Host B', host_slug: 'host b', title: 'Semua jaket musim gugur', url: '#', duration_sec: 3150, aired_on: '2026-10-02' }],
  }
}
const art = (id, title, label, o = {}) => ({ id, type: o.type || 'topic', slug: o.slug || 'a' + id, title, summary: o.summary || '', category_label: label, cover_url: 'x', cover_alt: title, author: 'RARA', author_slug: 'rara', read_minutes: 4, published_at: '2026-10-08T10:00:00+08:00', tags: [], is_featured: Boolean(o.featured) })
const journal = () => ({ labels: ['Outfit dopamin', 'Outfit mungil', 'Outfit kencan', 'Outfit jalan-jalan', 'Outfit kerja', 'Outfit tampak langsing', 'Outfit musim panas', 'Outfit traveling'], items: [
  art(1, 'Outfit jalan-jalan musim panas 2026 terbaik untuk wanita', 'Outfit jalan-jalan', { featured: true, summary: 'Pantai, kota tua, camping — tiga rencana, satu per satu outfit-nya' }),
  art(2, 'Cara padu padan outfit dopamin? Panduan gaya wanita 2026', 'Outfit dopamin'), art(3, 'Wanita mungil pakai apa supaya terlihat tinggi?', 'Outfit mungil'),
  art(4, 'Pakai apa saat kencan pertama? Rekomendasi outfit kencan wanita', 'Outfit kencan'), art(5, 'Outfit kerja tidak membosankan: 5 rumus seminggu', 'Outfit kerja') ] })
const pcard = (id, name, price, o = {}) => ({ ...card(name, price, { id, ...o }) })
const contentPages = {
  tren: () => ({
    page: art(21, 'Tren outfit minggu ini: 3 outfit yang paling banyak ditanya', 'Tren', { slug: 'tren', type: 'topic', summary: '' }),
    blocks: [
      { type: 'p', text: 'Pertanyaan terbanyak di ruang live minggu ini: "bagaimana berpakaian di musim gugur agar tidak gerah tapi tetap berlapis". Kami rangkum 3 outfit live yang paling banyak dipesan, semua bisa langsung dibeli.' },
      { type: 'h2', text: 'Kemeja kotak jadi outer, satu baju untuk tiga acara' },
      { type: 'image', url: 'x', alt: 'Kemeja kotak khaki dengan celana khaki', caption: 'Look 1・kemeja kotak jadi outer, dalaman kaos putih' },
      { type: 'image', url: 'x', alt: 'Kardigan rajut argyle abu tua dengan celana lebar', caption: 'Look 2・rajut argyle + celana lebar, kombinasi paling aman di musim gugur' },
    ],
    products: [pcard(1, 'Kemeja kotak longgar dua saku', 590, { live: true }), pcard(2, 'Kardigan rajut kotak', 790), pcard(3, 'Kaos longgar motif huruf', 290), pcard(4, 'Rok asimetris suede', 690)],
    categories: ['Kemeja', 'Rajut', 'Celana lebar', 'Jaket'].map((n) => ({ name: n, display: n })), hosts: [hosts.rara, hosts.bella],
    related: [art(22, 'Rekomendasi outfit tampak langsing', 'x', { summary: 'Warna gelap, garis lurus, proporsi pinggang tinggi' }), art(23, 'Panduan outfit kerja', 'x', { summary: '5 outfit seminggu tanpa mengulang' }), art(24, 'Inspirasi outfit kencan', 'x', { summary: 'Kencan pertama yang lembut dan santai' })],
    seo: { title: '', description: '', canonical: '', index: true },
  }),
  arts: () => ({
    page: { ...art(31, 'Outfit jalan-jalan musim panas 2026 terbaik untuk wanita', 'Outfit jalan-jalan', { slug: 'arts', type: 'article' }), author: 'Host A', read_minutes: 6, published_at: '2026-10-05T10:00:00+08:00', tags: ['OutfitJalanJalan', 'OutfitMusimPanas', 'OutfitKaosPolos', 'Outfit2026'] },
    blocks: [
      { type: 'p', text: 'Musim panas jalan-jalan paling takut panas dan tidak fotogenik. Artikel ini merangkum 3 rumus outfit untuk 3 jenis perjalanan, setiap item ditandai, klik yang kamu suka untuk ke halaman produk.' },
      { type: 'h2', text: '1. Pantai: kaos polos terang + celana lebar' },
      { type: 'p', text: 'Atasan terang tidak panas dan bagus di foto. Pilih model drop shoulder longgar, dipadu celana pinggang tinggi agar kaki terlihat panjang.' },
      { type: 'product', product_id: 3 },
      { type: 'h2', text: '2. Jalan-jalan kota tua: kemeja kotak jadi outer' },
      { type: 'p', text: 'Pagi dan malam beda suhu, kemeja tipis dibuka jadi outer paling praktis.' },
      { type: 'product', product_id: 1 },
      { type: 'h2', text: '3. Camping: jaket utility anti panas & tahan kotor' },
    ],
    products: [pcard(3, 'Kaos longgar motif huruf (8 warna)', 290, { compare_at: 490 }), pcard(1, 'Kemeja kotak longgar dua saku', 590, { live: true, compare_at: 890 })],
    categories: [], hosts: [{ ...hosts.rara, name: 'Host A' }],
    related: [art(2, 'Cara padu padan outfit dopamin? Panduan gaya wanita 2026', 'Outfit dopamin'), art(3, 'Wanita mungil pakai apa supaya terlihat tinggi?', 'Outfit mungil'), art(4, 'Pakai apa saat kencan pertama? Rekomendasi outfit kencan wanita', 'Outfit kencan')],
    seo: { title: '', description: '', canonical: '', index: true },
  }),
}
const raraExtra = { extra: {
  worn: [], picks: [card('Kardigan rajut kotak', 790, { id: 11 }), card('Kaos longgar motif huruf', 290, { id: 12, compare_at: 490 })],
  coupons: [
    { code: 'RARA100', title: 'Kupon khusus live', subtitle: 'Min. NT$990・semua produk', type: 'fixed_amount', value: 100, min_order_amount: 990, end_date: '2026-10-08T23:59:00+08:00' },
    { code: 'REKRARA', title: 'Produk rekomendasi RARA diskon 10%', subtitle: 'Khusus produk rekomendasi RARA', type: 'percentage', value: 10, min_order_amount: 0, end_date: '2026-10-31T23:59:00+08:00' },
    { code: 'FOLLOW50', title: 'Hadiah follower baru', subtitle: 'Tanpa minimal', type: 'fixed_amount', value: 50, min_order_amount: 0, end_date: '2026-10-15T23:59:00+08:00' } ],
  journal: [art(41, 'Jurnal gaya RARA: tinggi 158 cm pakai celana lebar tanpa terlihat pendek', 'Outfit sesuai bentuk tubuh', { type: 'host_article', slug: 'a1' }), art(42, 'Coba produk baru: 5 item favoritku minggu ini', 'Coba produk baru', { type: 'host_article', slug: 'a2' }), art(43, 'Sorotan live: 3 outfit paling banyak ditanya 10/05', 'Sorotan live', { type: 'host_article', slug: 'a3' })],
} }
const hostDetail = (h, o = {}) => ({
  host: { id: h.id, slug: h.slug, name: h.name, avatar_url: 'x', cover_url: 'x', live_status: h.live_status, live_title: h.live_title, viewer_count: h.viewer_count, next_live_at: h.next_live_at, next_live_title: h.next_live_title, watch_url: h.watch_url, tiktok_url: h.watch_url,
    bio: 'Gaya harian Korea untuk badan mungil. Live setiap Selasa, Kamis, Sabtu malam, mengajari tinggi 158 cm tampil proporsional.', height_cm: 158, usual_size: 'S / M', style_note: 'Harian ala Korea', favorites: 'Rajut・celana lebar', ...o.host },
  blocks: {}, showing: [card('Kemeja kotak longgar dua saku', 590, { id: 1 }), card('Jaket rajut tweed resleting', 890, { id: 2 }), card('Rok asimetris suede', 690, { id: 3 })],
  worn: [card('Kardigan rajut kotak', 790, { id: 11 }), card('Kaos longgar motif huruf', 290, { id: 12, compare_at: 490 })], picks: [],
  outfits: [{ id: 1, title: 'Akhir pekan musim gugur: kemeja kotak + rok pendek', tag: 'Outfit sehari-hari', total: 1570, items: [
    { variant_id: 11, product_id: 1, name: 'Kemeja kotak longgar dua saku', color: 'Kotak khaki', size: 'M', price: 590, image: 'x' }, { variant_id: 12, product_id: 3, name: 'Rok asimetris suede', color: 'Caramel', size: 'S', price: 690, image: 'x' }, { variant_id: 13, product_id: 8, name: 'Kalung mutiara bar', color: '', size: 'F', price: 290, image: 'x' }] }],
  coupons: [{ code: 'RARA100', title: 'Kupon khusus live', subtitle: 'Min. NT$990・semua produk', type: 'fixed_amount', value: 100, min_order_amount: 990, end_date: '2026-10-08T23:59:00+08:00' }],
  replays: [], journal: [], ...o.extra,
})
contentPages.a1 = () => ({
  author_height_cm: 158,
  page: { ...art(41, 'Jurnal gaya RARA: tinggi 158 cm pakai celana lebar tanpa terlihat pendek', 'Outfit sesuai bentuk tubuh', { type: 'host_article', slug: 'a1' }), author: 'RARA', author_slug: 'rara', published_at: '2026-10-06T10:00:00+08:00', tags: [] },
  blocks: [{ type: 'p', text: 'Isi artikel ditulis host atau editor; harus berisi pengalaman & pendapat gaya asli dari host tersebut, hindari halaman duplikat yang hanya beda nama.' }, { type: 'h2', text: '1. Pinggang tinggi + atasan crop' }, { type: 'p', text: 'Isi paragraf' }, { type: 'product', product_id: 11 }],
  products: [{ ...pcard(11, 'Kardigan rajut kotak', 790), wear_size: 'M' }, pcard(12, 'Kaos longgar motif huruf', 290), pcard(3, 'Rok asimetris suede', 690)],
  categories: [], hosts: [hosts.rara], related: [art(42, 'Coba produk baru: 5 item favoritku minggu ini', 'x', { type: 'host_article', slug: 'a2' }), art(43, 'Sorotan live: 3 outfit paling banyak ditanya 10/05', 'x', { type: 'host_article', slug: 'a3' })],
  seo: { title: '', description: '', canonical: '', index: true },
})
const routes = {
  '/public/store/content': journal,
  '/public/store/live': liveData,
  '/public/store/reviews': () => ({ count: 0, average: 0, items: [] }),
  '/public/store/quote': () => ({ subtotal: 1280, shipping_fee: 0, discount: 100, total: 1180, payable_now: 1180, wallet: null }),
  '/public/store/cvs/search': ({ params }) => { const q = params.get('q'); return q === '123456' ? stores.found : q === '公益' ? stores.candidates : stores.not_found },
  '/public/store/products': ({ params }) => params.get('sale') === 'true' && params.get('limit') === '1' ? { products: [product(21, 'x', 100)], total: 1 } : ({ products: listProducts, total: 128 }),
  '/public/store/search': searchRara,
  '/public/store/cards': () => ({ items: wishCards }),
  '/public/store/orders/track': ({ params }) => orders[params.get('order_no')] || { __http: 404, body: { error: 'nf' } },
  '/public/store/hosts': () => ({ hosts: Object.values(hosts), total: 6, live_count: 2 }),
  '/member/me': () => me,
  '/member/orders': () => [{ order_no: 'RL2610080031', phone: '0912345678', status: 'picking' }, { order_no: 'RL2610060007', phone: '0912345678', status: 'shipped' }],
  '/member/favorites': () => [],
  '/member/coupons': () => [],
  '/member/sync': () => ({}),
  '/public/store/settings': () => settings,
  '/public/store/category-tree': () => categoryTree,
  '/public/store/home': home,
  '/theme/published.css': () => ({ css: '' }),
}

// apiFor(entry, pathname, searchParams, method, body): entry.api may override / extend any route.
export async function apiFor(entry, pathname, params, method, body) {
  const custom = entry.api && (entry.api[pathname] ?? entry.api['*'])
  if (custom !== undefined) return typeof custom === 'function' ? custom({ pathname, params, method, body }) : custom
  const pm = pathname.match(/^\/public\/store\/products\/(\d+)$/)
  if (pm && products[pm[1]]) return products[pm[1]]
  if (/^\/public\/store\/products\/\d+\/reviews$/.test(pathname)) return { count: 0, average: 0, items: [] }
  const hm = pathname.match(/^\/public\/store\/hosts\/([\w-]+)$/)
  if (hm && hosts[hm[1]]) return hostDetail(hosts[hm[1]], hm[1] === 'rara' ? raraExtra : {})
  const cm = pathname.match(/^\/public\/store\/content\/([\w-]+)$/)
  if (cm && contentPages[cm[1]]) return contentPages[cm[1]]()
  const h = routes[pathname]
  if (h) return h({ params, method, body })
  return { __http: 404, body: { error: 'no fixture for ' + pathname } }
}
