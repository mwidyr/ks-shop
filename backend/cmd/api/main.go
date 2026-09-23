package main

import (
	"context"
	"embed"
	"log"
	"net/http"
	"os"
	"sort"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"ordermgmt/internal/config"
	"ordermgmt/internal/db"
	"ordermgmt/internal/handlers"
	appmw "ordermgmt/internal/middleware"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

const uploadDir = "uploads"

func main() {
	cfg := config.Load()

	pool, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatal("failed to connect to database: ", err)
	}
	defer pool.Close()

	runMigrations(pool)

	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Fatal("failed to create upload dir: ", err)
	}

	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
	}))

	authH := &handlers.AuthHandler{DB: pool, JWTSecret: cfg.JWTSecret, Cfg: cfg}
	productH := &handlers.ProductHandler{DB: pool}
	orderH := &handlers.OrderHandler{DB: pool}
	orderMergeH := &handlers.OrderMergeHandler{DB: pool}
	shippingExportH := &handlers.ShippingExportHandler{DB: pool}
	cvsStoreH := &handlers.CvsStoreHandler{
		DB:         pool,
		MerchantID: cfg.ECPayLogisticsMerchantID,
		HashKey:    cfg.ECPayLogisticsHashKey,
		HashIV:     cfg.ECPayLogisticsHashIV,
		BaseURL:    cfg.ECPayLogisticsBaseURL,
	}
	if cfg.ECPayLogisticsEnv == "production" && cfg.ECPayLogisticsMerchantID == "" {
		log.Printf("ECPay logistics: ECPAY_LOGISTICS_ENV=production but no MerchantID/HashKey/HashIV set - CVS store-code validation is disabled until real credentials are provided")
	} else {
		log.Printf("ECPay logistics: env=%s base_url=%s merchant_id=%s", cfg.ECPayLogisticsEnv, cfg.ECPayLogisticsBaseURL, cfg.ECPayLogisticsMerchantID)
	}
	go runCvsStoreScheduler(cvsStoreH)
	rolePermH := &handlers.RolePermissionHandler{DB: pool}
	customerH := &handlers.CustomerHandler{DB: pool}
	dashboardH := &handlers.DashboardHandler{DB: pool}
	activityLogH := &handlers.ActivityLogHandler{DB: pool}
	supplierH := &handlers.SupplierHandler{DB: pool}
	purchaseH := &handlers.PurchaseHandler{DB: pool}
	purchaseAlertH := &handlers.PurchaseAlertHandler{DB: pool}
	hostH := &handlers.HostHandler{DB: pool}
	hostLocationH := &handlers.HostLocationHandler{DB: pool}
	returnH := &handlers.ReturnHandler{DB: pool}
	perfDashboardH := &handlers.PerformanceDashboardHandler{DB: pool}
	hostAnalyticsH := &handlers.HostAnalyticsHandler{DB: pool}
	heatmapH := &handlers.HeatmapHandler{DB: pool}
	pickupChainH := &handlers.PickupChainHandler{DB: pool}
	uploadH := &handlers.UploadHandler{
		UploadDir:           uploadDir,
		CloudinaryCloudName: cfg.CloudinaryCloudName,
		CloudinaryAPIKey:    cfg.CloudinaryAPIKey,
		CloudinaryAPISecret: cfg.CloudinaryAPISecret,
	}
	imageH := &handlers.ProductImageHandler{DB: pool}
	feesH := &handlers.FeeSettingsHandler{DB: pool}
	shippingSettingsH := &handlers.ShippingSettingsHandler{DB: pool}
	storeSettingsH := &handlers.StoreSettingsHandler{DB: pool}
	pickingH := &handlers.PickingHandler{DB: pool}
	pickupLinkH := &handlers.PickupLinkHandler{DB: pool}
	categoryH := &handlers.CategoryHandler{DB: pool}
	reportsH := &handlers.ReportsHandler{DB: pool}
	userH := &handlers.UserHandler{DB: pool, Cfg: cfg}
	liveSessionH := &handlers.LiveSessionHandler{DB: pool}

	// Any authenticated staff role may reach this outer gate; the real per-section
	// restriction happens per-route below via view()/edit() (backed by role_tab_access -
	// see internal/middleware/tabaccess.go). super_user always passes the tab check itself.
	allStaffRoles := []string{"sales", "spv", "management", "cs", "warehouse", "super_user"}

	view := func(tab string) func(http.Handler) http.Handler { return appmw.RequireTabView(pool, tab) }
	edit := func(tab string) func(http.Handler) http.Handler { return appmw.RequireTabEdit(pool, tab) }

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir))))

	r.Route("/api", func(r chi.Router) {
		// Public
		r.Get("/store-settings", storeSettingsH.Get)
		r.Post("/auth/login", authH.Login)
		r.Post("/auth/otp/request", authH.RequestLoginOTP)
		r.Post("/auth/otp/verify", authH.VerifyLoginOTP)
		r.Post("/auth/forgot-password", authH.ForgotPassword)
		r.Post("/auth/reset-password", authH.ResetPassword)
		r.Post("/auth/accept-invite", authH.AcceptInvite)
		r.Get("/auth/tokens/{token}", authH.ValidateToken)
		r.Get("/public/pickup/{token}", pickupLinkH.PublicGet)

		r.Group(func(r chi.Router) {
			r.Use(appmw.JWTAuth(cfg.JWTSecret))
			r.Use(appmw.RequireRole(allStaffRoles...))

			r.With(view("products")).Get("/products", productH.List)
			r.With(view("products")).Get("/products/{id}", productH.Detail)
			r.With(view("inventory")).Get("/inventory/history", productH.StockHistory)
			r.With(edit("products")).Post("/products", productH.Create)
			r.With(edit("products")).Patch("/products/{id}", productH.Update)
			r.With(edit("products")).Post("/products/{id}/variants", productH.CreateVariant)
			r.With(edit("products")).Patch("/products/{id}/variants/{variantId}", productH.UpdateVariant)
			r.With(edit("products")).Delete("/products/{id}/variants/{variantId}", productH.DeleteVariant)
			r.With(edit("products")).Delete("/products/{id}", productH.Delete)
			r.With(edit("products")).Post("/products/{id}/images", imageH.AddImage)
			r.With(edit("products")).Delete("/products/{id}/images/{imageId}", imageH.DeleteImage)
			r.With(edit("products")).Post("/uploads/image", uploadH.UploadImage)

			r.With(view("categories")).Get("/categories", categoryH.List)
			r.With(edit("categories")).Post("/categories", categoryH.Create)
			r.With(edit("categories")).Delete("/categories/{id}", categoryH.Delete)

			r.With(view("orders")).Get("/pickup-stores/validate", cvsStoreH.ValidateStoreCode)
			r.With(view("orders")).Get("/orders", orderH.List)
			r.With(view("orders")).Get("/orders/{id}", orderH.Detail)
			r.With(edit("orders")).Post("/orders", orderH.Create)
			r.With(edit("orders")).Patch("/orders/{id}/status", orderH.UpdateStatus)
			r.With(edit("orders")).Patch("/orders/{id}/notes", orderH.UpdateNotes)
			r.With(edit("orders")).Patch("/orders/{id}/keep-date", orderH.UpdateKeepDate)
			r.With(edit("orders")).Patch("/orders/{id}/pickup", orderH.UpdatePickup)
			r.With(edit("orders")).Post("/orders/{id}/attachments", orderH.AddAttachment)
			r.With(edit("picking")).Patch("/order-items/{itemId}/pick", orderH.PickItem)
			r.With(edit("orders")).Post("/orders/{id}/split", orderH.Split)
			r.With(view("orders")).Get("/orders/merge-suggestions", orderMergeH.Suggestions)
			r.With(edit("orders")).Post("/orders/merge-groups", orderMergeH.CreateGroup)
			r.With(edit("orders")).Delete("/orders/merge-groups/{id}", orderMergeH.DeleteGroup)
			r.With(view("picking")).Get("/picking-queue", pickingH.Queue)

			r.With(view("shipping")).Get("/shipping-export", shippingExportH.List)
			r.With(edit("shipping")).Post("/shipping-export/mark-exported", shippingExportH.MarkExported)
			r.With(edit("shipping")).Patch("/orders/{id}/tracking-number", shippingExportH.UpdateTrackingNumber)
			r.With(view("shipping")).Get("/pickup-links", pickupLinkH.List)
			r.With(edit("shipping")).Post("/pickup-links", pickupLinkH.Create)
			r.With(edit("shipping")).Patch("/pickup-links/{id}", pickupLinkH.Update)

			r.With(view("audit_logs")).Get("/activity-log", activityLogH.List)

			r.With(view("dashboard")).Get("/dashboard/summary", dashboardH.Summary)
			r.With(view("dashboard")).Get("/dashboard/graph", dashboardH.Graph)
			r.With(view("dashboard")).Get("/dashboard/host-ranking", dashboardH.HostRanking)
			r.With(view("dashboard")).Get("/dashboard/top-products", dashboardH.TopProducts)
			r.With(view("profit")).Get("/dashboard/profit", dashboardH.Profit)
			r.With(view("dashboard")).Get("/dashboard/alerts", dashboardH.Alerts)

			r.With(view("hosts")).Get("/hosts", hostH.List)
			r.With(edit("hosts")).Post("/hosts", hostH.Create)
			r.With(edit("hosts")).Patch("/hosts/{id}", hostH.Update)
			r.With(edit("hosts")).Delete("/hosts/{id}", hostH.Delete)

			// Location Tags (item 021) - managed from within the Host Management page,
			// so reuse the same "hosts" tab permission rather than a new tab.
			r.With(view("hosts")).Get("/host-locations", hostLocationH.List)
			r.With(edit("hosts")).Post("/host-locations", hostLocationH.Create)
			r.With(edit("hosts")).Patch("/host-locations/{id}", hostLocationH.Update)
			r.With(edit("hosts")).Delete("/host-locations/{id}", hostLocationH.Delete)

			r.With(view("shipping_settings")).Get("/pickup-chains", pickupChainH.List)
			r.With(edit("shipping_settings")).Post("/pickup-chains", pickupChainH.Create)
			r.With(edit("shipping_settings")).Patch("/pickup-chains/{id}", pickupChainH.Update)
			r.With(edit("shipping_settings")).Delete("/pickup-chains/{id}", pickupChainH.Delete)
			r.With(view("shipping_settings")).Get("/settings/shipping", shippingSettingsH.Get)
			r.With(edit("shipping_settings")).Patch("/settings/shipping", shippingSettingsH.Update)
			r.With(edit("store_profile")).Patch("/store-settings", storeSettingsH.Update)

			r.With(view("suppliers")).Get("/suppliers", supplierH.List)
			r.With(edit("suppliers")).Post("/suppliers", supplierH.Create)
			r.With(edit("suppliers")).Patch("/suppliers/{id}", supplierH.Update)
			r.With(edit("suppliers")).Delete("/suppliers/{id}", supplierH.Delete)

			r.With(view("purchases")).Get("/purchases", purchaseH.List)
			r.With(view("purchases")).Get("/purchases/{id}", purchaseH.Detail)
			r.With(edit("purchases")).Post("/purchases", purchaseH.Create)
			r.With(edit("purchases")).Patch("/purchases/{id}/receive", purchaseH.Receive)
			r.With(edit("purchases")).Delete("/purchases/{id}", purchaseH.Delete)

			r.With(view("purchase_alert")).Get("/purchase-alert", purchaseAlertH.List)

			r.With(view("customers")).Get("/customers", customerH.Search)
			r.With(edit("customers")).Post("/customers", customerH.Create)
			r.With(view("customers")).Get("/customers/stats", customerH.Stats)
			r.With(edit("customers")).Patch("/customers/{id}/labels", customerH.SetLabel)
			r.With(edit("customers")).Delete("/customers/{id}", customerH.Delete)

			r.With(view("fees")).Get("/settings/fees", feesH.Get)
			r.With(edit("fees")).Patch("/settings/fees", feesH.Update)

			r.With(view("reports")).Get("/reports/products", reportsH.Products)
			r.With(view("reports")).Get("/reports/orders", reportsH.Orders)
			r.With(view("product_analytics")).Get("/reports/product-analysis", reportsH.ProductAnalysis)
			r.With(view("product_performance")).Get("/reports/product-performance", reportsH.ProductPerformance)
			r.With(view("product_color_pair")).Get("/reports/product-color-pair", reportsH.ProductColorPair)
			r.With(view("host_category_leaderboard")).Get("/reports/host-category-leaderboard", reportsH.HostCategoryLeaderboard)

			r.With(view("panel_siaran")).Get("/live-sessions", liveSessionH.List)
			r.With(edit("panel_siaran")).Post("/live-sessions", liveSessionH.Create)
			r.With(view("panel_siaran")).Get("/live-sessions/{id}", liveSessionH.Detail)
			r.With(edit("panel_siaran")).Patch("/live-sessions/{id}", liveSessionH.Update)
			r.With(edit("panel_siaran")).Patch("/live-sessions/{id}/go-live", liveSessionH.GoLive)
			r.With(edit("panel_siaran")).Patch("/live-sessions/{id}/end", liveSessionH.End)
			r.With(edit("panel_siaran")).Post("/live-sessions/{id}/products", liveSessionH.AddProduct)
			r.With(edit("panel_siaran")).Delete("/live-sessions/{id}/products/{productId}", liveSessionH.RemoveProduct)
			r.With(edit("panel_siaran")).Patch("/live-sessions/{id}/live-data", liveSessionH.SubmitLiveData)

			r.With(view("returns")).Get("/returns", returnH.List)
			r.With(edit("returns")).Post("/returns", returnH.Create)
			r.With(edit("returns")).Patch("/returns/{id}/approve", returnH.Approve)
			r.With(edit("returns")).Patch("/returns/{id}/reject", returnH.Reject)

			r.With(view("performance_dashboard")).Get("/performance-dashboard/summary", perfDashboardH.Summary)
			r.With(view("performance_dashboard")).Get("/performance-dashboard/host-ranking", perfDashboardH.HostRanking)
			r.With(view("performance_dashboard")).Get("/performance-dashboard/performance-data", perfDashboardH.PerformanceData)

			r.With(view("host_performance_analytics")).Get("/host-analytics/lifetime", hostAnalyticsH.Lifetime)
			r.With(view("host_performance_analytics")).Get("/host-analytics/summary", hostAnalyticsH.Summary)
			r.With(view("host_performance_analytics")).Get("/host-analytics/historical-best", hostAnalyticsH.HistoricalBest)
			r.With(view("host_performance_analytics")).Get("/host-analytics/performance-data", hostAnalyticsH.PerformanceData)

			r.With(view("heatmap")).Get("/heatmap/summary", heatmapH.Summary)
			r.With(view("heatmap")).Get("/heatmap/grid", heatmapH.Grid)
			r.With(view("heatmap")).Get("/heatmap/cell-detail", heatmapH.CellDetail)

			// Staff & permission management: no configurable role is seeded with edit access to
			// the "roles" tab (see 036_role_tab_access.sql), so only super_user's bypass reaches
			// the write endpoints - matches the previous superUserOnly-only behavior exactly.
			r.With(view("roles")).Get("/users", userH.List)
			r.With(edit("roles")).Post("/users", userH.Create)
			r.With(edit("roles")).Patch("/users/{id}", userH.Update)
			r.Get("/my-access", rolePermH.MyAccess)
			r.With(view("roles")).Get("/tabs", rolePermH.Tabs)
			r.With(view("roles")).Get("/role-tab-access", rolePermH.Matrix)
			r.With(edit("roles")).Put("/role-tab-access", rolePermH.UpdateMatrix)
		})
	})

	log.Println("server listening on port", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		log.Fatal(err)
	}
}

