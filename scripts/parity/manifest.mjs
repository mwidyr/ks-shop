// Artboard -> storefront route. w/h are the artboard's own size (so fixed bars land where the artboard draws them).
// Not pixel-targeted (see the plan): documentation artboards (DesignSystem, Icons, Theme_Spec, Backend_Gap, Promo_Sync,
// Admin_Mobile_Matrix), Admin_* / Theme_Center proposals (Ralulu Hub keeps its own look) and the older DL_* store-picker
// variants superseded by ZH_*.
// The cart every screen of the design shows: Kemeja kotak (M) + Rok asimetris (S) = NT$1,280, badge 2.
import { hosts, settings } from './fixtures.mjs'
export const cart2 = [
  { variantId: 11, productId: 1, name: 'Kemeja kotak longgar dua saku', color: 'Kotak khaki', size: 'M', price: 590, stock: 9, image: 'x', qty: 1, selected: true },
  { variantId: 12, productId: 3, name: 'Rok asimetris suede', color: 'Caramel', size: 'S', price: 690, stock: 9, image: 'x', qty: 1, selected: true },
]
const withCart = { ralulu_cart_v2: cart2 }
const cart3 = [...cart2, { variantId: 13, productId: 7, name: 'Cincin perak bertekstur', color: '', size: 'Bisa diatur', price: 190, stock: 9, image: 'x', qty: 1, selected: false }]
const localOrders = ['RL2610090012', 'RL2610080031', 'RL2610060007', 'RL2609280044', 'RL2609200019'].map((orderNo) => ({ orderNo, phone: '0912345678', total: 0 }))
const signedIn = { ...withCart, ralulu_member_token: 'parity-token' }


// ---- checkout (ZH_* artboards) ----
const rara100 = { code: 'RARA100', type: 'fixed_amount', value: 100, min_order_amount: 990, end_date: '2026-10-31T23:59:00+08:00', title: 'Kupon khusus live', host: 'RARA' }
const co = { ...withCart, ralulu_coupons_v1: [rara100] }
const guest = { step: 2, view: '', name: 'Wang Xiaomei', phone: '0912-345-678', email: '', method: '', store: null, address: '', addrName: '', addrPhone: '', coupon: '' }
const store123 = { code: '123456', name: '○○門市', addr: '台北市○○區○○路 123 號', verified: true }
const storeRv = { ...store123, name: '○○' }
const at711 = { ...guest, method: 'cvs_711' }
const storeView = { ...at711, view: 'store' }
const ph = 'Ketik nomor toko atau nama toko'
const search = (q) => async (p) => { await p.getByPlaceholder(ph).fill(q); await p.getByRole('button', { name: 'Cari toko' }).click() }
const zhBase = { w: 390, max: 0.7, local: co, deviate: ['7-ELEVEN・Logo resmi', 'FamilyMart・Logo resmi', 'Logo resmi', '7-ELEVEN', 'FamilyMart'] }
const zh = [
  { id: 'ZH_Info', route: '/checkout', h: 1100, session: { ralulu_checkout_v1: { ...guest, step: 1, name: '', phone: '' } } },
  { id: 'ZH_InfoError', route: '/checkout', h: 1100, session: { ralulu_checkout_v1: { ...guest, step: 1, name: '', phone: '0912-34' } }, actions: async (p) => { await p.getByRole('button', { name: 'Lanjut: metode pengiriman' }).click() } },
  { id: 'ZH_Delivery', route: '/checkout', h: 1100, session: { ralulu_checkout_v1: guest } },
  { id: 'ZH_NoStore', route: '/checkout', h: 1100, session: { ralulu_checkout_v1: at711 }, actions: async (p) => { await p.getByRole('button', { name: 'Lanjut: konfirmasi pesanan' }).click() } },
  { id: 'ZH_StoreConfirmed', route: '/checkout', h: 1100, session: { ralulu_checkout_v1: { ...at711, store: store123, picked: true } } },
  { id: 'ZH_Store', route: '/checkout', h: 1150, session: { ralulu_checkout_v1: storeView } },
  { id: 'ZH_StoreLoading', route: '/checkout', h: 1670, session: { ralulu_checkout_v1: storeView }, api: { '/public/store/cvs/search': { delayForever: true } }, actions: search('123456') },
  { id: 'ZH_StoreFound', route: '/checkout', h: 1670, cmpH: 800, max: 1.1, deviate: ['Buka 24 jam・tunjukkan nama dan 3 digit terakhir HP saat ambil', 'Tunjukkan nama dan 3 digit terakhir HP saat ambil'], session: { ralulu_checkout_v1: storeView }, actions: search('123456') },
  { id: 'ZH_StoreCandidates', route: '/checkout', h: 1670, session: { ralulu_checkout_v1: storeView }, actions: search('公益') },
  { id: 'ZH_StoreNotFound', route: '/checkout', h: 1670, session: { ralulu_checkout_v1: storeView }, actions: search('公益路') },
  { id: 'ZH_StoreFail', route: '/checkout', h: 1670, session: { ralulu_checkout_v1: storeView }, api: { '/public/store/cvs/search': { __http: 503, body: { error: 'down' } } }, actions: search('123456') },
  { id: 'ZH_Review', route: '/checkout', h: 1350, session: { ralulu_checkout_v1: { ...at711, step: 3, store: storeRv } } },
  { id: 'ZH_Submitting', route: '/checkout', h: 1350, max: 0.9, session: { ralulu_checkout_v1: { ...at711, step: 3, store: storeRv } }, api: { '/public/store/orders': { delayForever: true } }, actions: async (p) => { await p.getByRole('button', { name: 'Konfirmasi pesanan' }).click() } },
  { id: 'ZH_SubmitFail', route: '/checkout', h: 1530, session: { ralulu_checkout_v1: { ...at711, step: 3, store: storeRv } }, api: { '/public/store/orders': { __http: 500, body: { error: 'x' } } }, actions: async (p) => { await p.getByRole('button', { name: 'Konfirmasi pesanan' }).click() } },
  { id: 'ZH_LogisticsFail', route: '/checkout', h: 1000, session: { ralulu_checkout_v1: guest }, api: { '/public/store/settings': () => ({ ...settings, shipping_options: [] }) } },
].map((e) => ({ ...zhBase, ...e, deviate: [...zhBase.deviate, ...(e.deviate || [])] }))

