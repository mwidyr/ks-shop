# Module 10: Responsive UI/UX

## Overview
Layout adaptif untuk desktop & mobile, mencakup dua aplikasi terpisah: sistem internal (CS/Sales/SPV/Management/Super User) dan portal customer.

## Scope
- **Internal system**: dashboard, product management, cart/checkout, order management — dioptimalkan untuk kecepatan input (Sales sering pakai di lapangan/mobile saat checkout customer)
- **Customer portal**: lebih sederhana, fokus ke tracking order — prioritas mobile-first karena customer kemungkinan besar akses dari HP

## Key UX Considerations
- **Checkout flow**: timer 30 menit harus tampil jelas & real-time (misal countdown visible di header checkout page) agar sales sadar batas waktu
- **Picking flow**: UI harus tetap mudah dipakai di layar kecil untuk tim gudang yang mungkin pakai tablet/HP saat picking
- **Search customer**: autocomplete cepat, cocok untuk input cepat di lapangan
- Navigasi mobile: bottom nav atau hamburger menu, konsisten di seluruh modul internal

## Technical Notes
- Breakpoint standar: mobile (<768px), tablet (768-1024px), desktop (>1024px)
- Komponen reusable untuk konsistensi (button, table responsive → card view di mobile, form input)

## Open Questions
1. Apakah ada preferensi design system/branding tertentu dari klien (warna, logo, font)?
2. Sistem existing — apakah UI-nya bisa jadi referensi langsung untuk mempercepat desain baru?

## Acceptance Criteria
- [ ] Semua modul internal berfungsi baik di desktop & mobile browser tanpa fitur hilang
- [ ] Customer portal mobile-first dan mudah dipakai tanpa training
- [ ] Timer checkout & status order jelas terlihat di semua ukuran layar
