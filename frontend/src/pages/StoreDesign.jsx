import MockPage from '../components/MockPage'

export default function StoreDesign() {
  return (
    <MockPage icon="🎨" title="Store Design" description="Atur tampilan halaman toko: layout, featured products, dan koleksi.">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-800 mb-2">Featured Products</p>
          <p className="text-xs text-gray-500">Pilih hingga 8 produk unggulan untuk ditampilkan di beranda toko.</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-800 mb-2">Collections</p>
          <p className="text-xs text-gray-500">Kelompokkan produk ke dalam koleksi tematik (mis. "Best Seller", "New Arrival").</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-800 mb-2">Layout</p>
          <p className="text-xs text-gray-500">Pilih tata letak grid produk: 2, 3, atau 4 kolom.</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-800 mb-2">Store Categories</p>
          <p className="text-xs text-gray-500">Susun urutan kategori yang tampil di navigasi toko.</p>
        </div>
      </div>
    </MockPage>
  )
}