const orderState = { order: { order_no: 'RL2610090031', total: 1180, discount: 100, shipping_fee: 0, store_verified: true, whatsapp: { url: 'https://wa.me/6282220056883?text=x' } }, chain: '7-ELEVEN', store: { name: '○○門市', code: '123456' }, home: false, name: 'Wang', method: 'cvs_711' }
const success = { id: 'ZH_Success', route: '/', w: 390, h: 1000, cmpH: 400, max: 1, local: withCart,
  actions: async (p) => { await p.evaluate((st) => { window.history.pushState({ usr: st, key: 'k1', idx: 1 }, '', '/checkout/success'); window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state })) }, orderState) },
  deviate: ['Perkiraan tiba', '10/12', '7-ELEVEN ○○門市', '7-ELEVEN [○○]門市', 'Total bayar', 'Metode pembayaran', 'Kirim detail pesanan ke CS via WhatsApp', 'Tekan tombol di bawah supaya CS langsung memproses pesananmu. Pesanan sudah tercatat di sistem.', 'Kirim ke WhatsApp'] }

const prodEntry = { route: '/p/1', w: 390, local: { ...withCart, ralulu_profile_v1: { height: '160', weight: '50' } } }
// bottom sheets: only the sheet is compared (the artboard draws it over a blank page)
const sheetRegion = [[0, 0, 46], [330, 330, 570]]
export const manifest = [
  { id: 'Coupon_Apply', route: '/checkout', w: 390, h: 900, local: { ...co, ralulu_coupons_v1: [rara100, { code: 'REKRARA', type: 'percentage', value: 10, min_order_amount: 0, end_date: '2026-10-31T23:59:00+08:00', title: 'Produk rekomendasi RARA diskon 10%' }, { code: 'WELCOME150', type: 'fixed_amount', value: 150, min_order_amount: 1500, end_date: '2026-11-30T23:59:00+08:00', title: 'Hadiah member baru' }] }, session: { ralulu_checkout_v1: { ...at711, step: 3, store: storeRv } }, regions: sheetRegion, max: 20,
    actions: async (p) => { await p.getByRole('button', { name: /Kupon/ }).first().click() } },
  { id: 'WA_Handoff', route: '/p/1', w: 390, h: 900, local: withCart, regions: sheetRegion, max: 16,
    actions: async (p) => { await p.getByRole('radio', { name: 'M', exact: true }).click(); await p.getByRole('link', { name: 'Tanya CS' }).last().click() } },
  // Product_v2 shows the new gallery + "Padu padan" bundle, Product the sizes / description: the page has both, so each artboard is compared on the slices it draws
  { id: 'Product_v2', ...prodEntry, h: 1500, appH: 2600, max: 0.6, regions: [[0, 0, 560]], deviate: ['Tonton RARA coba-pakai 0:32', 'Tonton RARA coba-pakai', 'Rekomendasi RARA ›'] },
  ...zh,
  success,
  { id: 'Main', route: '/', w: 390, h: 4050, local: withCart },
  { id: 'Hosts', route: '/hosts', w: 390, h: 2020, max: 1.6, local: withCart, deviate: ['Live terakhir: replay 45 menit', 'Live terakhir: replay 52 menit', 'Live terakhir: replay'] },
  { id: 'Live', route: '/live', w: 390, h: 1720, max: 0.7, deviate: ['Host B・30 pesanan pertama dapat aksesori', 'Host C・Harga live mulai diskon 50%', 'Senin depan', 'Senin 20:00', 'Host B・Tonton live dapat kupon NT$100', 'Host C・Tonton live dapat kupon NT$100'], local: withCart, api: { '/public/store/settings': () => ({ ...settings, social: { facebook: 'https://facebook.com/x', youtube: 'https://youtube.com/x', instagram: '', tiktok: '' } }) } },
  { id: 'Journal', route: '/style', w: 390, h: 1700, local: withCart, deviate: ['Outfit jalan-jalan・Pilihan minggu ini'] },
  { id: 'Topic', route: '/style/tren', w: 390, h: 2950, local: withCart },
  { id: 'HostBrand', route: '/hosts/rara', w: 390, h: 3420, cmpH: 1500, local: { ...withCart, ralulu_coupons_v1: [{ code: 'FOLLOW50', type: 'fixed_amount', value: 50, min_order_amount: 0, title: 'x' }] }, max: 1.5,
    actions: async (p) => { await p.getByRole('button', { name: 'Outfit sehari-hari' }).click() },
    deviate: ['Dalam 7 hari setelah klaim', 'Berlaku s/d 10/15', 'Rekomendasi RARA', 'Khusus RARA', 'Live RARA', 'Sedang dipakai', 'Outfit tampak langsing', 'Pilihan minggu ini', 'Sama dengan live'] },
  { id: 'Host_Live', route: '/hosts/lala', w: 390, h: 2300, local: withCart },
  { id: 'Host_Offline', route: '/hosts/cici', w: 390, h: 2350, local: withCart },
  { id: 'HostArticle', route: '/hosts/rara/journal/a1', w: 390, h: 2300, local: withCart },
  { id: 'Article', route: '/style/arts', w: 390, h: 2560, cmpH: 1250, max: 2.3, local: withCart, deviate: ['Kaos longgar motif huruf', 'Kaos longgar motif huruf (8 warna)', '3. Camping: jaket utility anti panas & tahan kotor', 'Atasan terang tidak panas dan bagus di foto. Pilih model drop shoulder longgar, dipadu celana pinggang tinggi agar kaki terlihat panjang,Wanita mungiljuga cocok.', 'Atasan terang tidak panas dan bagus di foto. Pilih model drop shoulder longgar, dipadu celana pinggang tinggi agar kaki terlihat panjang.', 'Pagi dan malam beda suhu, kemeja tipis dibuka jadi outer paling praktis. Mau lebih ceria, ganti kotak merah, lihatPanduan outfit dopamin。', 'Pagi dan malam beda suhu, kemeja tipis dibuka jadi outer paling praktis.', 'Produk live', 'Produk live #A12'] },
  { id: 'Desktop_Home', route: '/', w: 1280, h: 3180, local: withCart },
  { id: 'Desktop_Host', route: '/hosts/rara', w: 1280, h: 2050, local: withCart },
  { id: 'Desktop_Product', route: '/p/1', w: 1280, h: 1000, local: withCart },
  { id: 'Language', route: '/language', w: 390, h: 844, local: withCart },
  { id: 'Menu', route: '/menu', w: 390, h: 844, local: withCart },
  // Login: LINE is replaced by Email (accounts = WhatsApp + email only) and the SMS code row is not part of the WhatsApp flow (the member sends the code from WhatsApp)
  { id: 'Login', route: '/login', w: 390, h: 1100, cmpH: 690, max: 6.3, deviate: ['Lanjut dengan LINE', 'Lanjut dengan Email', 'Kode verifikasi', 'Kirim kode verifikasi', 'Kode verifikasi dikirim via WhatsApp atau SMS'] },
  { id: 'Member', route: '/member', w: 390, h: 1386, local: signedIn, deviate: ['Ajak teman, masing-masing dapat NT$jumlah', 'Ajak teman, masing-masing dapat NT$50'] },
  { id: 'Orders', route: '/orders', w: 390, h: 1760, max: 1.6, local: { ...withCart, ralulu_orders_v1: localOrders },
    // pay-at-store only (no ATM transfer / prepaid) and no delivery ETA in the data: these notes and the "Bayar" button differ on purpose
    deviate: ['Silakan 10/09 23:59 selesaikan transfer ATM sebelum itu, lewat batas pesanan otomatis batal', 'Bayar', 'Pesanan diterima・bayar di toko saat ambil barang・NT$780', 'Lihat detail', 'Sudah dibayar・perkiraan 10/10 dikirim・Toko ambil: 7-ELEVEN toko', 'Pesanan sedang disiapkan・Toko ambil: 7-ELEVEN Nama toko (Mandarin)', 'Perkiraan 10/09 tiba di 7-ELEVEN Nama toko (Mandarin)・Bayar di toko NT$1,180', 'Sedang menuju 7-ELEVEN Nama toko (Mandarin)・Bayar di toko NT$1,180'] },
  { id: 'Wishlist', route: '/wishlist', w: 390, h: 1260, local: { ...withCart, ralulu_favorites_v1: [{ id: 1, price: 890, name: 'Kemeja kotak longgar dua saku' }, { id: 2, price: 890, name: 'Jaket rajut tweed resleting' }, { id: 6, price: 1990, name: 'Jaket bomber pendek suede' }, { id: 7, price: 290, name: 'Kalung moonstone' }, { id: 8, price: 100, name: 'x' }, { id: 9, price: 100, name: 'y' }], ralulu_fav_articles_v1: [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }] } },
  { id: 'Member_Coupons', route: '/coupons', w: 390, h: 1500, cmpH: 400, max: 1,
    // the artboard's coupon scope / live-date tags and its illustrative used+expired examples have no data behind them
    deviate: ['Live RARA 10/09', 'Live RARA', 'Rekomendasi RARA', 'REKRARA', 'Khusus produk rekomendasi RARA (12 item)', 'Semua produk', 'Potongan', 'NT$100', 'Kupon khusus live', 'Sudah dipakai・kedaluwarsa (contoh)', 'Live ANNA', 'Bisa dipakai min. NT$990', 'Dipakai 2026/10/05 di RL2610050012', 'Sudah dipakai', 'Min. NT$990・semua produk', 'Berakhir 2026/10/05 23:59', 'Dipakai', 'Live BELLA', 'OLD80', 'Min. NT$790・semua produk', 'Kedaluwarsa', 'NT$80', 'Kampanye', 'Khusus akhir pekan', 'Min. NT$800', 'Kedaluwarsa 2026/09/30', 'Hak klaim, syarat, dan nilai diskon selalu divalidasi backend; frontend hanya menampilkan hasilnya.'], local: { ...withCart, ralulu_coupons_v1: [
  { code: 'RARA100', type: 'fixed_amount', value: 100, min_order_amount: 990, end_date: '2026-10-09T23:59:00+08:00', title: 'Kupon khusus live', host: 'RARA' },
  { code: 'REKRARA', type: 'percentage', value: 10, min_order_amount: 0, end_date: '2026-10-31T23:59:00+08:00', title: 'Produk rekomendasi RARA diskon 10%' },
  { code: 'WELCOME150', type: 'fixed_amount', value: 150, min_order_amount: 1500, end_date: '2026-11-30T23:59:00+08:00', title: 'Hadiah member baru' },
  { code: 'ANNA100', type: 'fixed_amount', value: 100, min_order_amount: 990, end_date: '2026-10-05T23:59:00+08:00', title: 'Kupon khusus live', host: 'ANNA', usedAt: 1790000000000 },
  { code: 'OLD80', type: 'fixed_amount', value: 80, min_order_amount: 790, end_date: '2026-09-30T23:59:00+08:00', title: 'Kupon khusus live', host: 'BELLA' },
] } },
  { id: 'Profile', route: '/profile', w: 390, h: 1300, cmpH: 540, max: 1.5, local: { ...signedIn, ralulu_profile_v1: { stores: [{ chain: 'cvs_711', code: '024842', name: 'Nama toko (Mandarin)', addr: 'Alamat toko', isDefault: true }, { chain: 'cvs_fm', code: '12345', name: 'Nama toko (Mandarin)', addr: 'Alamat toko' }], addresses: [{ name: 'Penerima', phone: 'Telepon', text: 'Kota Distrik Alamat' }], birthday: '2026-01-15' } },
    // LINE / Google login rows do not exist (accounts = WhatsApp + email); the artboard's "Logo resmi" is a placeholder for the chain logo
    api: { '/member/me': { id: 1, name: 'Nama', phone: '62 xxx', email: 'email', birthday: '2026-01-15', referral_code: 'X', balance: 0, points: 0, counts: { coupons: 0, favorites: 0, orders: 0 }, profile: {} } },
    deviate: ['0912-xxx-xxx', 'LINE', 'Nama LINE', 'Google', 'Belum terhubung', 'Hubungkan', '7-ELEVEN・Logo resmi', 'FamilyMart・Logo resmi', '中文', 'Indonesia', 'Terhubung', 'Terverifikasi', 'MM/DD・Kupon di bulan ulang tahun', '01/15・Kupon di bulan ulang tahun', 'Nama toko (Mandarin)（Default）', 'Alamat toko・No. toko xxxxxx', 'Alamat toko・No. toko xxxxx', 'Penerima・Telepon', 'KotaDistrikAlamat', 'Kota Distrik Alamat', '+62 xxx', 'Email', 'email', '7-ELEVEN', 'FamilyMart', 'Alamat toko・No. toko 024842', 'Alamat toko・No. toko 12345', 'Data ukuran', 'Dipakai untuk saran ukuran di halaman produk (tidak dikirim ke mana pun).', 'Tinggi (cm)', 'Berat (kg)', 'Simpan', 'Hapus semua data di perangkat ini'] },
  { id: 'OrderDetail', route: '/orders/RL2610060007', w: 390, h: 1340, local: { ...withCart, ralulu_orders_v1: localOrders }, max: 3.5,
    deviate: ['Perkiraan tiba di toko 10/09, diberi tahu via LINE / WhatsApp', 'Sedang dikirim ke toko, diberi tahu via WhatsApp saat tiba', '10/06 20:45・CS bantu pesan', '10/06 10:00', '10/07 15:10', '10/08 09:32', 'Perkiraan 10/09', '7-ELEVEN・Logo resmi', '7-ELEVEN', 'Ajukan retur / tukar'] },
  { id: 'Return', route: '/orders/RL2609280044/return', w: 390, h: 1480, cmpH: 700, actions: async (p) => { await p.getByRole('radio', { name: 'Ukuran tidak pas' }).click() }, local: { ...withCart, ralulu_orders_v1: localOrders }, deviate: ['7-ELEVEN・Logo resmi', 'FamilyMart・Logo resmi', '7-ELEVEN', 'FamilyMart'] },
  { id: 'Search', route: '/search?q=rara', w: 390, h: 1900, cmpH: 1290, max: 1, local: withCart,
    // the artboard's illustrative extras: "Produk 8" count over two shown cards, a second "contoh" block, abbreviated suggestions
    deviate: ['Produk 8', 'Produk 2', 'Kemeja kotak yang sedang dipakai RARA', 'Kemeja kotak longgar dua saku yang sedang dipakai RARA', 'RA', 'RA・Host', 'RARA・Host', 'Kemeja kotak yang sedang dipakai RARA', 'Kemeja kotak yang sedang dipakai RA', 'Contoh 2: cari kata kunci produk "kotak" → produk dulu, di bawahnya "host yang pernah memakai"', 'Host yang pernah memakai ini', 'BELLA', 'RARA', 'Sedang live', 'Kemeja kotak longgar dua saku', 'NT$590'] },
  { id: 'Category', route: '/categories', w: 390, h: 2560, local: withCart, api: { '/public/store/hosts': () => ({ hosts: Object.values(hosts).slice(0, 5), total: 5, live_count: 1 }) } },
  { id: 'ProductList', route: '/c/Kemeja?min=300&sale=true', w: 390, h: 1640, cmpH: 1290, max: 1.3, local: withCart,
    deviate: ['Produk live', 'Produk live #A12', 'Rekomendasi host', 'Tampilkan lebih banyak', 'Kemeja・Atasan'],
    api: { '/public/store/category-tree': () => [{ id: 100, name: 'Atasan', display: 'Atasan', slug: 'atasan', cover_url: 'x', count: 5, children: [{ id: 1, name: 'Kaos', display: 'Kaos' }, { id: 2, name: 'Kemeja', display: 'Kemeja' }, { id: 3, name: 'Rajut', display: 'Rajut' }, { id: 4, name: 'Lengan panjang', display: 'Lengan panjang' }] }] } },
  { id: 'Cart', route: '/cart', w: 390, h: 1200, max: 0.6, local: { ralulu_cart_v2: cart3 } },
  { id: 'Service', route: '/service', w: 390, h: 1560, local: withCart },
]