// runCvsStoreScheduler keeps the cvs_stores cache warm: refreshes immediately on startup (so a
// fresh deploy has real data right away instead of an empty table waiting for the first user to
// type a store code), then once every 24h after that - matching ValidateStoreCode's own 24h
// staleness window, which stays in place as a lazy fallback.
func runCvsStoreScheduler(h *handlers.CvsStoreHandler) {
	if !h.Configured() {
		log.Printf("CVS store cache scheduler: ECPay not configured, skipping automatic refresh")
		return
	}
	refresh := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		if err := h.RefreshAll(ctx); err != nil {
			log.Printf("CVS store cache refresh failed: %v", err)
		} else {
			log.Printf("CVS store cache refreshed")
		}
	}
	refresh()
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		refresh()
	}
}

// runMigrations executes embedded .sql files in filename order, tracked via schema_migrations table.
func runMigrations(pool *pgxpool.Pool) {
	ctx := context.Background()

	_, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
	if err != nil {
		log.Fatal("failed to create schema_migrations table: ", err)
	}

	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		log.Fatal("failed to read migrations dir: ", err)
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)

	for _, name := range names {
		var exists bool
		pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)`, name).Scan(&exists)
		if exists {
			continue
		}

		content, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			log.Fatal("failed to read migration file ", name, ": ", err)
		}

		log.Println("applying migration:", name)
		if _, err := pool.Exec(ctx, string(content)); err != nil {
			log.Fatal("migration failed (", name, "): ", err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name); err != nil {
			log.Fatal("failed to record migration: ", err)
		}
	}
	log.Println("migrations up to date")
}
