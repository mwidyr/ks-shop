# ralulu storefront design (source of truth)

85 static artboards exported from the "ralulu" design artifact (`*.dc.html`: plain HTML + inline styles, 390px wide;
Home / Host / Product also have 1280px desktop versions). The storefront in `../../storefront` is a 1:1 React port.

Open any file directly in a browser to see the artboard (images are placeholders). Naming:
`Main` / `Desktop_Home` home, `Category`, `ProductList`, `Product*`, `Cart`, `Checkout`, `ZH_*` (checkout store flow,
canonical), `DL_*` (earlier store-flow variants; tutorial / example / help pieces reused), `Host*`, `Hosts*`, `Live`,
`Topic` / `Article` / `Journal` / `HostArticle`, `Search`, `Menu`, `Wishlist`, `Orders`, `OrderDetail`, `Return`,
`Service`, `WA_Handoff`, `Language`, `DesignSystem`, `Icons`, `Theme_Spec`, `Theme_Center`, `Admin_*`, `Backend_Gap`,
`Promo_Sync`.

`Theme_Spec`, `Backend_Gap` and `Promo_Sync` describe the theme system, the admin/API gaps and the free-shipping sync;
they are implemented by `backend/internal/handlers/theme.go`, `site_*.go` and the Website group in Ralulu Hub.
