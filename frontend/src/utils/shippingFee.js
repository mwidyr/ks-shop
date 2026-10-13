// Mirrors backend ComputeShippingFee (shipping_fee.go): the chain's target_fee (minimarket)
// or the flat home-delivery fee (chain_type='courier'), 0 once subtotal clears the relevant
// threshold. Seeds the default of the editable shipping-fee fields (Create Order, change pickup method).
export function defaultShippingFee(chain, shippingSettings, subtotal) {
  if (!chain || !shippingSettings) return 0
  if (chain.chain_type === 'courier') {
    const threshold = shippingSettings.free_shipping_threshold_pos
    if (threshold > 0 && subtotal >= threshold) return 0
    return shippingSettings.home_delivery_flat_fee
  }
  const threshold = shippingSettings.free_shipping_threshold_minimarket
  if (threshold > 0 && subtotal >= threshold) return 0
  return chain.target_fee
}
