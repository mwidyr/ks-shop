// "Add the whole set" of a host outfit. The outfit already carries live stock per item, so nothing is fetched:
// in-stock items become cart lines, sold-out ones are skipped, and the toast says what really happened.
export function outfitCartLines(items) {
  const lines = (items || []).filter((it) => it.stock > 0).map((it) => ({
    variantId: it.variant_id, productId: it.product_id, name: it.name, color: it.color, size: it.size,
    price: it.price, stock: it.stock, image: it.image || '', code: it.sku, liveCode: it.live_code,
  }))
  const total = (items || []).length
  const toast = lines.length === 0 ? 'none' : lines.length < total ? 'partial' : 'added'
  return { lines, toast, added: lines.length, total }
}
